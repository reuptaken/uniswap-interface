import { UniverseChainId } from '@universe/chains'

// GeckoTerminal network ids; chains not listed get no candlestick view rather than a guessed id.
const GECKOTERMINAL_NETWORKS: Partial<Record<UniverseChainId, string>> = {
  [UniverseChainId.Mainnet]: 'eth',
  [UniverseChainId.Base]: 'base',
  [UniverseChainId.ArbitrumOne]: 'arbitrum',
  [UniverseChainId.Optimism]: 'optimism',
  [UniverseChainId.Polygon]: 'polygon_pos',
  [UniverseChainId.Bnb]: 'bsc',
  [UniverseChainId.Avalanche]: 'avax',
}

const MAX_CANDLES = 1000
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
export type CandleIntervalLabel = '5m' | '15m' | '1h' | '4h' | '1d'

export interface CandleInterval {
  timeframe: 'minute' | 'hour' | 'day'
  aggregate: number
  seconds: number
  label: CandleIntervalLabel
}

/** The intervals offered in the chart, finest first; each is one GeckoTerminal serves. */
export const CANDLE_INTERVALS: readonly CandleInterval[] = [
  { timeframe: 'minute', aggregate: 5, seconds: 5 * MINUTE, label: '5m' },
  { timeframe: 'minute', aggregate: 15, seconds: 15 * MINUTE, label: '15m' },
  { timeframe: 'hour', aggregate: 1, seconds: HOUR, label: '1h' },
  { timeframe: 'hour', aggregate: 4, seconds: 4 * HOUR, label: '4h' },
  { timeframe: 'day', aggregate: 1, seconds: DAY, label: '1d' },
]

export const DEFAULT_CANDLE_INTERVAL: CandleIntervalLabel = '15m'

export function getCandleInterval(label: CandleIntervalLabel): CandleInterval {
  return CANDLE_INTERVALS.find((interval) => interval.label === label) ?? CANDLE_INTERVALS[1]
}

export interface PoolCandle {
  /** Candle open, unix seconds. */
  time: number
  open: number
  high: number
  low: number
  close: number
  volume?: number
}

function ohlcvUrl({
  chainId,
  poolAddress,
  interval,
  query,
}: {
  chainId: UniverseChainId
  poolAddress: string
  interval: CandleInterval
  query: Record<string, string>
}): string | undefined {
  const network = GECKOTERMINAL_NETWORKS[chainId]
  if (!network || !/^0x[0-9a-fA-F]{40}$/.test(poolAddress)) {
    return undefined
  }
  const params = new URLSearchParams({ aggregate: String(interval.aggregate), limit: String(MAX_CANDLES), ...query })
  return `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/${interval.timeframe}?${params.toString()}`
}

/** Candles of `pricedTokenAddress` denominated in the pool's other token. */
export function getPoolCandlesUrl({
  chainId,
  poolAddress,
  pricedTokenAddress,
  interval,
}: {
  chainId: UniverseChainId
  poolAddress: string
  pricedTokenAddress: string
  interval: CandleInterval
}): string | undefined {
  return ohlcvUrl({ chainId, poolAddress, interval, query: { currency: 'token', token: pricedTokenAddress } })
}

export function parsePoolCandles(response: unknown): PoolCandle[] {
  const list = (response as { data?: { attributes?: { ohlcv_list?: unknown } } } | undefined)?.data?.attributes
    ?.ohlcv_list
  if (!Array.isArray(list)) {
    return []
  }
  return list
    .filter((row): row is number[] => Array.isArray(row) && row.length >= 5 && row.slice(0, 5).every(Number.isFinite))
    .map(([time, open, high, low, close, volume]) => ({
      time,
      open,
      high,
      low,
      close,
      ...(Number.isFinite(volume) ? { volume } : {}),
    }))
    .sort((a, b) => a.time - b.time)
}

export async function fetchPoolCandles(url: string): Promise<PoolCandle[]> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`GeckoTerminal candles: HTTP ${response.status}`)
  }
  return parsePoolCandles(await response.json())
}

/** Enough decimals to show a few significant digits for prices far below 1 (e.g. USDC priced in WETH). */
export function pricePrecision(price: number): number {
  if (!(price > 0)) {
    return 2
  }
  return Math.min(10, Math.max(2, Math.ceil(-Math.log10(price)) + 4))
}

/**
 * The current candle with the pool's live price applied. It continues the fetched last candle (or a live one
 * started after it) and opens a new candle once the interval rolls over.
 */
export function nextLiveCandle({
  fetchedLast,
  previousLive,
  livePrice,
  nowSeconds,
  candleSeconds,
}: {
  fetchedLast: PoolCandle
  previousLive: PoolCandle | null
  livePrice: number
  nowSeconds: number
  candleSeconds: number
}): PoolCandle {
  // A refetch can return the candle we were already extending; keep the extremes seen by either source.
  const sameCandle = previousLive?.time === fetchedLast.time
  const current: PoolCandle =
    previousLive && previousLive.time > fetchedLast.time
      ? previousLive
      : sameCandle
        ? {
            ...fetchedLast,
            high: Math.max(fetchedLast.high, previousLive.high),
            low: Math.min(fetchedLast.low, previousLive.low),
          }
        : fetchedLast

  const bucket = Math.floor(nowSeconds / candleSeconds) * candleSeconds
  if (bucket > current.time) {
    return {
      time: bucket,
      open: current.close,
      high: Math.max(current.close, livePrice),
      low: Math.min(current.close, livePrice),
      close: livePrice,
    }
  }
  return {
    ...current,
    high: Math.max(current.high, livePrice),
    low: Math.min(current.low, livePrice),
    close: livePrice,
  }
}
