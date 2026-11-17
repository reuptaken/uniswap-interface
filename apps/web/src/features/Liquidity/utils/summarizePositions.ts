import { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import type { MintData } from '~/features/Liquidity/hooks/usePositionMintData'
import { getPositionFeeAprEstimate } from '~/features/Liquidity/utils/positionFeeApr'
import { getPositionFeeStats } from '~/features/Liquidity/utils/positionFeeStats'
import { getPositionPnlUsd } from '~/features/Liquidity/utils/positionPnl'

export interface PositionsSummary {
  openCount: number
  valueUsd: number
  feesUsd: number
  pnlUsd: number | undefined
  /** How many open positions the P/L total covers; it's partial while histories load or for V4. */
  pnlCount: number
  /** Value-weighted average of the per-position fee APRs (from history, else the estimate), over those that have one. */
  feeApr: number | undefined
}

export function isOpenPosition(position: PositionInfo): boolean {
  return position.status === PositionStatus.IN_RANGE || position.status === PositionStatus.OUT_OF_RANGE
}

export function summarizePositions({
  openPositions,
  mintData,
  nowMs,
}: {
  openPositions: readonly PositionInfo[]
  /** Parallel to openPositions. */
  mintData: readonly (MintData | undefined)[]
  nowMs: number
}): PositionsSummary {
  let valueUsd = 0
  let feesUsd = 0
  let pnlUsd = 0
  let pnlCount = 0
  let aprWeightedSum = 0
  let aprValueSum = 0

  openPositions.forEach((position, index) => {
    const value = position.totalValueUsd ?? 0
    valueUsd += value
    const history = mintData[index]
    const feeStats = history ? getPositionFeeStats({ position, mintData: history, nowMs }) : undefined
    feesUsd += feeStats?.totalFeesUsd ?? position.uncollectedFeesUsd ?? 0

    const pnl = history ? getPositionPnlUsd(position, history) : undefined
    if (pnl !== undefined) {
      pnlUsd += pnl
      pnlCount += 1
    }

    const apr = feeStats?.feeApr ?? getPositionFeeAprEstimate(position, nowMs)
    if (apr !== undefined && value > 0) {
      aprWeightedSum += apr * value
      aprValueSum += value
    }
  })

  return {
    openCount: openPositions.length,
    valueUsd,
    feesUsd,
    pnlUsd: pnlCount > 0 ? pnlUsd : undefined,
    pnlCount,
    feeApr: aprValueSum > 0 ? aprWeightedSum / aprValueSum : undefined,
  }
}
