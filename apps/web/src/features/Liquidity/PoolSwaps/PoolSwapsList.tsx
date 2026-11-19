import '~/features/Liquidity/PoolSwaps/PoolSwapsList.css'
import type { Currency } from '@uniswap/sdk-core'
import type { EVMUniverseChainId } from '@universe/chains'
import { Flex, Text } from '@universe/mycelium'
import { SegmentedControl } from '@universe/mycelium/segmented-control-compat'
import { opacify, useSporeColors } from '@universe/mycelium/theme-hooks-compat'
import { type CSSProperties, useMemo, useState } from 'react'
import { useCurrentLocale } from 'uniswap/src/features/language/hooks'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'
import { NumberType } from 'utilities/src/format/types'
import { MouseoverTooltip } from '~/components/Tooltip'
import { LiveClock } from '~/features/Liquidity/PoolSwaps/LiveClock'
import {
  baseAmountPerPriceMove,
  estimatePositionFee,
  latestSwaps,
  type PoolSwap,
  priceFromSqrtPriceX96,
  SWAP_HISTORY_SECONDS,
  sqrtPriceAtTick,
} from '~/features/Liquidity/PoolSwaps/poolSwaps'
import {
  SWAP_ARROW_SIZE,
  SwapSideArrow,
  type SwapSizeTier,
  swapSizeOpacity,
  swapSizeTier,
} from '~/features/Liquidity/PoolSwaps/SwapSideArrow'
import {
  DecimalAlignedNumber,
  ExplorerLink,
  formatSwapTime,
  HeaderCell,
  rawToNumber,
  splitAtDecimal,
  TABULAR_NUMBERS,
} from '~/features/Liquidity/PoolSwaps/swapTableCells'
import { useArrivedSwapIds } from '~/features/Liquidity/PoolSwaps/useArrivedSwapIds'
import { usePoolSwaps } from '~/features/Liquidity/PoolSwaps/usePoolSwaps'
import { useFlashColor } from '~/pages/Positions/useFlashColor'

/** One of the owner's positions in this pool, enough to estimate its fees. */
export interface OwnerPoolPosition {
  tokenId: string
  liquidity: string
  tickLower: number
  tickUpper: number
}

const COLUMN_WIDTHS = { date: 76 } as const
const SHOWN_SWAPS = 25
const ARRIVED_CLASS = 'pool-swap-arrived'
// The arrival flash's starting tint per size tier, in percent: dust barely shows, the biggest swaps stand out.
const ARRIVAL_TINT: Record<SwapSizeTier, number> = { 0: 4, 1: 8, 2: 12, 3: 22, 4: 35 }
// How fast every flash fades, in tint percent per second: the biggest swaps' 35% takes 1.2s, and a fainter start
// ends proportionally sooner.
const ARRIVAL_FADE_PER_SECOND = 35 / 1.2
// XL swaps share L's size tier but flash stronger and longer, so they stand out and linger.
const XL_ARRIVAL_TINT = 50
const XL_ARRIVAL_SECONDS = 2.4
// Per-swap fees are mostly fractions of a cent, so they're shown in cents.
const FEE_CENT_DECIMALS = 2
const FILTER_CLASS = 'pool-swaps-filter'
// Size filters: swaps that moved the pool price by more than this fraction (0.00001 = 0.001%).
const MOVE_FILTERS = { XS: 0.000002, S: 0.00001, M: 0.00005, L: 0.0002, XL: 0.0004 } as const

type SwapFilter = 'all' | keyof typeof MOVE_FILTERS

// Quote amounts from here up are shown without decimals.
const QUOTE_WHOLE_FROM = 100
const FILTER_SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const
const FILTER_ORDER: readonly SwapFilter[] = ['all', ...FILTER_SIZES]
// Selected on each page load: hides dust and the smallest trades.
const DEFAULT_FILTER: SwapFilter = 'S'

/**
 * The swap's size class: the most specific filter it passes (XS…XL), or "dust" below XS; undefined when its price
 * move isn't known (the first swap read).
 */
function sizeClass(priceMove: number | undefined): string | undefined {
  if (priceMove === undefined) {
    return undefined
  }
  const passed = FILTER_SIZES.filter((size) => priceMove > MOVE_FILTERS[size])
  return passed.length > 0 ? passed[passed.length - 1] : 'dust'
}

const percentLabel = (fraction: number): string => `${Number((fraction * 100).toPrecision(3))}%`

/**
 * The pool's latest swaps, live: read from the chain (usePoolSwaps), 15 minutes back on load. Amounts and price are
 * shown the way the page shows the pair (base, then quote); buy and sell are from the taker's side, for the base token.
 */
export function PoolSwapsList({
  chainId,
  poolAddress,
  token0,
  token1,
  baseIsToken0,
  position,
  ownerPoolPositions,
  currentTokenId,
  stablecoinIndex,
  usdPerToken,
}: {
  chainId: EVMUniverseChainId
  poolAddress: string
  token0: Currency
  token1: Currency
  baseIsToken0: boolean
  /** The position whose fee from each swap is estimated (see estimatePositionFee). */
  position?: { liquidity: string; tickLower: number; tickUpper: number; feeAmount: number }
  /** All the owner's open positions in this pool, this one included: their fees from the same swaps add up. */
  ownerPoolPositions?: readonly OwnerPoolPosition[]
  /** The shown position's token id, marked in the fee breakdown. */
  currentTokenId?: string
  /** Which pool token is a stablecoin, if one is: the other is then priced in USD at each swap's own price. */
  stablecoinIndex?: 0 | 1
  /** USD prices to fall back on for a pair without a stablecoin. */
  usdPerToken?: { token0?: number; token1?: number }
}): JSX.Element {
  const { formatNumberOrString } = useLocalizationContext()
  const locale = useCurrentLocale()
  const wholeNumberFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale])
  const [filter, setFilter] = useState<SwapFilter>(DEFAULT_FILTER)
  const { state, isLoading, error, updatedAt } = usePoolSwaps({ chainId, poolAddress })
  const colors = useSporeColors()

  const arrivedIds = useArrivedSwapIds({ swaps: state?.swaps, poolAddress })
  const minPriceMove = filter === 'all' ? undefined : MOVE_FILTERS[filter]
  const base = baseIsToken0 ? token0 : token1
  const quote = baseIsToken0 ? token1 : token0

  const shown = useMemo(
    () =>
      latestSwaps({
        swaps: state?.swaps ?? [],
        count: SHOWN_SWAPS,
        minPriceMove,
      }),
    [state?.swaps, minPriceMove],
  )
  // Roughly how big a swap each filter's threshold means right now, from the swaps seen.
  const depth = useMemo(
    () => baseAmountPerPriceMove({ swaps: state?.swaps ?? [], baseIsToken0, baseDecimals: base.decimals }),
    [state?.swaps, baseIsToken0, base.decimals],
  )
  const filterOptions = useMemo(
    () =>
      FILTER_ORDER.map((value) => {
        const threshold = value === 'all' ? undefined : MOVE_FILTERS[value]
        const approxSize =
          threshold !== undefined && depth !== undefined
            ? ` — about ${formatNumberOrString({ value: threshold * depth, type: NumberType.TokenNonTx })} ${base.symbol} or more at the pool’s current depth`
            : ''
        const tooltip =
          threshold === undefined
            ? 'Every swap'
            : `Swaps that moved the price by more than ${percentLabel(threshold)}${approxSize}`
        return {
          value,
          display: (
            <MouseoverTooltip text={tooltip} placement="top">
              <Text variant="buttonLabel3">{value === 'all' ? 'All' : value}</Text>
            </MouseoverTooltip>
          ),
        }
      }),
    [depth, base.symbol, formatNumberOrString],
  )

  const formatAmount = (value: number): string => formatNumberOrString({ value, type: NumberType.TokenNonTx })
  // The quote side (USDC) drops its cents from 100 up: they're noise at that size. Still aligned on the separator.
  const formatQuoteAmount = (value: number): string =>
    value >= QUOTE_WHOLE_FROM ? wholeNumberFormat.format(value) : formatAmount(value)
  // The formatter's own decimal separator ('.' or ',', by locale): what the columns align on.
  const decimalSeparator = formatAmount(1.5).replace(/[0-9]/g, '').charAt(0) || '.'

  // The position's fee from a swap, in USD; undefined when it can't be estimated (first swap seen, no prices).
  const feeUsdFor = (swap: PoolSwap, target: { liquidity: string; tickLower: number; tickUpper: number }) => {
    if (!position) {
      return undefined
    }
    const fee = estimatePositionFee({
      swap,
      liquidity: Number(target.liquidity),
      sqrtPriceLower: sqrtPriceAtTick(target.tickLower),
      sqrtPriceUpper: sqrtPriceAtTick(target.tickUpper),
      // Every position in the pool pays the same fee tier.
      feeRate: position.feeAmount / 1_000_000,
      feeProtocol: state?.feeProtocol,
    })
    if (!fee) {
      return undefined
    }
    const price0In1 = priceFromSqrtPriceX96({
      sqrtPriceX96: swap.sqrtPriceX96,
      decimals0: token0.decimals,
      decimals1: token1.decimals,
    })
    const usd0 = stablecoinIndex === 0 ? 1 : stablecoinIndex === 1 ? price0In1 : usdPerToken?.token0
    const usd1 = stablecoinIndex === 1 ? 1 : stablecoinIndex === 0 ? 1 / price0In1 : usdPerToken?.token1
    if (usd0 === undefined || usd1 === undefined) {
      return undefined
    }
    return (fee.amount0 / 10 ** token0.decimals) * usd0 + (fee.amount1 / 10 ** token1.decimals) * usd1
  }
  const positionFeeUsd = (swap: PoolSwap): number | undefined => (position ? feeUsdFor(swap, position) : undefined)
  const formatFee = (usd: number | undefined): string =>
    usd === undefined ? '–' : `${(usd * 100).toFixed(FEE_CENT_DECIMALS).replace('.', decimalSeparator)}¢`

  // The position's estimated fees over the last 15 minutes, from every swap (not just the listed ones).
  const allSwaps = state?.swaps ?? []
  const newestTimestamp = allSwaps.length > 0 ? allSwaps[allSwaps.length - 1].timestamp : 0
  const swapsInWindow = allSwaps.filter((swap) => swap.timestamp > newestTimestamp - SWAP_HISTORY_SECONDS)
  const windowFeesUsd = position
    ? swapsInWindow.reduce((total, swap) => total + (positionFeeUsd(swap) ?? 0), 0)
    : undefined
  // The same window for each of the owner's positions here: shown only when there's more than this one.
  const ownerWindowFees =
    position && ownerPoolPositions && ownerPoolPositions.length > 1
      ? ownerPoolPositions
          .map((owned) => ({
            tokenId: owned.tokenId,
            usd: swapsInWindow.reduce((total, swap) => total + (feeUsdFor(swap, owned) ?? 0), 0),
          }))
          .sort((a, b) => b.usd - a.usd)
      : undefined
  const feesLine =
    windowFeesUsd === undefined
      ? undefined
      : ownerWindowFees
        ? {
            totalUsd: ownerWindowFees.reduce((total, owned) => total + owned.usd, 0),
            breakdown: ownerWindowFees.map((owned) => ({ ...owned, isCurrent: owned.tokenId === currentTokenId })),
          }
        : {
            totalUsd: windowFeesUsd,
            breakdown: currentTokenId ? [{ tokenId: currentTokenId, usd: windowFeesUsd, isCurrent: true }] : [],
          }

  const feesTotalText = feesLine ? `≈ $${feesLine.totalUsd.toFixed(2)}` : undefined
  // Green when the window's fees grow, red when they shrink (old swaps leaving the 15 minutes), like other live values.
  const feesTotalFlashColor = useFlashColor(feesTotalText)

  const rows = shown.map((swap) => {
    const baseRaw = baseIsToken0 ? swap.amount0 : swap.amount1
    const quoteRaw = baseIsToken0 ? swap.amount1 : swap.amount0
    const price0In1 = priceFromSqrtPriceX96({
      sqrtPriceX96: swap.sqrtPriceX96,
      decimals0: token0.decimals,
      decimals1: token1.decimals,
    })
    return {
      swap,
      // The pool paying out the base token means the taker bought it.
      isBuy: baseRaw < 0n,
      baseText: formatAmount(rawToNumber(baseRaw, base.decimals)),
      quoteText: formatQuoteAmount(rawToNumber(quoteRaw, quote.decimals)),
      priceText: formatAmount(baseIsToken0 ? price0In1 : 1 / price0In1),
      feeText: formatFee(positionFeeUsd(swap)),
    }
  })
  const fractionChars = (texts: readonly string[]): number =>
    Math.max(0, ...texts.map((text) => splitAtDecimal(text, decimalSeparator)[1].length))
  const fractions = {
    base: fractionChars(rows.map((row) => row.baseText)),
    quote: fractionChars(rows.map((row) => row.quoteText)),
    price: fractionChars(rows.map((row) => row.priceText)),
    fee: fractionChars(rows.map((row) => row.feeText)),
  }

  const renderRow = (
    { swap, isBuy, baseText, quoteText, priceText, feeText }: (typeof rows)[number],
    index: number,
  ): JSX.Element => {
    // A thin line wherever the block changes, so swaps from one block read as a group.
    const startsBlock = index > 0 && rows[index - 1].swap.blockNumber !== swap.blockNumber
    // The price after the swap takes the trade's color: up after a buy, down after a sell.
    const sideColor = isBuy ? '$statusSuccess' : '$statusCritical'
    // The amounts, price after and fee all fade with the swap's size, like its arrow: small swaps recede.
    const tier = swapSizeTier({ priceMove: swap.priceMove, thresholds: MOVE_FILTERS })
    // Signed the way the price moved as shown: a buy of the base token lifts it, a sell lowers it.
    const movedBy =
      swap.priceMove === undefined ? undefined : `${isBuy ? '+' : '−'}${(swap.priceMove * 100).toFixed(3)}% move`

    const isXl = swap.priceMove !== undefined && swap.priceMove > MOVE_FILTERS.XL
    const arrivalTint = isXl ? XL_ARRIVAL_TINT : ARRIVAL_TINT[tier]
    const arrivalSeconds = isXl ? XL_ARRIVAL_SECONDS : arrivalTint / ARRIVAL_FADE_PER_SECOND
    const arrivalColor = opacify(arrivalTint, isBuy ? colors.statusSuccess.val : colors.statusCritical.val)

    return (
      <Flex
        key={swap.id}
        row
        alignItems="center"
        gap="$spacing8"
        py="$spacing2"
        // A swap that just landed flashes in its side's color, as strong as its size (see PoolSwapsList.css).
        className={arrivedIds.has(swap.id) ? ARRIVED_CLASS : undefined}
        style={
          {
            '--arrival-color': arrivalColor,
            '--arrival-duration': `${arrivalSeconds}s`,
          } as CSSProperties
        }
        borderTopWidth={startsBlock ? 1 : 0}
        // Fainter than the header rule: a quiet grouping, not a grid.
        borderColor="$surface2"
      >
        <Flex width={SWAP_ARROW_SIZE}>
          <MouseoverTooltip
            text={[`${isBuy ? 'Buy' : 'Sell'} ${base.symbol}`, sizeClass(swap.priceMove), movedBy]
              .filter(Boolean)
              .join(' · ')}
            placement="top"
          >
            <SwapSideArrow isBuy={isBuy} tier={tier} />
          </MouseoverTooltip>
        </Flex>
        {/* The time links to the transaction, whose hash shows on hover. */}
        <Flex width={COLUMN_WIDTHS.date}>
          <MouseoverTooltip text={swap.txHash} placement="top">
            <ExplorerLink
              url={getExplorerLink({ chainId, data: swap.txHash, type: ExplorerDataType.TRANSACTION })}
              label={formatSwapTime(swap.timestamp)}
            />
          </MouseoverTooltip>
        </Flex>
        <Flex flex={1} flexBasis={0} minWidth={0} alignItems="flex-end">
          <Flex opacity={swapSizeOpacity(tier)}>
            <DecimalAlignedNumber
              text={baseText}
              separator={decimalSeparator}
              fractionChars={fractions.base}
              color="$neutral1"
            />
          </Flex>
        </Flex>
        <Flex flex={1} flexBasis={0} minWidth={0} alignItems="flex-end">
          <Flex opacity={swapSizeOpacity(tier)}>
            <DecimalAlignedNumber
              text={quoteText}
              separator={decimalSeparator}
              fractionChars={fractions.quote}
              color="$neutral1"
            />
          </Flex>
        </Flex>
        <Flex flex={1} flexBasis={0} minWidth={0} alignItems="flex-end">
          <MouseoverTooltip text={movedBy} disabled={movedBy === undefined} placement="top">
            {/* As faint as the swap's arrow: small swaps recede, big ones stand out. */}
            <Flex opacity={swapSizeOpacity(tier)}>
              <DecimalAlignedNumber
                text={priceText}
                separator={decimalSeparator}
                fractionChars={fractions.price}
                color={sideColor}
              />
            </Flex>
          </MouseoverTooltip>
        </Flex>
        {position && (
          <Flex flex={1} flexBasis={0} minWidth={0} alignItems="flex-end">
            {/* Faded like the arrow and price: the fee from a small swap is small too. */}
            <Flex opacity={swapSizeOpacity(tier)}>
              <DecimalAlignedNumber
                text={feeText}
                separator={decimalSeparator}
                fractionChars={fractions.fee}
                color="$neutral1"
              />
            </Flex>
          </Flex>
        )}
      </Flex>
    )
  }

  const emptyText = isLoading
    ? 'Loading swaps…'
    : error && !state
      ? 'Couldn’t load swaps'
      : minPriceMove !== undefined
        ? `No swap moved the price by more than ${percentLabel(minPriceMove)} yet`
        : 'No swaps in the last 15 minutes'

  return (
    <Flex gap="$spacing12">
      <Flex row alignItems="center" justifyContent="space-between">
        <Text variant="body2" color="$neutral2" fontWeight="600">
          Recent swaps
        </Text>
        {/* Tooltips for the selected option too: see PoolSwapsList.css. */}
        <Flex className={FILTER_CLASS}>
          <SegmentedControl
            size="small"
            options={filterOptions}
            selectedOption={filter}
            onSelectOption={(option: SwapFilter) => setFilter(option)}
          />
        </Flex>
      </Flex>
      {/* Fees on the left (when there's a position to estimate them for), the live clock on the right. */}
      <Flex row alignItems="center" justifyContent="space-between" gap="$spacing16">
        {feesLine ? (
          <MouseoverTooltip
            placement="top"
            text={
              <Flex gap="$spacing4">
                <Text variant="body4" color="$neutral2">
                  {feesLine.breakdown.length > 1
                    ? 'The owner’s positions in this pool, last 15 min'
                    : 'This position, last 15 min'}
                </Text>
                {feesLine.breakdown.map((owned) => {
                  const color = owned.isCurrent ? '$neutral1' : owned.usd > 0 ? '$neutral2' : '$neutral3'
                  return (
                    <Flex key={owned.tokenId} row justifyContent="space-between" gap="$spacing16">
                      <Text variant="body4" color={color} fontWeight={owned.isCurrent ? '600' : undefined}>
                        #{owned.tokenId}
                        {owned.isCurrent ? ' (shown)' : ''}
                      </Text>
                      <Text variant="body4" color={color} style={TABULAR_NUMBERS}>
                        ${owned.usd.toFixed(2)}
                      </Text>
                    </Flex>
                  )
                })}
                <Text variant="body4" color="$neutral3">
                  Estimated from each swap’s price move inside each range, its liquidity and the pool fee, after the
                  protocol’s cut
                </Text>
              </Flex>
            }
          >
            <Text variant="body3" color="$neutral2">
              Fees (last 15 min):{' '}
              <Text variant="body3" color={feesTotalFlashColor ?? '$neutral1'} style={TABULAR_NUMBERS}>
                {feesTotalText}
              </Text>
            </Text>
          </MouseoverTooltip>
        ) : (
          <Flex />
        )}
        <LiveClock updatedAt={updatedAt} />
      </Flex>
      <Flex gap="$spacing4">
        <Flex row alignItems="center" gap="$spacing8" pb="$spacing4" borderBottomWidth={1} borderColor="$surface3">
          <HeaderCell width={SWAP_ARROW_SIZE} />
          <HeaderCell width={COLUMN_WIDTHS.date}>Time</HeaderCell>
          <HeaderCell flex={1} alignRight>
            {base.symbol}
          </HeaderCell>
          <HeaderCell flex={1} alignRight>
            {quote.symbol}
          </HeaderCell>
          <HeaderCell flex={1} alignRight>
            Price after
          </HeaderCell>
          {position && (
            <HeaderCell flex={1} alignRight>
              Position fee
            </HeaderCell>
          )}
        </Flex>
        {rows.length > 0 ? (
          rows.map(renderRow)
        ) : (
          <Text variant="body3" color="$neutral3" py="$spacing8">
            {emptyText}
          </Text>
        )}
      </Flex>
    </Flex>
  )
}
