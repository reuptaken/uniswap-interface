import { useQuery } from '@tanstack/react-query'
import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { CHAIN_TO_ADDRESSES_MAP, CurrencyAmount, NONFUNGIBLE_POSITION_MANAGER_ADDRESSES } from '@uniswap/sdk-core'
import { Pool as V3Pool, Position as V3Position } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Position as V4Position } from '@uniswap/v4-sdk'
import { type PublicClient, v3PoolStateAbi } from '@universe/chains'
import { useMemo } from 'react'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { usePublicClient, useReadContracts } from 'wagmi'
import { assume0xAddress } from '~/chains'

const LIVE_POOL_REFETCH_MS = 4000

const V4_STATE_VIEW_ABI = [
  {
    type: 'function',
    name: 'getSlot0',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'sqrtPriceX96', type: 'uint160' },
      { name: 'tick', type: 'int24' },
      { name: 'protocolFee', type: 'uint24' },
      { name: 'lpFee', type: 'uint24' },
    ],
  },
  {
    type: 'function',
    name: 'getLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'liquidity', type: 'uint128' }],
  },
] as const

const MAX_UINT128 = 2n ** 128n - 1n

// NonfungiblePositionManager.collect: simulated from the owner, it returns exactly what a collect would pay out now,
// i.e. the position's claimable fees (plus any principal already withdrawn but not yet collected).
const V3_COLLECT_ABI = [
  {
    type: 'function',
    name: 'collect',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenId', type: 'uint256' },
          { name: 'recipient', type: 'address' },
          { name: 'amount0Max', type: 'uint128' },
          { name: 'amount1Max', type: 'uint128' },
        ],
      },
    ],
    outputs: [
      { name: 'amount0', type: 'uint256' },
      { name: 'amount1', type: 'uint256' },
    ],
  },
] as const

type LiveFees = readonly [bigint, bigint]

/**
 * A V3 position's claimable fees, read from the chain on the pool price's cadence. The backend reports the same
 * numbers, but only as often as the page re-reads it, so on their own the fees trail the live price.
 */
function useLiveV3Fees(positionInfo: PositionInfo | undefined): LiveFees | undefined {
  const isV3 = positionInfo?.version === ProtocolVersion.V3
  const chainId = positionInfo?.chainId
  const tokenId = isV3 ? positionInfo.tokenId : undefined
  const owner = isV3 ? assume0xAddress(positionInfo.owner) : undefined
  const manager = assume0xAddress(chainId ? NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId] : undefined)
  // wagmi types each client by its configured chain; the simulation only uses the chain-agnostic surface.
  const client = usePublicClient({ chainId }) as PublicClient | undefined

  const { data } = useQuery({
    queryKey: ['liveV3PositionFees', chainId, tokenId],
    queryFn: async (): Promise<LiveFees> => {
      if (!client || !owner || !manager || !tokenId) {
        throw new Error('live fees read is not ready')
      }
      const { result } = await client.simulateContract({
        address: manager,
        abi: V3_COLLECT_ABI,
        functionName: 'collect',
        account: owner,
        args: [{ tokenId: BigInt(tokenId), recipient: owner, amount0Max: MAX_UINT128, amount1Max: MAX_UINT128 }],
      })
      return result
    },
    enabled: isV3 && !!client && !!owner && !!manager && !!tokenId,
    refetchInterval: LIVE_POOL_REFETCH_MS,
  })
  return data
}

/** Swaps in the chain's fee amounts, re-pricing them with the backend's token prices like the backend itself does. */
export function applyLiveFees(info: PositionInfo, fees: LiveFees): PositionInfo {
  const fee0Amount = CurrencyAmount.fromRawAmount(info.currency0Amount.currency, fees[0].toString())
  const fee1Amount = CurrencyAmount.fromRawAmount(info.currency1Amount.currency, fees[1].toString())
  const token0UncollectedFeesUsd =
    info.token0PriceUsd !== undefined ? Number(fee0Amount.toExact()) * info.token0PriceUsd : undefined
  const token1UncollectedFeesUsd =
    info.token1PriceUsd !== undefined ? Number(fee1Amount.toExact()) * info.token1PriceUsd : undefined
  return {
    ...info,
    fee0Amount,
    fee1Amount,
    token0UncollectedFeesUsd,
    token1UncollectedFeesUsd,
    uncollectedFeesUsd:
      token0UncollectedFeesUsd !== undefined && token1UncollectedFeesUsd !== undefined
        ? token0UncollectedFeesUsd + token1UncollectedFeesUsd
        : info.uncollectedFeesUsd,
  }
}

// NonfungiblePositionManager.positions: the position's own state; only `liquidity` (index 7) is used here.
const V3_POSITIONS_ABI = [
  {
    type: 'function',
    name: 'positions',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'nonce', type: 'uint96' },
      { name: 'operator', type: 'address' },
      { name: 'token0', type: 'address' },
      { name: 'token1', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'tickLower', type: 'int24' },
      { name: 'tickUpper', type: 'int24' },
      { name: 'liquidity', type: 'uint128' },
      { name: 'feeGrowthInside0LastX128', type: 'uint256' },
      { name: 'feeGrowthInside1LastX128', type: 'uint256' },
      { name: 'tokensOwed0', type: 'uint128' },
      { name: 'tokensOwed1', type: 'uint128' },
    ],
  },
] as const
const V3_POSITION_LIQUIDITY_INDEX = 7

type LivePoolState = {
  sqrtPriceX96: bigint
  tick: number
  liquidity: bigint
  /** The position's own liquidity (V3), so adds and removals made anywhere show up without re-reading the backend. */
  positionLiquidity?: bigint
  updatedAt: number
}

type ContractRead = { result?: unknown; error?: Error | null }

/** The batched read's results, in order: pool slot0, pool liquidity and, for V3, the position itself. */
function decodeLivePoolRead({
  results,
  error,
  updatedAt,
  waitingMessage,
}: {
  results: readonly ContractRead[] | undefined
  error: Error | null
  updatedAt: number
  waitingMessage: string
}): { live?: LivePoolState; error?: string } {
  const slot0 = results?.[0]?.result as readonly [bigint, number, ...unknown[]] | undefined
  const liquidity = results?.[1]?.result as bigint | undefined
  // A failed position read (e.g. a burned NFT) leaves the backend's liquidity in place rather than failing the pool read.
  const position = results?.[2]?.result as readonly unknown[] | undefined
  const positionLiquidity = position?.[V3_POSITION_LIQUIDITY_INDEX] as bigint | undefined
  const readError = error ?? results?.[0]?.error ?? results?.[1]?.error
  const errorMessage = readError
    ? ((readError as { shortMessage?: string }).shortMessage ?? readError.message)
    : undefined
  if (!slot0 || liquidity === undefined) {
    return { error: errorMessage ?? waitingMessage }
  }
  return {
    live: { sqrtPriceX96: slot0[0], tick: slot0[1], liquidity, positionLiquidity, updatedAt },
    error: errorMessage,
  }
}

function useLivePoolState(positionInfo: PositionInfo | undefined): { live?: LivePoolState; error?: string } {
  const { chainId, poolId, version } = positionInfo ?? {}
  const tokenId = positionInfo?.version === ProtocolVersion.V3 ? positionInfo.tokenId : undefined
  const positionManager = assume0xAddress(chainId ? NONFUNGIBLE_POSITION_MANAGER_ADDRESSES[chainId] : undefined)

  const poolAddress = assume0xAddress(poolId)
  const stateView = assume0xAddress(
    chainId ? CHAIN_TO_ADDRESSES_MAP[Number(chainId) as keyof typeof CHAIN_TO_ADDRESSES_MAP]?.v4StateView : undefined,
  )
  const isV3 = version === ProtocolVersion.V3 && !!poolAddress
  const isV4 = version === ProtocolVersion.V4 && !!poolAddress && !!stateView
  const query = { refetchInterval: LIVE_POOL_REFETCH_MS }

  const v3 = useReadContracts({
    contracts: [
      { address: poolAddress, abi: v3PoolStateAbi, functionName: 'slot0', chainId },
      { address: poolAddress, abi: v3PoolStateAbi, functionName: 'liquidity', chainId },
      {
        address: positionManager,
        abi: V3_POSITIONS_ABI,
        functionName: 'positions',
        args: [tokenId ? BigInt(tokenId) : 0n],
        chainId,
      },
    ],
    query: { ...query, enabled: isV3 && !!positionManager && !!tokenId },
  })
  const v4 = useReadContracts({
    contracts: [
      { address: stateView, abi: V4_STATE_VIEW_ABI, functionName: 'getSlot0', args: [poolAddress ?? '0x'], chainId },
      {
        address: stateView,
        abi: V4_STATE_VIEW_ABI,
        functionName: 'getLiquidity',
        args: [poolAddress ?? '0x'],
        chainId,
      },
    ],
    query: { ...query, enabled: isV4 },
  })
  const { data, dataUpdatedAt, error, fetchStatus } = isV4 ? v4 : v3
  return decodeLivePoolRead({
    results: data,
    error,
    updatedAt: dataUpdatedAt,
    waitingMessage: isV3 || isV4 ? `no result yet (${fetchStatus})` : 'no pool to read',
  })
}

function applyLivePoolState(info: PositionInfo, live: LivePoolState): PositionInfo {
  const { tickLower, tickUpper } = info
  if (info.version === ProtocolVersion.V2 || !info.poolOrPair || tickLower === undefined || tickUpper === undefined) {
    return info
  }
  const sqrtPrice = live.sqrtPriceX96.toString()
  const poolLiquidity = live.liquidity.toString()
  const liquidity = live.positionLiquidity?.toString() ?? info.liquidity ?? '0'
  const rangeStatus =
    live.tick >= tickLower && live.tick < tickUpper ? PositionStatus.IN_RANGE : PositionStatus.OUT_OF_RANGE
  // With the position's own liquidity read live, closing and reopening show up too; otherwise only the range can move.
  const status =
    live.positionLiquidity !== undefined
      ? live.positionLiquidity === 0n
        ? PositionStatus.CLOSED
        : rangeStatus
      : info.status === PositionStatus.IN_RANGE || info.status === PositionStatus.OUT_OF_RANGE
        ? rangeStatus
        : info.status

  if (info.version === ProtocolVersion.V3) {
    const { token0, token1, fee } = info.poolOrPair
    const pool = new V3Pool(token0, token1, fee, sqrtPrice, poolLiquidity, live.tick)
    const position = new V3Position({ pool, liquidity, tickLower, tickUpper })
    return {
      ...info,
      status,
      liquidity,
      poolOrPair: pool,
      position,
      currency0Amount: position.amount0,
      currency1Amount: position.amount1,
    }
  }

  const { currency0, currency1, fee, tickSpacing, hooks } = info.poolOrPair
  const pool = new V4Pool(currency0, currency1, fee, tickSpacing, hooks, sqrtPrice, poolLiquidity, live.tick)
  const position = new V4Position({ pool, liquidity, tickLower, tickUpper })
  return {
    ...info,
    status,
    poolOrPair: pool,
    position,
    currency0Amount: position.amount0,
    currency1Amount: position.amount1,
  }
}

/**
 * The backend's pool snapshot can lag the chain by far longer than its poll, so price and amounts come from the pool,
 * and (for V3) the claimable fees from the position manager, all on the same few-second cadence.
 */
export function useLivePositionInfo(positionInfo: PositionInfo | undefined): {
  positionInfo: PositionInfo | undefined
  poolUpdatedAt: number | undefined
  poolError: string | undefined
} {
  const { live, error } = useLivePoolState(positionInfo)
  const liveFees = useLiveV3Fees(positionInfo)

  const livePositionInfo = useMemo(() => {
    if (!positionInfo) {
      return positionInfo
    }
    let info = positionInfo
    if (live) {
      try {
        info = applyLivePoolState(info, live)
      } catch {
        info = positionInfo
      }
    }
    return liveFees ? applyLiveFees(info, liveFees) : info
  }, [positionInfo, live, liveFees])

  return { positionInfo: livePositionInfo, poolUpdatedAt: live?.updatedAt, poolError: error }
}
