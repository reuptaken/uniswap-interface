import { UniverseChainId } from '@universe/chains'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_CANDLE_INTERVAL,
  fetchPoolCandles,
  getCandleInterval,
  getPoolCandlesSource,
  groupCandles,
  mergeCandles,
  nextLiveCandle,
  parseDexPaprikaCandles,
  parsePoolCandles,
  pricePrecision,
} from '~/features/Liquidity/charts/PositionCandlestickChart/poolCandles'

const POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224'
const WETH = '0x4200000000000000000000000000000000000006'
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const CBBTC = '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf'

function source(overrides: Partial<Parameters<typeof getPoolCandlesSource>[0]> = {}) {
  return getPoolCandlesSource({
    chainId: UniverseChainId.Base,
    poolAddress: POOL,
    token0Address: WETH,
    token1Address: USDC,
    pricedTokenAddress: WETH,
    stablecoinAddress: USDC,
    interval: getCandleInterval('15m'),
    ...overrides,
  })
}

describe('getPoolCandlesSource', () => {
  it('asks GeckoTerminal for 15-minute candles priced in the given token', () => {
    expect(source()?.geckoUrl).toBe(
      `https://api.geckoterminal.com/api/v2/networks/base/pools/${POOL}/ohlcv/minute?aggregate=15&limit=1000&currency=token&token=${WETH}`,
    )
  })

  it('takes recent candles from DexPaprika for a pair with a stablecoin, inverted when pricing the stablecoin', () => {
    expect(source()?.recent).toEqual({
      network: 'base',
      poolAddress: POOL.toLowerCase(),
      volatileTokenAddress: WETH.toLowerCase(),
      invert: false,
    })
    expect(source({ pricedTokenAddress: USDC })?.recent?.invert).toBe(true)
  })

  it('keeps a pair without a stablecoin on GeckoTerminal alone', () => {
    expect(source({ token1Address: CBBTC, stablecoinAddress: undefined })?.recent).toBeUndefined()
  })

  it('changes its key with the series', () => {
    expect(source()?.key).not.toBe(source({ pricedTokenAddress: USDC })?.key)
    expect(source()?.key).not.toBe(source({ interval: getCandleInterval('1h') })?.key)
    // 1h and 6h are both built from GeckoTerminal's hourly series, so the URL alone doesn't tell them apart.
    expect(source({ interval: getCandleInterval('1h') })?.key).not.toBe(
      source({ interval: getCandleInterval('6h') })?.key,
    )
  })

  it('is unavailable for unsupported chains and V4 pool ids', () => {
    expect(source({ chainId: UniverseChainId.Zora })).toBeUndefined()
    expect(source({ poolAddress: `0x${'ab'.repeat(32)}` })).toBeUndefined()
  })
})

describe('getCandleInterval', () => {
  it('offers 10m to 1d, each native on DexPaprika, with the GeckoTerminal series to build it from', () => {
    const intervals = (['10m', '15m', '1h', '6h', '1d'] as const).map(getCandleInterval)
    expect(intervals.map((interval) => interval.dexPaprika)).toEqual(['10m', '15m', '1h', '6h', '24h'])
    expect(intervals.map(({ gecko }) => `${gecko.timeframe}:${gecko.aggregate}`)).toEqual([
      'minute:5',
      'minute:15',
      'hour:1',
      'hour:1',
      'day:1',
    ])
  })

  it('defaults to 15 minutes', () => {
    expect(getCandleInterval(DEFAULT_CANDLE_INTERVAL).seconds).toBe(900)
  })
})

describe('groupCandles', () => {
  it('builds epoch-aligned coarser candles from finer ones', () => {
    const hour = 3600
    const hourly = [0, 1, 2, 3, 4, 5, 6].map((i) => ({
      time: i * hour,
      open: 10 + i,
      high: 20 + i,
      low: 5 - i,
      close: 11 + i,
      volume: 1,
    }))
    expect(groupCandles(hourly, 6 * hour)).toEqual([
      { time: 0, open: 10, high: 25, low: 0, close: 16, volume: 6 },
      { time: 6 * hour, open: 16, high: 26, low: -1, close: 17, volume: 1 },
    ])
  })
})

describe('parseDexPaprikaCandles', () => {
  const row = { time_open: '2026-11-18T08:45:00Z', open: 2000, high: 2500, low: 1600, close: 2000, volume: 4000 }

  it('reads USD candles of the volatile token as its price in the stablecoin', () => {
    expect(parseDexPaprikaCandles([row], false)).toEqual([
      { time: Date.parse('2026-11-18T08:45:00Z') / 1000, open: 2000, high: 2500, low: 1600, close: 2000, volume: 4000 },
    ])
  })

  it('inverts them to price the stablecoin, swapping high and low and converting volume to the volatile token', () => {
    const [candle] = parseDexPaprikaCandles([row], true)
    expect(candle.open).toBeCloseTo(1 / 2000)
    expect(candle.high).toBeCloseTo(1 / 1600)
    expect(candle.low).toBeCloseTo(1 / 2500)
    // $4,000 at a typical price of (2000 + 2500 + 1600 + 2000) / 4 = 2025.
    expect(candle.volume).toBeCloseTo(4000 / 2025)
  })

  it('drops malformed rows and tolerates unexpected shapes', () => {
    expect(
      parseDexPaprikaCandles(
        [
          { ...row, time_open: undefined },
          { ...row, high: 'x' },
        ],
        false,
      ),
    ).toEqual([])
    expect(parseDexPaprikaCandles({ message: 'Forbidden' }, false)).toEqual([])
  })
})

describe('mergeCandles', () => {
  const candle = (time: number, close: number) => ({ time, open: close, high: close, low: close, close })

  it('keeps older candles up to where the recent series starts', () => {
    expect(mergeCandles([candle(1, 1), candle(2, 2), candle(3, 3)], [candle(2, 20), candle(3, 30)])).toEqual([
      candle(1, 1),
      candle(2, 20),
      candle(3, 30),
    ])
  })

  it('keeps the older series when there is no recent one', () => {
    expect(mergeCandles([candle(1, 1)], [])).toEqual([candle(1, 1)])
  })
})

describe('fetchPoolCandles', () => {
  const geckoResponse = { data: { attributes: { ohlcv_list: [[1800, 1, 2, 0.5, 1.5, 10]] } } }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('falls back to GeckoTerminal alone when DexPaprika is unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) =>
        url.startsWith('https://api.geckoterminal.com')
          ? new Response(JSON.stringify(geckoResponse))
          : new Response('not found', { status: 404 }),
      ),
    )
    const candles = await fetchPoolCandles(source()!)
    expect(candles).toEqual([{ time: 1800, open: 1, high: 2, low: 0.5, close: 1.5, volume: 10 }])
  })
})

describe('parsePoolCandles', () => {
  it('turns newest-first rows into oldest-first candles', () => {
    const response = {
      data: {
        attributes: {
          ohlcv_list: [
            [2000, 2, 3, 1, 2.5, 10],
            [1000, 1, 2, 0.5, 2, 5],
          ],
        },
      },
    }
    expect(parsePoolCandles(response)).toEqual([
      { time: 1000, open: 1, high: 2, low: 0.5, close: 2, volume: 5 },
      { time: 2000, open: 2, high: 3, low: 1, close: 2.5, volume: 10 },
    ])
  })

  it('drops malformed rows and tolerates unexpected shapes', () => {
    expect(parsePoolCandles({ data: { attributes: { ohlcv_list: [[1, 'x', 2, 3, 4], [5]] } } })).toEqual([])
    expect(parsePoolCandles(undefined)).toEqual([])
  })
})

describe('pricePrecision', () => {
  it('keeps two decimals for ordinary prices and more for tiny ones', () => {
    expect(pricePrecision(1823.65)).toBe(2)
    expect(pricePrecision(0.00055)).toBe(8)
  })
})

describe('nextLiveCandle', () => {
  const fetchedLast = { time: 900, open: 10, high: 12, low: 9, close: 11 }

  it('moves the current candle to the live price, widening its range', () => {
    expect(
      nextLiveCandle({ fetchedLast, previousLive: null, livePrice: 13, nowSeconds: 1000, candleSeconds: 900 }),
    ).toEqual({
      time: 900,
      open: 10,
      high: 13,
      low: 9,
      close: 13,
    })
  })

  it('opens a new candle from the last close once the interval rolls over', () => {
    expect(
      nextLiveCandle({ fetchedLast, previousLive: null, livePrice: 10.5, nowSeconds: 1800, candleSeconds: 900 }),
    ).toEqual({
      time: 1800,
      open: 11,
      high: 11,
      low: 10.5,
      close: 10.5,
    })
  })

  it('keeps extending a live candle that the fetched data has not reached yet', () => {
    const previousLive = { time: 1800, open: 11, high: 11.5, low: 10.5, close: 11 }
    expect(
      nextLiveCandle({ fetchedLast, previousLive, livePrice: 11.2, nowSeconds: 1900, candleSeconds: 900 }),
    ).toEqual({
      time: 1800,
      open: 11,
      high: 11.5,
      low: 10.5,
      close: 11.2,
    })
  })

  it('merges a refetched candle with the extremes the live price already reached', () => {
    const previousLive = { time: 900, open: 10, high: 14, low: 9, close: 13 }
    expect(
      nextLiveCandle({ fetchedLast, previousLive, livePrice: 12.5, nowSeconds: 1000, candleSeconds: 900 }),
    ).toEqual({
      time: 900,
      open: 10,
      high: 14,
      low: 9,
      close: 12.5,
    })
  })
})
