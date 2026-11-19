import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { PoolSwap } from '~/features/Liquidity/PoolSwaps/poolSwaps'
import { useArrivedSwapIds } from '~/features/Liquidity/PoolSwaps/useArrivedSwapIds'

const swap = (id: string): PoolSwap => ({
  id,
  blockNumber: 1,
  logIndex: 0,
  timestamp: 0,
  txHash: '0x1',
  amount0: 0n,
  amount1: 0n,
  sqrtPriceX96: 0n,
})

function render(initial: { swaps: PoolSwap[] | undefined; poolAddress: string }) {
  return renderHook((props: { swaps: PoolSwap[] | undefined; poolAddress: string }) => useArrivedSwapIds(props), {
    initialProps: initial,
  })
}

describe('useArrivedSwapIds', () => {
  it('leaves the first read’s history out and reports only what arrives after', () => {
    const { result, rerender } = render({ swaps: [swap('a'), swap('b')], poolAddress: '0xpool' })
    expect(result.current.size).toBe(0)

    rerender({ swaps: [swap('a'), swap('b'), swap('c')], poolAddress: '0xpool' })
    expect([...result.current]).toEqual(['c'])
  })

  it('starts over for another pool instead of flashing its whole history', () => {
    const { result, rerender } = render({ swaps: [swap('a')], poolAddress: '0xpool' })
    rerender({ swaps: [swap('a'), swap('b')], poolAddress: '0xpool' })
    expect([...result.current]).toEqual(['b'])

    rerender({ swaps: [swap('x'), swap('y')], poolAddress: '0xother' })
    expect(result.current.size).toBe(0)
  })
})
