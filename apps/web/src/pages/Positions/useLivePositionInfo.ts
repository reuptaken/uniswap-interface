import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { CHAIN_TO_ADDRESSES_MAP } from '@uniswap/sdk-core'
import { Pool as V3Pool, Position as V3Position } from '@uniswap/v3-sdk'
import { Pool as V4Pool, Position as V4Position } from '@uniswap/v4-sdk'
import { v3PoolStateAbi } from '@universe/chains'
import { useMemo } from 'react'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { useReadContracts } from 'wagmi'
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

type LivePoolState = { sqrtPriceX96: bigint; tick: number; liquidity: bigint; updatedAt: number }

function useLivePoolState(positionInfo: PositionInfo | undefined): { live?: LivePoolState; error?: string } {
  const { chainId, poolId, version } = positionInfo ?? {}

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
    ],
    query: { ...query, enabled: isV3 },
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
  const hasPool = isV3 || isV4

  const slot0 = data?.[0]?.result as readonly [bigint, number, ...unknown[]] | undefined
  const liquidity = data?.[1]?.result as bigint | undefined
  const readError = error ?? data?.[0]?.error ?? data?.[1]?.error
  const errorMessage = readError
    ? ((readError as { shortMessage?: string }).shortMessage ?? readError.message)
    : undefined
  if (!slot0 || liquidity === undefined) {
    const waitingMessage = !hasPool ? 'no pool to read' : `no result yet (${fetchStatus})`
    return { error: errorMessage ?? waitingMessage }
  }
  return {
    live: { sqrtPriceX96: slot0[0], tick: slot0[1], liquidity, updatedAt: dataUpdatedAt },
    error: errorMessage,
  }
}

function applyLivePoolState(info: PositionInfo, live: LivePoolState): PositionInfo {
  const { tickLower, tickUpper } = info
  if (info.version === ProtocolVersion.V2 || !info.poolOrPair || tickLower === undefined || tickUpper === undefined) {
    return info
  }
  const sqrtPrice = live.sqrtPriceX96.toString()
  const poolLiquidity = live.liquidity.toString()
  const liquidity = info.liquidity ?? '0'
  const status =
    info.status === PositionStatus.IN_RANGE || info.status === PositionStatus.OUT_OF_RANGE
      ? live.tick >= tickLower && live.tick < tickUpper
        ? PositionStatus.IN_RANGE
        : PositionStatus.OUT_OF_RANGE
      : info.status

  if (info.version === ProtocolVersion.V3) {
    const { token0, token1, fee } = info.poolOrPair
    const pool = new V3Pool(token0, token1, fee, sqrtPrice, poolLiquidity, live.tick)
    const position = new V3Position({ pool, liquidity, tickLower, tickUpper })
    return {
      ...info,
      status,
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

/** The backend's pool snapshot can lag the chain by far longer than its poll, so price and amounts come from the pool. */
export function useLivePositionInfo(positionInfo: PositionInfo | undefined): {
  positionInfo: PositionInfo | undefined
  poolUpdatedAt: number | undefined
  poolError: string | undefined
} {
  const { live, error } = useLivePoolState(positionInfo)

  const livePositionInfo = useMemo(() => {
    if (!positionInfo || !live) {
      return positionInfo
    }
    try {
      return applyLivePoolState(positionInfo, live)
    } catch {
      return positionInfo
    }
  }, [positionInfo, live])

  return { positionInfo: livePositionInfo, poolUpdatedAt: live?.updatedAt, poolError: error }
}
