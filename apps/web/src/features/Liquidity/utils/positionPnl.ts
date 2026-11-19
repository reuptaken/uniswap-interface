import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import type { MintData } from '~/features/Liquidity/hooks/usePositionMintData'

export function tokenAmountUsd({
  rawAmount,
  decimals,
  priceUsd,
}: {
  rawAmount: bigint
  decimals: number
  priceUsd: number
}): number {
  return (Number(rawAmount) / 10 ** decimals) * priceUsd
}

/**
 * Value now plus everything taken out, minus everything put in, all at the backend's current token prices.
 * Collected amounts include withdrawn principal, which is what P/L wants: it's money returned to the owner.
 */
export function getPositionPnlUsd(
  position: PositionInfo,
  mintData: Pick<MintData, 'totalDeposited0' | 'totalDeposited1' | 'totalCollected0' | 'totalCollected1'>,
): number | undefined {
  const { totalValueUsd, uncollectedFeesUsd, token0PriceUsd, token1PriceUsd } = position
  const { totalDeposited0, totalDeposited1, totalCollected0, totalCollected1 } = mintData
  if (
    position.version !== ProtocolVersion.V3 ||
    totalValueUsd === undefined ||
    uncollectedFeesUsd === undefined ||
    token0PriceUsd === undefined ||
    token1PriceUsd === undefined ||
    totalDeposited0 === undefined ||
    totalDeposited1 === undefined ||
    totalCollected0 === undefined ||
    totalCollected1 === undefined
  ) {
    return undefined
  }
  const decimals0 = position.currency0Amount.currency.decimals
  const decimals1 = position.currency1Amount.currency.decimals
  const depositedUsd =
    tokenAmountUsd({ rawAmount: totalDeposited0, decimals: decimals0, priceUsd: token0PriceUsd }) +
    tokenAmountUsd({ rawAmount: totalDeposited1, decimals: decimals1, priceUsd: token1PriceUsd })
  const collectedUsd =
    tokenAmountUsd({ rawAmount: totalCollected0, decimals: decimals0, priceUsd: token0PriceUsd }) +
    tokenAmountUsd({ rawAmount: totalCollected1, decimals: decimals1, priceUsd: token1PriceUsd })
  return totalValueUsd + uncollectedFeesUsd + collectedUsd - depositedUsd
}

export type PnlTone = 'profit' | 'loss' | 'flat'

/**
 * How a whole-dollar P/L reads: a profit gets "+" and green, a loss red; anything that rounds to $0 is flat, shown
 * without a sign in the neutral colour (no green "+$0", no red "-$0"). Returns the amount to format: rounded, so a
 * flat one is a plain 0.
 */
export function wholeDollarPnl(pnlUsd: number): { amount: number; sign: '+' | ''; tone: PnlTone } {
  const amount = Math.round(pnlUsd) || 0
  if (amount === 0) {
    return { amount: 0, sign: '', tone: 'flat' }
  }
  return amount > 0 ? { amount, sign: '+', tone: 'profit' } : { amount, sign: '', tone: 'loss' }
}

export const PNL_TONE_COLOR: Record<PnlTone, '$statusSuccess' | '$statusCritical' | '$neutral1'> = {
  profit: '$statusSuccess',
  loss: '$statusCritical',
  flat: '$neutral1',
}
