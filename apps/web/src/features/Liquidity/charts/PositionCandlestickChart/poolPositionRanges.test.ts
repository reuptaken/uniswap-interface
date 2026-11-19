import {
  getPoolPositionRanges,
  tickToPrice,
} from '~/features/Liquidity/charts/PositionCandlestickChart/poolPositionRanges'
import type { NftPositionInfo } from '~/features/Liquidity/hooks/useOwnerOpenPositions'
import { buildPositionInfo } from '~/test-utils/pools/liquidityServicePositionFixtures'

// The fixture is a mainnet ETH/USDT v4 pool whose live tick is -202299.
const current = buildPositionInfo({ liquidity: '1000000000000' }) as NftPositionInfo

function sibling(overrides: Partial<NftPositionInfo>): NftPositionInfo {
  return { ...current, ...overrides } as NftPositionInfo
}

describe('tickToPrice', () => {
  it('prices token0 in token1, adjusted for decimals', () => {
    // ETH (18 decimals) in USDT (6 decimals) around tick -202299 is roughly 1,640.
    expect(tickToPrice({ tick: -202299, decimals0: 18, decimals1: 6 })).toBeCloseTo(1640, -1)
  })
})

describe('getPoolPositionRanges', () => {
  it('keeps the owner’s other positions in the same pool, flagging whether the live price is inside', () => {
    const inside = sibling({ tokenId: '1', tickLower: -202400, tickUpper: -202200, createdAt: 1_700_000_000 })
    const above = sibling({ tokenId: '2', tickLower: -202000, tickUpper: -201800 })
    const otherPool = sibling({ tokenId: '3', poolId: '0xother' })

    const ranges = getPoolPositionRanges({
      positions: [current, inside, above, otherPool],
      current,
      priceInverted: false,
    })

    expect(ranges.map((range) => [range.inRange, range.startTime])).toEqual([
      [true, 1_700_000_000],
      [false, 0],
    ])
    expect(ranges[0].priceLower).toBeCloseTo(tickToPrice({ tick: -202400, decimals0: 18, decimals1: 6 }))
    expect(ranges[0].priceUpper).toBeCloseTo(tickToPrice({ tick: -202200, decimals0: 18, decimals1: 6 }))
  })

  it('inverts the bounds when the chart shows the price inverted', () => {
    const inside = sibling({ tokenId: '1', tickLower: -202400, tickUpper: -202200 })

    const [range] = getPoolPositionRanges({ positions: [inside], current, priceInverted: true })

    expect(range.priceLower).toBeCloseTo(1 / tickToPrice({ tick: -202200, decimals0: 18, decimals1: 6 }))
    expect(range.priceUpper).toBeCloseTo(1 / tickToPrice({ tick: -202400, decimals0: 18, decimals1: 6 }))
  })
})
