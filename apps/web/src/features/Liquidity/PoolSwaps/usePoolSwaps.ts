import { useQuery, useQueryClient } from '@tanstack/react-query'
import { assume0xAddress, type EVMUniverseChainId, type PublicClient, v3PoolStateAbi } from '@universe/chains'
import { usePublicClient } from 'wagmi'
import {
  appendSwaps,
  type BlockAnchor,
  type PoolSwapsState,
  SWAP_HISTORY_SECONDS,
} from '~/features/Liquidity/PoolSwaps/poolSwaps'

// Same cadence as the live pool price (useLivePositionInfo): a few new blocks per read.
const SWAPS_REFETCH_MS = 4000
// Blocks sampled to measure the chain's block time, which sizes the history window.
const BLOCK_TIME_SAMPLE = 100

const V3_SWAP_EVENT = {
  type: 'event',
  name: 'Swap',
  inputs: [
    { indexed: true, name: 'sender', type: 'address' },
    { indexed: true, name: 'recipient', type: 'address' },
    { indexed: false, name: 'amount0', type: 'int256' },
    { indexed: false, name: 'amount1', type: 'int256' },
    { indexed: false, name: 'sqrtPriceX96', type: 'uint160' },
    { indexed: false, name: 'liquidity', type: 'uint128' },
    { indexed: false, name: 'tick', type: 'int24' },
  ],
} as const

/** A fresh window: the last SWAP_HISTORY_SECONDS of blocks, nothing read yet. */
async function startWindow({
  client,
  poolAddress,
  latest,
}: {
  client: PublicClient
  poolAddress: string
  latest: BlockAnchor
}): Promise<PoolSwapsState> {
  const [sample, slot0] = await Promise.all([
    client.getBlock({ blockNumber: BigInt(latest.number - BLOCK_TIME_SAMPLE) }),
    client.readContract({ address: assume0xAddress(poolAddress), abi: v3PoolStateAbi, functionName: 'slot0' }),
  ])
  const secondsPerBlock = Math.max((latest.timestamp - Number(sample.timestamp)) / BLOCK_TIME_SAMPLE, 0.05)
  const windowBlocks = Math.ceil(SWAP_HISTORY_SECONDS / secondsPerBlock)
  return {
    swaps: [],
    lastBlock: { number: latest.number - windowBlocks, timestamp: latest.timestamp - windowBlocks * secondsPerBlock },
    secondsPerBlock,
    // slot0's sixth field: the protocol's cut of swap fees (see lpShareOfFee).
    feeProtocol: Number(slot0[5]),
  }
}

/** Reads the swaps since the previous read: the whole window the first time, then only the newest blocks. */
async function readNewSwaps({
  client,
  poolAddress,
  previous,
}: {
  client: PublicClient
  poolAddress: string
  previous: PoolSwapsState | undefined
}): Promise<PoolSwapsState> {
  const block = await client.getBlock()
  const latest = { number: Number(block.number), timestamp: Number(block.timestamp) }
  // Back after a long pause (a hidden tab doesn't poll), the gap would be more than the window: start over instead.
  const isStale =
    !previous || latest.number - previous.lastBlock.number > SWAP_HISTORY_SECONDS / previous.secondsPerBlock
  const state = isStale ? await startWindow({ client, poolAddress, latest }) : previous
  if (latest.number <= state.lastBlock.number) {
    return state
  }
  const logs = await client.getLogs({
    address: assume0xAddress(poolAddress),
    event: V3_SWAP_EVENT,
    fromBlock: BigInt(state.lastBlock.number + 1),
    toBlock: BigInt(latest.number),
    strict: true,
  })
  return appendSwaps({
    state,
    scannedTo: latest,
    logs: logs.map((log) => ({
      blockNumber: Number(log.blockNumber),
      logIndex: log.logIndex,
      txHash: log.transactionHash,
      amount0: log.args.amount0,
      amount1: log.args.amount1,
      sqrtPriceX96: log.args.sqrtPriceX96,
    })),
  })
}

/**
 * A V3 pool's recent swaps, read from the chain: the last 15 minutes on load, then each new block's as it comes.
 * Kept in memory only (the query cache), never stored.
 */
export function usePoolSwaps({
  chainId,
  poolAddress,
  enabled = true,
}: {
  chainId: EVMUniverseChainId | undefined
  poolAddress: string | undefined
  enabled?: boolean
}): {
  state: PoolSwapsState | undefined
  isLoading: boolean
  error: Error | null
  /** When the last read succeeded (ms since epoch), 0 before the first; changes on every read, new swaps or not. */
  updatedAt: number
} {
  // wagmi types each client by its configured chain; the reads here only use the chain-agnostic surface.
  const client = usePublicClient({ chainId }) as PublicClient | undefined
  const queryClient = useQueryClient()
  const queryKey = ['poolSwaps', chainId, poolAddress] as const

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey,
    queryFn: async (): Promise<PoolSwapsState> => {
      if (!client || !poolAddress) {
        throw new Error('pool swaps read is not ready')
      }
      // Each read extends the previous one, which the query cache holds.
      return readNewSwaps({ client, poolAddress, previous: queryClient.getQueryData<PoolSwapsState>(queryKey) })
    },
    enabled: enabled && !!client && !!poolAddress,
    refetchInterval: SWAPS_REFETCH_MS,
    // The RPC gateway answers 401 until the session is initialized, which can be after this first runs.
    retry: 8,
    retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 8000),
  })
  return { state: data, isLoading, error, updatedAt: dataUpdatedAt }
}
