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
