import { describe, expect, it } from 'vitest'
import {
  appendSwaps,
  baseAmountPerPriceMove,
  estimatePositionFee,
  lpShareOfFee,
  estimateTimestamp,
  latestSwaps,
  MAX_KEPT_SWAPS,
  type PoolSwapsState,
  priceFromSqrtPriceX96,
  priceMoveBetween,
  type SwapLog,
} from '~/features/Liquidity/PoolSwaps/poolSwaps'

const Q96 = 2n ** 96n
// A sqrtPriceX96 for a raw token1/token0 price, e.g. 1800e-12 for WETH (18 decimals) at 1,800 USDC (6 decimals).
const sqrtPriceX96 = (rawPrice: number): bigint => BigInt(Math.round(Math.sqrt(rawPrice) * Number(Q96)))

const emptyState: PoolSwapsState = {
  swaps: [],
  lastBlock: { number: 100, timestamp: 1000 },
  secondsPerBlock: 2,
}

function log(blockNumber: number, logIndex: number, rawPrice: number): SwapLog {
  return {
    blockNumber,
    logIndex,
    txHash: `0x${blockNumber.toString(16)}${logIndex}`,
    amount0: -(10n ** 18n),
    amount1: 1800n * 10n ** 6n,
    sqrtPriceX96: sqrtPriceX96(rawPrice),
  }
}

describe('priceFromSqrtPriceX96', () => {
  it('prices token0 in token1, in whole tokens', () => {
    expect(priceFromSqrtPriceX96({ sqrtPriceX96: sqrtPriceX96(1800e-12), decimals0: 18, decimals1: 6 })).toBeCloseTo(
      1800,
      6,
    )
  })
})

describe('priceMoveBetween', () => {
  it('measures the relative price change, whichever way the price moved', () => {
    expect(priceMoveBetween(sqrtPriceX96(1800e-12), sqrtPriceX96(1803.6e-12))).toBeCloseTo(0.002, 9)
    expect(priceMoveBetween(sqrtPriceX96(1800e-12), sqrtPriceX96(1798.2e-12))).toBeCloseTo(0.001, 9)
  })
})

describe('estimateTimestamp', () => {
  it('places a block between two known ones', () => {
    expect(
      estimateTimestamp({
        blockNumber: 150,
        from: { number: 100, timestamp: 1000 },
        to: { number: 200, timestamp: 1200 },
      }),
    ).toBe(1100)
  })
})

describe('appendSwaps', () => {
  it('adds swaps in chain order, each with the price move since the swap before', () => {
    const state = appendSwaps({
      state: emptyState,
      scannedTo: { number: 110, timestamp: 1020 },
      logs: [log(105, 1, 1801.8e-12), log(102, 0, 1800e-12)],
    })

    expect(state.swaps.map((swap) => swap.blockNumber)).toEqual([102, 105])
    // The first swap seen has nothing to compare with.
    expect(state.swaps[0].priceMove).toBeUndefined()
    expect(state.swaps[1].priceMove).toBeCloseTo(0.001, 9)
    expect(state.swaps.map((swap) => swap.timestamp)).toEqual([1004, 1010])
    expect(state.lastBlock).toEqual({ number: 110, timestamp: 1020 })
  })

  it('carries the last price across reads, so the next read’s first swap still gets its move', () => {
    const first = appendSwaps({
      state: emptyState,
      scannedTo: { number: 110, timestamp: 1020 },
      logs: [log(102, 0, 1800e-12)],
    })
    const second = appendSwaps({
      state: first,
      scannedTo: { number: 120, timestamp: 1040 },
      logs: [log(115, 0, 1803.6e-12)],
    })

    expect(second.swaps).toHaveLength(2)
    expect(second.swaps[1].priceMove).toBeCloseTo(0.002, 9)
  })

  it('keeps no more than MAX_KEPT_SWAPS', () => {
    const many = Array.from({ length: MAX_KEPT_SWAPS + 5 }, (_, i) => log(101 + i, 0, 1800e-12))
    const state = appendSwaps({ state: emptyState, scannedTo: { number: 2000, timestamp: 4000 }, logs: many })

    expect(state.swaps).toHaveLength(MAX_KEPT_SWAPS)
    expect(state.swaps[state.swaps.length - 1].blockNumber).toBe(101 + MAX_KEPT_SWAPS + 4)
  })
})

describe('latestSwaps', () => {
  const state = appendSwaps({
    state: emptyState,
    scannedTo: { number: 200, timestamp: 1200 },
    logs: [
      log(101, 0, 1800e-12),
      log(102, 0, 1800.9e-12), // +0.05%
      log(103, 0, 1803.6e-12), // +0.15%
      log(104, 0, 1801.8e-12), // −0.1% exactly: not more than 0.1%
    ],
  })

  it('lists the newest first, up to the count', () => {
    expect(latestSwaps({ swaps: state.swaps, count: 2 }).map((swap) => swap.blockNumber)).toEqual([104, 103])
  })

  it('keeps only swaps that moved the price by more than the threshold', () => {
    expect(latestSwaps({ swaps: state.swaps, count: 25, minPriceMove: 0.001 }).map((swap) => swap.blockNumber)).toEqual(
      [103],
    )
  })
})

describe('baseAmountPerPriceMove', () => {
  const swap = (wethRaw: bigint, priceMove: number | undefined) => ({
    id: `${wethRaw}:${priceMove}`,
    blockNumber: 1,
    logIndex: 0,
    timestamp: 0,
    txHash: '0x1',
    amount0: wethRaw,
    amount1: 0n,
    sqrtPriceX96: 0n,
    priceMove,
  })

  it('estimates the size per price move as the median over recent swaps', () => {
    // 1 WETH per 0.001%, i.e. 100,000 WETH per 100%; one outlier and the dust swaps don't move the median.
    const swaps = [
      swap(10n ** 18n, 0.00001),
      swap(-(2n * 10n ** 18n), 0.00002),
      swap(5n * 10n ** 18n, 0.00005),
      swap(10n ** 18n, 0.0001),
      swap(10n ** 12n, 0.0000001), // dust: its move is mostly rounding
      swap(10n ** 18n, undefined), // the first swap seen has no move
    ]
    expect(baseAmountPerPriceMove({ swaps, baseIsToken0: true, baseDecimals: 18 })).toBeCloseTo(100000)
  })

  it('has no estimate without swaps that moved the price', () => {
    expect(baseAmountPerPriceMove({ swaps: [swap(10n ** 18n, undefined)], baseIsToken0: true, baseDecimals: 18 })).toBe(
      undefined,
    )
  })
})

describe('estimatePositionFee', () => {
  const swap = (beforeRaw: number, afterRaw: number) => ({
    id: 'x',
    blockNumber: 1,
    logIndex: 0,
    timestamp: 0,
    txHash: '0x1',
    amount0: 0n,
    amount1: 0n,
    sqrtPriceX96Before: sqrtPriceX96(beforeRaw),
    sqrtPriceX96: sqrtPriceX96(afterRaw),
  })
  const range = { sqrtPriceLower: Math.sqrt(1700e-12), sqrtPriceUpper: Math.sqrt(1900e-12) }
  const liquidity = 1e15
  const feeRate = 0.0005

  it('charges token1 on a rise: liquidity × Δ√P × fee/(1−fee)', () => {
    const fee = estimatePositionFee({ swap: swap(1800e-12, 1801e-12), liquidity, ...range, feeRate })
    const expected = liquidity * (Math.sqrt(1801e-12) - Math.sqrt(1800e-12)) * (feeRate / (1 - feeRate))
    expect(fee?.amount0).toBe(0)
    expect(fee?.amount1).toBeCloseTo(expected, 3)
  })

  it('charges token0 on a fall: liquidity × Δ(1/√P) × fee/(1−fee)', () => {
    const fee = estimatePositionFee({ swap: swap(1801e-12, 1800e-12), liquidity, ...range, feeRate })
    const expected = liquidity * (1 / Math.sqrt(1800e-12) - 1 / Math.sqrt(1801e-12)) * (feeRate / (1 - feeRate))
    expect(fee?.amount1).toBe(0)
    expect(fee?.amount0).toBeCloseTo(expected, 0)
  })

  it('counts only the part of the move inside the range', () => {
    const partly = estimatePositionFee({ swap: swap(1850e-12, 1950e-12), liquidity, ...range, feeRate })
    const capped = estimatePositionFee({ swap: swap(1850e-12, 1900e-12), liquidity, ...range, feeRate })
    expect(partly?.amount1).toBeCloseTo(capped?.amount1 ?? NaN, 6)
    expect(estimatePositionFee({ swap: swap(1950e-12, 2000e-12), liquidity, ...range, feeRate })?.amount1).toBe(0)
  })

  it('has no estimate without the opening price', () => {
    expect(
      estimatePositionFee({ swap: { ...swap(1, 1), sqrtPriceX96Before: undefined }, liquidity, ...range, feeRate }),
    ).toBeUndefined()
  })
})

describe('lpShareOfFee', () => {
  it('reads the protocol cut per input token from slot0.feeProtocol', () => {
    // 68 = 4 | (4 << 4): a quarter of each fee goes to the protocol, on both tokens.
    expect(lpShareOfFee({ feeProtocol: 68, token: 0 })).toBe(0.75)
    expect(lpShareOfFee({ feeProtocol: 68, token: 1 })).toBe(0.75)
    // 0x50 = 5 on token1 only.
    expect(lpShareOfFee({ feeProtocol: 0x50, token: 0 })).toBe(1)
    expect(lpShareOfFee({ feeProtocol: 0x50, token: 1 })).toBeCloseTo(0.8)
  })
})
