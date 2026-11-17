import { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { ONE_DAY_MS, ONE_SECOND_MS } from 'utilities/src/time/time'

const ONE_YEAR_MS = 365 * ONE_DAY_MS

/**
 * This position's own fee APR from data the list already has: uncollected fees over current value, annualized
 * since creation. Only valid while uncollected fees are every fee ever earned and the liquidity never changed,
 * i.e. nothing has happened since the mint, so anything else returns undefined.
 */
export function getPositionFeeAprEstimate(position: PositionInfo, nowMs: number): number | undefined {
  const { status, createdAt, updatedAt, uncollectedFeesUsd, totalValueUsd } = position
  if (status !== PositionStatus.IN_RANGE && status !== PositionStatus.OUT_OF_RANGE) {
    return undefined
  }
  if (createdAt === undefined || uncollectedFeesUsd === undefined || !totalValueUsd || totalValueUsd <= 0) {
    return undefined
  }
  if (updatedAt !== undefined && updatedAt !== createdAt) {
    return undefined
  }
  const ageMs = nowMs - createdAt * ONE_SECOND_MS
  if (ageMs <= 0) {
    return undefined
  }
  return (uncollectedFeesUsd / totalValueUsd) * (ONE_YEAR_MS / ageMs) * 100
}
