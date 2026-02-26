/* eslint-disable max-lines */
import { BigNumber } from '@ethersproject/bignumber'
import { Position, PositionStatus, ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { Currency, CurrencyAmount, Percent, Price } from '@uniswap/sdk-core'
import { GraphQLApi } from '@universe/api'
import { FeatureFlags, useFeatureFlag } from '@universe/gating'
import { BreadcrumbNavContainer, BreadcrumbNavLink } from 'components/BreadcrumbNav'
import { WrappedLiquidityPositionRangeChart } from 'components/Charts/LiquidityPositionRangeChart/LiquidityPositionRangeChart'
import { Dropdown } from 'components/Dropdowns/Dropdown'
import { BaseQuoteFiatAmount } from 'components/Liquidity/BaseQuoteFiatAmount'
import { useGetRangeDisplay } from 'components/Liquidity/hooks/useGetRangeDisplay'
import { useReportPositionHandler } from 'components/Liquidity/hooks/useReportPositionHandler'
import { LiquidityPositionAmountRows } from 'components/Liquidity/LiquidityPositionAmountRows'
import { LiquidityPositionInfo } from 'components/Liquidity/LiquidityPositionInfo'
import { LiquidityPositionStackedBars } from 'components/Liquidity/LiquidityPositionStackedBars'
import { LoadingRow } from 'components/Liquidity/Loader'
import { PositionNFT } from 'components/Liquidity/PositionNFT'
import { PositionPageActionButtons } from 'components/Liquidity/PositionPageActionButtons'
import type { PositionInfo } from 'components/Liquidity/types'
import { getBaseAndQuoteCurrencies } from 'components/Liquidity/utils/currency'
import { parseRestPosition } from 'components/Liquidity/utils/parseFromRest'
import { LoadingFullscreen, LoadingRows } from 'components/Loader/styled'
import { LP_INCENTIVES_REWARD_TOKEN } from 'components/LpIncentives/constants'
import { MouseoverTooltip } from 'components/Tooltip'
import { useCurrencyInfo } from 'hooks/Tokens'
import { useAccount } from 'hooks/useAccount'
import { useV3NFTPositionManagerContract } from 'hooks/useContract'
import { useSrcColor } from 'hooks/useColor'
import { useLpIncentivesFormattedEarnings } from 'hooks/useLpIncentivesFormattedEarnings'
import { usePositionTokenURI } from 'hooks/usePositionTokenURI'
import NotFound from 'pages/NotFound'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft } from 'react-feather'
import { Helmet } from 'react-helmet-async/lib/index'
import { Trans, useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { MultichainContextProvider } from 'state/multichain/MultichainContext'
import { usePendingLPTransactionsChangeListener } from 'state/transactions/hooks'
import { ClickableTamaguiStyle } from 'theme/components/styles'
import {
  Button,
  Flex,
  Main,
  SegmentedControl,
  SegmentedControlOption,
  styled,
  Text,
  TouchableArea,
  useSporeColors,
} from 'ui/src'
import { ExchangeHorizontal } from 'ui/src/components/icons/ExchangeHorizontal'
import { Flag } from 'ui/src/components/icons/Flag'
import { InfoCircleFilled } from 'ui/src/components/icons/InfoCircleFilled'
import { RotatableChevron } from 'ui/src/components/icons/RotatableChevron'
import { useDeviceDimensions } from 'ui/src/hooks/useDeviceDimensions'
import { breakpoints } from 'ui/src/theme/breakpoints'
import { CurrencyLogo } from 'uniswap/src/components/CurrencyLogo/CurrencyLogo'
import { PollingInterval, ZERO_ADDRESS } from 'uniswap/src/constants/misc'
import { useGetPositionQuery } from 'uniswap/src/data/rest/getPosition'
import { getChainInfo } from 'uniswap/src/features/chains/chainInfo'
import { useSupportedChainId } from 'uniswap/src/features/chains/hooks/useSupportedChainId'
import { EVMUniverseChainId, UniverseChainId } from 'uniswap/src/features/chains/types'
import { CurrencyInfo } from 'uniswap/src/features/dataApi/types'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { isEVMChain } from 'uniswap/src/features/platforms/utils/chains'
import { InterfacePageName } from 'uniswap/src/features/telemetry/constants'
import Trace from 'uniswap/src/features/telemetry/Trace'
import { useCurrencyInfos } from 'uniswap/src/features/tokens/useCurrencyInfo'
import { useUSDCValue } from 'uniswap/src/features/transactions/hooks/useUSDCPrice'
import { usePositionVisibilityCheck } from 'uniswap/src/features/visibility/hooks/usePositionVisibilityCheck'
import { areAddressesEqual } from 'uniswap/src/utils/addresses'
import { ExplorerDataType, getExplorerLink } from 'uniswap/src/utils/linking'
import { buildCurrencyId, currencyId, currencyIdToAddress } from 'uniswap/src/utils/currencyId'
import { NumberType } from 'utilities/src/format/types'
import { isMobileWeb } from 'utilities/src/platform'
import { useEvent } from 'utilities/src/react/hooks'
import { useChainIdFromUrlParam } from 'utils/chainParams'

const STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'LUSD']

const BodyWrapper = styled(Main, {
  backgroundColor: '$surface1',
  display: 'flex',
  flexDirection: 'column',
  gap: '$spacing32',
  width: '100%',
  maxWidth: 1200,
  zIndex: '$default',
  py: '$spacing24',
  px: '$spacing40',

  $lg: {
    px: '$padding20',
  },
})

function parseTokenId(tokenId: string | undefined): BigNumber | undefined {
  if (!tokenId) {
    return undefined
  }
  try {
    return BigNumber.from(tokenId)
  } catch {
    return undefined
  }
}

function parseDisplayedNumber(s: string): number {
  return parseFloat(s.replace(/[^0-9.\-]/g, ''))
}

function useFlashColor(displayedValue: string | undefined): string | undefined {
  const prevValueRef = useRef<string | undefined>(undefined)
  const [flashColor, setFlashColor] = useState<string | undefined>(undefined)

  useEffect(() => {
    const prev = prevValueRef.current
    prevValueRef.current = displayedValue

    if (prev === undefined || displayedValue === undefined || prev === displayedValue) {
      return
    }

    const prevNum = parseDisplayedNumber(prev)
    const currNum = parseDisplayedNumber(displayedValue)
    if (Number.isNaN(prevNum) || Number.isNaN(currNum) || prevNum === currNum) {
      return
    }

    setFlashColor(currNum > prevNum ? '$statusSuccess' : '$statusCritical')
    const timer = setTimeout(() => setFlashColor(undefined), 3000)
    return () => clearTimeout(timer)
  }, [displayedValue])

  return flashColor
}

interface PositionEvent {
  type: 'mint' | 'increase' | 'decrease' | 'collect' | 'decrease_collect' | 'burn'
  timestamp: number
  txHash: string
  amount0: BigNumber
  amount1: BigNumber
}

interface MintData {
  timestamp: number | undefined
  totalDeposited0: BigNumber | undefined
  totalDeposited1: BigNumber | undefined
  totalCollected0: BigNumber | undefined
  totalCollected1: BigNumber | undefined
  events: PositionEvent[]
}

function useMintData(
  chainId: EVMUniverseChainId | undefined,
  tokenId: string | undefined,
  version: ProtocolVersion | undefined,
): MintData {
  const [data, setData] = useState<MintData>({
    timestamp: undefined,
    totalDeposited0: undefined,
    totalDeposited1: undefined,
    totalCollected0: undefined,
    totalCollected1: undefined,
    events: [],
  })
  const contract = useV3NFTPositionManagerContract(false, chainId)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (!contract || !tokenId || version !== ProtocolVersion.V3 || fetchedRef.current) {
      return
    }

    fetchedRef.current = true
    let cancelled = false
    const tokenIdBN = BigNumber.from(tokenId)

    const fetchData = async () => {
      try {
        const [mintTransfers, burnTransfers, increaseEvents, decreaseEvents, collectEvents] = await Promise.all([
          contract.queryFilter(contract.filters.Transfer(ZERO_ADDRESS, null, tokenIdBN)),
          contract.queryFilter(contract.filters.Transfer(null, ZERO_ADDRESS, tokenIdBN)),
          contract.queryFilter(contract.filters.IncreaseLiquidity(tokenIdBN, null, null, null)),
          contract.queryFilter(contract.filters.DecreaseLiquidity(tokenIdBN, null, null, null)),
          contract.queryFilter(contract.filters.Collect(tokenIdBN, null, null, null)),
        ])

        if (cancelled) {
          return
        }

        // Collect all raw events with block numbers
        const rawEvents: Array<{
          type: PositionEvent['type']
          blockNumber: number
          txHash: string
          amount0: BigNumber
          amount1: BigNumber
        }> = []

        for (const ev of mintTransfers) {
          rawEvents.push({
            type: 'mint',
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
            amount0: BigNumber.from(0),
            amount1: BigNumber.from(0),
          })
        }
        for (const ev of burnTransfers) {
          rawEvents.push({
            type: 'burn',
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
            amount0: BigNumber.from(0),
            amount1: BigNumber.from(0),
          })
        }
        for (const ev of increaseEvents) {
          rawEvents.push({
            type: 'increase',
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
            amount0: ev.args.amount0,
            amount1: ev.args.amount1,
          })
        }
        for (const ev of decreaseEvents) {
          rawEvents.push({
            type: 'decrease',
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
            amount0: ev.args.amount0,
            amount1: ev.args.amount1,
          })
        }
        for (const ev of collectEvents) {
          rawEvents.push({
            type: 'collect',
            blockNumber: ev.blockNumber,
            txHash: ev.transactionHash,
            amount0: ev.args.amount0,
            amount1: ev.args.amount1,
          })
        }

        if (cancelled) {
          return
        }

        // Deduplicate block numbers and fetch timestamps
        const uniqueBlocks = [...new Set(rawEvents.map((e) => e.blockNumber))]
        const blockTimestamps = new Map<number, number>()
        const blockPromises = uniqueBlocks.map(async (bn) => {
          const block = await contract.provider.getBlock(bn)
          blockTimestamps.set(bn, block.timestamp)
        })
        await Promise.all(blockPromises)

        if (cancelled) {
          return
        }

        // Build sorted event list
        const events: PositionEvent[] = rawEvents
          .map((raw) => ({
            type: raw.type,
            timestamp: blockTimestamps.get(raw.blockNumber) ?? 0,
            txHash: raw.txHash,
            amount0: raw.amount0,
            amount1: raw.amount1,
          }))
          .sort((a, b) => a.timestamp - b.timestamp || a.type.localeCompare(b.type))

        // Merge related events in the same tx:
        // 1. Mint + IncreaseLiquidity → show as mint with amounts
        // 2. DecreaseLiquidity + Collect → show as "decrease_collect" with combined amounts
        const mintTxHashes = new Set(events.filter((e) => e.type === 'mint').map((e) => e.txHash))
        const decreaseTxHashes = new Set(events.filter((e) => e.type === 'decrease').map((e) => e.txHash))
        const consumedTxTypes = new Set<string>() // "txHash:type" entries already merged
        const mergedEvents: PositionEvent[] = []

        for (const ev of events) {
          const key = `${ev.txHash}:${ev.type}`
          if (consumedTxTypes.has(key)) {
            continue
          }

          if (ev.type === 'mint') {
            const matchingIncrease = events.find((e) => e.type === 'increase' && e.txHash === ev.txHash)
            if (matchingIncrease) {
              consumedTxTypes.add(`${ev.txHash}:increase`)
            }
            mergedEvents.push({
              ...ev,
              amount0: matchingIncrease?.amount0 ?? BigNumber.from(0),
              amount1: matchingIncrease?.amount1 ?? BigNumber.from(0),
            })
          } else if (ev.type === 'increase' && mintTxHashes.has(ev.txHash)) {
            // Skip — already merged into the mint event
            continue
          } else if (ev.type === 'decrease') {
            // Check if there's a Collect in the same tx → merge
            const matchingCollect = events.find((e) => e.type === 'collect' && e.txHash === ev.txHash)
            if (matchingCollect) {
              consumedTxTypes.add(`${ev.txHash}:collect`)
              mergedEvents.push({
                type: 'decrease_collect',
                timestamp: ev.timestamp,
                txHash: ev.txHash,
                amount0: matchingCollect.amount0,
                amount1: matchingCollect.amount1,
              })
            } else {
              mergedEvents.push(ev)
            }
          } else if (ev.type === 'collect' && decreaseTxHashes.has(ev.txHash)) {
            // Skip — already merged into the decrease_collect event
            continue
          } else {
            mergedEvents.push(ev)
          }
        }

        // Compute sums
        let dep0 = BigNumber.from(0)
        let dep1 = BigNumber.from(0)
        for (const ev of increaseEvents) {
          dep0 = dep0.add(ev.args.amount0)
          dep1 = dep1.add(ev.args.amount1)
        }

        let col0 = BigNumber.from(0)
        let col1 = BigNumber.from(0)
        for (const ev of collectEvents) {
          col0 = col0.add(ev.args.amount0)
          col1 = col1.add(ev.args.amount1)
        }

        const ts = mergedEvents.length > 0 ? mergedEvents[0].timestamp : undefined

        if (!cancelled) {
          setData({
            timestamp: ts,
            totalDeposited0: dep0,
            totalDeposited1: dep1,
            totalCollected0: col0,
            totalCollected1: col1,
            events: mergedEvents,
          })
        }
      } catch {
        // silently fail — RPC may not support historical log queries
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [contract, tokenId, version])

  return data
}

export default function PositionPageWrapper() {
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

function PositionPage({ chainId }: { chainId: EVMUniverseChainId | undefined }) {
  const { tokenId: tokenIdFromUrl } = useParams<{ tokenId: string }>()
  const tokenId = parseTokenId(tokenIdFromUrl)
  const chainInfo = chainId ? getChainInfo(chainId) : undefined
  const account = useAccount()
  const supportedAccountChainId = useSupportedChainId(account.chainId)
  const { pathname } = useLocation()
  const {
    data,
    isLoading: positionLoading,
    refetch,
  } = useGetPositionQuery({
    owner: account.address ?? ZERO_ADDRESS,
    protocolVersion: pathname.includes('v3')
      ? ProtocolVersion.V3
      : pathname.includes('v4')
        ? ProtocolVersion.V4
        : ProtocolVersion.UNSPECIFIED,
    tokenId: tokenIdFromUrl,
    chainId: chainId ?? supportedAccountChainId,
  })
  const position = data?.position
  const positionInfo = useMemo(() => parseRestPosition(position), [position])
  const metadata = usePositionTokenURI({ tokenId, chainId, version: positionInfo?.version })
  const {
    timestamp: mintTimestamp,
    totalDeposited0,
    totalDeposited1,
    totalCollected0,
    totalCollected1,
    events: positionEvents,
  } = useMintData(
    chainId,
    tokenIdFromUrl,
    positionInfo?.version,
  )
  usePendingLPTransactionsChangeListener(refetch)

  useEffect(() => {
    const interval = setInterval(() => {
      refetch()
    }, 20_000)
    return () => clearInterval(interval)
  }, [refetch])

  const isLpIncentivesEnabled = useFeatureFlag(FeatureFlags.LpIncentives)

  const navigate = useNavigate()
  const { t } = useTranslation()

  const { currency0Amount, currency1Amount, status, fee0Amount, fee1Amount } = positionInfo ?? {}
  const fiatValue0Raw = useUSDCValue(currency0Amount, PollingInterval.Slow)
  const fiatValue1Raw = useUSDCValue(currency1Amount, PollingInterval.Slow)
  const fiatFeeValue0Raw = useUSDCValue(fee0Amount, PollingInterval.Slow)
  const fiatFeeValue1Raw = useUSDCValue(fee1Amount, PollingInterval.Slow)

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

  const [priceInverted, setPriceInverted] = useState(false)

  const { maxPrice, minPrice, tokenASymbol, tokenBSymbol, isFullRange } = useGetRangeDisplay({
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

  const [selectedHistoryDuration, setSelectedHistoryDuration] = useState<GraphQLApi.HistoryDuration>(
    GraphQLApi.HistoryDuration.Month,
  )
  const [timePeriodDropdownOpen, setTimePeriodDropdownOpen] = useState(false)
  const [mainViewDropdownOpen, setMainViewDropdownOpen] = useState(false)
  const timePeriodOptions = useMemo(() => {
    const options: Array<SegmentedControlOption<GraphQLApi.HistoryDuration> & { verboseDisplay: JSX.Element }> = [
      [
        GraphQLApi.HistoryDuration.Day,
        t('token.priceExplorer.timeRangeLabel.day'),
        t('token.priceExplorer.timeRangeLabel.day.verbose'),
      ],
      [
        GraphQLApi.HistoryDuration.Week,
        t('token.priceExplorer.timeRangeLabel.week'),
        t('token.priceExplorer.timeRangeLabel.week.verbose'),
      ],
      [
        GraphQLApi.HistoryDuration.Month,
        t('token.priceExplorer.timeRangeLabel.month'),
        t('token.priceExplorer.timeRangeLabel.month.verbose'),
      ],
      [
        GraphQLApi.HistoryDuration.Year,
        t('token.priceExplorer.timeRangeLabel.year'),
        t('token.priceExplorer.timeRangeLabel.year.verbose'),
      ],
      [GraphQLApi.HistoryDuration.Max, t('token.priceExplorer.timeRangeLabel.all')],
    ].map((timePeriod) => ({
      value: timePeriod[0] as GraphQLApi.HistoryDuration,
      display: <Text variant="buttonLabel3">{timePeriod[1]}</Text>,
      verboseDisplay: <Text variant="buttonLabel3">{timePeriod[2] ?? timePeriod[1]}</Text>,
    }))
    return {
      options,
      selected: selectedHistoryDuration,
    }
  }, [selectedHistoryDuration, t])

  const [mainView, setMainView] = useState<'chart' | 'nft'>('chart')
  const mainViewOptions = useMemo(() => {
    return [
      {
        value: 'chart',
        display: <Text variant="buttonLabel3">{t('common.chart')}</Text>,
      },
      {
        value: 'nft',
        display: <Text variant="buttonLabel3">{t('common.nft')}</Text>,
      },
    ] as const
  }, [t])

  const { fullWidth: screenWidth } = useDeviceDimensions()
  const chartWidth = useMemo(() => {
    // The chart requires an exact numeric width to render correctly.
    // On mobile, we use the full width of the screen minus the padding.
    if (screenWidth && screenWidth < breakpoints.lg) {
      return screenWidth - 64
    }
    // On desktop, we use a max width of 620px and shrink the width as the screen gets smaller.
    if (screenWidth && screenWidth < breakpoints.xxl) {
      return Math.min((screenWidth - 32) / 2, 620)
    }
    return 620
  }, [screenWidth])

  const onMigrate = useEvent(() => {
    navigate(`/migrate/v3/${chainInfo?.urlParam}/${tokenIdFromUrl}`)
  })

  if (positionLoading) {
    return (
      <BodyWrapper>
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

  if (!position || !positionInfo || !currency0Amount || !currency1Amount || !baseCurrency || !quoteCurrency) {
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
            <Button width="fit-content" variant="branded" onPress={() => navigate('/positions')}>
              {t('common.backToPositions')}
            </Button>
          </Flex>
        }
      />
    )
  }

  const token0Price = positionInfo.version !== ProtocolVersion.V2 ? positionInfo.poolOrPair?.token0Price : undefined
  const token1Price = positionInfo.version !== ProtocolVersion.V2 ? positionInfo.poolOrPair?.token1Price : undefined

  const token0IsStable = STABLECOIN_SYMBOLS.includes(currency0Amount.currency.symbol ?? '')
  const token1IsStable = STABLECOIN_SYMBOLS.includes(currency1Amount.currency.symbol ?? '')

  // Use API-derived fiat values when available, otherwise fall back to pool price
  // if one side of the pair is a stablecoin (treating 1 stablecoin = 1 USD).
  const fiatValue0 = (() => {
    if (fiatValue0Raw) return fiatValue0Raw
    if (token0IsStable) return currency0Amount
    if (token1IsStable && token0Price) {
      try { return token0Price.quote(currency0Amount) } catch { return null }
    }
    return null
  })()

  const fiatValue1 = (() => {
    if (fiatValue1Raw) return fiatValue1Raw
    if (token1IsStable) return currency1Amount
    if (token0IsStable && token1Price) {
      try { return token1Price.quote(currency1Amount) } catch { return null }
    }
    return null
  })()

  const fiatFeeValue0 = (() => {
    if (fiatFeeValue0Raw) return fiatFeeValue0Raw
    if (!fee0Amount) return null
    if (token0IsStable) return fee0Amount
    if (token1IsStable && token0Price) {
      try { return token0Price.quote(fee0Amount) } catch { return null }
    }
    return null
  })()

  const fiatFeeValue1 = (() => {
    if (fiatFeeValue1Raw) return fiatFeeValue1Raw
    if (!fee1Amount) return null
    if (token1IsStable) return fee1Amount
    if (token0IsStable && token1Price) {
      try { return token1Price.quote(fee1Amount) } catch { return null }
    }
    return null
  })()

  const depositedFiatValue0 = (() => {
    if (depositedFiat0) return depositedFiat0
    if (!depositedCurrency0Amount) return null
    if (token0IsStable) return depositedCurrency0Amount
    if (token1IsStable && token0Price) {
      try { return token0Price.quote(depositedCurrency0Amount) } catch { return null }
    }
    return null
  })()

  const depositedFiatValue1 = (() => {
    if (depositedFiat1) return depositedFiat1
    if (!depositedCurrency1Amount) return null
    if (token1IsStable) return depositedCurrency1Amount
    if (token0IsStable && token1Price) {
      try { return token1Price.quote(depositedCurrency1Amount) } catch { return null }
    }
    return null
  })()

  const collectedFiatValue0 = (() => {
    if (collectedFiat0) return collectedFiat0
    if (!collectedCurrency0Amount) return null
    if (token0IsStable) return collectedCurrency0Amount
    if (token1IsStable && token0Price) {
      try { return token0Price.quote(collectedCurrency0Amount) } catch { return null }
    }
    return null
  })()

  const collectedFiatValue1 = (() => {
    if (collectedFiat1) return collectedFiat1
    if (!collectedCurrency1Amount) return null
    if (token1IsStable) return collectedCurrency1Amount
    if (token0IsStable && token1Price) {
      try { return token1Price.quote(collectedCurrency1Amount) } catch { return null }
    }
    return null
  })()

  const { profitLoss, realizedApr, feesApr } = (() => {
    if (
      !mintTimestamp ||
      !fiatValue0 ||
      !fiatValue1 ||
      !fiatFeeValue0 ||
      !fiatFeeValue1 ||
      !depositedFiatValue0 ||
      !depositedFiatValue1 ||
      !collectedFiatValue0 ||
      !collectedFiatValue1
    ) {
      return { profitLoss: undefined, realizedApr: undefined, feesApr: undefined }
    }

    const currentValueUsd =
      parseFloat(fiatValue0.toExact()) + parseFloat(fiatValue1.toExact()) +
      parseFloat(fiatFeeValue0.toExact()) + parseFloat(fiatFeeValue1.toExact())
    const totalDepositedUsd = parseFloat(depositedFiatValue0.toExact()) + parseFloat(depositedFiatValue1.toExact())
    const totalCollectedUsd = parseFloat(collectedFiatValue0.toExact()) + parseFloat(collectedFiatValue1.toExact())
    const uncollectedFeesUsd = parseFloat(fiatFeeValue0.toExact()) + parseFloat(fiatFeeValue1.toExact())

    const pl = currentValueUsd + totalCollectedUsd - totalDepositedUsd

    const ageSeconds = Date.now() / 1000 - mintTimestamp
    if (totalDepositedUsd === 0 || ageSeconds < 86400) {
      return { profitLoss: pl, realizedApr: undefined, feesApr: undefined }
    }

    const annualizer = (365 * 24 * 3600) / ageSeconds
    const totalReturn = (currentValueUsd + totalCollectedUsd - totalDepositedUsd) / totalDepositedUsd
    const feesReturn = (totalCollectedUsd + uncollectedFeesUsd) / totalDepositedUsd
    return {
      profitLoss: pl,
      realizedApr: totalReturn * annualizer * 100,
      feesApr: feesReturn * annualizer * 100,
    }
  })()

  const isOwner = areAddressesEqual({
    addressInput1: { address: positionInfo.owner, chainId: positionInfo.chainId },
    addressInput2: { address: account.address, chainId: supportedAccountChainId ?? positionInfo.chainId },
  })

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
            quoteSymbol: currency1Amount.currency.symbol,
            baseSymbol: currency0Amount.currency.symbol,
          })}
        </title>
      </Helmet>
      <BodyWrapper mb={100}>
        <Flex gap="$gap20">
          <BreadcrumbNavContainer aria-label="breadcrumb-nav">
            <BreadcrumbNavLink style={{ gap: '8px' }} to="/positions">
              <ArrowLeft size={14} /> <Trans i18nKey="pool.positions.title" />
            </BreadcrumbNavLink>
          </BreadcrumbNavContainer>
          <Flex
            row
            $lg={{ row: false, alignItems: 'flex-start', gap: '$gap16' }}
            justifyContent="space-between"
            alignItems="center"
            borderBottomWidth={1}
            borderColor="$surface3"
            pb="$padding16"
          >
            <LiquidityPositionInfo
              positionInfo={positionInfo}
              linkToPool
              includeNetwork
              includeLpIncentives={isLpIncentivesEnabled}
            />
            <PositionPageActionButtons isOwner={isOwner} positionInfo={positionInfo} onMigrate={onMigrate} />
          </Flex>
        </Flex>
        <Flex row justifyContent="space-between" pt="$padding20" $lg={{ row: false, gap: '$gap24' }}>
          <Flex gap="$gap12" width={chartWidth}>
            <Flex row gap="$gap8" alignItems="center">
              <BaseQuoteFiatAmount
                price={priceInverted ? token1Price : token0Price}
                base={priceInverted ? currency1Amount.currency : currency0Amount.currency}
                quote={priceInverted ? currency0Amount.currency : currency1Amount.currency}
                variant="heading3"
              />
              <TouchableArea
                onPress={() => {
                  setPriceInverted((prev) => !prev)
                }}
              >
                <ExchangeHorizontal size="$icon.16" />
              </TouchableArea>
            </Flex>
            <Flex
              animation="fast"
              height="auto"
              width="100%"
              $lg={{ width: '100%' }}
              borderWidth={0}
              borderColor="$surface3"
              pb="$padding12"
            >
              {mainView === 'chart' ? (
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
                />
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
                      gap="$gap6"
                      {...ClickableTamaguiStyle}
                    >
                      {mainViewOptions.find((p) => p.value === mainView)?.display}
                      <RotatableChevron direction="down" height={16} width={16} color="$neutral2" />
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
                  onSelectOption={(option: 'chart' | 'nft') => {
                    setMainView(option)
                  }}
                />
              )}
              {mainView === 'chart' &&
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
                        gap="$gap6"
                        {...ClickableTamaguiStyle}
                      >
                        {timePeriodOptions.options.find((p) => p.value === timePeriodOptions.selected)?.display}
                        <RotatableChevron direction="down" height={16} width={16} color="$neutral2" />
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
                    onSelectOption={(option: GraphQLApi.HistoryDuration) => {
                      setSelectedHistoryDuration(option)
                    }}
                  />
                ))}
            </Flex>
            <Flex mt="$spacing24" gap="$spacing16">
              <PriceRangeSection
                maxPrice={maxPrice}
                minPrice={minPrice}
                tokenASymbol={tokenASymbol}
                tokenBSymbol={tokenBSymbol}
                isFullRange={isFullRange}
                token0CurrentPrice={token0Price}
                token1CurrentPrice={token1Price}
                priceInverted={priceInverted}
                setPriceInverted={setPriceInverted}
              />
              {positionEvents.length > 0 && currency0Amount && currency1Amount && chainId && (
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

                      const hasAmounts = !ev.amount0.isZero() || !ev.amount1.isZero()
                      const amountParts: string[] = []
                      if (!ev.amount0.isZero()) {
                        amountParts.push(`${amt0} ${sym0}`)
                      }
                      if (!ev.amount1.isZero()) {
                        amountParts.push(`${amt1} ${sym1}`)
                      }

                      return (
                        <Flex key={`${ev.txHash}-${ev.type}-${idx}`} row alignItems="flex-start" gap="$spacing8">
                          <Text variant="body3" style={{ minWidth: 22 }}>
                            {emoji}
                          </Text>
                          <Text variant="body3" color="$neutral3" style={{ lineHeight: 22 }}>
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
              position={position}
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
              position={position}
              currency0Amount={currency0Amount}
              currency1Amount={currency1Amount}
              fiatValue0={fiatValue0}
              fiatValue1={fiatValue1}
            />
            <EarningsSection
              positionInfo={positionInfo}
              currency0Amount={currency0Amount}
              currency1Amount={currency1Amount}
              fiatValue0={fiatValue0}
              fiatValue1={fiatValue1}
              fiatFeeValue0={fiatFeeValue0}
              fiatFeeValue1={fiatFeeValue1}
              fee0Amount={fee0Amount}
              fee1Amount={fee1Amount}
            />
            {isLpIncentivesEnabled &&
              positionInfo.version === ProtocolVersion.V4 &&
              Boolean(positionInfo.boostedApr) && (
                <APRSection
                  poolApr={positionInfo.apr}
                  lpIncentiveRewardApr={positionInfo.boostedApr}
                  totalApr={positionInfo.totalApr}
                />
              )}
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
          </Flex>
        </Flex>
      </BodyWrapper>
    </Trace>
  )
}

const SectionContainer = ({ children }: { children: React.ReactNode }) => {
  return (
    <Flex
      p="$spacing20"
      backgroundColor="$surface2"
      width={380}
      $lg={{ width: '100%' }}
      borderRadius="$rounded16"
      gap="$spacing24"
      $platform-web={{
        height: 'min-content',
      }}
    >
      {children}
    </Flex>
  )
}

const TotalValueSection = ({
  position,
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
  position: Position
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
  const colors = useSporeColors()
  const currencyInfo0 = useCurrencyInfo(currency0Amount.currency)
  const currencyInfo1 = useCurrencyInfo(currency1Amount.currency)
  const token0Color = useSrcColor({
    src: currencyInfo0?.logoUrl ?? undefined,
    currencyName: currencyInfo0?.currency.name,
    backgroundColor: colors.surface2.val,
  }).tokenColor
  const token1Color = useSrcColor({
    src: currencyInfo1?.logoUrl ?? undefined,
    currencyName: currencyInfo1?.currency.name,
    backgroundColor: colors.surface2.val,
  }).tokenColor

  const totalFiat0 = useMemo(() => {
    if (!fiatValue0) {
      return undefined
    }
    return fiatFeeValue0 ? parseFloat(fiatValue0.toExact()) + parseFloat(fiatFeeValue0.toExact()) : parseFloat(fiatValue0.toExact())
  }, [fiatValue0, fiatFeeValue0])

  const totalFiat1 = useMemo(() => {
    if (!fiatValue1) {
      return undefined
    }
    return fiatFeeValue1 ? parseFloat(fiatValue1.toExact()) + parseFloat(fiatFeeValue1.toExact()) : parseFloat(fiatValue1.toExact())
  }, [fiatValue1, fiatFeeValue1])

  const totalValueExact = useMemo(() => {
    if (totalFiat0 === undefined || totalFiat1 === undefined) {
      return undefined
    }
    return totalFiat0 + totalFiat1
  }, [totalFiat0, totalFiat1])

  const formattedTotalValue = useMemo(
    () => (totalValueExact !== undefined ? convertFiatAmountFormatted(totalValueExact, NumberType.FiatTokenPrice) : undefined),
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
      !token0Color ||
      !token1Color ||
      !currencyInfo0 ||
      !currencyInfo1
    ) {
      return []
    }

    const bips0 = Math.round((totalFiat0 / totalValueExact) * 10000)
    const bips1 = 10000 - bips0

    return [
      { value: new Percent(bips0, 10000), color: token0Color, currencyInfo: currencyInfo0 },
      { value: new Percent(bips1, 10000), color: token1Color, currencyInfo: currencyInfo1 },
    ]
  }, [totalFiat0, totalFiat1, totalValueExact, token0Color, token1Color, currencyInfo0, currencyInfo1])

  const totalRowFiat0 = useMemo(
    () => (fiatValue0 && fiatFeeValue0 ? fiatValue0.add(fiatFeeValue0) : fiatValue0),
    [fiatValue0, fiatFeeValue0],
  )
  const totalRowFiat1 = useMemo(
    () => (fiatValue1 && fiatFeeValue1 ? fiatValue1.add(fiatFeeValue1) : fiatValue1),
    [fiatValue1, fiatFeeValue1],
  )
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
        fiatValue: totalRowFiat0,
        flashColor: totalRow0FlashColor,
      },
      {
        currencyInfo: currencyInfo1,
        currencyAmount: totalAmount1,
        fiatValue: totalRowFiat1,
        flashColor: totalRow1FlashColor,
      },
    ]
  }, [currencyInfo0, currencyInfo1, totalAmount0, totalAmount1, totalRowFiat0, totalRowFiat1, totalRow0FlashColor, totalRow1FlashColor, totalFiat0, totalFiat1])

  return (
    <SectionContainer>
      <Flex gap="$gap8">
        <Text color="$neutral2" variant="body2">
          {t('common.totalValue')}
        </Text>
        {position.status === PositionStatus.CLOSED ? (
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
                  {profitLoss !== undefined && profitLoss >= 0 ? '+' : ''}{formattedPL}
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
  position,
  currency0Amount,
  currency1Amount,
  fiatValue0,
  fiatValue1,
}: {
  position: Position
  currency0Amount: CurrencyAmount<Currency>
  currency1Amount: CurrencyAmount<Currency>
  fiatValue0: Maybe<CurrencyAmount<Currency>>
  fiatValue1: Maybe<CurrencyAmount<Currency>>
}) => {
  const { convertFiatAmountFormatted, formatCurrencyAmount: formatCurrencyAmountPos } = useLocalizationContext()
  const { t } = useTranslation()
  const colors = useSporeColors()
  const currencyInfo0 = useCurrencyInfo(currency0Amount.currency)
  const currencyInfo1 = useCurrencyInfo(currency1Amount.currency)
  const token0Color = useSrcColor({
    src: currencyInfo0?.logoUrl ?? undefined,
    currencyName: currencyInfo0?.currency.name,
    backgroundColor: colors.surface2.val,
  }).tokenColor
  const token1Color = useSrcColor({
    src: currencyInfo1?.logoUrl ?? undefined,
    currencyName: currencyInfo1?.currency.name,
    backgroundColor: colors.surface2.val,
  }).tokenColor
  const totalFiatValue = fiatValue0?.add(fiatValue1 ?? CurrencyAmount.fromRawAmount(fiatValue0.currency, 0))
  const formattedTotal = useMemo(
    () => (fiatValue0 && fiatValue1 ? convertFiatAmountFormatted(fiatValue0.add(fiatValue1).toExact(), NumberType.FiatTokenPrice) : undefined),
    [fiatValue0, fiatValue1, convertFiatAmountFormatted],
  )
  const positionFlashColor = useFlashColor(formattedTotal)
  const bars = useMemo(() => {
    const percent0 =
      totalFiatValue?.greaterThan(0) && fiatValue0
        ? new Percent(fiatValue0.quotient, totalFiatValue.quotient)
        : undefined

    const percent1 =
      totalFiatValue?.greaterThan(0) && fiatValue1
        ? new Percent(fiatValue1.quotient, totalFiatValue.quotient)
        : undefined

    if (!percent0 || !percent1 || !token0Color || !token1Color || !currencyInfo0 || !currencyInfo1) {
      return []
    }

    return [
      { value: percent0, color: token0Color, currencyInfo: currencyInfo0 },
      { value: percent1, color: token1Color, currencyInfo: currencyInfo1 },
    ]
  }, [currencyInfo0, currencyInfo1, fiatValue0, fiatValue1, token0Color, token1Color, totalFiatValue])

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
        fiatValue: fiatValue0,
        flashColor: posRow0FlashColor,
      },
      {
        currencyInfo: currencyInfo1,
        currencyAmount: currency1Amount,
        fiatValue: fiatValue1,
        flashColor: posRow1FlashColor,
      },
    ]
  }, [currencyInfo0, currencyInfo1, currency0Amount, currency1Amount, fiatValue0, fiatValue1, posRow0FlashColor, posRow1FlashColor])

  return (
    <SectionContainer>
      <Flex gap="$gap8">
        <Text color="$neutral2" variant="body2">
          <Trans i18nKey="pool.position" />
        </Text>
        {position.status === PositionStatus.CLOSED ? (
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
  lpIncentiveRewardApr,
  totalApr,
}: {
  poolApr?: number
  lpIncentiveRewardApr?: number
  totalApr?: number
}) => {
  const { address, chainId, symbol } = LP_INCENTIVES_REWARD_TOKEN
  const currencyInfo = useCurrencyInfo(address, chainId)
  const { t } = useTranslation()
  const { formatPercent } = useLocalizationContext()

  // Format APR values
  const displayPoolApr = poolApr ? formatPercent(poolApr) : '-'
  const displayRewardApr = lpIncentiveRewardApr ? formatPercent(lpIncentiveRewardApr) : '-'
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
          <Text color="$neutral2" variant="body3">
            {t('pool.aprText')}
          </Text>
          <Text color="$neutral1" variant="body3">
            {displayPoolApr}
          </Text>
        </Flex>
        <Flex row justifyContent="space-between">
          <Text color="$neutral2" variant="body3">
            {t('pool.rewardAPR')}
          </Text>
          <Flex row gap="$spacing6" alignItems="center">
            <CurrencyLogo currencyInfo={currencyInfo} size={16} />
            <Text color="$accent1" variant="body3">
              {displayRewardApr} {symbol}
            </Text>
          </Flex>
        </Flex>
      </Flex>
    </SectionContainer>
  )
}

const EarningsSection = ({
  positionInfo,
  currency0Amount,
  currency1Amount,
  fiatFeeValue0,
  fiatFeeValue1,
  fee0Amount,
  fee1Amount,
}: {
  positionInfo: PositionInfo
  currency0Amount: CurrencyAmount<Currency>
  currency1Amount: CurrencyAmount<Currency>
  fiatValue0: Maybe<CurrencyAmount<Currency>>
  fiatValue1: Maybe<CurrencyAmount<Currency>>
  fiatFeeValue0: Maybe<CurrencyAmount<Currency>>
  fiatFeeValue1: Maybe<CurrencyAmount<Currency>>
  fee0Amount?: CurrencyAmount<Currency>
  fee1Amount?: CurrencyAmount<Currency>
}) => {
  const { convertFiatAmountFormatted, formatCurrencyAmount: formatCurrencyAmountEarn } = useLocalizationContext()
  const { t } = useTranslation()
  const colors = useSporeColors()
  const isLpIncentivesEnabled = useFeatureFlag(FeatureFlags.LpIncentives)

  const { uniLpRewardsCurrencyAmount, uniLpRewardsFiatValue, totalEarningsFiatValue, hasRewards, hasFees } =
    useLpIncentivesFormattedEarnings({
      liquidityPosition: positionInfo,
      fiatFeeValue0,
      fiatFeeValue1,
    })

  const formattedEarnings = useMemo(
    () => (totalEarningsFiatValue ? convertFiatAmountFormatted(totalEarningsFiatValue.toExact(), NumberType.FiatRewards) : undefined),
    [totalEarningsFiatValue, convertFiatAmountFormatted],
  )
  const earningsFlashColor = useFlashColor(formattedEarnings)

  // TODO(WEB-4920): skip GraphQL call once backend provides image URLs
  const [currencyInfo0, currencyInfo1, rewardCurrencyInfo] = useCurrencyInfos([
    currencyId(currency0Amount.currency),
    currencyId(currency1Amount.currency),
    buildCurrencyId(UniverseChainId.Mainnet, LP_INCENTIVES_REWARD_TOKEN.address),
  ])

  const token0Color = useSrcColor({
    src: currencyInfo0?.logoUrl ?? undefined,
    currencyName: currencyInfo0?.currency.name,
    backgroundColor: colors.surface2.val,
  }).tokenColor
  const token1Color = useSrcColor({
    src: currencyInfo1?.logoUrl ?? undefined,
    currencyName: currencyInfo1?.currency.name,
    backgroundColor: colors.surface2.val,
  }).tokenColor
  const rewardTokenColor = useSrcColor({
    src: rewardCurrencyInfo?.logoUrl ?? undefined,
    currencyName: rewardCurrencyInfo?.currency.name,
    backgroundColor: colors.surface2.val,
  }).tokenColor

  const bars = useMemo(() => {
    const percent0 =
      totalEarningsFiatValue?.greaterThan(0) && fiatFeeValue0
        ? new Percent(fiatFeeValue0.quotient, totalEarningsFiatValue.quotient)
        : undefined

    const percent1 =
      totalEarningsFiatValue?.greaterThan(0) && fiatFeeValue1
        ? new Percent(fiatFeeValue1.quotient, totalEarningsFiatValue.quotient)
        : undefined

    if (!percent0 || !percent1 || !token0Color || !token1Color || !currencyInfo0 || !currencyInfo1) {
      return []
    }

    const rewards =
      isLpIncentivesEnabled &&
      rewardTokenColor &&
      uniLpRewardsFiatValue?.greaterThan(0) &&
      totalEarningsFiatValue?.greaterThan(0) &&
      hasRewards
        ? [
            {
              value: new Percent(uniLpRewardsFiatValue.quotient, totalEarningsFiatValue.quotient),
              color: rewardTokenColor,
              currencyInfo: rewardCurrencyInfo as CurrencyInfo,
            },
          ]
        : []

    return [
      { value: percent0, color: token0Color, currencyInfo: currencyInfo0 },
      { value: percent1, color: token1Color, currencyInfo: currencyInfo1 },
      ...rewards,
    ]
  }, [
    totalEarningsFiatValue,
    fiatFeeValue0,
    fiatFeeValue1,
    token0Color,
    token1Color,
    currencyInfo0,
    currencyInfo1,
    isLpIncentivesEnabled,
    rewardTokenColor,
    uniLpRewardsFiatValue,
    hasRewards,
    rewardCurrencyInfo,
  ])

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
        fiatValue: fiatFeeValue0,
        flashColor: feeRow0FlashColor,
      },
      {
        currencyInfo: currencyInfo1,
        currencyAmount: fee1Amount,
        fiatValue: fiatFeeValue1,
        flashColor: feeRow1FlashColor,
      },
    ]
  }, [currencyInfo0, currencyInfo1, fee0Amount, fee1Amount, fiatFeeValue0, fiatFeeValue1, feeRow0FlashColor, feeRow1FlashColor])

  const rewardRows = useMemo(() => {
    if (!isLpIncentivesEnabled || !rewardCurrencyInfo || !hasRewards) {
      return []
    }

    return [
      {
        currencyInfo: rewardCurrencyInfo,
        currencyAmount: uniLpRewardsCurrencyAmount || CurrencyAmount.fromRawAmount(rewardCurrencyInfo.currency, 0),
        fiatValue: uniLpRewardsFiatValue,
      },
    ]
  }, [isLpIncentivesEnabled, rewardCurrencyInfo, uniLpRewardsCurrencyAmount, uniLpRewardsFiatValue, hasRewards])

  return (
    <SectionContainer>
      <Flex gap="$gap8">
        <Text color="$neutral2" variant="body2">
          {isLpIncentivesEnabled && hasRewards ? t('pool.earnings') : t('common.feesEarned')}
        </Text>
        {positionInfo.status === PositionStatus.CLOSED ? (
          <Text variant="heading2">{convertFiatAmountFormatted(0, NumberType.FiatRewards)}</Text>
        ) : (
          <>
            <Text variant="heading2" mb="$spacing12" color={earningsFlashColor ?? '$neutral1'}>
              {totalEarningsFiatValue ? (
                convertFiatAmountFormatted(totalEarningsFiatValue.toExact(), NumberType.FiatRewards)
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

            {isLpIncentivesEnabled ? (
              <>
                {hasRewards && rewardRows.length > 0 && (
                  <>
                    <Text color="$neutral2" variant="body2" mb="$spacing12">
                      {t('pool.rewards')}
                    </Text>
                    <LiquidityPositionAmountRows rows={rewardRows} />
                  </>
                )}
                {hasFees && feeRows.length > 0 && (
                  <>
                    <Text color="$neutral2" variant="body2" mb="$spacing12" mt={hasRewards ? '$spacing24' : '$none'}>
                      {t('common.fees')}
                    </Text>
                    <LiquidityPositionAmountRows rows={feeRows} />
                  </>
                )}
              </>
            ) : (
              feeRows.length > 0 && <LiquidityPositionAmountRows rows={feeRows} />
            )}

            {(!totalEarningsFiatValue || totalEarningsFiatValue.equalTo(0)) && (
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

const PriceDisplay = ({
  labelText,
  price,
  tokenASymbol,
  tokenBSymbol,
  priceColor,
  setPriceInverted,
}: {
  labelText: string
  price: string | React.ReactNode
  tokenASymbol?: string
  tokenBSymbol?: string
  priceColor?: string
  setPriceInverted: (value: React.SetStateAction<boolean>) => void
}) => {
  return (
    <Flex gap="$gap4">
      <Text variant="subheading2" color="$neutral2">
        {labelText}
      </Text>
      <Text variant="subheading1" color={priceColor}>{price}</Text>
      <Flex group row>
        <Flex row gap="$gap8" alignItems="center">
          <Text variant="body4" color="$neutral2">
            {tokenASymbol} = 1 {tokenBSymbol}
          </Text>
          <TouchableArea
            animation={null}
            $group-hover={{ opacity: 1 }}
            opacity={0}
            onPress={() => {
              setPriceInverted((prev: boolean) => !prev)
            }}
          >
            <ExchangeHorizontal color="$neutral2" size="$icon.16" />
          </TouchableArea>
        </Flex>
      </Flex>
    </Flex>
  )
}

const PriceRangeSection = ({
  maxPrice,
  minPrice,
  tokenASymbol,
  tokenBSymbol,
  token0CurrentPrice,
  token1CurrentPrice,
  isFullRange,
  priceInverted,
  setPriceInverted,
}: {
  maxPrice: string
  minPrice: string
  tokenASymbol?: string
  tokenBSymbol?: string
  isFullRange?: boolean
  token0CurrentPrice?: Price<Currency, Currency>
  token1CurrentPrice?: Price<Currency, Currency>
  priceInverted?: boolean
  setPriceInverted: React.Dispatch<React.SetStateAction<boolean>>
}) => {
  const { t } = useTranslation()
  const { formatNumberOrString } = useLocalizationContext()
  const formattedMarketPrice = useMemo(() => {
    return formatNumberOrString({
      value: (priceInverted ? token1CurrentPrice : token0CurrentPrice)?.toSignificant(),
      type: NumberType.TokenTx,
    })
  }, [priceInverted, token0CurrentPrice, token1CurrentPrice, formatNumberOrString])
  const marketPriceFlashColor = useFlashColor(formattedMarketPrice)

  if (isFullRange) {
    return null
  }

  return (
    <Flex gap="$spacing24">
      <Text variant="heading3" color="$neutral1">
        Price Range
      </Text>
      <Flex row justifyContent="space-between">
        <PriceDisplay
          labelText={t('pool.minPrice')}
          price={minPrice}
          tokenASymbol={tokenASymbol}
          tokenBSymbol={tokenBSymbol}
          setPriceInverted={setPriceInverted}
        />

        <PriceDisplay
          labelText={t('pool.maxPrice')}
          price={maxPrice}
          tokenASymbol={tokenASymbol}
          tokenBSymbol={tokenBSymbol}
          setPriceInverted={setPriceInverted}
        />

        <PriceDisplay
          labelText={t('common.marketPrice')}
          price={formattedMarketPrice}
          priceColor={marketPriceFlashColor}
          tokenASymbol={tokenASymbol}
          tokenBSymbol={tokenBSymbol}
          setPriceInverted={setPriceInverted}
        />
      </Flex>
    </Flex>
  )
}
