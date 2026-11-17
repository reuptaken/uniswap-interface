import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { ONE_DAY_MS, ONE_SECOND_MS } from 'utilities/src/time/time'
import { describe, expect, it } from 'vitest'
import type { MintData } from '~/features/Liquidity/hooks/usePositionMintData'
import { isOpenPosition, summarizePositions } from '~/features/Liquidity/utils/summarizePositions'

const CREATED_AT_SECONDS = 1_700_000_000
const NOW_MS = CREATED_AT_SECONDS * ONE_SECOND_MS + 10 * ONE_DAY_MS

function makePosition(overrides: Partial<PositionInfo> = {}): PositionInfo {
  return {
    version: ProtocolVersion.V3,
    status: PositionStatus.IN_RANGE,
    currency0Amount: { currency: { decimals: 18 } },
    currency1Amount: { currency: { decimals: 6 } },
    createdAt: CREATED_AT_SECONDS,
    updatedAt: CREATED_AT_SECONDS,
    totalValueUsd: 10_000,
    uncollectedFeesUsd: 100,
    token0PriceUsd: 2_000,
    token1PriceUsd: 1,
    ...overrides,
  } as unknown as PositionInfo
}

function depositedUsdc(amount: bigint): MintData {
  return {
    timestamp: CREATED_AT_SECONDS,
    totalDeposited0: 0n,
    totalDeposited1: amount * 10n ** 6n,
    totalCollected0: 0n,
    totalCollected1: 0n,
    totalWithdrawn0: 0n,
    totalWithdrawn1: 0n,
    events: [],
  }
}

describe('summarizePositions', () => {
  it('totals value, fees and P/L across open positions', () => {
    const summary = summarizePositions({
      openPositions: [makePosition(), makePosition({ totalValueUsd: 20_000, uncollectedFeesUsd: 50 })],
      mintData: [depositedUsdc(10_000n), depositedUsdc(19_000n)],
      nowMs: NOW_MS,
    })
    expect(summary.openCount).toBe(2)
    expect(summary.valueUsd).toBe(30_000)
    expect(summary.feesUsd).toBe(150)
    expect(summary.pnlUsd).toBeCloseTo(100 + 1_050)
    expect(summary.pnlCount).toBe(2)
  })

  it('counts collected fees in the fees total', () => {
    const collectedTwentyUsdc = { ...depositedUsdc(10_000n), totalCollected1: 20n * 10n ** 6n }
    const summary = summarizePositions({
      openPositions: [makePosition()],
      mintData: [collectedTwentyUsdc],
      nowMs: NOW_MS,
    })
    expect(summary.feesUsd).toBeCloseTo(120)
  })

  it('weights the fee APR by position value', () => {
    // 1% in 10 days = 36.5% on $10k, 0.25% in 10 days = 9.125% on $20k → (365_000 + 182_500) / 30_000
    const summary = summarizePositions({
      openPositions: [makePosition(), makePosition({ totalValueUsd: 20_000, uncollectedFeesUsd: 50 })],
      mintData: [undefined, undefined],
      nowMs: NOW_MS,
    })
    expect(summary.feeApr).toBeCloseTo(18.25)
  })

  it('reports a partial P/L while some histories are still loading', () => {
    const summary = summarizePositions({
      openPositions: [makePosition(), makePosition()],
      mintData: [depositedUsdc(10_000n), undefined],
      nowMs: NOW_MS,
    })
    expect(summary.pnlUsd).toBeCloseTo(100)
    expect(summary.pnlCount).toBe(1)
  })

  it('has no P/L or APR when nothing qualifies', () => {
    const summary = summarizePositions({
      openPositions: [makePosition({ updatedAt: CREATED_AT_SECONDS + 1 })],
      mintData: [undefined],
      nowMs: NOW_MS,
    })
    expect(summary.pnlUsd).toBeUndefined()
    expect(summary.feeApr).toBeUndefined()
  })
})

describe('isOpenPosition', () => {
  it('counts in- and out-of-range positions as open, closed ones not', () => {
    expect(isOpenPosition(makePosition())).toBe(true)
    expect(isOpenPosition(makePosition({ status: PositionStatus.OUT_OF_RANGE }))).toBe(true)
    expect(isOpenPosition(makePosition({ status: PositionStatus.CLOSED }))).toBe(false)
  })
})
