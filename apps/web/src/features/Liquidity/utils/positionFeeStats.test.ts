import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { ONE_DAY_MS, ONE_SECOND_MS } from 'utilities/src/time/time'
import { describe, expect, it } from 'vitest'
import { getPositionFeeStats } from '~/features/Liquidity/utils/positionFeeStats'

const MINTED_AT_SECONDS = 1_700_000_000
const NOW_MS = MINTED_AT_SECONDS * ONE_SECOND_MS + 10 * ONE_DAY_MS
const USDC = 10n ** 6n
const WETH = 10n ** 18n

function makePosition(overrides: Partial<PositionInfo> = {}): PositionInfo {
  return {
    version: ProtocolVersion.V3,
    currency0Amount: { currency: { decimals: 18 } },
    currency1Amount: { currency: { decimals: 6 } },
    uncollectedFeesUsd: 100,
    token0PriceUsd: 2_000,
    token1PriceUsd: 1,
    ...overrides,
  } as unknown as PositionInfo
}

const history = {
  timestamp: MINTED_AT_SECONDS,
  totalDeposited0: 0n,
  totalDeposited1: 10_000n * USDC,
  totalCollected0: 0n,
  totalCollected1: 0n,
  totalWithdrawn0: 0n,
  totalWithdrawn1: 0n,
}

describe('getPositionFeeStats', () => {
  it('annualizes uncollected fees over deposits when nothing was collected', () => {
    const stats = getPositionFeeStats({ position: makePosition(), mintData: history, nowMs: NOW_MS })
    expect(stats?.collectedFeesUsd).toBe(0)
    expect(stats?.totalFeesUsd).toBe(100)
    expect(stats?.feeApr).toBeCloseTo(36.5)
  })

  it('adds collected fees but not the withdrawn principal collected with them', () => {
    const withdrewAndCollected = {
      ...history,
      totalWithdrawn0: WETH,
      totalCollected0: WETH + WETH / 100n,
      totalCollected1: 50n * USDC,
    }
    const stats = getPositionFeeStats({ position: makePosition(), mintData: withdrewAndCollected, nowMs: NOW_MS })
    // 0.01 WETH ($20) + 50 USDC collected as fees
    expect(stats?.collectedFeesUsd).toBeCloseTo(70)
    expect(stats?.totalFeesUsd).toBeCloseTo(170)
    expect(stats?.feeApr).toBeCloseTo(62.05)
  })

  it('never counts a negative fee when principal is withdrawn but not yet collected', () => {
    const stats = getPositionFeeStats({
      position: makePosition(),
      mintData: { ...history, totalWithdrawn1: 5_000n * USDC },
      nowMs: NOW_MS,
    })
    expect(stats?.collectedFeesUsd).toBe(0)
  })

  it('annualizes from the actual age even within the first day', () => {
    const stats = getPositionFeeStats({
      position: makePosition(),
      mintData: history,
      nowMs: MINTED_AT_SECONDS * ONE_SECOND_MS + ONE_DAY_MS / 2,
    })
    // 1% in half a day → 730% a year
    expect(stats?.feeApr).toBeCloseTo(730)
  })

  it('is unavailable until the history loads, or for V4', () => {
    expect(
      getPositionFeeStats({
        position: makePosition(),
        mintData: { ...history, totalWithdrawn0: undefined },
        nowMs: NOW_MS,
      }),
    ).toBeUndefined()
    expect(
      getPositionFeeStats({
        position: makePosition({ version: ProtocolVersion.V4 }),
        mintData: history,
        nowMs: NOW_MS,
      }),
    ).toBeUndefined()
  })
})
