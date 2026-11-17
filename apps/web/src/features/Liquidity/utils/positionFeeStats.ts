import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { ONE_DAY_MS, ONE_SECOND_MS } from 'utilities/src/time/time'
import type { MintData } from '~/features/Liquidity/hooks/usePositionMintData'
import { tokenAmountUsd } from '~/features/Liquidity/utils/positionPnl'

const ONE_YEAR_MS = 365 * ONE_DAY_MS

export interface PositionFeeStats {
  /** Fees already collected; Collect also pays out withdrawn principal, which is excluded. */
  collectedFeesUsd: number
  /** Collected plus still-uncollected fees. */
  totalFeesUsd: number
  /** Total fees over total deposits, annualized since the mint, however recent. */
  feeApr: number | undefined
}

/** Fee totals from the position's on-chain history, at the backend's current token prices. */
export function getPositionFeeStats({
  position,
  mintData,
  nowMs,
}: {
  position: PositionInfo
  mintData: Pick<
    MintData,
    | 'timestamp'
    | 'totalDeposited0'
    | 'totalDeposited1'
    | 'totalCollected0'
    | 'totalCollected1'
    | 'totalWithdrawn0'
    | 'totalWithdrawn1'
  >
  nowMs: number
}): PositionFeeStats | undefined {
  const { uncollectedFeesUsd, token0PriceUsd, token1PriceUsd } = position
  const {
    timestamp,
    totalDeposited0,
    totalDeposited1,
    totalCollected0,
    totalCollected1,
    totalWithdrawn0,
    totalWithdrawn1,
  } = mintData
  if (
    position.version !== ProtocolVersion.V3 ||
    uncollectedFeesUsd === undefined ||
    token0PriceUsd === undefined ||
    token1PriceUsd === undefined ||
    timestamp === undefined ||
    totalDeposited0 === undefined ||
    totalDeposited1 === undefined ||
    totalCollected0 === undefined ||
    totalCollected1 === undefined ||
    totalWithdrawn0 === undefined ||
    totalWithdrawn1 === undefined
  ) {
    return undefined
  }
  const decimals0 = position.currency0Amount.currency.decimals
  const decimals1 = position.currency1Amount.currency.decimals
  const collectedFees0 = totalCollected0 > totalWithdrawn0 ? totalCollected0 - totalWithdrawn0 : 0n
  const collectedFees1 = totalCollected1 > totalWithdrawn1 ? totalCollected1 - totalWithdrawn1 : 0n
  const collectedFeesUsd =
    tokenAmountUsd({ rawAmount: collectedFees0, decimals: decimals0, priceUsd: token0PriceUsd }) +
    tokenAmountUsd({ rawAmount: collectedFees1, decimals: decimals1, priceUsd: token1PriceUsd })
  const totalFeesUsd = uncollectedFeesUsd + collectedFeesUsd
  const depositedUsd =
    tokenAmountUsd({ rawAmount: totalDeposited0, decimals: decimals0, priceUsd: token0PriceUsd }) +
    tokenAmountUsd({ rawAmount: totalDeposited1, decimals: decimals1, priceUsd: token1PriceUsd })

  const ageMs = nowMs - timestamp * ONE_SECOND_MS
  const feeApr = ageMs > 0 && depositedUsd > 0 ? (totalFeesUsd / depositedUsd) * (ONE_YEAR_MS / ageMs) * 100 : undefined

  return { collectedFeesUsd, totalFeesUsd, feeApr }
}
