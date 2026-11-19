/** A V3 pool swap, from its `Swap` event. Amounts are the pool's side: positive flowed in, negative flowed out. */
export interface PoolSwap {
  /** `${txHash}:${logIndex}`: unique, even for several swaps in one transaction. */
  id: string
  blockNumber: number
  logIndex: number
  /** Unix seconds, estimated from the block number (see estimateTimestamp). */
  timestamp: number
  txHash: string
  amount0: bigint
  amount1: bigint
  /** The pool price after the swap. */
  sqrtPriceX96: bigint
  /** The pool price before it (the previous swap's closing price); unknown for the first swap seen. */
  sqrtPriceX96Before?: bigint
  /** How far the swap moved the price, as a fraction (0.001 = 0.1%); unknown for the first swap seen. */
  priceMove?: number
}

/** A block whose timestamp is known, to place other blocks in time. */
export interface BlockAnchor {
  number: number
  timestamp: number
}

export interface PoolSwapsState {
  swaps: PoolSwap[]
  /** The last block scanned; the next read starts after it. */
  lastBlock: BlockAnchor
  /** Average seconds per block on this chain, measured when the window was first read. */
  secondsPerBlock: number
  /** The price after the newest swap, to measure the next swap's move. */
  lastSqrtPriceX96?: bigint
  /** The pool's slot0.feeProtocol, read when the window starts (only governance changes it). */
  feeProtocol?: number
}

export interface SwapLog {
  blockNumber: number
  logIndex: number
  txHash: string
  amount0: bigint
  amount1: bigint
  sqrtPriceX96: bigint
}

/** How much history the list starts with. */
export const SWAP_HISTORY_SECONDS = 15 * 60
/** A cap on what's kept in memory; the list itself shows far fewer. */
export const MAX_KEPT_SWAPS = 1000

/** A block's time, interpolated between two known blocks (exact on chains with a fixed block time, like Base). */
export function estimateTimestamp({
  blockNumber,
  from,
  to,
}: {
  blockNumber: number
  from: BlockAnchor
  to: BlockAnchor
}): number {
  if (to.number === from.number) {
    return to.timestamp
  }
  const secondsPerBlock = (to.timestamp - from.timestamp) / (to.number - from.number)
  return Math.round(from.timestamp + (blockNumber - from.number) * secondsPerBlock)
}

/** The relative price change between two sqrt prices: price is the square of sqrtPrice, whichever way it's quoted. */
export function priceMoveBetween(before: bigint, after: bigint): number {
  const ratio = Number(after) / Number(before)
  return Math.abs(ratio * ratio - 1)
}

/** token1 per token0, in whole tokens. */
export function priceFromSqrtPriceX96({
  sqrtPriceX96,
  decimals0,
  decimals1,
}: {
  sqrtPriceX96: bigint
  decimals0: number
  decimals1: number
}): number {
  const sqrtPrice = Number(sqrtPriceX96) / 2 ** 96
  return sqrtPrice * sqrtPrice * 10 ** (decimals0 - decimals1)
}

/**
 * Adds newly read swaps to the state, oldest first, measuring each one's price move against the swap before it.
 * Between swaps only liquidity changes happen, and they don't move the price, so the previous swap's closing price is
 * the next one's opening price.
 */
export function appendSwaps({
  state,
  logs,
  scannedTo,
}: {
  state: PoolSwapsState
  logs: readonly SwapLog[]
  scannedTo: BlockAnchor
}): PoolSwapsState {
  const sorted = [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.logIndex - b.logIndex)
  let previous = state.lastSqrtPriceX96
  const added = sorted.map((log): PoolSwap => {
    const swap: PoolSwap = {
      id: `${log.txHash}:${log.logIndex}`,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      timestamp: estimateTimestamp({ blockNumber: log.blockNumber, from: state.lastBlock, to: scannedTo }),
      txHash: log.txHash,
      amount0: log.amount0,
      amount1: log.amount1,
      sqrtPriceX96: log.sqrtPriceX96,
      sqrtPriceX96Before: previous,
      priceMove: previous === undefined ? undefined : priceMoveBetween(previous, log.sqrtPriceX96),
    }
    previous = log.sqrtPriceX96
    return swap
  })
  return {
    swaps: [...state.swaps, ...added].slice(-MAX_KEPT_SWAPS),
    lastBlock: scannedTo,
    secondsPerBlock: state.secondsPerBlock,
    lastSqrtPriceX96: previous,
    feeProtocol: state.feeProtocol,
  }
}

/** The newest `count` swaps, newest first; with `minPriceMove`, only those that moved the price by more than it. */
export function latestSwaps({
  swaps,
  count,
  minPriceMove,
}: {
  swaps: readonly PoolSwap[]
  count: number
  minPriceMove?: number
}): PoolSwap[] {
  const shown = minPriceMove === undefined ? swaps : swaps.filter((swap) => (swap.priceMove ?? 0) > minPriceMove)
  return shown.slice(-count).reverse()
}

// Moves smaller than this are mostly rounding, which makes their size-per-move ratio noise.
const MIN_MOVE_FOR_DEPTH = 0.000001

/**
 * How much of the base token it currently takes to move the price by 100%, as a linear estimate from recent swaps
 * (the median of each swap's size over its price move). Near the current price a pool's depth is close to linear,
 * so threshold × this is the swap size a price-move threshold corresponds to; undefined without usable swaps.
 */
export function baseAmountPerPriceMove({
  swaps,
  baseIsToken0,
  baseDecimals,
}: {
  swaps: readonly PoolSwap[]
  baseIsToken0: boolean
  baseDecimals: number
}): number | undefined {
  const ratios = swaps
    .filter((swap) => swap.priceMove !== undefined && swap.priceMove > MIN_MOVE_FOR_DEPTH)
    .map((swap) => {
      const raw = baseIsToken0 ? swap.amount0 : swap.amount1
      const amount = Number(raw < 0n ? -raw : raw) / 10 ** baseDecimals
      return amount / (swap.priceMove ?? 1)
    })
    .sort((a, b) => a - b)
  if (ratios.length === 0) {
    return undefined
  }
  const middle = Math.floor(ratios.length / 2)
  return ratios.length % 2 === 1 ? ratios[middle] : (ratios[middle - 1] + ratios[middle]) / 2
}

const Q96 = 2 ** 96

/** √price (raw token1 per raw token0) at a tick. */
export function sqrtPriceAtTick(tick: number): number {
  return 1.0001 ** (tick / 2)
}

/**
 * The fee a position earned from one swap, in raw token units: the input token pays it, token1 when the price rose and
 * token0 when it fell. Within a range of liquidity L, moving √P by Δ takes L·Δ of token1 (or L·Δ(1/√P) of token0) after
 * the fee, so a position's cut of the fee is its own liquidity times the part of the move inside its range, scaled by
 * fee / (1 − fee). Other LPs' liquidity doesn't enter: they set how far the price moves, not this position's share of
 * each step of it. Undefined without the opening price.
 */
export function estimatePositionFee({
  swap,
  liquidity,
  sqrtPriceLower,
  sqrtPriceUpper,
  feeRate,
  feeProtocol = 0,
}: {
  swap: PoolSwap
  liquidity: number
  sqrtPriceLower: number
  sqrtPriceUpper: number
  /** e.g. 0.0005 for the 0.05% tier. */
  feeRate: number
  /** slot0.feeProtocol: the protocol's cut of each fee, which never reaches LPs (see lpShareOfFee). */
  feeProtocol?: number
}): { amount0: number; amount1: number } | undefined {
  if (swap.sqrtPriceX96Before === undefined) {
    return undefined
  }
  const before = Number(swap.sqrtPriceX96Before) / Q96
  const after = Number(swap.sqrtPriceX96) / Q96
  const clip = (value: number): number => Math.min(Math.max(value, sqrtPriceLower), sqrtPriceUpper)
  const [from, to] = [clip(before), clip(after)]
  const feeFactor = feeRate / (1 - feeRate)
  if (to > from) {
    return { amount0: 0, amount1: liquidity * (to - from) * feeFactor * lpShareOfFee({ feeProtocol, token: 1 }) }
  }
  return { amount0: liquidity * (1 / to - 1 / from) * feeFactor * lpShareOfFee({ feeProtocol, token: 0 }), amount1: 0 }
}

/**
 * The LPs' share of a V3 swap fee. slot0.feeProtocol packs a denominator per input token (token0 in the low 4 bits,
 * token1 in the high 4): n sends 1/n of the fee to the protocol, 0 none. E.g. 68 is 1/4 on both, leaving LPs 75%.
 */
export function lpShareOfFee({ feeProtocol, token }: { feeProtocol: number; token: 0 | 1 }): number {
  const denominator = token === 0 ? feeProtocol % 16 : feeProtocol >> 4
  return denominator === 0 ? 1 : 1 - 1 / denominator
}
