import { Percent } from '@uniswap/sdk-core'
import { Flex, Text } from '@universe/mycelium'
import { useSporeColors } from '@universe/mycelium/theme-hooks-compat'
import { TestID } from '@universe/test'
import { scaleLinear } from 'd3'
import { useMemo } from 'react'
import { CurrencyLogo } from 'uniswap/src/components/CurrencyLogo/CurrencyLogo'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { useSrcColor } from '~/hooks/useColor'

type Bar = {
  /**
   * Identity of the segment, stable across refetches — it keys the slice's extracted-color state.
   * The token alone won't do: a pool incentivized in one of its own tokens has a fee segment and a
   * reward segment in the same currency, so callers qualify it with the segment's role.
   */
  id: string
  value: Percent
  currencyInfo: CurrencyInfo
}

type LiquidityPositionStackedBarsProps = {
  bars: Bar[]
  /**
   * 'inline' sets a two-token split on one line, each share at its end of a taller bar. Any other
   * count (e.g. fees plus reward tokens) keeps the legend layout, which has room for them.
   */
  layout?: 'legend' | 'inline'
}

const LEGEND_BAR_HEIGHT = 4
const INLINE_BAR_HEIGHT = 12

/**
 * A bar's slice is tinted with its token's logo colour. Extracting it here rather than in the
 * caller keeps it one hook per rendered slice, so the number of bars can vary freely — callers
 * pass however many they have and don't deal in colour at all.
 */
function BarSlice({
  currencyInfo,
  share,
  height,
}: {
  currencyInfo: CurrencyInfo
  share: number
  height: number
}): JSX.Element {
  const colors = useSporeColors()
  // Contrast is checked against surface2 — every surface these bars appear on is a surface2 card.
  const { tokenColor } = useSrcColor({
    src: currencyInfo.logoUrl ?? undefined,
    currencyName: currencyInfo.currency.name,
    backgroundColor: colors.surface2.val,
    colorOverrides: currencyInfo.colorOverrides,
  })

  return (
    <Flex
      height={height}
      borderRadius="$roundedFull"
      backgroundColor={tokenColor ?? colors.accent1.val}
      // Grown from zero rather than sized as a percentage: shares already total 100%, so the gaps
      // between slices would otherwise add to that and push the row past its container. Growing
      // takes the gaps out of the available width instead, however many slices there are.
      flexGrow={share}
      flexBasis={0}
      minWidth={0}
    />
  )
}

function BarShare({ bar, label }: { bar: Bar; label: string }): JSX.Element {
  return (
    <Flex row alignItems="center" gap="$spacing6" flexShrink={0} testID={TestID.LiquidityPositionStackedBarSegment}>
      <CurrencyLogo currencyInfo={bar.currencyInfo} size={16} />
      <Text variant="body3" color="$neutral1">
        {label}
      </Text>
    </Flex>
  )
}

export const LiquidityPositionStackedBars = ({
  bars,
  layout = 'legend',
}: LiquidityPositionStackedBarsProps): JSX.Element => {
  const { formatPercent } = useLocalizationContext()
  const scale = useMemo(() => {
    const sum = bars.reduce((acc, bar) => acc.add(bar.value), new Percent(0, 100))
    // Check if sum is effectively zero to avoid division by zero
    const sumValue = sum.equalTo(new Percent(0, 100)) ? 1 : Number(sum.toFixed(2))
    return scaleLinear().domain([0, sumValue]).range([0, 100])
  }, [bars])

  // Helper function to safely convert Percent to number
  const safePercentToNumber = (percent: Percent): number => {
    return percent.equalTo(new Percent(0, 100)) ? 0 : Number(percent.toFixed(2))
  }

  const shareOf = (bar: Bar): number => scale(safePercentToNumber(bar.value))
  const labelOf = (bar: Bar): string => (bar.value.equalTo(new Percent(0, 100)) ? '0%' : formatPercent(shareOf(bar)))
  const isInline = layout === 'inline' && bars.length === 2
  const barHeight = isInline ? INLINE_BAR_HEIGHT : LEGEND_BAR_HEIGHT
  const barRow = (
    <Flex row borderRadius="$roundedFull" gap="$spacing2" height={barHeight} flexGrow={1} flexBasis={0} minWidth={0}>
      {bars.map((bar) => (
        <BarSlice key={bar.id} currencyInfo={bar.currencyInfo} share={shareOf(bar)} height={barHeight} />
      ))}
    </Flex>
  )

  if (isInline) {
    const [first, second] = bars
    return (
      <Flex row alignItems="center" gap="$gap8">
        <BarShare bar={first} label={labelOf(first)} />
        {barRow}
        <BarShare bar={second} label={labelOf(second)} />
      </Flex>
    )
  }

  return (
    <Flex gap="$gap8">
      {barRow}
      {/* Wraps because the entry count follows the number of reward tokens, which is open-ended —
          five already outgrow the card on one line. */}
      <Flex row flexWrap="wrap" gap="$gap12" rowGap="$spacing8">
        {bars.map((bar) => (
          <BarShare key={bar.id} bar={bar} label={labelOf(bar)} />
        ))}
      </Flex>
    </Flex>
  )
}
