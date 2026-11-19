import { describe, expect, it } from 'vitest'
import {
  DEPTH_QUOTE_MOVE,
  formatCompactUsd,
  token1PerMoveAt,
} from '~/features/Liquidity/charts/PositionCandlestickChart/marketDepth'

describe('token1PerMoveAt', () => {
  it('is liquidity × √price × (√(1 + move) − 1)', () => {
    const tick = 1000
    expect(token1PerMoveAt({ tick, liquidity: 1e18 })).toBeCloseTo(
      1e18 * 1.0001 ** (tick / 2) * (Math.sqrt(1 + DEPTH_QUOTE_MOVE) - 1),
      -6,
    )
  })

  it('scales with liquidity', () => {
    expect(token1PerMoveAt({ tick: 0, liquidity: 2e18 })).toBeCloseTo(
      2 * token1PerMoveAt({ tick: 0, liquidity: 1e18 }),
      -6,
    )
  })
})

describe('formatCompactUsd', () => {
  it('shortens to a few characters', () => {
    expect(formatCompactUsd(3_412_000)).toBe('$3.4M')
    expect(formatCompactUsd(812_400)).toBe('$812K')
    expect(formatCompactUsd(2_490)).toBe('$2.5K')
    expect(formatCompactUsd(950.4)).toBe('$950')
  })
})
