import { useCallback } from 'react'
import { useCurrentLocale } from 'uniswap/src/features/language/hooks'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { NoDecimalsCurrency } from 'utilities/src/format/localeBasedFormats'

/** USD amounts in the user's display currency and locale, rounded to whole units. */
export function useFormatWholeFiat(): (usd: number | undefined, placeholder?: string) => string {
  const { convertFiatAmount } = useLocalizationContext()
  const locale = useCurrentLocale()

  return useCallback(
    (usd: number | undefined, placeholder = '–') => {
      if (usd === undefined || !Number.isFinite(usd)) {
        return placeholder
      }
      const { amount, currency } = convertFiatAmount(usd)
      return NoDecimalsCurrency.createFormat(locale, currency).format(amount)
    },
    [convertFiatAmount, locale],
  )
}
