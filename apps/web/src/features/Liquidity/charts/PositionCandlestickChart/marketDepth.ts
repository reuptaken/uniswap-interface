/** The price move depth is quoted for: 0.01%, small enough to stay within one stretch of constant liquidity. */
export const DEPTH_QUOTE_MOVE = 0.0001

/**
 * The token1 (raw) it takes to move the price up by DEPTH_QUOTE_MOVE at a tick: L·√P·(√(1 + move) − 1). A density,
 * comparable between price levels and pools once priced in USD.
 */
export function token1PerMoveAt({ tick, liquidity }: { tick: number; liquidity: number }): number {
  return liquidity * 1.0001 ** (tick / 2) * (Math.sqrt(1 + DEPTH_QUOTE_MOVE) - 1)
}

/** "$3.4M", "$812K", "$2.5K", "$950": short enough for a chart corner. */
export function formatCompactUsd(usd: number): string {
  if (usd >= 1e9) {
    return `$${(usd / 1e9).toFixed(1)}B`
  }
  if (usd >= 1e6) {
    return `$${(usd / 1e6).toFixed(1)}M`
  }
  if (usd >= 1e4) {
    return `$${Math.round(usd / 1e3)}K`
  }
  if (usd >= 1e3) {
    return `$${(usd / 1e3).toFixed(1)}K`
  }
  return `$${Math.round(usd)}`
}
