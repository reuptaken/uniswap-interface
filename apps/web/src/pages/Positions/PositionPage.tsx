/* oxlint-disable max-lines */
import '~/pages/Positions/PositionPage.css'
import { PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { Currency, CurrencyAmount, Fraction, Percent, Price } from '@uniswap/sdk-core'
import { areAddressesEqual, EVMUniverseChainId, isEVMChain, UniverseChainId } from '@universe/chains'
import { isMobileWeb } from '@universe/environment'
import { Button, Flex, Text, TouchableArea } from '@universe/mycelium'
import { FlexCompat, type FlexCompatProps } from '@universe/mycelium/flex-compat'
import { SegmentedControl, type SegmentedControlOption } from '@universe/mycelium/segmented-control-compat'
import { useDeviceDimensions, useIsDarkMode } from '@universe/mycelium/theme-hooks-compat'
import { TestID } from '@universe/test'
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async/lib/index'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { AlertTriangleFilled } from 'ui/src/components/icons/AlertTriangleFilled'
import { ArrowLeft } from 'ui/src/components/icons/ArrowLeft'
import { ExchangeHorizontal } from 'ui/src/components/icons/ExchangeHorizontal'
import { Flag } from 'ui/src/components/icons/Flag'
import { InfoCircleFilled } from 'ui/src/components/icons/InfoCircleFilled'
import { RotatableChevron } from 'ui/src/components/icons/RotatableChevron'
import { breakpoints } from 'ui/src/theme/breakpoints'
import { PollingInterval, ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useSupportedChainId } from 'uniswap/src/features/chains/hooks/useSupportedChainId'
import { getPrimaryStablecoin } from 'uniswap/src/features/chains/utils'
import { HistoryDuration } from 'uniswap/src/features/dataApi/types'
import { useCurrentLocale } from 'uniswap/src/features/language/hooks'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { formatPositionPrice } from 'uniswap/src/features/positions/formatPositionPrice'
import { useEffectivePositionStatus } from 'uniswap/src/features/positions/hooks/useEffectivePositionStatus'
import { useGetPositionInfo } from 'uniswap/src/features/positions/hooks/useGetPositionInfo'
import { useGetRangeDisplay } from 'uniswap/src/features/positions/hooks/useGetRangeDisplay'
import type { PositionInfo, PositionRewardApr } from 'uniswap/src/features/positions/types'
import { getExactSharePercent } from 'uniswap/src/features/positions/utils'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { shouldReverseForWaterfall } from 'uniswap/src/features/tokens/waterfallPriority'
import { useUSDCValue } from 'uniswap/src/features/transactions/hooks/useUSDCPrice'
import { usePositionVisibilityCheck } from 'uniswap/src/features/visibility/hooks/usePositionVisibilityCheck'
import { currencyId, currencyIdToAddress } from 'uniswap/src/utils/currencyId'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'
import { NumberType } from 'utilities/src/format/types'
import { useEvent } from 'utilities/src/react/hooks'
import { BreadcrumbNavContainer, BreadcrumbNavLink } from '~/components/BreadcrumbNav'
import { Dropdown } from '~/components/Dropdowns/Dropdown'
import { LoadingFullscreen, LoadingRows } from '~/components/Loader/styled'
import { MouseoverTooltip, TooltipSize } from '~/components/Tooltip'
import { BlastShutdownBanner } from '~/features/Liquidity/BlastShutdownBanner'
import { DexToolsChart, getDexToolsChartUrl } from '~/features/Liquidity/charts/DexToolsChart/DexToolsChart'
import { WrappedLiquidityPositionRangeChart } from '~/features/Liquidity/charts/LiquidityPositionRangeChart/LiquidityPositionRangeChart'
import {
  CANDLE_INTERVALS,
  type CandleIntervalLabel,
  DEFAULT_CANDLE_INTERVAL,
  getCandleInterval,
  getPoolCandlesUrl,
} from '~/features/Liquidity/charts/PositionCandlestickChart/poolCandles'
import { PositionCandlestickChart } from '~/features/Liquidity/charts/PositionCandlestickChart/PositionCandlestickChart'
import { useEntryPointBreadcrumb } from '~/features/Liquidity/Create/hooks/useEntryPointBreadcrumb'
import { useLpIncentivesFormattedEarnings } from '~/features/Liquidity/hooks/useLpIncentivesFormattedEarnings'
import { usePositionMintData } from '~/features/Liquidity/hooks/usePositionMintData'
import { useReportPositionHandler } from '~/features/Liquidity/hooks/useReportPositionHandler'
import { LiquidityPositionAmountRows } from '~/features/Liquidity/LiquidityPositionAmountRows'
import { LiquidityPositionInfo } from '~/features/Liquidity/LiquidityPositionInfo'
import { LiquidityPositionStackedBars } from '~/features/Liquidity/LiquidityPositionStackedBars'
import { LoadingRow } from '~/features/Liquidity/Loader'
import { usePositionRewardEarnings } from '~/features/Liquidity/LPIncentives/hooks/usePositionRewardEarnings'
import { PoolAprTooltip } from '~/features/Liquidity/LPIncentives/PoolAprTooltip'
import { RewardAprBadge } from '~/features/Liquidity/LPIncentives/RewardAprBadge'
import { rewardCurrencyId } from '~/features/Liquidity/LPIncentives/utils'
import { PositionExternalLinks } from '~/features/Liquidity/PositionExternalLinks'
import { PositionNFT } from '~/features/Liquidity/PositionNFT'
import { PositionPageActionButtons } from '~/features/Liquidity/PositionPageActionButtons'
import { getBaseAndQuoteCurrencies } from '~/features/Liquidity/utils/currency'
import { useCurrencyInfo } from '~/hooks/Tokens'
import { useAccount } from '~/hooks/useAccount'
import { useDynamicMetatags } from '~/pages/metatags'
import { NotFound } from '~/pages/NotFound'
import { useLivePositionInfo } from '~/pages/Positions/useLivePositionInfo'
import { usePositionTokenURI } from '~/pages/Positions/usePositionTokenURI'
import { MultichainContextProvider } from '~/state/multichain/MultichainContext'
import { usePendingLPTransactionsChangeListener } from '~/state/transactions/hooks'
import { ClickableTamaguiStyle } from '~/theme/components/styles'
import { useChainIdFromUrlParam } from '~/utils/params/chainParams'

type MainView = 'chart' | 'candles' | 'dextools' | 'nft'

const RIGHT_COLUMN_WIDTH = 380
// Matches the body's $spacing32 between sections, e.g. from the header rule to the first card.
const COLUMN_GAP = 32

// Scales this page's text down; see PositionPage.css.
const COMPACT_TEXT_CLASS = 'position-page-compact'

const STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'LUSD']

// Pool prices routinely run to 1e-6 and below, so keep enough significant digits to survive `Number()`.
const SPOT_PRICE_SIGNIFICANT_DIGITS = 12

// Wrap a backend-provided fee USD number as a CurrencyAmount so it flows through the same
// consumers (sum, share %, formatting) as the live-priced values it replaces. Denominated in a
// single fixed stablecoin (Mainnet USDC) so token0 and token1 fees share one currency — the value
// is chain-independent USD, and the UNI-rewards fiat value uses the same currency, so `.add()` and
// the percentage math stay consistent. LP-1616.
function fiatFeeCurrencyAmount(usd: number | undefined): CurrencyAmount<Currency> | undefined {
  if (usd === undefined || !Number.isFinite(usd)) {
    return undefined
  }
  const stablecoin = getPrimaryStablecoin(UniverseChainId.Mainnet)
  return CurrencyAmount.fromRawAmount(stablecoin, Math.round(usd * 10 ** stablecoin.decimals))
}

const EMPTY_REWARDS: PositionRewardApr[] = []

// `$lg` stays `$lg`: mycelium's `media-lg` is `(max-width: 768px)`; Tailwind's stock `lg:` is the inversion.
const BodyWrapper = forwardRef<HTMLElement, FlexCompatProps>(function BodyWrapper({ $lg: lg, ...props }, ref) {
  return (
    <FlexCompat
      ref={ref}
      tag="main"
      backgroundColor="$surface1"
      gap="$spacing32"
      width="100%"
      maxWidth={1200}
      zIndex="$default"
      py="$spacing24"
      px="$spacing40"
      // Merge, don't spread: Tamagui deep-merged a caller's object-valued prop into the config's value for the same key.
      $lg={{ px: '$padding20', ...lg }}
      $md={{ px: '$none' }}
      {...props}
    />
  )
})

function parseTokenId(tokenId: string | undefined): bigint | undefined {
  if (!tokenId) {
    return undefined
  }
  try {
    return BigInt(tokenId)
  } catch {
    return undefined
  }
}

type FiatAmount = Maybe<CurrencyAmount<Currency>>

function quoteOrNull(
  price: Price<Currency, Currency> | undefined,
  amount: CurrencyAmount<Currency>,
): CurrencyAmount<Currency> | null {
  try {
    return price?.quote(amount) ?? null
  } catch {
    return null
  }
}

// Both sides are priced in the pair's own stablecoin so the two results always share a currency; callers `.add()` them.
function withStablecoinFallback({
  amount0,
  amount1,
  fiat0,
  fiat1,
  currency0,
  currency1,
  token0Price,
  token1Price,
}: {
  amount0?: CurrencyAmount<Currency>
  amount1?: CurrencyAmount<Currency>
  fiat0: FiatAmount
  fiat1: FiatAmount
  currency0: Currency
  currency1: Currency
  token0Price?: Price<Currency, Currency>
  token1Price?: Price<Currency, Currency>
}): [FiatAmount, FiatAmount] {
  if ((fiat0 && fiat1) || !amount0 || !amount1) {
    return [fiat0, fiat1]
  }
  if (STABLECOIN_SYMBOLS.includes(currency0.symbol ?? '')) {
    return [amount0, quoteOrNull(token1Price, amount1)]
  }
  if (STABLECOIN_SYMBOLS.includes(currency1.symbol ?? '')) {
    return [quoteOrNull(token0Price, amount0), amount1]
  }
  return [fiat0, fiat1]
}

function parseDisplayedNumber(s: string): number {
  return parseFloat(s.replace(/[^0-9.-]/g, ''))
}

function useFlashColor(displayedValue: string | undefined): string | undefined {
  const prevValueRef = useRef<string | undefined>(undefined)
  const [flashColor, setFlashColor] = useState<string | undefined>(undefined)

  useEffect(() => {
    const prev = prevValueRef.current
    prevValueRef.current = displayedValue

    if (prev === undefined || displayedValue === undefined || prev === displayedValue) {
      return undefined
    }

    const prevNum = parseDisplayedNumber(prev)
    const currNum = parseDisplayedNumber(displayedValue)
    if (Number.isNaN(prevNum) || Number.isNaN(currNum) || prevNum === currNum) {
      return undefined
    }

    setFlashColor(currNum > prevNum ? '$statusSuccess' : '$statusCritical')
    const timer = setTimeout(() => setFlashColor(undefined), 3000)
    return () => clearTimeout(timer)
  }, [displayedValue])

  return flashColor
}

export function PositionPageWrapper() {
  const chainId = useChainIdFromUrlParam()

  if (chainId && !isEVMChain(chainId)) {
    return <Navigate to="/positions" replace />
  }

  return (
    <MultichainContextProvider initialChainId={chainId}>
      <PositionPage chainId={chainId} />
    </MultichainContextProvider>
  )
}

export default PositionPageWrapper

// oxlint-disable-next-line complexity
function PositionPage({ chainId }: { chainId: EVMUniverseChainId | undefined }) {
  const { tokenId: tokenIdFromUrl } = useParams<{ tokenId: string }>()
  const tokenId = parseTokenId(tokenIdFromUrl)
  const chainInfo = chainId ? getChainInfo(chainId) : undefined
  const account = useAccount()
  const supportedAccountChainId = useSupportedChainId(account.chainId)
  const { pathname, search } = useLocation()
  const breadcrumb = useEntryPointBreadcrumb()
  // tokenIds are only unique per position manager; the flag routes the read to the PermissionedPositionManager
  const isPermissionedFromUrl = useMemo(() => new URLSearchParams(search).get('permissioned') === 'true', [search])
  const {
    positionInfo: servedPositionInfo,
    isLoading: positionLoading,
    refetch,
    dataUpdatedAt: positionUpdatedAt,
  } = useGetPositionInfo({
    owner: account.address ?? ZERO_ADDRESS,
    protocolVersion: pathname.includes('v3')
      ? ProtocolVersion.V3
      : pathname.includes('v4')
        ? ProtocolVersion.V4
        : ProtocolVersion.UNSPECIFIED,
    tokenId: tokenIdFromUrl,
    chainId: chainId ?? supportedAccountChainId,
    permissioned: isPermissionedFromUrl,
  })
  const { positionInfo, poolUpdatedAt, poolError } = useLivePositionInfo(servedPositionInfo)
  const metadata = usePositionTokenURI({ tokenId, chainId, version: positionInfo?.version })
  const {
    timestamp: mintTimestamp,
    totalDeposited0,
    totalDeposited1,
    totalCollected0,
    totalCollected1,
    totalWithdrawn0,
    totalWithdrawn1,
    events: positionEvents,
  } = usePositionMintData({ chainId, tokenId: tokenIdFromUrl, version: positionInfo?.version })
  usePendingLPTransactionsChangeListener(refetch)

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 20_000)
    return () => clearInterval(interval)
  }, [refetch])

  const navigate = useNavigate()
  const { t } = useTranslation()

  const metatagProperties = useMemo(() => {
    const token0Symbol = positionInfo?.currency0Amount.currency.symbol
    const token1Symbol = positionInfo?.currency1Amount.currency.symbol
    if (!token0Symbol || !token1Symbol || !chainInfo?.urlParam || !tokenIdFromUrl) {
      return { title: 'Position on Uniswap', url: window.location.href }
    }
    const poolName = `${token0Symbol}/${token1Symbol}`
    const version = pathname.includes('v3') ? 'v3' : 'v4'
    return {
      title: `${poolName} on Uniswap`,
      url: window.location.href,
      image: `${window.location.origin}/api/image/positions/${version}/${chainInfo.urlParam}/${tokenIdFromUrl}`,
    }
  }, [
    positionInfo?.currency0Amount.currency.symbol,
    positionInfo?.currency1Amount.currency.symbol,
    pathname,
    chainInfo?.urlParam,
    tokenIdFromUrl,
  ])
  const metatags = useDynamicMetatags(metatagProperties)

  const { currency0Amount, currency1Amount, status, fee0Amount, fee1Amount } = positionInfo ?? {}
  // Prefer the backend's per-token fee USD (priced with the same token prices it used for the
  // total `uncollectedFeesUsd`) so the fee breakdown here matches the positions-list total. Only
  // the liquidity-service path serves these; fall back to live pricing on the data-api path.
  // Re-pricing with a live oracle is what made this page disagree with the list (LP-1616).
  const liveFiatFeeValue0 = useUSDCValue(fee0Amount, PollingInterval.Slow)
  const liveFiatFeeValue1 = useUSDCValue(fee1Amount, PollingInterval.Slow)
  const backendFiatFeeValue0 = fiatFeeCurrencyAmount(positionInfo?.token0UncollectedFeesUsd)
  const backendFiatFeeValue1 = fiatFeeCurrencyAmount(positionInfo?.token1UncollectedFeesUsd)
  // All-or-nothing so fee0 and fee1 never mix currencies (backend USD vs the live oracle's
  // per-chain stablecoin), which would break the .add() and share-percentage math downstream.
  const useBackendFees = backendFiatFeeValue0 !== undefined && backendFiatFeeValue1 !== undefined
  const fiatFeeValue0Raw = useBackendFees ? backendFiatFeeValue0 : liveFiatFeeValue0
  const fiatFeeValue1Raw = useBackendFees ? backendFiatFeeValue1 : liveFiatFeeValue1
  const fiatValue0Raw = useUSDCValue(currency0Amount, PollingInterval.Slow)
  const fiatValue1Raw = useUSDCValue(currency1Amount, PollingInterval.Slow)

  const depositedCurrency0Amount = useMemo(
    () =>
      totalDeposited0 && currency0Amount
        ? CurrencyAmount.fromRawAmount(currency0Amount.currency, totalDeposited0.toString())
        : undefined,
    [totalDeposited0, currency0Amount],
  )
  const depositedCurrency1Amount = useMemo(
    () =>
      totalDeposited1 && currency1Amount
        ? CurrencyAmount.fromRawAmount(currency1Amount.currency, totalDeposited1.toString())
        : undefined,
    [totalDeposited1, currency1Amount],
  )
  const collectedCurrency0Amount = useMemo(
    () =>
      totalCollected0 && currency0Amount
        ? CurrencyAmount.fromRawAmount(currency0Amount.currency, totalCollected0.toString())
        : undefined,
    [totalCollected0, currency0Amount],
  )
  const collectedCurrency1Amount = useMemo(
    () =>
      totalCollected1 && currency1Amount
        ? CurrencyAmount.fromRawAmount(currency1Amount.currency, totalCollected1.toString())
        : undefined,
    [totalCollected1, currency1Amount],
  )
  const depositedFiat0 = useUSDCValue(depositedCurrency0Amount)
  const depositedFiat1 = useUSDCValue(depositedCurrency1Amount)
  const collectedFiat0 = useUSDCValue(collectedCurrency0Amount)
  const collectedFiat1 = useUSDCValue(collectedCurrency1Amount)

  const priceOrdering = useMemo(() => {
    if (positionInfo?.version === ProtocolVersion.V2 || !positionInfo?.position) {
      return {}
    }

    const position = positionInfo.position
    const token0 = position.amount0.currency
    const token1 = position.amount1.currency

    return {
      priceLower: position.token0PriceLower,
      priceUpper: position.token0PriceUpper,
      quote: token1,
      base: token0,
    }
  }, [positionInfo])

  const isPositionVisible = usePositionVisibilityCheck()
  const isVisible =
    positionInfo !== undefined &&
    isPositionVisible({
      poolId: positionInfo.poolId,
      tokenId: positionInfo.tokenId,
      chainId: positionInfo.chainId,
      isFlaggedSpam: positionInfo.isHidden,
    })

  const reportPositionHandler = useReportPositionHandler({
    position: positionInfo,
    isVisible,
    navigateToPositions: true,
  })

  // Waterfall priority picks the default quote asset (same as the pool details page). The user's flip is
  // stored relative to that default rather than as the absolute value, since positionInfo arrives after mount.
  const waterfallDefault = Boolean(
    currency0Amount && currency1Amount && shouldReverseForWaterfall(currency0Amount.currency, currency1Amount.currency),
  )
  const [userFlipped, setUserFlipped] = useState(false)
  const togglePriceInverted = useEvent(() => setUserFlipped((flipped) => !flipped))
  const priceInverted = waterfallDefault !== userFlipped

  const { formatNumberOrString } = useLocalizationContext()
  const { isPoolPriceStale, isPoolOutOfSync, marketPrice } = useEffectivePositionStatus(positionInfo)
  const stalePriceWarning = useMemo(() => {
    // A stale badge always carries a sibling-pool market price — the status override is gated on
    // one in useEffectivePositionStatus — so the marketPrice check only narrows the type
    if (!isPoolPriceStale || !marketPrice) {
      return undefined
    }

    // Quote the market price in the same orientation as the headline price toggle
    const displayMarketPrice = priceInverted ? marketPrice.invert() : marketPrice
    return {
      marketPrice: `1 ${displayMarketPrice.baseCurrency.symbol} = ${formatNumberOrString({
        value: displayMarketPrice.toSignificant(6),
        type: NumberType.TokenTx,
      })} ${displayMarketPrice.quoteCurrency.symbol}`,
    }
  }, [isPoolPriceStale, marketPrice, priceInverted, formatNumberOrString])

  const { maxPrice, minPrice, isFullRange } = useGetRangeDisplay({
    priceOrdering,
    tickSpacing: positionInfo?.tickSpacing,
    tickLower: positionInfo?.tickLower,
    tickUpper: positionInfo?.tickUpper,
    pricesInverted: priceInverted,
  })

  const { baseCurrency, quoteCurrency } = getBaseAndQuoteCurrencies(
    { TOKEN0: currency0Amount?.currency, TOKEN1: currency1Amount?.currency },
    priceInverted,
  )

  const [selectedHistoryDuration, setSelectedHistoryDuration] = useState<HistoryDuration>(HistoryDuration.Month)
  const [timePeriodDropdownOpen, setTimePeriodDropdownOpen] = useState(false)
  const [mainViewDropdownOpen, setMainViewDropdownOpen] = useState(false)
  const timePeriodOptions = useMemo(() => {
    const options: Array<SegmentedControlOption<HistoryDuration> & { verboseDisplay: JSX.Element }> = [
      [
        HistoryDuration.Day,
        t('token.priceExplorer.timeRangeLabel.day'),
        t('token.priceExplorer.timeRangeLabel.day.verbose'),
      ],
      [
        HistoryDuration.Week,
        t('token.priceExplorer.timeRangeLabel.week'),
        t('token.priceExplorer.timeRangeLabel.week.verbose'),
      ],
      [
        HistoryDuration.Month,
        t('token.priceExplorer.timeRangeLabel.month'),
        t('token.priceExplorer.timeRangeLabel.month.verbose'),
      ],
      [
        HistoryDuration.Year,
        t('token.priceExplorer.timeRangeLabel.year'),
        t('token.priceExplorer.timeRangeLabel.year.verbose'),
      ],
      [HistoryDuration.Max, t('token.priceExplorer.timeRangeLabel.all')],
    ].map((timePeriod) => ({
      value: timePeriod[0] as HistoryDuration,
      display: <Text variant="buttonLabel3">{timePeriod[1]}</Text>,
      verboseDisplay: <Text variant="buttonLabel3">{timePeriod[2] ?? timePeriod[1]}</Text>,
    }))
    return {
      options,
      selected: selectedHistoryDuration,
    }
  }, [selectedHistoryDuration, t])

  const [mainView, setMainView] = useState<MainView>('candles')
  const isDarkMode = useIsDarkMode()
  const dexToolsChartUrl = positionInfo
    ? getDexToolsChartUrl({
        chainId: positionInfo.chainId,
        version: positionInfo.version,
        poolAddress: positionInfo.poolId,
        darkMode: isDarkMode,
      })
    : undefined
  // Candles are priced in the same direction as the headline price: the displayed base token, in the other token.
  const candlesBaseToken = priceInverted ? currency1Amount?.currency : currency0Amount?.currency
  const [candleIntervalLabel, setCandleIntervalLabel] = useState<CandleIntervalLabel>(DEFAULT_CANDLE_INTERVAL)
  const candleInterval = getCandleInterval(candleIntervalLabel)
  const candleIntervalOptions = useMemo(
    () =>
      CANDLE_INTERVALS.map(({ label }) => ({
        value: label,
        display: <Text variant="buttonLabel3">{label}</Text>,
      })),
    [],
  )
  const candlesUrl =
    positionInfo?.version === ProtocolVersion.V3 && candlesBaseToken
      ? getPoolCandlesUrl({
          chainId: positionInfo.chainId,
          poolAddress: positionInfo.poolId,
          pricedTokenAddress: candlesBaseToken.wrapped.address,
          interval: candleInterval,
        })
      : undefined
  // The line chart is no longer offered, but still stands in where candles aren't available (V4, unsupported chains).
  const shownView: MainView = mainView === 'candles' && !candlesUrl ? 'chart' : mainView
  const mainViewOptions = useMemo(() => {
    const options: { value: MainView; display: JSX.Element }[] = []
    if (candlesUrl) {
      options.push({ value: 'candles', display: <Text variant="buttonLabel3">Candles</Text> })
    }
    if (dexToolsChartUrl) {
      options.push({ value: 'dextools', display: <Text variant="buttonLabel3">DEXTools</Text> })
    }
    options.push({ value: 'nft', display: <Text variant="buttonLabel3">{t('common.nft')}</Text> })
    return options
  }, [t, dexToolsChartUrl, candlesUrl])

  const { fullWidth: screenWidth } = useDeviceDimensions()
  const [contentRowWidth, setContentRowWidth] = useState<number | undefined>(undefined)
  const chartWidth = useMemo(() => {
    // The chart requires an exact numeric width to render correctly.
    // On mobile, we use the full width of the screen minus the padding.
    if (screenWidth && screenWidth < breakpoints.lg) {
      return screenWidth - 64
    }
    // Side by side, the chart takes all of the row but the right column and a gap matching the page's section spacing.
    if (contentRowWidth) {
      return Math.floor(contentRowWidth - RIGHT_COLUMN_WIDTH - COLUMN_GAP)
    }
    // On desktop, we use a max width of 620px and shrink the width as the screen gets smaller.
    if (screenWidth && screenWidth < breakpoints.xxl) {
      return Math.min((screenWidth - 32) / 2, 620)
    }
    return 620
  }, [screenWidth, contentRowWidth])

  const onMigrate = useEvent(() => {
    navigate(`/migrate/v3/${chainInfo?.urlParam}/${tokenIdFromUrl}`)
  })

  if (positionLoading) {
    return (
      <BodyWrapper className={COMPACT_TEXT_CLASS}>
        <LoadingRows>
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
          <LoadingRow />
        </LoadingRows>
      </BodyWrapper>
    )
  }

  if (!positionInfo || !currency0Amount || !currency1Amount || !baseCurrency || !quoteCurrency) {
    return (
      <NotFound
        title={<Text variant="heading2">{t('position.notFound')}</Text>}
        subtitle={
          <Flex centered maxWidth="75%" mt="$spacing20">
            <Text color="$neutral2" variant="heading3" textAlign="center">
              {t('position.notFound.description')}
            </Text>
          </Flex>
        }
        actionButton={
          <Flex row centered>
            <Button width="fit-content" variant="branded" onPress={() => navigate(breadcrumb.to)}>
              {breadcrumb.label}
            </Button>
          </Flex>
        }
      />
    )
  }

  const candleRange = (() => {
    const { priceLower, priceUpper } = priceOrdering
    if (!priceLower) {
      return undefined
    }
    const lower = Number(priceLower.toSignificant(12))
    const upper = Number(priceUpper.toSignificant(12))
    if (!(lower > 0) || !(upper > 0)) {
      return undefined
    }
    return priceInverted ? { lower: 1 / upper, upper: 1 / lower } : { lower, upper }
  })()

  // While the pool is out of sync, substitute the most liquid sibling pool's price when one exists
  // (marketPrice); without a trustworthy substitute, keep the pool's own price and only warn
  const token0Price =
    positionInfo.version !== ProtocolVersion.V2 ? (marketPrice ?? positionInfo.poolOrPair?.token0Price) : undefined
  const token1Price =
    positionInfo.version !== ProtocolVersion.V2
      ? (marketPrice?.invert() ?? positionInfo.poolOrPair?.token1Price)
      : undefined

  // Live spot price from the pool's active tick, oriented to match the chart's `priceInverted` display.
  const currentSpotPrice = priceInverted ? token1Price : token0Price
  const currentChartPrice = currentSpotPrice
    ? Number(currentSpotPrice.toSignificant(SPOT_PRICE_SIGNIFICANT_DIGITS))
    : undefined
  // Range bounds relative to the displayed market price, in the same price direction.
  const rangeDeltas =
    candleRange && currentChartPrice
      ? {
          min: (candleRange.lower / currentChartPrice - 1) * 100,
          max: (candleRange.upper / currentChartPrice - 1) * 100,
        }
      : undefined
  // The pool's own live price (never the sibling-pool substitute), which drives the candlestick chart's current candle.
  const livePoolPrice =
    positionInfo.version !== ProtocolVersion.V2 && positionInfo.poolOrPair
      ? Number(
          (priceInverted ? positionInfo.poolOrPair.token1Price : positionInfo.poolOrPair.token0Price).toSignificant(
            SPOT_PRICE_SIGNIFICANT_DIGITS,
          ),
        )
      : undefined

  const stablePricing = {
    token0Price,
    token1Price,
    currency0: currency0Amount.currency,
    currency1: currency1Amount.currency,
  }
  const [fiatValue0, fiatValue1] = withStablecoinFallback({
    ...stablePricing,
    amount0: currency0Amount,
    amount1: currency1Amount,
    fiat0: fiatValue0Raw,
    fiat1: fiatValue1Raw,
  })
  const [fiatFeeValue0, fiatFeeValue1] = withStablecoinFallback({
    ...stablePricing,
    amount0: fee0Amount,
    amount1: fee1Amount,
    fiat0: fiatFeeValue0Raw,
    fiat1: fiatFeeValue1Raw,
  })
  const [depositedFiatValue0, depositedFiatValue1] = withStablecoinFallback({
    ...stablePricing,
    amount0: depositedCurrency0Amount,
    amount1: depositedCurrency1Amount,
    fiat0: depositedFiat0,
    fiat1: depositedFiat1,
  })
  const [collectedFiatValue0, collectedFiatValue1] = withStablecoinFallback({
    ...stablePricing,
    amount0: collectedCurrency0Amount,
    amount1: collectedCurrency1Amount,
    fiat0: collectedFiat0,
    fiat1: collectedFiat1,
  })

  const collectedFeesUsd = sumIfDefined(
    collectedFeesShareUsd({
      collectedUsd: usdOrZero(collectedFiatValue0, totalCollected0),
      collectedRaw: totalCollected0,
      withdrawnRaw: totalWithdrawn0,
    }),
    collectedFeesShareUsd({
      collectedUsd: usdOrZero(collectedFiatValue1, totalCollected1),
      collectedRaw: totalCollected1,
      withdrawnRaw: totalWithdrawn1,
    }),
  )

  const { profitLoss, realizedApr, feesApr } = (() => {
    const deposited0 = usdOrZero(depositedFiatValue0, totalDeposited0)
    const deposited1 = usdOrZero(depositedFiatValue1, totalDeposited1)
    const collected0 = usdOrZero(collectedFiatValue0, totalCollected0)
    const collected1 = usdOrZero(collectedFiatValue1, totalCollected1)
    const value0 = toUsdValue(fiatValue0)
    const value1 = toUsdValue(fiatValue1)
    const feeValue0 = usdOrZero(fiatFeeValue0, fee0Amount ? BigInt(fee0Amount.quotient.toString()) : undefined)
    const feeValue1 = usdOrZero(fiatFeeValue1, fee1Amount ? BigInt(fee1Amount.quotient.toString()) : undefined)

    if (
      !mintTimestamp ||
      value0 === undefined ||
      value1 === undefined ||
      feeValue0 === undefined ||
      feeValue1 === undefined ||
      deposited0 === undefined ||
      deposited1 === undefined ||
      collected0 === undefined ||
      collected1 === undefined
    ) {
      return { profitLoss: undefined, realizedApr: undefined, feesApr: undefined }
    }

    const uncollectedFeesUsd = feeValue0 + feeValue1
    const currentValueUsd = value0 + value1 + uncollectedFeesUsd
    const totalDepositedUsd = deposited0 + deposited1
    const totalCollectedUsd = collected0 + collected1

    const pl = currentValueUsd + totalCollectedUsd - totalDepositedUsd

    const ageSeconds = Date.now() / 1000 - mintTimestamp
    if (totalDepositedUsd === 0 || ageSeconds <= 0) {
      return { profitLoss: pl, realizedApr: undefined, feesApr: undefined }
    }

    const annualizer = (365 * 24 * 3600) / ageSeconds
    const totalReturn = (currentValueUsd + totalCollectedUsd - totalDepositedUsd) / totalDepositedUsd
    return {
      profitLoss: pl,
      realizedApr: totalReturn * annualizer * 100,
      feesApr:
        collectedFeesUsd === undefined
          ? undefined
          : ((collectedFeesUsd + uncollectedFeesUsd) / totalDepositedUsd) * annualizer * 100,
    }
  })()

  const isOwner = areAddressesEqual({
    addressInput1: { address: positionInfo.owner, chainId: positionInfo.chainId },
    addressInput2: { address: account.address, chainId: supportedAccountChainId ?? positionInfo.chainId },
  })

  const rewards = positionInfo.rewards ?? EMPTY_REWARDS

  return (
    <Trace
      logImpression
      page={InterfacePageName.PositionDetails}
      properties={{
        pool_address: positionInfo.poolId,
        label: [currency0Amount.currency.symbol, currency1Amount.currency.symbol].join('/'),
        type: positionInfo.version,
        fee_tier: positionInfo.feeTier?.feeAmount,
        baseCurrencyId: currencyIdToAddress(currencyId(currency0Amount.currency)),
        quoteCurrencyId: currencyIdToAddress(currencyId(currency1Amount.currency)),
      }}
    >
      <Helmet>
        <title>
          {t(`liquidityPool.positions.page.title`, {
            quoteSymbol: currency1Amount.currency.symbol ?? t('common.token'),
            baseSymbol: currency0Amount.currency.symbol ?? t('common.token'),
          })}
        </title>
        {metatags.map((tag, index) => (
          <meta key={index} {...tag} />
        ))}
      </Helmet>
      <BodyWrapper mb={100} className={COMPACT_TEXT_CLASS}>
        <Flex gap="$gap20">
          <BreadcrumbNavContainer aria-label="breadcrumb-nav">
            <BreadcrumbNavLink style={{ gap: '8px' }} to={breadcrumb.to}>
              <ArrowLeft size="$icon.16" /> {breadcrumb.label}
            </BreadcrumbNavLink>
          </BreadcrumbNavContainer>
          {positionInfo.chainId === UniverseChainId.Blast && <BlastShutdownBanner />}
          <Flex
            row
            // The actions collapse into a compact '…' below $lg, so the header keeps its single-row
            // layout (position info left, actions right) like the pool detail page.
            $lg={{ alignItems: 'flex-start', gap: '$gap16' }}
            justifyContent="space-between"
            alignItems="center"
            borderBottomWidth={1}
            borderColor="$surface3"
            pb="$padding16"
          >
            <Flex flex={1} minWidth={0}>
              <LiquidityPositionInfo
                positionInfo={positionInfo}
                linkToPool
                includeNetwork
                stackedLogo
                stalePriceWarning={stalePriceWarning}
                titleAccessory={
                  <Flex row gap="$gap8" alignItems="center">
                    <TouchableArea onPress={togglePriceInverted}>
                      <ExchangeHorizontal size="$icon.16" />
                    </TouchableArea>
                    <PositionExternalLinks position={positionInfo} />
                    {isPoolOutOfSync && (
                      <MouseoverTooltip
                        text={
                          marketPrice
                            ? t('position.currentPrice.poolOutOfSync.tooltip')
                            : t('position.currentPrice.poolOutOfSync.tooltip.noMarketPrice')
                        }
                        placement="top"
                      >
                        <AlertTriangleFilled color="$statusWarning" size="$icon.16" />
                      </MouseoverTooltip>
                    )}
                  </Flex>
                }
              />
            </Flex>
            <PositionPageActionButtons isOwner={isOwner} positionInfo={positionInfo} onMigrate={onMigrate} />
          </Flex>
        </Flex>
        <Flex
          row
          justifyContent="space-between"
          $lg={{ row: false, gap: '$gap24' }}
          onLayout={(event) => setContentRowWidth(event.nativeEvent.layout.width)}
        >
          <Flex gap="$gap12" width={chartWidth}>
            <PriceRangeSection
              maxPrice={maxPrice}
              minPrice={minPrice}
              minPriceDelta={rangeDeltas?.min}
              maxPriceDelta={rangeDeltas?.max}
              minTick={priceInverted ? positionInfo.tickUpper : positionInfo.tickLower}
              maxTick={priceInverted ? positionInfo.tickLower : positionInfo.tickUpper}
              isFullRange={isFullRange}
              token0CurrentPrice={token0Price}
              token1CurrentPrice={token1Price}
              priceInverted={priceInverted}
            />
            <Flex
              height="auto"
              width="100%"
              $lg={{ width: '100%' }}
              borderWidth={0}
              borderColor="$surface3"
              pb="$padding12"
            >
              {shownView === 'chart' ? (
                <WrappedLiquidityPositionRangeChart
                  version={positionInfo.version}
                  quoteCurrency={quoteCurrency}
                  baseCurrency={baseCurrency}
                  sdkCurrencies={{ TOKEN0: currency0Amount.currency, TOKEN1: currency1Amount.currency }}
                  priceInverted={priceInverted}
                  poolAddressOrId={positionInfo.poolId}
                  chainId={positionInfo.chainId}
                  tickSpacing={positionInfo.tickSpacing}
                  feeTier={positionInfo.feeTier?.feeAmount}
                  hook={positionInfo.v4hook}
                  positionStatus={status}
                  priceOrdering={
                    priceInverted
                      ? {
                          base: priceOrdering.quote,
                          priceLower: priceOrdering.priceUpper?.invert(),
                          priceUpper: priceOrdering.priceLower?.invert(),
                        }
                      : priceOrdering
                  }
                  duration={selectedHistoryDuration}
                  width={chartWidth}
                  height={440}
                  showXAxis
                  showYAxis
                  showLiquidityBars
                  showChartBorder
                  crosshairEnabled={false}
                  currentPrice={currentChartPrice}
                />
              ) : shownView === 'candles' && candlesUrl ? (
                <PositionCandlestickChart
                  candlesUrl={candlesUrl}
                  candleSeconds={candleInterval.seconds}
                  width={chartWidth}
                  height={440}
                  startTime={mintTimestamp ?? positionInfo.createdAt}
                  priceLower={candleRange?.lower}
                  priceUpper={candleRange?.upper}
                  inRange={positionInfo.status === PositionStatus.IN_RANGE}
                  livePrice={livePoolPrice}
                />
              ) : shownView === 'dextools' && dexToolsChartUrl ? (
                <DexToolsChart url={dexToolsChartUrl} width={chartWidth} height={440} />
              ) : (
                <Flex
                  width="100%"
                  height="100%"
                  justifyContent="center"
                  alignItems="center"
                  py="$spacing20"
                  backgroundColor="$surface2"
                  borderRadius="$rounded20"
                >
                  {'result' in metadata ? (
                    <PositionNFT image={metadata.result.image} height={400} />
                  ) : (
                    <LoadingFullscreen style={{ borderRadius: 12, backgroundColor: 'transparent' }} />
                  )}
                </Flex>
              )}
            </Flex>
            <Flex row alignItems="center" justifyContent="space-between" flexDirection="row-reverse" width="100%">
              {isMobileWeb ? (
                <Dropdown
                  containerStyle={{ width: 'auto' }}
                  menuLabel={
                    <Flex
                      borderRadius="$rounded16"
                      backgroundColor="transparent"
                      row
                      centered
                      p="$padding8"
                      pl="$padding12"
                      borderColor="$surface3"
                      borderWidth="$spacing1"
                      gap="$spacing6"
                      {...ClickableTamaguiStyle}
                    >
                      {mainViewOptions.find((p) => p.value === mainView)?.display}
                      <RotatableChevron direction="down" size="$icon.16" color="$neutral2" />
                    </Flex>
                  }
                  buttonStyle={{
                    borderWidth: 0,
                    p: 0,
                  }}
                  dropdownStyle={{
                    width: 160,
                  }}
                  hideChevron
                  isOpen={mainViewDropdownOpen}
                  toggleOpen={() => {
                    setMainViewDropdownOpen((prev) => !prev)
                  }}
                >
                  {mainViewOptions.map((p) => (
                    <Flex
                      key={p.value}
                      width="100%"
                      height={32}
                      row
                      alignItems="center"
                      justifyContent="flex-start"
                      p="$padding12"
                      onPress={() => {
                        setMainView(p.value)
                      }}
                    >
                      {p.display}
                    </Flex>
                  ))}
                </Dropdown>
              ) : (
                <SegmentedControl
                  options={mainViewOptions}
                  selectedOption={mainView}
                  onSelectOption={(option: MainView) => {
                    setMainView(option)
                  }}
                />
              )}
              {shownView === 'candles' && (
                <SegmentedControl
                  options={candleIntervalOptions}
                  selectedOption={candleIntervalLabel}
                  onSelectOption={(option: CandleIntervalLabel) => {
                    setCandleIntervalLabel(option)
                  }}
                />
              )}
              {shownView === 'chart' &&
                (isMobileWeb ? (
                  <Dropdown
                    containerStyle={{ width: 'auto' }}
                    menuLabel={
                      <Flex
                        borderRadius="$rounded16"
                        backgroundColor="transparent"
                        row
                        centered
                        p="$padding8"
                        pl="$padding12"
                        borderColor="$surface3"
                        borderWidth="$spacing1"
                        gap="$spacing6"
                        {...ClickableTamaguiStyle}
                      >
                        {timePeriodOptions.options.find((p) => p.value === timePeriodOptions.selected)?.display}
                        <RotatableChevron direction="down" size="$icon.16" color="$neutral2" />
                      </Flex>
                    }
                    buttonStyle={{
                      borderWidth: 0,
                      p: 0,
                    }}
                    dropdownStyle={{
                      width: 160,
                      left: 0,
                    }}
                    hideChevron
                    isOpen={timePeriodDropdownOpen}
                    toggleOpen={() => {
                      setTimePeriodDropdownOpen((prev) => !prev)
                    }}
                  >
                    {timePeriodOptions.options.map((p) => (
                      <Flex
                        key={p.value}
                        width="100%"
                        height={32}
                        row
                        alignItems="center"
                        justifyContent="flex-start"
                        p="$padding12"
                        onPress={() => {
                          setSelectedHistoryDuration(p.value)
                        }}
                      >
                        {p.verboseDisplay}
                      </Flex>
                    ))}
                  </Dropdown>
                ) : (
                  <SegmentedControl
                    options={timePeriodOptions.options}
                    selectedOption={timePeriodOptions.selected}
                    onSelectOption={(option: HistoryDuration) => {
                      setSelectedHistoryDuration(option)
                    }}
                  />
                ))}
            </Flex>
            <Flex mt="$spacing24" gap="$spacing16">
              {positionEvents.length > 0 && chainId && (
                <Flex gap="$spacing12" mt="$spacing12">
                  <Text variant="body2" color="$neutral2" fontWeight="600">
                    Position history
                  </Text>
                  <Flex gap="$spacing8">
                    {positionEvents.map((ev, idx) => {
                      const date = new Date(ev.timestamp * 1000)
                      const dd = String(date.getDate()).padStart(2, '0')
                      const mm = String(date.getMonth() + 1).padStart(2, '0')
                      const yyyy = date.getFullYear()
                      const hh = String(date.getHours()).padStart(2, '0')
                      const min = String(date.getMinutes()).padStart(2, '0')
                      const ss = String(date.getSeconds()).padStart(2, '0')
                      const dateStr = `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`

                      const amt0 = CurrencyAmount.fromRawAmount(
                        currency0Amount.currency,
                        ev.amount0.toString(),
                      ).toSignificant(6)
                      const amt1 = CurrencyAmount.fromRawAmount(
                        currency1Amount.currency,
                        ev.amount1.toString(),
                      ).toSignificant(6)
                      const sym0 = currency0Amount.currency.symbol ?? ''
                      const sym1 = currency1Amount.currency.symbol ?? ''

                      const shortTx = `${ev.txHash.slice(0, 6)}...${ev.txHash.slice(-4)}`
                      const txUrl = getExplorerLink({
                        chainId: chainId as UniverseChainId,
                        data: ev.txHash,
                        type: ExplorerDataType.TRANSACTION,
                      })

                      let emoji: string
                      let label: string
                      switch (ev.type) {
                        case 'mint':
                          emoji = '🎉'
                          label = 'Minted'
                          break
                        case 'increase':
                          emoji = '➕'
                          label = 'Added liquidity'
                          break
                        case 'decrease':
                          emoji = '➖'
                          label = 'Removed liquidity'
                          break
                        case 'decrease_collect':
                          emoji = '📤'
                          label = 'Removed liquidity & collected fees'
                          break
                        case 'collect':
                          emoji = '💰'
                          label = 'Collected fees'
                          break
                        case 'burn':
                          emoji = '🔥'
                          label = 'Burned'
                          break
                      }

                      const hasAmounts = ev.amount0 !== 0n || ev.amount1 !== 0n
                      const amountParts: string[] = []
                      if (ev.amount0 !== 0n) {
                        amountParts.push(`${amt0} ${sym0}`)
                      }
                      if (ev.amount1 !== 0n) {
                        amountParts.push(`${amt1} ${sym1}`)
                      }

                      return (
                        <Flex key={`${ev.txHash}-${ev.type}-${idx}`} row alignItems="flex-start" gap="$spacing8">
                          <Text variant="body3" style={{ minWidth: 22 }}>
                            {emoji}
                          </Text>
                          <Text variant="body3" color="$neutral3" style={{ lineHeight: '22px' }}>
                            <Text variant="body3" color="$neutral2" fontWeight="500">
                              {label}
                            </Text>
                            {hasAmounts ? ` · ${amountParts.join(' + ')}` : ''}
                            {' · '}
                            <Text variant="body3" color="$neutral3">
                              {dateStr}
                            </Text>
                            {' · '}
                            <Text
                              variant="body3"
                              color="$accent1"
                              cursor="pointer"
                              hoverStyle={{ opacity: 0.7 }}
                              onPress={() => window.open(txUrl, '_blank')}
                            >
                              {shortTx}
                            </Text>
                          </Text>
                        </Flex>
                      )
                    })}
                  </Flex>
                </Flex>
              )}
            </Flex>
          </Flex>
          <Flex gap="$spacing20">
            <TotalValueSection
              status={positionInfo.status}
              currency0Amount={currency0Amount}
              currency1Amount={currency1Amount}
              fee0Amount={fee0Amount}
              fee1Amount={fee1Amount}
              fiatValue0={fiatValue0}
              fiatValue1={fiatValue1}
              fiatFeeValue0={fiatFeeValue0}
              fiatFeeValue1={fiatFeeValue1}
              profitLoss={profitLoss}
              realizedApr={realizedApr}
              feesApr={feesApr}
            />
            <PositionSection
              status={positionInfo.status}
              currency0Amount={currency0Amount}
              currency1Amount={currency1Amount}
              fiatValue0={fiatValue0}
              fiatValue1={fiatValue1}
            />
            <EarningsSection
              positionInfo={positionInfo}
              collectedFeesUsd={collectedFeesUsd}
              currency0Amount={currency0Amount}
              currency1Amount={currency1Amount}
              fiatFeeValue0={fiatFeeValue0}
              fiatFeeValue1={fiatFeeValue1}
              fee0Amount={fee0Amount}
              fee1Amount={fee1Amount}
            />
            {rewards.length > 0 && (
              <APRSection
                poolApr={positionInfo.apr}
                totalApr={positionInfo.totalApr}
                apr1d={positionInfo.apr1d}
                apr7d={positionInfo.apr7d}
                apr30d={positionInfo.apr30d}
                rewards={rewards}
              />
            )}
            {!positionInfo.isHidden && (
              <Flex row justifyContent="space-between">
                <Text variant="body3" color="$neutral3">
                  {t('reporting.pool.details.title')}
                </Text>
                <TouchableArea row gap="$gap4" alignItems="center" onPress={reportPositionHandler}>
                  <Flag size="$icon.16" color="$statusCritical" />
                  <Text variant="body3" color="$statusCritical">
                    {t('nft.reportSpam')}
                  </Text>
                </TouchableArea>
              </Flex>
            )}
          </Flex>
        </Flex>
        <RefreshStatusBar poolUpdatedAt={poolUpdatedAt} poolError={poolError} positionUpdatedAt={positionUpdatedAt} />
      </BodyWrapper>
    </Trace>
  )
}

function formatRefreshTime(updatedAt: number | undefined, now: number): string {
  if (!updatedAt) {
    return 'never'
  }
  const secondsAgo = Math.max(0, Math.round((now - updatedAt) / 1000))
  return `${new Date(updatedAt).toLocaleTimeString()} (${secondsAgo}s ago)`
}

const RefreshStatusBar = ({
  poolUpdatedAt,
  poolError,
  positionUpdatedAt,
}: {
  poolUpdatedAt?: number
  poolError?: string
  positionUpdatedAt?: number
}) => {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <Flex row gap="$gap16" flexWrap="wrap" testID="position-refresh-status">
      <Text variant="body3" color="$neutral2">
        Pool price (on-chain): {formatRefreshTime(poolUpdatedAt, now)}
      </Text>
      <Text variant="body3" color="$neutral2">
        Position data (backend): {formatRefreshTime(positionUpdatedAt, now)}
      </Text>
      {poolError && (
        <Text variant="body3" color="$statusCritical">
          Pool read: {poolError}
        </Text>
      )}
    </Flex>
  )
}

const SectionContainer = ({ children, testID }: { children: React.ReactNode; testID?: string }) => {
  return (
    <Flex
      p="$spacing20"
      backgroundColor="$surface2"
      width={RIGHT_COLUMN_WIDTH}
      $lg={{ width: '100%' }}
      borderRadius="$rounded16"
      gap="$spacing24"
      $platform-web={{
        height: 'min-content',
      }}
      testID={testID}
    >
      {children}
    </Flex>
  )
}

const TotalValueSection = ({
  status,
  currency0Amount,
  currency1Amount,
  fee0Amount,
  fee1Amount,
  fiatValue0,
  fiatValue1,
  fiatFeeValue0,
  fiatFeeValue1,
  profitLoss,
  realizedApr,
  feesApr,
}: {
  status?: PositionStatus
  currency0Amount: CurrencyAmount<Currency>
  currency1Amount: CurrencyAmount<Currency>
  fee0Amount?: CurrencyAmount<Currency>
  fee1Amount?: CurrencyAmount<Currency>
  fiatValue0: Maybe<CurrencyAmount<Currency>>
  fiatValue1: Maybe<CurrencyAmount<Currency>>
  fiatFeeValue0: Maybe<CurrencyAmount<Currency>>
  fiatFeeValue1: Maybe<CurrencyAmount<Currency>>
  profitLoss?: number
  realizedApr?: number
  feesApr?: number
}) => {
  const { convertFiatAmountFormatted, formatPercent, formatCurrencyAmount } = useLocalizationContext()
  const { t } = useTranslation()
  const currencyInfo0 = useCurrencyInfo(currency0Amount.currency)
  const currencyInfo1 = useCurrencyInfo(currency1Amount.currency)

  const totalFiat0 = useMemo(() => {
    if (!fiatValue0) {
      return undefined
    }
    return fiatFeeValue0
      ? parseFloat(fiatValue0.toExact()) + parseFloat(fiatFeeValue0.toExact())
      : parseFloat(fiatValue0.toExact())
  }, [fiatValue0, fiatFeeValue0])

  const totalFiat1 = useMemo(() => {
    if (!fiatValue1) {
      return undefined
    }
    return fiatFeeValue1
      ? parseFloat(fiatValue1.toExact()) + parseFloat(fiatFeeValue1.toExact())
      : parseFloat(fiatValue1.toExact())
  }, [fiatValue1, fiatFeeValue1])

  const totalValueExact = useMemo(() => {
    if (totalFiat0 === undefined || totalFiat1 === undefined) {
      return undefined
    }
    return totalFiat0 + totalFiat1
  }, [totalFiat0, totalFiat1])

  const formattedTotalValue = useMemo(
    () =>
      totalValueExact !== undefined
        ? convertFiatAmountFormatted(totalValueExact, NumberType.FiatTokenPrice)
        : undefined,
    [totalValueExact, convertFiatAmountFormatted],
  )
  const totalValueFlashColor = useFlashColor(formattedTotalValue)

  const formattedPL = useMemo(
    () => (profitLoss !== undefined ? convertFiatAmountFormatted(profitLoss, NumberType.FiatTokenPrice) : undefined),
    [profitLoss, convertFiatAmountFormatted],
  )
  const plFlashColor = useFlashColor(formattedPL)

  const formattedApr = useMemo(
    () => (realizedApr !== undefined ? formatPercent(realizedApr) : undefined),
    [realizedApr, formatPercent],
  )
  const aprFlashColor = useFlashColor(formattedApr)

  const formattedFeesApr = useMemo(
    () => (feesApr !== undefined ? formatPercent(feesApr) : undefined),
    [feesApr, formatPercent],
  )
  const feesAprFlashColor = useFlashColor(formattedFeesApr)

  const totalAmount0 = useMemo(
    () => (fee0Amount ? currency0Amount.add(fee0Amount) : currency0Amount),
    [currency0Amount, fee0Amount],
  )
  const totalAmount1 = useMemo(
    () => (fee1Amount ? currency1Amount.add(fee1Amount) : currency1Amount),
    [currency1Amount, fee1Amount],
  )

  const bars = useMemo(() => {
    if (
      totalFiat0 === undefined ||
      totalFiat1 === undefined ||
      totalValueExact === undefined ||
      totalValueExact === 0 ||
      !currencyInfo0 ||
      !currencyInfo1
    ) {
      return []
    }

    const bips0 = Math.round((totalFiat0 / totalValueExact) * 10000)
    const bips1 = 10000 - bips0

    return [
      { id: currencyInfo0.currencyId, value: new Percent(bips0, 10000), currencyInfo: currencyInfo0 },
      { id: currencyInfo1.currencyId, value: new Percent(bips1, 10000), currencyInfo: currencyInfo1 },
    ]
  }, [totalFiat0, totalFiat1, totalValueExact, currencyInfo0, currencyInfo1])

  const formattedTotalRow0 = useMemo(
    () => formatCurrencyAmount({ value: totalAmount0, type: NumberType.TokenNonTx }),
    [totalAmount0, formatCurrencyAmount],
  )
  const formattedTotalRow1 = useMemo(
    () => formatCurrencyAmount({ value: totalAmount1, type: NumberType.TokenNonTx }),
    [totalAmount1, formatCurrencyAmount],
  )
  const totalRow0FlashColor = useFlashColor(formattedTotalRow0)
  const totalRow1FlashColor = useFlashColor(formattedTotalRow1)

  const rows = useMemo(() => {
    if (!currencyInfo0 || !currencyInfo1 || totalFiat0 === undefined || totalFiat1 === undefined) {
      return []
    }

    return [
      {
        currencyInfo: currencyInfo0,
        currencyAmount: totalAmount0,
        usdValue: totalFiat0,
        flashColor: totalRow0FlashColor,
      },
      {
        currencyInfo: currencyInfo1,
        currencyAmount: totalAmount1,
        usdValue: totalFiat1,
        flashColor: totalRow1FlashColor,
      },
    ]
  }, [
    currencyInfo0,
    currencyInfo1,
    totalAmount0,
    totalAmount1,
    totalRow0FlashColor,
    totalRow1FlashColor,
    totalFiat0,
    totalFiat1,
  ])

  return (
    <SectionContainer>
      <Flex gap="$gap8">
        <Text color="$neutral2" variant="body2">
          {t('common.totalValue')}
        </Text>
        {status === PositionStatus.CLOSED ? (
          <Text variant="heading2" $lg={{ variant: 'heading3' }}>
            {convertFiatAmountFormatted(0, NumberType.FiatTokenPrice)}
          </Text>
        ) : (
          <>
            <Text variant="heading2" mb="$spacing12" color={totalValueFlashColor ?? '$neutral1'}>
              {formattedTotalValue ? (
                formattedTotalValue
              ) : (
                <MouseoverTooltip text={t('pool.positions.usdValueUnavailable.tooltip')} placement="right">
                  <Flex alignItems="center" row gap="$gap8">
                    <Text variant="body1" color="$neutral2">
                      {t('pool.positions.usdValueUnavailable')}
                    </Text>
                    <InfoCircleFilled color="$neutral2" size="$icon.16" />
                  </Flex>
                </MouseoverTooltip>
              )}
            </Text>
            {formattedPL !== undefined && (
              <Flex row gap="$gap8" mb="$spacing4">
                <Text variant="body2" color="$neutral2">
                  P/L
                </Text>
                <Text variant="body2" color={plFlashColor ?? '$neutral1'}>
                  {profitLoss !== undefined && profitLoss >= 0 ? '+' : ''}
                  {formattedPL}
                </Text>
              </Flex>
            )}
            {formattedApr !== undefined && (
              <Flex row gap="$gap8" mb="$spacing4">
                <Text variant="body2" color="$neutral2">
                  APR
                </Text>
                <Text variant="body2" color={aprFlashColor ?? '$neutral1'}>
                  {formattedApr}
                </Text>
              </Flex>
            )}
            {formattedFeesApr !== undefined && (
              <Flex row gap="$gap8" mb="$spacing8">
                <Text variant="body2" color="$neutral2">
                  Fees APR
                </Text>
                <Text variant="body2" color={feesAprFlashColor ?? '$neutral1'}>
                  {formattedFeesApr}
                </Text>
              </Flex>
            )}
            {bars.length > 0 && (
              <Flex mb="$spacing24">
                <LiquidityPositionStackedBars bars={bars} />
              </Flex>
            )}
            {rows.length > 0 && <LiquidityPositionAmountRows rows={rows} />}
          </>
        )}
      </Flex>
    </SectionContainer>
  )
}

const PositionSection = ({
  status,
  currency0Amount,
  currency1Amount,
  fiatValue0,
  fiatValue1,
}: {
  status?: PositionStatus
  currency0Amount: CurrencyAmount<Currency>
  currency1Amount: CurrencyAmount<Currency>
  fiatValue0: Maybe<CurrencyAmount<Currency>>
  fiatValue1: Maybe<CurrencyAmount<Currency>>
}) => {
  const { convertFiatAmountFormatted, formatCurrencyAmount: formatCurrencyAmountPos } = useLocalizationContext()
  const { t } = useTranslation()
  const currencyInfo0 = useCurrencyInfo(currency0Amount.currency)
  const currencyInfo1 = useCurrencyInfo(currency1Amount.currency)
  const totalFiatValue = fiatValue0?.add(fiatValue1 ?? CurrencyAmount.fromRawAmount(fiatValue0.currency, 0))
  const formattedTotal = useMemo(
    () =>
      fiatValue0 && fiatValue1
        ? convertFiatAmountFormatted(fiatValue0.add(fiatValue1).toExact(), NumberType.FiatTokenPrice)
        : undefined,
    [fiatValue0, fiatValue1, convertFiatAmountFormatted],
  )
  const positionFlashColor = useFlashColor(formattedTotal)
  const bars = useMemo(() => {
    const percent0 =
      totalFiatValue?.greaterThan(0) && fiatValue0 ? getExactSharePercent(fiatValue0, totalFiatValue) : undefined

    const percent1 =
      totalFiatValue?.greaterThan(0) && fiatValue1 ? getExactSharePercent(fiatValue1, totalFiatValue) : undefined

    if (!percent0 || !percent1 || !currencyInfo0 || !currencyInfo1) {
      return []
    }

    return [
      { id: currencyInfo0.currencyId, value: percent0, currencyInfo: currencyInfo0 },
      { id: currencyInfo1.currencyId, value: percent1, currencyInfo: currencyInfo1 },
    ]
  }, [currencyInfo0, currencyInfo1, fiatValue0, fiatValue1, totalFiatValue])

  const formattedPosRow0 = useMemo(
    () => formatCurrencyAmountPos({ value: currency0Amount, type: NumberType.TokenNonTx }),
    [currency0Amount, formatCurrencyAmountPos],
  )
  const formattedPosRow1 = useMemo(
    () => formatCurrencyAmountPos({ value: currency1Amount, type: NumberType.TokenNonTx }),
    [currency1Amount, formatCurrencyAmountPos],
  )
  const posRow0FlashColor = useFlashColor(formattedPosRow0)
  const posRow1FlashColor = useFlashColor(formattedPosRow1)

  const rows = useMemo(() => {
    if (!currencyInfo0 || !currencyInfo1) {
      return []
    }

    return [
      {
        currencyInfo: currencyInfo0,
        currencyAmount: currency0Amount,
        usdValue: toUsdValue(fiatValue0),
        flashColor: posRow0FlashColor,
      },
      {
        currencyInfo: currencyInfo1,
        currencyAmount: currency1Amount,
        usdValue: toUsdValue(fiatValue1),
        flashColor: posRow1FlashColor,
      },
    ]
  }, [
    currencyInfo0,
    currencyInfo1,
    currency0Amount,
    currency1Amount,
    fiatValue0,
    fiatValue1,
    posRow0FlashColor,
    posRow1FlashColor,
  ])

  return (
    <SectionContainer>
      <Flex gap="$gap8">
        <Text color="$neutral2" variant="body2">
          {t('pool.position')}
        </Text>
        {status === PositionStatus.CLOSED ? (
          <Text variant="heading2" $lg={{ variant: 'heading3' }}>
            {convertFiatAmountFormatted(0, NumberType.FiatTokenPrice)}
          </Text>
        ) : (
          <>
            <Text variant="heading2" mb="$spacing12" color={positionFlashColor ?? '$neutral1'}>
              {fiatValue0 && fiatValue1 ? (
                convertFiatAmountFormatted(fiatValue0.add(fiatValue1).toExact(), NumberType.FiatTokenPrice)
              ) : (
                <MouseoverTooltip text={t('pool.positions.usdValueUnavailable.tooltip')} placement="right">
                  <Flex alignItems="center" row gap="$gap8">
                    <Text variant="body1" color="$neutral2">
                      {t('pool.positions.usdValueUnavailable')}
                    </Text>
                    <InfoCircleFilled color="$neutral2" size="$icon.16" />
                  </Flex>
                </MouseoverTooltip>
              )}
            </Text>
            {bars.length > 0 && (
              <Flex mb="$spacing24">
                <LiquidityPositionStackedBars bars={bars} />
              </Flex>
            )}
            {rows.length > 0 && <LiquidityPositionAmountRows rows={rows} />}
          </>
        )}
      </Flex>
    </SectionContainer>
  )
}

const APRSection = ({
  poolApr,
  totalApr,
  apr1d,
  apr7d,
  apr30d,
  rewards,
}: {
  poolApr?: number
  totalApr?: number
  apr1d?: number
  apr7d?: number
  apr30d?: number
  /** The pool's live LP-incentive campaigns, one entry per reward token. */
  rewards: PositionRewardApr[]
}) => {
  const { t } = useTranslation()
  const { formatPercent } = useLocalizationContext()
  const hasTimeframeAprs = apr1d !== undefined || apr7d !== undefined || apr30d !== undefined

  // Format APR values
  const displayPoolApr = poolApr ? formatPercent(poolApr) : '-'
  const displayTotalApr = totalApr ? formatPercent(totalApr) : '-'

  return (
    <SectionContainer>
      <Flex justifyContent="space-between" gap="$gap8">
        <Text color="$neutral2" variant="body2">
          {t('pool.totalAPR')}
        </Text>
        <Text color="$neutral1" variant="heading2" pb="$spacing4">
          {displayTotalApr}
        </Text>
        <Flex row justifyContent="space-between">
          <MouseoverTooltip
            disabled={!hasTimeframeAprs}
            padding={0}
            text={
              <PoolAprTooltip
                currency0Info={undefined}
                currency1Info={undefined}
                apr1d={apr1d}
                apr7d={apr7d}
                apr30d={apr30d}
              />
            }
            size={TooltipSize.Small}
            placement="top"
          >
            <Flex row gap="$gap4" alignItems="center">
              <Text color="$neutral2" variant="body3">
                {t('pool.apr.24h')}
              </Text>
              {hasTimeframeAprs && <InfoCircleFilled color="$neutral2" size="$icon.12" />}
            </Flex>
          </MouseoverTooltip>
          <Text color="$neutral1" variant="body3">
            {displayPoolApr}
          </Text>
        </Flex>
        {/* One row per reward token: the boost is per-denomination, and the count follows the
            pool's campaigns rather than anything about the position. */}
        {rewards.map((reward) => (
          <Flex key={rewardCurrencyId(reward.token)} row justifyContent="space-between" gap="$gap8">
            <Text color="$neutral2" variant="body3">
              {t('pool.apr.reward')}
            </Text>
            <RewardAprBadge rewards={[reward]} hideBackground label="symbol" flexShrink={0} />
          </Flex>
        ))}
      </Flex>
    </SectionContainer>
  )
}

/**
 * A fiat `CurrencyAmount` reduced to the plain USD figure the earnings surfaces work in. Client-side
 * quotes land in whichever stablecoin priced them, and their decimals differ by chain, so the
 * amounts are compared and summed as USD rather than as quotients of mismatched scales.
 */
function toUsdValue(fiatValue: Maybe<CurrencyAmount<Currency>>): number | undefined {
  return fiatValue ? Number(fiatValue.toExact()) : undefined
}

// Pricing a zero amount yields nothing, but a token that was never collected is a known $0 rather than unpriced.
function usdOrZero(fiatValue: Maybe<CurrencyAmount<Currency>>, rawAmount: bigint | undefined): number | undefined {
  return rawAmount === 0n ? 0 : toUsdValue(fiatValue)
}

// Collect pays out withdrawn principal too; only the part beyond what DecreaseLiquidity released is fees.
function collectedFeesShareUsd({
  collectedUsd,
  collectedRaw,
  withdrawnRaw,
}: {
  collectedUsd: number | undefined
  collectedRaw: bigint | undefined
  withdrawnRaw: bigint | undefined
}): number | undefined {
  if (collectedUsd === undefined || collectedRaw === undefined || withdrawnRaw === undefined) {
    return undefined
  }
  if (collectedRaw === 0n) {
    return 0
  }
  const feesRaw = collectedRaw > withdrawnRaw ? collectedRaw - withdrawnRaw : 0n
  return (collectedUsd * Number(feesRaw)) / Number(collectedRaw)
}

function sumIfDefined(a: number | undefined, b: number | undefined): number | undefined {
  return a === undefined || b === undefined ? undefined : a + b
}

// `Fraction` takes integers, so USD figures are scaled to sub-cent precision before becoming a ratio.
const EARNINGS_SHARE_SCALE = 1e6

/** A USD figure's share of the earnings total, or undefined when there's no share to draw. */
function toEarningsShare(value: number | undefined, total: number | undefined): Percent | undefined {
  if (!value || !total || value <= 0) {
    return undefined
  }
  // Rounding a sub-microdollar total to zero is what getExactSharePercent's non-positive guard is
  // for — it returns undefined rather than building a Percent that throws on the first toFixed.
  return getExactSharePercent(
    new Fraction(Math.round(value * EARNINGS_SHARE_SCALE), EARNINGS_SHARE_SCALE),
    new Fraction(Math.round(total * EARNINGS_SHARE_SCALE), EARNINGS_SHARE_SCALE),
  )
}

const EarningsSection = ({
  positionInfo,
  collectedFeesUsd,
  currency0Amount,
  currency1Amount,
  fiatFeeValue0,
  fiatFeeValue1,
  fee0Amount,
  fee1Amount,
}: {
  positionInfo: PositionInfo
  /** Fees already collected over the position's life, in USD; undefined until its history loads. */
  collectedFeesUsd?: number
  currency0Amount: CurrencyAmount<Currency>
  currency1Amount: CurrencyAmount<Currency>
  fiatFeeValue0: Maybe<CurrencyAmount<Currency>>
  fiatFeeValue1: Maybe<CurrencyAmount<Currency>>
  fee0Amount?: CurrencyAmount<Currency>
  fee1Amount?: CurrencyAmount<Currency>
}) => {
  const { convertFiatAmountFormatted, formatCurrencyAmount: formatCurrencyAmountEarn } = useLocalizationContext()
  const { t } = useTranslation()

  const { rewardBalances, totalEarningsUsd, hasRewards, hasFees } = useLpIncentivesFormattedEarnings({
    liquidityPosition: positionInfo,
    fiatFeeValue0,
    fiatFeeValue1,
  })

  const isClosed = positionInfo.status === PositionStatus.CLOSED
  // A closed position has nothing accrued; what it earned is what was collected.
  const accruedUsd = isClosed ? 0 : totalEarningsUsd
  const earnedUsd = accruedUsd === undefined ? undefined : accruedUsd + (collectedFeesUsd ?? 0)
  const formattedEarnings = useMemo(
    () => (earnedUsd !== undefined ? convertFiatAmountFormatted(earnedUsd, NumberType.FiatRewards) : undefined),
    [earnedUsd, convertFiatAmountFormatted],
  )
  const earningsFlashColor = useFlashColor(formattedEarnings)

  // TODO(WEB-4920): skip the token lookup once the backend provides image URLs.
  // Singular hook, twice, rather than the batched plural one: only this hook falls back to the
  // local common-base list, so a pool in ETH/USDT/USDC/DAI/WBTC/WETH still resolves its tokens
  // when the token gateway throttles the lookup. The plural hook is the network response alone,
  // and an empty one dropped both fee segments and the whole Fees breakdown while the reward rows
  // (which build their own CurrencyInfo) stayed — see PositionEarnings.e2e.test.ts. PositionSection
  // above resolves the same two currencies this way, so these calls dedupe with its.
  const currencyInfo0 = useCurrencyInfo(currency0Amount.currency)
  const currencyInfo1 = useCurrencyInfo(currency1Amount.currency)

  const rewardEarnings = usePositionRewardEarnings(rewardBalances)

  const bars = useMemo(() => {
    // Each side contributes a segment only if it has a share to draw. Gating the whole bar on both
    // fee shares would drop every reward segment along with them, which is what a position with
    // rewards and freshly-collected fees hits.
    const feeShares = [
      { role: 'fee', value: toEarningsShare(toUsdValue(fiatFeeValue0), totalEarningsUsd), currencyInfo: currencyInfo0 },
      { role: 'fee', value: toEarningsShare(toUsdValue(fiatFeeValue1), totalEarningsUsd), currencyInfo: currencyInfo1 },
    ]

    // One segment per reward denomination. An unpriced reward has no share of the USD total to
    // draw, so it appears in the rows below but not in the bar.
    const rewardShares = rewardEarnings.map((earning) => ({
      role: 'reward',
      value: toEarningsShare(earning.usdValue, totalEarningsUsd),
      currencyInfo: earning.currencyInfo,
    }))

    // Keyed by role as well as token: a pool incentivized in one of its own tokens earns fees and
    // rewards in the same currency, and the two are distinct segments.
    return [...feeShares, ...rewardShares].flatMap(({ role, value, currencyInfo }) =>
      value && currencyInfo ? [{ id: `${role}-${currencyInfo.currencyId}`, value, currencyInfo }] : [],
    )
  }, [totalEarningsUsd, fiatFeeValue0, fiatFeeValue1, currencyInfo0, currencyInfo1, rewardEarnings])

  const formattedFeeRow0 = useMemo(
    () => (fee0Amount ? formatCurrencyAmountEarn({ value: fee0Amount, type: NumberType.TokenNonTx }) : undefined),
    [fee0Amount, formatCurrencyAmountEarn],
  )
  const formattedFeeRow1 = useMemo(
    () => (fee1Amount ? formatCurrencyAmountEarn({ value: fee1Amount, type: NumberType.TokenNonTx }) : undefined),
    [fee1Amount, formatCurrencyAmountEarn],
  )
  const feeRow0FlashColor = useFlashColor(formattedFeeRow0)
  const feeRow1FlashColor = useFlashColor(formattedFeeRow1)

  const feeRows = useMemo(() => {
    if (!currencyInfo0 || !currencyInfo1 || !fee0Amount || !fee1Amount) {
      return []
    }

    return [
      {
        currencyInfo: currencyInfo0,
        currencyAmount: fee0Amount,
        usdValue: toUsdValue(fiatFeeValue0),
        flashColor: feeRow0FlashColor,
      },
      {
        currencyInfo: currencyInfo1,
        currencyAmount: fee1Amount,
        usdValue: toUsdValue(fiatFeeValue1),
        flashColor: feeRow1FlashColor,
      },
    ]
  }, [
    currencyInfo0,
    currencyInfo1,
    fee0Amount,
    fee1Amount,
    fiatFeeValue0,
    fiatFeeValue1,
    feeRow0FlashColor,
    feeRow1FlashColor,
  ])

  return (
    <SectionContainer testID={TestID.PositionEarningsSection}>
      <Flex gap="$gap8">
        <Text color="$neutral2" variant="body2">
          {hasRewards ? t('pool.earnings') : t('common.feesEarned')}
        </Text>
        {isClosed ? (
          <>
            <Text variant="heading2">{formattedEarnings}</Text>
            <CollectedFeesNote collectedFeesUsd={collectedFeesUsd} />
          </>
        ) : (
          <>
            <Text variant="heading2" color={earningsFlashColor ?? '$neutral1'}>
              {formattedEarnings !== undefined ? (
                formattedEarnings
              ) : (
                <MouseoverTooltip text={t('pool.positions.usdValueUnavailable.tooltip')} placement="right">
                  <Flex alignItems="center" row gap="$gap8">
                    <Text variant="body1" color="$neutral2">
                      {t('pool.positions.usdValueUnavailable')}
                    </Text>
                    <InfoCircleFilled color="$neutral2" size="$icon.16" />
                  </Flex>
                </MouseoverTooltip>
              )}
            </Text>
            <CollectedFeesNote collectedFeesUsd={collectedFeesUsd} />
            <Flex mb="$spacing12" />
            {bars.length > 0 && (
              <Flex mb="$spacing24">
                <LiquidityPositionStackedBars bars={bars} />
              </Flex>
            )}

            {hasRewards && rewardEarnings.length > 0 && (
              <>
                <Text color="$neutral2" variant="body2" mb="$spacing12">
                  {t('pool.rewards')}
                </Text>
                <LiquidityPositionAmountRows rows={rewardEarnings} />
              </>
            )}
            {hasFees && feeRows.length > 0 && (
              <>
                <Text color="$neutral2" variant="body2" mb="$spacing12" mt={hasRewards ? '$spacing24' : '$none'}>
                  Fees accrued
                </Text>
                <LiquidityPositionAmountRows rows={feeRows} />
              </>
            )}

            {/* Rewards the backend couldn't price leave the total undefined while the rows above
                still show real earned amounts — "no earnings yet" under them would contradict them. */}
            {!totalEarningsUsd && !hasRewards && (
              <Text variant="body3" color="$neutral3">
                {t('pool.earnings.empty')}
              </Text>
            )}
          </>
        )}
      </Flex>
    </SectionContainer>
  )
}

const CollectedFeesNote = ({ collectedFeesUsd }: { collectedFeesUsd?: number }) => {
  const { convertFiatAmountFormatted } = useLocalizationContext()
  if (!collectedFeesUsd) {
    return null
  }
  return (
    <Text variant="body3" color="$neutral2">
      (including {convertFiatAmountFormatted(collectedFeesUsd, NumberType.FiatRewards)} collected)
    </Text>
  )
}

const PriceDisplay = ({
  labelText,
  price,
  priceColor,
  subText,
  tooltip,
}: {
  labelText: string
  price: string
  priceColor?: string
  subText?: string
  tooltip?: string
}) => {
  const priceText = (
    <Text
      variant="subheading1"
      color={priceColor}
      ellipsizeMode="middle"
      numberOfLines={1}
      title={tooltip ? undefined : price}
    >
      {price}
    </Text>
  )
  return (
    <Flex
      gap="$gap4"
      flex={1}
      maxWidth="60%"
      minWidth={0}
      overflow="hidden"
      $sm={{ maxWidth: '100%', flexBasis: 'auto' }}
    >
      <Text variant="subheading2" color="$neutral2" numberOfLines={1}>
        {labelText}
      </Text>
      {tooltip ? (
        <MouseoverTooltip text={tooltip} placement="top">
          {priceText}
        </MouseoverTooltip>
      ) : (
        priceText
      )}
      {subText !== undefined && (
        <Text variant="body4" color="$neutral2" numberOfLines={1}>
          {subText}
        </Text>
      )}
    </Flex>
  )
}

const PriceRangeSection = ({
  maxPrice,
  minPrice,
  minPriceDelta,
  maxPriceDelta,
  minTick,
  maxTick,
  token0CurrentPrice,
  token1CurrentPrice,
  isFullRange,
  priceInverted,
}: {
  maxPrice: string
  minPrice: string
  /** How far each bound is from the market price, in percent of it; signed. */
  minPriceDelta?: number
  maxPriceDelta?: number
  /** The ticks behind the displayed bounds; when prices are flipped the lower bound comes from the upper tick. */
  minTick?: number
  maxTick?: number
  isFullRange?: boolean
  token0CurrentPrice?: Price<Currency, Currency>
  token1CurrentPrice?: Price<Currency, Currency>
  priceInverted?: boolean
}) => {
  const { t } = useTranslation()
  const { formatNumberOrString, formatPercent } = useLocalizationContext()
  const formatDelta = (delta: number | undefined): string | undefined =>
    delta === undefined ? undefined : `${delta >= 0 ? '+' : '−'}${formatPercent(Math.abs(delta))}`
  const locale = useCurrentLocale()
  const formattedMarketPrice = useMemo(() => {
    return formatPositionPrice({
      value: (priceInverted ? token1CurrentPrice : token0CurrentPrice)?.toSignificant(),
      locale,
      formatNumberOrString,
    })
  }, [priceInverted, token0CurrentPrice, token1CurrentPrice, locale, formatNumberOrString])
  const marketPriceFlashColor = useFlashColor(formattedMarketPrice)

  if (isFullRange) {
    return null
  }

  return (
    <Flex gap="$spacing24">
      <Flex row justifyContent="space-between" gap="$gap16" $sm={{ row: false, gap: '$gap20' }}>
        <Flex justifyContent="center" minWidth={0} width="33.333%" flexShrink={0} $sm={{ width: '100%' }}>
          <Text
            variant="heading1"
            color={marketPriceFlashColor ?? '$neutral1'}
            numberOfLines={1}
            title={formattedMarketPrice}
          >
            {formattedMarketPrice}
          </Text>
        </Flex>

        <Flex width={1} alignSelf="stretch" backgroundColor="$surface3" $sm={{ width: '100%', height: 1 }} />

        <PriceDisplay
          labelText={t('pool.minPrice')}
          price={minPrice}
          subText={formatDelta(minPriceDelta)}
          tooltip={minTick === undefined ? undefined : `Tick ${minTick}`}
        />

        <PriceDisplay
          labelText={t('pool.maxPrice')}
          price={maxPrice}
          subText={formatDelta(maxPriceDelta)}
          tooltip={maxTick === undefined ? undefined : `Tick ${maxTick}`}
        />
      </Flex>
    </Flex>
  )
}
