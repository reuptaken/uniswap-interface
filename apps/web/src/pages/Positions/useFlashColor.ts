import { useEffect, useRef, useState } from 'react'

const FLASH_MS = 3000

/** The number in a displayed value ("-$1,234.56", "−3.9%", "+12.3"), sign included; NaN if there is none. */
export function parseDisplayedNumber(text: string): number {
  // Formatters use the typographic minus (U+2212) as well as the hyphen; both mean negative.
  return parseFloat(text.replace(/−/g, '-').replace(/[^0-9.-]/g, ''))
}

/**
 * Green for a moment when a displayed number goes up, red when it goes down. Compares against the last value actually
 * shown, so a brief gap (the value undefined while an input reloads) neither hides a change nor leaves a flash on: the
 * flash's own timer always clears it.
 */
export function useFlashColor(displayedValue: string | undefined): string | undefined {
  const lastShownRef = useRef<string | undefined>(undefined)
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [flashColor, setFlashColor] = useState<string | undefined>(undefined)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  useEffect(() => {
    if (displayedValue === undefined) {
      return
    }
    const previous = lastShownRef.current
    lastShownRef.current = displayedValue
    if (previous === undefined || previous === displayedValue) {
      return
    }
    const previousNumber = parseDisplayedNumber(previous)
    const currentNumber = parseDisplayedNumber(displayedValue)
    if (Number.isNaN(previousNumber) || Number.isNaN(currentNumber) || previousNumber === currentNumber) {
      return
    }
    setFlashColor(currentNumber > previousNumber ? '$statusSuccess' : '$statusCritical')
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setFlashColor(undefined), FLASH_MS)
  }, [displayedValue])

  return flashColor
}
