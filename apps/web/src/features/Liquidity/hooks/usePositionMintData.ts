import { useQueries, useQuery } from '@tanstack/react-query'
import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { NONFUNGIBLE_POSITION_MANAGER_ADDRESSES } from '@uniswap/sdk-core'
import { assume0xAddress, type EVMUniverseChainId, type PublicClient } from '@universe/chains'
import { ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { useConfig, usePublicClient } from 'wagmi'
import { getPublicClient } from 'wagmi/actions'

export interface PositionEvent {
  type: 'mint' | 'increase' | 'decrease' | 'collect' | 'decrease_collect' | 'burn'
  timestamp: number
  txHash: string
  amount0: bigint
  amount1: bigint
}

export interface MintData {
  timestamp: number | undefined
  totalDeposited0: bigint | undefined
  totalDeposited1: bigint | undefined
  totalCollected0: bigint | undefined
  totalCollected1: bigint | undefined
  /** Principal removed via DecreaseLiquidity; it leaves through Collect, so collected minus this is fees. */
  totalWithdrawn0: bigint | undefined
  totalWithdrawn1: bigint | undefined
  events: PositionEvent[]
}

const LIQUIDITY_CHANGE_INPUTS = [
  { indexed: true, name: 'tokenId', type: 'uint256' },
  { indexed: false, name: 'liquidity', type: 'uint128' },
  { indexed: false, name: 'amount0', type: 'uint256' },
  { indexed: false, name: 'amount1', type: 'uint256' },
] as const

const TRANSFER_EVENT = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: true, name: 'tokenId', type: 'uint256' },
  ],
} as const
const INCREASE_LIQUIDITY_EVENT = { type: 'event', name: 'IncreaseLiquidity', inputs: LIQUIDITY_CHANGE_INPUTS } as const
const DECREASE_LIQUIDITY_EVENT = { type: 'event', name: 'DecreaseLiquidity', inputs: LIQUIDITY_CHANGE_INPUTS } as const
const COLLECT_EVENT = {
  type: 'event',
  name: 'Collect',
  inputs: [
    { indexed: true, name: 'tokenId', type: 'uint256' },
    { indexed: false, name: 'recipient', type: 'address' },
    { indexed: false, name: 'amount0', type: 'uint256' },
    { indexed: false, name: 'amount1', type: 'uint256' },
  ],
} as const

const EMPTY_MINT_DATA: MintData = {
  timestamp: undefined,
  totalDeposited0: undefined,
  totalDeposited1: undefined,
  totalCollected0: undefined,
  totalCollected1: undefined,
  totalWithdrawn0: undefined,
  totalWithdrawn1: undefined,
  events: [],
}

async function fetchMintData({
  client,
  managerAddress,
  tokenId,
}: {
  client: PublicClient
  managerAddress: string
  tokenId: string
}): Promise<MintData> {
  const tokenIdBigInt = BigInt(tokenId)
  const logFilter = {
    address: assume0xAddress(managerAddress),
    fromBlock: 0n,
    toBlock: 'latest',
    strict: true,
  } as const

  const [mintTransfers, burnTransfers, increaseEvents, decreaseEvents, collectEvents] = await Promise.all([
    client.getLogs({
      ...logFilter,
      event: TRANSFER_EVENT,
      args: { from: assume0xAddress(ZERO_ADDRESS), tokenId: tokenIdBigInt },
    }),
    client.getLogs({
      ...logFilter,
      event: TRANSFER_EVENT,
      args: { to: assume0xAddress(ZERO_ADDRESS), tokenId: tokenIdBigInt },
    }),
    client.getLogs({ ...logFilter, event: INCREASE_LIQUIDITY_EVENT, args: { tokenId: tokenIdBigInt } }),
    client.getLogs({ ...logFilter, event: DECREASE_LIQUIDITY_EVENT, args: { tokenId: tokenIdBigInt } }),
    client.getLogs({ ...logFilter, event: COLLECT_EVENT, args: { tokenId: tokenIdBigInt } }),
  ])

  const rawEvents = [
    ...mintTransfers.map((ev) => ({ type: 'mint' as const, log: ev, amount0: 0n, amount1: 0n })),
    ...burnTransfers.map((ev) => ({ type: 'burn' as const, log: ev, amount0: 0n, amount1: 0n })),
    ...increaseEvents.map((ev) => ({ type: 'increase' as const, log: ev, ...ev.args })),
    ...decreaseEvents.map((ev) => ({ type: 'decrease' as const, log: ev, ...ev.args })),
    ...collectEvents.map((ev) => ({ type: 'collect' as const, log: ev, ...ev.args })),
  ]

  const uniqueBlocks = [...new Set(rawEvents.map((e) => e.log.blockNumber))]
  const blocks = await Promise.all(uniqueBlocks.map((blockNumber) => client.getBlock({ blockNumber })))
  const blockTimestamps = new Map(blocks.map((block) => [block.number, Number(block.timestamp)]))

  const events: PositionEvent[] = rawEvents
    .map((raw) => ({
      type: raw.type,
      timestamp: blockTimestamps.get(raw.log.blockNumber) ?? 0,
      txHash: raw.log.transactionHash,
      amount0: raw.amount0,
      amount1: raw.amount1,
    }))
    .sort((a, b) => a.timestamp - b.timestamp || a.type.localeCompare(b.type))

  // Mint + IncreaseLiquidity shows as a mint with amounts; DecreaseLiquidity + Collect shows as one line.
  const mintTxHashes = new Set(events.filter((e) => e.type === 'mint').map((e) => e.txHash))
  const decreaseTxHashes = new Set(events.filter((e) => e.type === 'decrease').map((e) => e.txHash))
  const mergedEvents: PositionEvent[] = []

  for (const ev of events) {
    if (ev.type === 'mint') {
      const matchingIncrease = events.find((e) => e.type === 'increase' && e.txHash === ev.txHash)
      mergedEvents.push({
        ...ev,
        amount0: matchingIncrease?.amount0 ?? 0n,
        amount1: matchingIncrease?.amount1 ?? 0n,
      })
    } else if (ev.type === 'increase' && mintTxHashes.has(ev.txHash)) {
      continue
    } else if (ev.type === 'decrease') {
      const matchingCollect = events.find((e) => e.type === 'collect' && e.txHash === ev.txHash)
      mergedEvents.push(
        matchingCollect
          ? {
              type: 'decrease_collect',
              timestamp: ev.timestamp,
              txHash: ev.txHash,
              amount0: matchingCollect.amount0,
              amount1: matchingCollect.amount1,
            }
          : ev,
      )
    } else if (ev.type === 'collect' && decreaseTxHashes.has(ev.txHash)) {
      continue
    } else {
      mergedEvents.push(ev)
    }
  }

  return {
    timestamp: mergedEvents[0]?.timestamp,
    totalDeposited0: increaseEvents.reduce((sum, ev) => sum + ev.args.amount0, 0n),
    totalDeposited1: increaseEvents.reduce((sum, ev) => sum + ev.args.amount1, 0n),
    totalCollected0: collectEvents.reduce((sum, ev) => sum + ev.args.amount0, 0n),
    totalCollected1: collectEvents.reduce((sum, ev) => sum + ev.args.amount1, 0n),
    totalWithdrawn0: decreaseEvents.reduce((sum, ev) => sum + ev.args.amount0, 0n),
    totalWithdrawn1: decreaseEvents.reduce((sum, ev) => sum + ev.args.amount1, 0n),
    events: mergedEvents,
  }
}

function mintDataQueryOptions({
  client,
  chainId,
  tokenId,
  enabled,
}: {
  // wagmi types each client by its configured chain; the log reads only use the chain-agnostic surface.
  client: unknown
  chainId: EVMUniverseChainId | undefined
  tokenId: string | undefined
  enabled: boolean
}) {
  const managerAddress = chainId ? NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId] : undefined
  return {
    queryKey: ['positionMintData', chainId, tokenId],
    queryFn: () =>
      fetchMintData({
        client: client as PublicClient,
        managerAddress: managerAddress as string,
        tokenId: tokenId as string,
      }),
    enabled: enabled && !!client && !!managerAddress && !!tokenId,
    // The RPC gateway answers 401 until the session is initialized, which can be after this first runs.
    retry: 8,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
    staleTime: 60_000,
  }
}

export function usePositionMintData({
  chainId,
  tokenId,
  version,
  enabled = true,
}: {
  chainId: EVMUniverseChainId | undefined
  tokenId: string | undefined
  version: ProtocolVersion | undefined
  enabled?: boolean
}): MintData {
  const client = usePublicClient({ chainId })
  const { data } = useQuery(
    mintDataQueryOptions({ client, chainId, tokenId, enabled: enabled && version === ProtocolVersion.V3 }),
  )
  return data ?? EMPTY_MINT_DATA
}

/** Same cache entries as usePositionMintData, so a list and its rows share one fetch per position. */
export function usePositionsMintData(
  positions: readonly { chainId: EVMUniverseChainId; tokenId: string }[],
): (MintData | undefined)[] {
  const config = useConfig()
  const results = useQueries({
    queries: positions.map(({ chainId, tokenId }) =>
      mintDataQueryOptions({
        client: getPublicClient(config, { chainId }),
        chainId,
        tokenId,
        enabled: true,
      }),
    ),
  })
  return results.map((result) => result.data)
}
