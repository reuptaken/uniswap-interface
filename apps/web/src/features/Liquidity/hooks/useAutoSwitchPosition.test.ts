import { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { describe, expect, it } from 'vitest'
import { isInRange, pickInRangePosition } from '~/features/Liquidity/hooks/useAutoSwitchPosition'
import type { NftPositionInfo } from '~/features/Liquidity/hooks/useOwnerOpenPositions'
import { buildPositionInfo } from '~/test-utils/pools/liquidityServicePositionFixtures'

const base = buildPositionInfo({ liquidity: '1000000000000' }) as NftPositionInfo
const LIVE_TICK = -202300

function position(tokenId: string, tickLower: number, tickUpper: number, overrides: Partial<NftPositionInfo> = {}) {
  return { ...base, tokenId, tickLower, tickUpper, ...overrides } as NftPositionInfo
}

// The current position sits above the live price: out of range.
const current = position('100', -202000, -201000)

describe('isInRange', () => {
  it('reads the live tick for positions in the same pool', () => {
    expect(isInRange({ position: position('1', -202400, -202200), current, liveTick: LIVE_TICK })).toBe(true)
    expect(isInRange({ position: current, current, liveTick: LIVE_TICK })).toBe(false)
  })

  it('leaves out an emptied position even when its range holds the price', () => {
    expect(
      isInRange({ position: position('1', -202400, -202200, { liquidity: '0' }), current, liveTick: LIVE_TICK }),
    ).toBe(false)
  })

  it('falls back on the backend status for another pool', () => {
    const elsewhere = position('1', 0, 10, { poolId: '0xother', status: PositionStatus.IN_RANGE })
    expect(isInRange({ position: elsewhere, current, liveTick: LIVE_TICK })).toBe(true)
  })
})

describe('pickInRangePosition', () => {
  it('picks the in-range position closest by id', () => {
    const positions = [
      current,
      position('40', -202400, -202200),
      position('120', -202400, -202200),
      position('101', -201000, -200000), // nearest id, but out of range
      position('300', -202400, -202200),
    ]
    expect(pickInRangePosition({ current, positions, liveTick: LIVE_TICK })?.tokenId).toBe('120')
  })

  it('finds nothing when no other position is in range', () => {
    expect(pickInRangePosition({ current, positions: [current], liveTick: LIVE_TICK })).toBeUndefined()
  })
})
