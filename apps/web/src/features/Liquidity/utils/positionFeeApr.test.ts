import { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { ONE_DAY_MS, ONE_SECOND_MS } from 'utilities/src/time/time'
import { describe, expect, it } from 'vitest'
import { getPositionFeeAprEstimate } from '~/features/Liquidity/utils/positionFeeApr'

const CREATED_AT_SECONDS = 1_700_000_000
const NOW_MS = CREATED_AT_SECONDS * ONE_SECOND_MS + 10 * ONE_DAY_MS

function makePosition(overrides: Partial<PositionInfo> = {}): PositionInfo {
  return {
    status: PositionStatus.IN_RANGE,
    createdAt: CREATED_AT_SECONDS,
    updatedAt: CREATED_AT_SECONDS,
    uncollectedFeesUsd: 100,
    totalValueUsd: 10_000,
    ...overrides,
  } as PositionInfo
}

describe('getPositionFeeAprEstimate', () => {
  it('annualizes uncollected fees over current value since creation', () => {
    // 1% in 10 days → 36.5% a year
    expect(getPositionFeeAprEstimate(makePosition(), NOW_MS)).toBeCloseTo(36.5)
  })

  it('applies to out-of-range positions too', () => {
    expect(getPositionFeeAprEstimate(makePosition({ status: PositionStatus.OUT_OF_RANGE }), NOW_MS)).toBeCloseTo(36.5)
  })

  it('is unavailable once the position changed after the mint', () => {
    expect(getPositionFeeAprEstimate(makePosition({ updatedAt: CREATED_AT_SECONDS + 60 }), NOW_MS)).toBeUndefined()
  })

  it('is unavailable for closed positions', () => {
    expect(getPositionFeeAprEstimate(makePosition({ status: PositionStatus.CLOSED }), NOW_MS)).toBeUndefined()
  })

  it('annualizes from the actual age even within the first day', () => {
    const halfDayLater = CREATED_AT_SECONDS * ONE_SECOND_MS + ONE_DAY_MS / 2
    // 1% in half a day → 730% a year
    expect(getPositionFeeAprEstimate(makePosition(), halfDayLater)).toBeCloseTo(730)
  })

  it('is unavailable without a valuation or fee amount', () => {
    expect(getPositionFeeAprEstimate(makePosition({ totalValueUsd: undefined }), NOW_MS)).toBeUndefined()
    expect(getPositionFeeAprEstimate(makePosition({ totalValueUsd: 0 }), NOW_MS)).toBeUndefined()
    expect(getPositionFeeAprEstimate(makePosition({ uncollectedFeesUsd: undefined }), NOW_MS)).toBeUndefined()
  })
})
