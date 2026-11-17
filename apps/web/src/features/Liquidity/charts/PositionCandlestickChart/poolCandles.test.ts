import { UniverseChainId } from '@universe/chains'
import { describe, expect, it } from 'vitest'
import {
  getPoolCandlesUrl,
  nextLiveCandle,
  parsePoolCandles,
  DEFAULT_CANDLE_INTERVAL,
  getCandleInterval,
  pricePrecision,
} from '~/features/Liquidity/charts/PositionCandlestickChart/poolCandles'

const POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224'
const WETH = '0x4200000000000000000000000000000000000006'
const FIFTEEN_MINUTES = { timeframe: 'minute', aggregate: 15, seconds: 900, label: '15m' } as const

describe('getPoolCandlesUrl', () => {
  it('asks for 15-minute candles priced in the given token', () => {
    expect(
      getPoolCandlesUrl({
        chainId: UniverseChainId.Base,
        poolAddress: POOL,
        pricedTokenAddress: WETH,
        interval: FIFTEEN_MINUTES,
      }),
    ).toBe(
      `https://api.geckoterminal.com/api/v2/networks/base/pools/${POOL}/ohlcv/minute?aggregate=15&limit=1000&currency=token&token=${WETH}`,
    )
  })

  it('uses GeckoTerminal network ids', () => {
    expect(
      getPoolCandlesUrl({
        chainId: UniverseChainId.Mainnet,
        poolAddress: POOL,
        pricedTokenAddress: WETH,
        interval: FIFTEEN_MINUTES,
      }),
    ).toContain('/networks/eth/')
  })

  it('is unavailable for unsupported chains and V4 pool ids', () => {
    expect(
      getPoolCandlesUrl({
        chainId: UniverseChainId.Zora,
        poolAddress: POOL,
        pricedTokenAddress: WETH,
        interval: FIFTEEN_MINUTES,
      }),
    ).toBeUndefined()
    expect(
      getPoolCandlesUrl({
        chainId: UniverseChainId.Base,
        poolAddress: `0x${'ab'.repeat(32)}`,
        pricedTokenAddress: WETH,
        interval: FIFTEEN_MINUTES,
      }),
    ).toBeUndefined()
  })
})

describe('getCandleInterval', () => {
  it('offers 5m to 1d and maps each to the GeckoTerminal timeframe', () => {
    const urls = (['5m', '15m', '1h', '4h', '1d'] as const).map((label) =>
      getPoolCandlesUrl({
        chainId: UniverseChainId.Base,
        poolAddress: POOL,
        pricedTokenAddress: WETH,
        interval: getCandleInterval(label),
      }),
    )
    expect(
      urls.map((url) =>
        url
          ?.match(/ohlcv\/(\w+)\?aggregate=(\d+)/)
          ?.slice(1)
          .join(':'),
      ),
    ).toEqual(['minute:5', 'minute:15', 'hour:1', 'hour:4', 'day:1'])
  })

  it('defaults to 15 minutes', () => {
    expect(getCandleInterval(DEFAULT_CANDLE_INTERVAL).seconds).toBe(900)
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
