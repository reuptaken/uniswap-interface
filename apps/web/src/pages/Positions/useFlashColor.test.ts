import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDisplayedNumber, useFlashColor } from '~/pages/Positions/useFlashColor'

describe('parseDisplayedNumber', () => {
  it('reads the sign whichever minus the formatter used', () => {
    expect(parseDisplayedNumber('-$7,100.12')).toBe(-7100.12)
    expect(parseDisplayedNumber('−3.9%')).toBe(-3.9)
    expect(parseDisplayedNumber('+12.5%')).toBe(12.5)
  })
})

describe('useFlashColor', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  function render(initial: string | undefined) {
    return renderHook(({ value }: { value: string | undefined }) => useFlashColor(value), {
      initialProps: { value: initial },
    })
  }

  it('flashes green on a rise and red on a fall, then clears', () => {
    const { result, rerender } = render('$100.00')
    rerender({ value: '$110.00' })
    expect(result.current).toBe('$statusSuccess')
    rerender({ value: '$105.00' })
    expect(result.current).toBe('$statusCritical')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBeUndefined()
  })

  it('treats a more negative value as a fall', () => {
    const { result, rerender } = render('−3.9%')
    rerender({ value: '−4.0%' })
    expect(result.current).toBe('$statusCritical')
  })

  it('compares across a moment without a value, and never leaves a flash on', () => {
    const { result, rerender } = render('$100.00')
    rerender({ value: '$110.00' })
    expect(result.current).toBe('$statusSuccess')
    // An input reloads: the value is briefly unknown, then comes back lower.
    rerender({ value: undefined })
    rerender({ value: '$90.00' })
    expect(result.current).toBe('$statusCritical')
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBeUndefined()
  })

  it('clears a flash even when the value goes away during it', () => {
    const { result, rerender } = render('$100.00')
    rerender({ value: '$110.00' })
    rerender({ value: undefined })
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(result.current).toBeUndefined()
  })
})
