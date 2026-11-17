import { useQuery } from '@tanstack/react-query'
import { Flex, Text } from '@universe/mycelium'
import { opacify, useSporeColors } from '@universe/mycelium/theme-hooks-compat'
import { CandlestickSeries, ColorType, createChart, HistogramSeries } from 'lightweight-charts'
import type { AutoscaleInfo, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import {
  fetchPoolCandles,
  nextLiveCandle,
  type PoolCandle,
  pricePrecision,
} from '~/features/Liquidity/charts/PositionCandlestickChart/poolCandles'
import { PositionRangeRectangle } from '~/features/Liquidity/charts/PositionCandlestickChart/PositionRangeRectangle'

const CANDLES_REFETCH_MS = 60_000
const INITIAL_VISIBLE_CANDLES = 125
const VOLUME_PANE_INDEX = 1
const VOLUME_PANE_HEIGHT = 96

interface PositionCandlestickChartProps {
  candlesUrl: string
  candleSeconds: number
  width: number
  height: number
  /** Position start, unix seconds. */
  startTime: number | undefined
  priceLower: number | undefined
  priceUpper: number | undefined
  inRange: boolean
  /** Live price read from the pool, in the candles' orientation; it drives the current candle. */
  livePrice: number | undefined
}

export function PositionCandlestickChart({
  candlesUrl,
  candleSeconds,
  width,
  height,
  startTime,
  priceLower,
  priceUpper,
  inRange,
  livePrice,
}: PositionCandlestickChartProps): JSX.Element {
  const colors = useSporeColors()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const rectangleRef = useRef<PositionRangeRectangle | null>(null)
  const rangeRef = useRef<{ lower?: number; upper?: number }>({})
  const hasFramedRef = useRef(false)
  const liveCandleRef = useRef<PoolCandle | null>(null)

  const { data: candles, isError } = useQuery({
    queryKey: ['poolCandles', candlesUrl],
    queryFn: () => fetchPoolCandles(candlesUrl),
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
      width,
      height,
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
    // Volume gets its own pane and price scale below the candles; the panes share the time scale, so they stay in sync.
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: 'volume' }, lastValueVisible: true, priceLineVisible: false },
      VOLUME_PANE_INDEX,
    )
    chart.panes()[VOLUME_PANE_INDEX]?.setHeight(VOLUME_PANE_HEIGHT)
    const rectangle = new PositionRangeRectangle()
    series.attachPrimitive(rectangle)
    chartRef.current = chart
    hasFramedRef.current = false
    seriesRef.current = series
    volumeSeriesRef.current = volumeSeries
    rectangleRef.current = rectangle
    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      volumeSeriesRef.current = null
      rectangleRef.current = null
    }
  }, [colors, width, height])

  useEffect(() => {
    const volumeSeries = volumeSeriesRef.current
    if (!volumeSeries || !candles) {
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
  }, [candles, colors])

  // A different interval or price direction is a different series: frame it afresh.
  useEffect(() => {
    hasFramedRef.current = false
    liveCandleRef.current = null
    // Drop the previous interval's bars so they don't share the time scale with the new candles.
    seriesRef.current?.setData([])
    volumeSeriesRef.current?.setData([])
  }, [candlesUrl])

  useEffect(() => {
    const series = seriesRef.current
    if (!series || !candles || candles.length === 0) {
      return
    }
    const precision = pricePrecision(candles[candles.length - 1].close)
    series.applyOptions({ priceFormat: { type: 'price', precision, minMove: 10 ** -precision } })
    series.setData(candles.map((candle: PoolCandle) => ({ ...candle, time: candle.time as UTCTimestamp })))

    // Open on the same number of candles whatever the interval, once per series; after that the user owns zoom and scroll.
    if (!hasFramedRef.current) {
      hasFramedRef.current = true
      // By time, not bar index: the volume series can briefly hold another interval's bars on the shared time scale.
      const from = candles[Math.max(0, candles.length - INITIAL_VISIBLE_CANDLES)].time
      const to = candles[candles.length - 1].time
      chartRef.current?.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp })
    }
  }, [candles])

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
    series.update({ ...live, time: live.time as UTCTimestamp })
    rectangleRef.current?.extendTo(live.time)
  }, [livePrice, candles, candleSeconds])

  useEffect(() => {
    const rectangle = rectangleRef.current
    if (!rectangle) {
      return
    }
    const color = inRange ? colors.statusSuccess.val : colors.statusCritical.val
    rectangle.setData({
      range:
        startTime !== undefined && priceLower !== undefined && priceUpper !== undefined
          ? { startTime, priceLower, priceUpper, fillColor: opacify(6, color), borderColor: opacify(60, color) }
          : undefined,
      candleTimes: candles?.map((candle) => candle.time) ?? [],
    })
  }, [candles, startTime, priceLower, priceUpper, inRange, colors])

  return (
    <Flex width={width} height={height} borderRadius="$rounded16" overflow="hidden" position="relative">
      <Flex ref={containerRef} width={width} height={height} />
      {isError && (
        <Flex position="absolute" inset={0} centered>
          <Text variant="body3" color="$neutral2">
            Couldn’t load candles
          </Text>
        </Flex>
      )}
    </Flex>
  )
}
