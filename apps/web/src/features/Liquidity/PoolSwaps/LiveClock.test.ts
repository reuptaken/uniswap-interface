import { describe, expect, it } from 'vitest'
import { formatClock } from '~/features/Liquidity/PoolSwaps/LiveClock'

describe('formatClock', () => {
  it('shows hh:mm:ss in local time, zero-padded', () => {
    expect(formatClock(new Date(2026, 0, 5, 7, 3, 9))).toBe('07:03:09')
  })

  it('shows the last second of the day', () => {
    expect(formatClock(new Date(2026, 11, 31, 23, 59, 58))).toBe('23:59:58')
  })
})
