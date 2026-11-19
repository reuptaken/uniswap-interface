import { useQuery } from '@tanstack/react-query'
import { Flex, Text } from '@universe/mycelium'
import { opacify, useSporeColors } from '@universe/mycelium/theme-hooks-compat'
import { CandlestickSeries, ColorType, createChart, CrosshairMode, HistogramSeries } from 'lightweight-charts'
import type { AutoscaleInfo, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { useEffect, useRef, useState } from 'react'
import { useChartPreferencesStore } from '~/features/Liquidity/charts/PositionCandlestickChart/chartPreferencesStore'
import { ChartResizeHandle } from '~/features/Liquidity/charts/PositionCandlestickChart/ChartResizeHandle'
import {
  type LiquiditySegment,
  LiquidityDepthPrimitive,
} from '~/features/Liquidity/charts/PositionCandlestickChart/LiquidityDepthPrimitive'
import { DEPTH_QUOTE_MOVE, formatCompactUsd } from '~/features/Liquidity/charts/PositionCandlestickChart/marketDepth'
import {
  fetchPoolCandles,
  nextLiveCandle,
  type PoolCandle,
  type PoolCandlesSource,
  pricePrecision,
} from '~/features/Liquidity/charts/PositionCandlestickChart/poolCandles'
import type { PoolPositionRange } from '~/features/Liquidity/charts/PositionCandlestickChart/poolPositionRanges'
import {
  type PositionRange,
  PositionRangeRectangle,
} from '~/features/Liquidity/charts/PositionCandlestickChart/PositionRangeRectangle'
import { useHighlightedPositionStore } from '~/features/Liquidity/hooks/useHighlightedPositionStore'

const CANDLES_REFETCH_MS = 60_000
const INITIAL_VISIBLE_CANDLES = 125
const VOLUME_PANE_INDEX = 1
const VOLUME_PANE_HEIGHT = 96
// Above the chart's own canvases, which are layered within its container.
const OVERLAY_Z_INDEX = 3
// The chart's attribution logo sits in the bottom pane's corner; with volume hidden that's the price pane, so the depth
// readout moves up above it.
const ATTRIBUTION_LOGO_CLEARANCE = 26
// Keeps the "show volume" control clear of the price scale on the right.
const PRICE_SCALE_CLEARANCE = 72
// The time scale's strip under the panes.
const TIME_AXIS_HEIGHT = 28
const NO_POOL_POSITIONS: readonly PoolPositionRange[] = []
const NO_LIQUIDITY_SEGMENTS: readonly LiquiditySegment[] = []
// Room right of the newest candle, in bars: it shows whole, with a sliver of space after it.
const LATEST_CANDLE_RIGHT_ROOM = 1

type CandleSeries = ISeriesApi<'Candlestick'>

function latestCandleIndex(chart: IChartApi, series: CandleSeries): number | null {
  const data = series.data()
  return data.length > 0 ? chart.timeScale().timeToIndex(data[data.length - 1].time, true) : null
}

/** Whether the newest candle is on screen, i.e. the user is watching the live edge rather than history. */
function isFollowingLatestCandle(chart: IChartApi, series: CandleSeries): boolean {
  const range = chart.timeScale().getVisibleLogicalRange()
  const latestIndex = latestCandleIndex(chart, series)
  return range !== null && latestIndex !== null && range.to >= latestIndex - 0.5
}

/** Scrolls, keeping the zoom, just far enough left that the newest candle is fully on screen. */
function revealLatestCandle(chart: IChartApi, series: CandleSeries): void {
  const timeScale = chart.timeScale()
  const range = timeScale.getVisibleLogicalRange()
  const latestIndex = latestCandleIndex(chart, series)
  if (!range || latestIndex === null) {
    return
  }
  const shortfall = latestIndex + LATEST_CANDLE_RIGHT_ROOM - range.to
  if (shortfall > 0) {
    timeScale.setVisibleLogicalRange({ from: range.from + shortfall, to: range.to + shortfall })
  }
}

interface PositionCandlestickChartProps {
  candlesSource: PoolCandlesSource
  candleSeconds: number
  width: number
  /** Position start, unix seconds. */
  startTime: number | undefined
  priceLower: number | undefined
  priceUpper: number | undefined
  inRange: boolean
  /** Live price read from the pool, in the candles' orientation; it drives the current candle. */
  livePrice: number | undefined
  /** The owner's other positions in this pool, drawn faintly beneath this one. */
  poolPositions?: readonly PoolPositionRange[]
  /** getPositionKey of this position, so pointing it out in the position switcher highlights its box. */
  positionKey?: string
  /** Called with the key of a pool position whose box was clicked. */
  onSelectPosition?: (key: string) => void
  /** The pool's liquidity by price, in the candles' orientation, drawn as depth bars along the right edge. */
  liquiditySegments?: readonly LiquiditySegment[]
  /** USD to move the price 0.01% within a depth segment; with it, the corner shows the depth at the cursor or price. */
  depthPerPercentUsd?: (segment: LiquiditySegment) => number | undefined
}

export function PositionCandlestickChart({
  candlesSource,
  candleSeconds,
  width,
  startTime,
  priceLower,
  priceUpper,
  inRange,
  livePrice,
  poolPositions = NO_POOL_POSITIONS,
  positionKey,
  onSelectPosition,
  liquiditySegments = NO_LIQUIDITY_SEGMENTS,
  depthPerPercentUsd,
}: PositionCandlestickChartProps): JSX.Element {
  const colors = useSporeColors()
  const highlightedKey = useHighlightedPositionStore((state) => state.highlightedKey)
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<CandleSeries | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const rectangleRef = useRef<PositionRangeRectangle | null>(null)
  const depthRef = useRef<LiquidityDepthPrimitive | null>(null)
  const rangeRef = useRef<{ lower?: number; upper?: number }>({})
  const hasFramedRef = useRef(false)
  const liveCandleRef = useRef<PoolCandle | null>(null)
  // Bumped each time the chart is (re)built, e.g. once the page measures its width; a rebuilt chart starts empty,
  // so every effect that feeds it data depends on this to refill it.
  const [chartGeneration, setChartGeneration] = useState(0)
  // The price under the cursor in the price pane, for the corner's depth readout; undefined when not hovering it.
  const [hoverPrice, setHoverPrice] = useState<number | undefined>(undefined)
  const showVolume = useChartPreferencesStore((state) => state.showVolume)
  const setShowVolume = useChartPreferencesStore((state) => state.setShowVolume)
  const savedHeight = useChartPreferencesStore((state) => state.chartHeight)
  const setChartHeight = useChartPreferencesStore((state) => state.setChartHeight)
  // While the bottom edge is being dragged, the height follows the pointer here; it's saved on release.
  const [dragHeight, setDragHeight] = useState<number | undefined>(undefined)
  const height = dragHeight ?? savedHeight
  // The size the chart is built at; later changes resize it in place (below), keeping its zoom and scroll.
  const sizeRef = useRef({ width, height })
  sizeRef.current = { width, height }
  // How far the price pane's bottom sits above the chart's: the time axis, plus the volume pane when shown.
  const pricePaneBottom = TIME_AXIS_HEIGHT + (showVolume ? VOLUME_PANE_HEIGHT : 0)

  const { data: candles, isError } = useQuery({
    queryKey: ['poolCandles', candlesSource.key],
    queryFn: () => fetchPoolCandles(candlesSource),
    refetchInterval: CANDLES_REFETCH_MS,
    staleTime: CANDLES_REFETCH_MS,
  })

  rangeRef.current = { lower: priceLower, upper: priceUpper }

  useEffect(() => {
    const container = containerRef.current
    if (!container) {
      return undefined
    }
    const chart = createChart(container, {
      width: sizeRef.current.width,
      height: sizeRef.current.height,
      layout: {
        background: { type: ColorType.Solid, color: colors.surface2.val },
        textColor: colors.neutral2.val,
      },
      grid: {
        vertLines: { color: opacify(6, colors.neutral1.val) },
        horzLines: { color: opacify(6, colors.neutral1.val) },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: { borderVisible: false, timeVisible: true, secondsVisible: false },
      // The crosshair follows the pointer rather than snapping to candle closes.
      crosshair: { mode: CrosshairMode.Normal },
    })
    const series = chart.addSeries(CandlestickSeries, {
      upColor: colors.statusSuccess.val,
      downColor: colors.statusCritical.val,
      wickUpColor: colors.statusSuccess.val,
      wickDownColor: colors.statusCritical.val,
      borderVisible: false,
      // Keep the position's range on screen even when the price is far from it.
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null): AutoscaleInfo | null => {
        const info = original()
        const { lower, upper } = rangeRef.current
        if (!info?.priceRange || lower === undefined || upper === undefined) {
          return info
        }
        return {
          ...info,
          priceRange: {
            minValue: Math.min(info.priceRange.minValue, lower),
            maxValue: Math.max(info.priceRange.maxValue, upper),
          },
        }
      },
    })
    // Depth first, so the range boxes paint over it.
    const depth = new LiquidityDepthPrimitive()
    series.attachPrimitive(depth)
    const rectangle = new PositionRangeRectangle()
    series.attachPrimitive(rectangle)
    chartRef.current = chart
    hasFramedRef.current = false
    liveCandleRef.current = null
    seriesRef.current = series
    rectangleRef.current = rectangle
    depthRef.current = depth
    chart.subscribeCrosshairMove((event) => {
      // Only over the price pane: the volume pane's y means volume, not price.
      const price = event.point && event.paneIndex === 0 ? series.coordinateToPrice(event.point.y) : null
      setHoverPrice(price ?? undefined)
    })
    setChartGeneration((generation) => generation + 1)
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      volumeSeriesRef.current = null
      rectangleRef.current = null
      depthRef.current = null
    }
  }, [colors])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) {
      return
    }
    chart.resize(width, height)
    // A resize shares the change across the panes; keep the volume pane at its size so the price pane takes it all
    // (and the overlays placed by the volume pane's height stay put).
    chart.panes()[VOLUME_PANE_INDEX]?.setHeight(VOLUME_PANE_HEIGHT)
  }, [width, height, chartGeneration, showVolume])

  // Volume gets its own pane and price scale below the candles (the panes share the time scale, so they stay in sync),
  // added and removed here so toggling it keeps the chart, its zoom and scroll.
  useEffect(() => {
    const chart = chartRef.current
    if (!chart) {
      return
    }
    if (showVolume && !volumeSeriesRef.current) {
      volumeSeriesRef.current = chart.addSeries(
        HistogramSeries,
        { priceFormat: { type: 'volume' }, lastValueVisible: true, priceLineVisible: false },
        VOLUME_PANE_INDEX,
      )
      chart.panes()[VOLUME_PANE_INDEX]?.setHeight(VOLUME_PANE_HEIGHT)
    } else if (!showVolume && volumeSeriesRef.current) {
      chart.removeSeries(volumeSeriesRef.current)
      volumeSeriesRef.current = null
      if (chart.panes().length > VOLUME_PANE_INDEX) {
        chart.removePane(VOLUME_PANE_INDEX)
      }
    }
  }, [showVolume, chartGeneration])

  useEffect(() => {
    const volumeSeries = volumeSeriesRef.current
    if (!volumeSeries) {
      return
    }
    // While another interval loads, clear the old bars so they don't share the time scale with the new candles.
    if (!candles) {
      volumeSeries.setData([])
      return
    }
    // Volume arrives in the quote token: the volume scale reads in that token (USDC for a WETH/USDC pool).
    volumeSeries.setData(
      candles
        .filter((candle) => candle.volume !== undefined)
        .map((candle) => ({
          time: candle.time as UTCTimestamp,
          value: candle.volume ?? 0,
          color: opacify(40, candle.close >= candle.open ? colors.statusSuccess.val : colors.statusCritical.val),
        })),
    )
  }, [candles, colors, chartGeneration, showVolume])

  // A different interval or price direction is a different series: frame it afresh.
  useEffect(() => {
    hasFramedRef.current = false
    liveCandleRef.current = null
  }, [candlesSource.key])

  useEffect(() => {
    const series = seriesRef.current
    if (!series) {
      return
    }
    if (!candles || candles.length === 0) {
      series.setData([])
      return
    }
    const chart = chartRef.current
    // Measured before the refetch lands: setData never scrolls, so a candle it adds would open off screen.
    const following = hasFramedRef.current && chart !== null && isFollowingLatestCandle(chart, series)
    const precision = pricePrecision(candles[candles.length - 1].close)
    series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
    series.setData(candles.map((candle: PoolCandle) => ({ ...candle, time: candle.time as UTCTimestamp })))
    if (following) {
      revealLatestCandle(chart, series)
    }

    // Open on the same number of candles whatever the interval, once per series; after that the user owns zoom and scroll.
    if (!hasFramedRef.current) {
      hasFramedRef.current = true
      // By time, not bar index: the volume series can briefly hold another interval's bars on the shared time scale.
      const from = candles[Math.max(0, candles.length - INITIAL_VISIBLE_CANDLES)].time
      const to = candles[candles.length - 1].time
      chart?.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp })
      if (chart) {
        revealLatestCandle(chart, series)
      }
    }
  }, [candles, chartGeneration])

  // The indexer's latest candle trails the chain, so the current candle follows the pool's own live price.
  useEffect(() => {
    const series = seriesRef.current
    if (!series || !candles || candles.length === 0 || livePrice === undefined || !(livePrice > 0)) {
      return
    }
    const live = nextLiveCandle({
      fetchedLast: candles[candles.length - 1],
      previousLive: liveCandleRef.current,
      livePrice,
      nowSeconds: Date.now() / 1000,
      candleSeconds,
    })
    liveCandleRef.current = live
    const chart = chartRef.current
    const following = chart !== null && isFollowingLatestCandle(chart, series)
    series.update({ ...live, time: live.time as UTCTimestamp })
    if (chart && following) {
      revealLatestCandle(chart, series)
    }
  }, [livePrice, candles, candleSeconds, chartGeneration])

  useEffect(() => {
    // Faint: background context for the candles and ranges, not a series of its own.
    depthRef.current?.setData({ segments: liquiditySegments, color: opacify(12, colors.neutral1.val) })
  }, [liquiditySegments, colors, chartGeneration])

  useEffect(() => {
    const rectangle = rectangleRef.current
    if (!rectangle) {
      return
    }
    // Subtle grey for the other positions; one the price is outside of keeps only its outline.
    const ranges: PositionRange[] = poolPositions.map((position) => ({
      startTime: position.startTime,
      priceLower: position.priceLower,
      priceUpper: position.priceUpper,
      fillColor: position.inRange ? opacify(5, colors.neutral2.val) : 'transparent',
      borderColor: opacify(position.inRange ? 30 : 15, colors.neutral2.val),
      hoverBorderColor: opacify(60, colors.neutral1.val),
      highlighted: position.key === highlightedKey,
      selectKey: position.key,
    }))
    if (startTime !== undefined && priceLower !== undefined && priceUpper !== undefined) {
      const color = inRange ? colors.statusSuccess.val : colors.statusCritical.val
      ranges.push({
        startTime,
        priceLower,
        priceUpper,
        fillColor: opacify(6, color),
        borderColor: opacify(60, color),
        hoverBorderColor: color,
        highlighted: positionKey !== undefined && positionKey === highlightedKey,
      })
    }
    rectangle.setData({ ranges, candleTimes: candles?.map((candle) => candle.time) ?? [], onSelect: onSelectPosition })
  }, [
    candles,
    startTime,
    priceLower,
    priceUpper,
    inRange,
    poolPositions,
    positionKey,
    highlightedKey,
    onSelectPosition,
    colors,
    chartGeneration,
  ])

  // The depth at a price: the segment holding it, priced per DEPTH_QUOTE_MOVE (0.01%) move. Read at the cursor, or at the live price when the
  // cursor is off the price pane.
  const depthPrice = hoverPrice ?? livePrice
  const depthReadout = (() => {
    if (depthPrice === undefined || !depthPerPercentUsd) {
      return undefined
    }
    const segment = liquiditySegments.find(
      (s) => Math.min(s.priceFrom, s.priceTo) <= depthPrice && depthPrice < Math.max(s.priceFrom, s.priceTo),
    )
    const usd = segment ? depthPerPercentUsd(segment) : undefined
    return usd === undefined
      ? undefined
      : `Depth at ${depthPrice.toFixed(pricePrecision(depthPrice))}: ${formatCompactUsd(usd)} per ${DEPTH_QUOTE_MOVE * 100}%`
  })()

  return (
    <Flex width={width} position="relative">
      <Flex width={width} height={height} borderRadius="$rounded16" overflow="hidden" position="relative">
        <Flex ref={containerRef} width={width} height={height} />
        {depthReadout && (
          // The price pane's bottom-left corner: above the volume pane and the time axis below it.
          <Flex
            position="absolute"
            left="$spacing8"
            bottom={pricePaneBottom + 6 + (showVolume ? 0 : ATTRIBUTION_LOGO_CLEARANCE)}
            zIndex={OVERLAY_Z_INDEX}
          >
            {/* Bright while it follows the cursor, muted at rest. */}
            <Text variant="body4" color={hoverPrice === undefined ? '$neutral2' : '$neutral1'}>
              {depthReadout}
            </Text>
          </Flex>
        )}
        {/* Close the volume pane from its own corner; bring it back from the price pane's corner. */}
        <Flex
          position="absolute"
          zIndex={OVERLAY_Z_INDEX}
          {...(showVolume
            ? { left: '$spacing8', bottom: TIME_AXIS_HEIGHT + VOLUME_PANE_HEIGHT - 18 }
            : { right: PRICE_SCALE_CLEARANCE, bottom: pricePaneBottom + 6 })}
        >
          <Text
            variant="body4"
            color="$neutral3"
            cursor="pointer"
            hoverStyle={{ color: '$neutral1' }}
            onPress={() => setShowVolume(!showVolume)}
          >
            {showVolume ? 'Volume \u2715' : '+ Volume'}
          </Text>
        </Flex>
        {isError && (
          <Flex position="absolute" inset={0} centered zIndex={OVERLAY_Z_INDEX}>
            <Text variant="body3" color="$neutral2">
              Couldn’t load candles
            </Text>
          </Flex>
        )}
      </Flex>
      <ChartResizeHandle
        height={height}
        onDrag={setDragHeight}
        onDragEnd={(finalHeight) => {
          setChartHeight(finalHeight)
          setDragHeight(undefined)
        }}
      />
    </Flex>
  )
}
