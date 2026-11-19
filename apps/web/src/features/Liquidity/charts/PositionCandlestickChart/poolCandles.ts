import { AddressStringFormat, normalizeAddress, UniverseChainId } from '@universe/chains'

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

// DexPaprika network ids, for the same chains.
const DEXPAPRIKA_NETWORKS: Partial<Record<UniverseChainId, string>> = {
  [UniverseChainId.Mainnet]: 'ethereum',
  [UniverseChainId.Base]: 'base',
  [UniverseChainId.ArbitrumOne]: 'arbitrum',
  [UniverseChainId.Optimism]: 'optimism',
  [UniverseChainId.Polygon]: 'polygon',
  [UniverseChainId.Bnb]: 'bsc',
  [UniverseChainId.Avalanche]: 'avalanche',
}

// Dev-server route to DexPaprika that adds the API key (see vite.config.mts); absent without a key.
const DEXPAPRIKA_PROXY = '/dexpaprika'
// What DexPaprika serves on a free key: the last 7 days. A start right at the edge is past it by the time the request
// lands, and is refused outright (403), so ask for an hour less.
const RECENT_WINDOW_SECONDS = 7 * 24 * 60 * 60 - 60 * 60

const lowercase = (address: string): string => normalizeAddress(address, AddressStringFormat.Lowercase)

const MAX_CANDLES = 1000
const MINUTE = 60
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
export type CandleIntervalLabel = '10m' | '15m' | '1h' | '6h' | '1d'

export interface CandleInterval {
  label: CandleIntervalLabel
  seconds: number
  /** GeckoTerminal's nearest series; coarser candles are built from it when `seconds` exceeds its own. */
  gecko: { timeframe: 'minute' | 'hour' | 'day'; aggregate: number; seconds: number }
  /** DexPaprika's interval parameter. */
  dexPaprika: string
}

/** The intervals offered in the chart, finest first; each is native on DexPaprika. */
export const CANDLE_INTERVALS: readonly CandleInterval[] = [
  {
    label: '10m',
    seconds: 10 * MINUTE,
    gecko: { timeframe: 'minute', aggregate: 5, seconds: 5 * MINUTE },
    dexPaprika: '10m',
  },
  {
    label: '15m',
    seconds: 15 * MINUTE,
    gecko: { timeframe: 'minute', aggregate: 15, seconds: 15 * MINUTE },
    dexPaprika: '15m',
  },
  { label: '1h', seconds: HOUR, gecko: { timeframe: 'hour', aggregate: 1, seconds: HOUR }, dexPaprika: '1h' },
  { label: '6h', seconds: 6 * HOUR, gecko: { timeframe: 'hour', aggregate: 1, seconds: HOUR }, dexPaprika: '6h' },
  { label: '1d', seconds: DAY, gecko: { timeframe: 'day', aggregate: 1, seconds: DAY }, dexPaprika: '24h' },
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

/**
 * Where a pool's candles come from. GeckoTerminal serves long history, but its wicks include dust trades, whose
 * integer rounding prices them up to ~1% off. For a pair with a stablecoin, the recent part instead comes from
 * DexPaprika, which leaves dust out; it prices in USD, so a stablecoin quote is needed to read it as the pool's price.
 */
export interface PoolCandlesSource {
  /** Changes whenever the series does (pool, priced token or interval). */
  key: string
  interval: CandleInterval
  geckoUrl: string
  recent?: {
    network: string
    poolAddress: string
    /** The pair's non-stablecoin token, whose USD price DexPaprika serves. */
    volatileTokenAddress: string
    /** The chart prices the stablecoin, so the volatile token's USD candles are inverted. */
    invert: boolean
  }
}

/** Candles of `pricedTokenAddress` denominated in the pool's other token. */
export function getPoolCandlesSource({
  chainId,
  poolAddress,
  token0Address,
  token1Address,
  pricedTokenAddress,
  stablecoinAddress,
  interval,
}: {
  chainId: UniverseChainId
  poolAddress: string
  token0Address: string
  token1Address: string
  pricedTokenAddress: string
  /** The pair's stablecoin, if it has one. */
  stablecoinAddress?: string
  interval: CandleInterval
}): PoolCandlesSource | undefined {
  const network = GECKOTERMINAL_NETWORKS[chainId]
  if (!network || !/^0x[0-9a-fA-F]{40}$/.test(poolAddress)) {
    return undefined
  }
  const params = new URLSearchParams({
    aggregate: String(interval.gecko.aggregate),
    limit: String(MAX_CANDLES),
    currency: 'token',
    token: pricedTokenAddress,
  })
  const geckoUrl = `https://api.geckoterminal.com/api/v2/networks/${network}/pools/${poolAddress}/ohlcv/${interval.gecko.timeframe}?${params.toString()}`

  const dexPaprikaNetwork = DEXPAPRIKA_NETWORKS[chainId]
  const isStable = (address: string): boolean =>
    stablecoinAddress !== undefined && lowercase(address) === lowercase(stablecoinAddress)
  const volatileTokenAddress = isStable(token0Address)
    ? token1Address
    : isStable(token1Address)
      ? token0Address
      : undefined
  const recent =
    dexPaprikaNetwork && volatileTokenAddress
      ? {
          network: dexPaprikaNetwork,
          poolAddress: lowercase(poolAddress),
          volatileTokenAddress: lowercase(volatileTokenAddress),
          invert: isStable(pricedTokenAddress),
        }
      : undefined

  return {
    key: `${interval.label}|${geckoUrl}|${recent ? `${recent.volatileTokenAddress}:${recent.invert}` : 'gecko'}`,
    interval,
    geckoUrl,
    recent,
  }
}

/** Coarser candles from finer ones, in buckets aligned to the unix epoch (as both providers align theirs). */
export function groupCandles(candles: readonly PoolCandle[], seconds: number): PoolCandle[] {
  const grouped: PoolCandle[] = []
  for (const candle of candles) {
    const time = Math.floor(candle.time / seconds) * seconds
    const last = grouped[grouped.length - 1] as PoolCandle | undefined
    if (last?.time === time) {
      last.high = Math.max(last.high, candle.high)
      last.low = Math.min(last.low, candle.low)
      last.close = candle.close
      if (candle.volume !== undefined) {
        last.volume = (last.volume ?? 0) + candle.volume
      }
    } else {
      grouped.push({ ...candle, time })
    }
  }
  return grouped
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

/**
 * DexPaprika's USD candles of the volatile token, as the chart's price: as-is when the chart prices that token in
 * the stablecoin, inverted when it prices the stablecoin in it. USD volume is converted to the chart's quote token
 * the same way, so it lines up with GeckoTerminal's volume (which is in the quote token).
 */
export function parseDexPaprikaCandles(response: unknown, invert: boolean): PoolCandle[] {
  if (!Array.isArray(response)) {
    return []
  }
  return response
    .map(
      (row: {
        time_open?: unknown
        open?: unknown
        high?: unknown
        low?: unknown
        close?: unknown
        volume?: unknown
      }) => ({
        time: typeof row.time_open === 'string' ? Date.parse(row.time_open) / 1000 : NaN,
        open: Number(row.open),
        high: Number(row.high),
        low: Number(row.low),
        close: Number(row.close),
        volume: Number(row.volume),
      }),
    )
    .filter((c) => [c.time, c.open, c.high, c.low, c.close].every((value) => Number.isFinite(value) && value > 0))
    .map(({ volume, ...c }) => {
      const usdVolume = Number.isFinite(volume) ? volume : undefined
      if (!invert) {
        return { ...c, ...(usdVolume !== undefined ? { volume: usdVolume } : {}) }
      }
      const typicalUsd = (c.open + c.high + c.low + c.close) / 4
      return {
        time: c.time,
        open: 1 / c.open,
        high: 1 / c.low,
        low: 1 / c.high,
        close: 1 / c.close,
        ...(usdVolume !== undefined ? { volume: usdVolume / typicalUsd } : {}),
      }
    })
    .sort((a, b) => a.time - b.time)
}

/** Older candles from one series, then the recent series from its first candle on. */
export function mergeCandles(older: readonly PoolCandle[], recent: readonly PoolCandle[]): PoolCandle[] {
  if (recent.length === 0) {
    return [...older]
  }
  const recentStart = recent[0].time
  return [...older.filter((candle) => candle.time < recentStart), ...recent]
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    throw new Error(`${url}: HTTP ${response.status}`)
  }
  return response.json()
}

async function fetchGeckoCandles(source: PoolCandlesSource): Promise<PoolCandle[]> {
  const candles = parsePoolCandles(await fetchJson(source.geckoUrl))
  return source.interval.gecko.seconds < source.interval.seconds
    ? groupCandles(candles, source.interval.seconds)
    : candles
}

// Which pool token DexPaprika's default (non-inversed) series prices; fixed per pool, so asked once.
const dexPaprikaBaseTokens = new Map<string, Promise<string>>()

function dexPaprikaBaseToken(recent: NonNullable<PoolCandlesSource['recent']>): Promise<string> {
  const poolUrl = `${DEXPAPRIKA_PROXY}/networks/${recent.network}/pools/${recent.poolAddress}`
  let baseToken = dexPaprikaBaseTokens.get(poolUrl)
  if (!baseToken) {
    baseToken = fetchJson(poolUrl).then((pool) => {
      const id = (pool as { base_token_id?: unknown }).base_token_id
      if (typeof id !== 'string') {
        throw new Error('DexPaprika pool has no base token')
      }
      return lowercase(id)
    })
    // A failure (e.g. no proxy) is retried on the next fetch rather than remembered.
    baseToken.catch(() => dexPaprikaBaseTokens.delete(poolUrl))
    dexPaprikaBaseTokens.set(poolUrl, baseToken)
  }
  return baseToken
}

async function fetchDexPaprikaCandles(source: PoolCandlesSource, nowSeconds: number): Promise<PoolCandle[]> {
  const { recent, interval } = source
  if (!recent) {
    return []
  }
  const baseToken = await dexPaprikaBaseToken(recent)
  const start = nowSeconds - Math.min(RECENT_WINDOW_SECONDS, (MAX_CANDLES - 1) * interval.seconds)
  const params = new URLSearchParams({
    start: String(Math.ceil(start)),
    interval: interval.dexPaprika,
    limit: String(MAX_CANDLES),
    // The default series prices the pool's base token in USD; `inversed` switches to the other token.
    inversed: String(baseToken !== recent.volatileTokenAddress),
  })
  const url = `${DEXPAPRIKA_PROXY}/networks/${recent.network}/pools/${recent.poolAddress}/ohlcv?${params.toString()}`
  return parseDexPaprikaCandles(await fetchJson(url), recent.invert)
}

/**
 * GeckoTerminal for history, DexPaprika (when available) for the recent part. Either alone is enough: without
 * DexPaprika (no key, unsupported pair, outage) the chart keeps GeckoTerminal's candles, dust wicks included.
 */
export async function fetchPoolCandles(source: PoolCandlesSource): Promise<PoolCandle[]> {
  const [gecko, dexPaprika] = await Promise.allSettled([
    fetchGeckoCandles(source),
    fetchDexPaprikaCandles(source, Date.now() / 1000),
  ])
  const recent = dexPaprika.status === 'fulfilled' ? dexPaprika.value : []
  if (gecko.status === 'rejected') {
    if (recent.length === 0) {
      throw gecko.reason
    }
    return recent
  }
  return mergeCandles(gecko.value, recent)
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
