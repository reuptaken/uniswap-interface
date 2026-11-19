import { Flex } from '@universe/mycelium'
import { ArrowDownCircleFilled } from '@universe/mycelium/icons/ArrowDownCircleFilled'

/**
 * How big a swap was, by how far it moved the price, in five steps: below XS (dust); XS up to S; S up to M; M up to L;
 * L and beyond (XL too).
 */
export type SwapSizeTier = 0 | 1 | 2 | 3 | 4

export function swapSizeTier({
  priceMove,
  thresholds,
}: {
  priceMove: number | undefined
  thresholds: { XS: number; S: number; M: number; L: number }
}): SwapSizeTier {
  if (priceMove === undefined || priceMove <= thresholds.XS) {
    return 0
  }
  if (priceMove <= thresholds.S) {
    return 1
  }
  if (priceMove <= thresholds.M) {
    return 2
  }
  return priceMove <= thresholds.L ? 3 : 4
}

export const SWAP_ARROW_SIZE = 18

const TIER_OPACITY: Record<SwapSizeTier, number> = { 0: 0.2, 1: 0.3, 2: 0.4, 3: 0.7, 4: 1 }

/** How strongly a swap's marks show: fainter the smaller it was. Shared by the arrow and the price after. */
export function swapSizeOpacity(tier: SwapSizeTier): number {
  return TIER_OPACITY[tier]
}

/**
 * The buy/sell mark: a green or red circle with the arrow cut out of it (showing the background), stronger the bigger
 * the swap. One size for every swap, so the column stays aligned.
 */
export function SwapSideArrow({ isBuy, tier }: { isBuy: boolean; tier: SwapSizeTier }): JSX.Element {
  return (
    <Flex opacity={swapSizeOpacity(tier)}>
      {/* The icon only points down; turned around for a buy. */}
      <ArrowDownCircleFilled
        size={SWAP_ARROW_SIZE}
        color={isBuy ? '$statusSuccess' : '$statusCritical'}
        transform={isBuy ? 'rotate(180deg)' : undefined}
      />
    </Flex>
  )
}
