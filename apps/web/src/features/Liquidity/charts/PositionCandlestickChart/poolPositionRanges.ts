import { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { AddressStringFormat, normalizeAddress } from '@universe/chains'
import { getPositionKey } from 'uniswap/src/features/positions/utils'
import type { NftPositionInfo } from '~/features/Liquidity/hooks/useOwnerOpenPositions'

/** Another position in the chart's pool, in the chart's price orientation. */
export interface PoolPositionRange {
  key: string
  /** Unix seconds; 0 when the backend has no creation time, which starts the box at the first candle. */
  startTime: number
  priceLower: number
  priceUpper: number
  inRange: boolean
}

/** token1 per token0 at a tick, in whole tokens. */
export function tickToPrice({
  tick,
  decimals0,
  decimals1,
}: {
  tick: number
  decimals0: number
  decimals1: number
}): number {
  return 1.0001 ** tick * 10 ** (decimals0 - decimals1)
}

/**
 * The owner's other positions in `current`'s pool, priced like the chart: token1 per token0, or its inverse when the
 * page shows the price inverted. In-range comes from the live pool tick, so it flips as the price moves.
 */
export function getPoolPositionRanges({
  positions,
  current,
  priceInverted,
}: {
  positions: readonly NftPositionInfo[]
  current: NftPositionInfo
  priceInverted: boolean
}): PoolPositionRange[] {
  const poolId = normalizeAddress(current.poolId, AddressStringFormat.Lowercase)
  const currentKey = getPositionKey(current)
  const liveTick = current.poolOrPair?.tickCurrent
  const decimals0 = current.currency0Amount.currency.decimals
  const decimals1 = current.currency1Amount.currency.decimals

  return positions.flatMap((position) => {
    const { tickLower, tickUpper } = position
    if (
      position.chainId !== current.chainId ||
      normalizeAddress(position.poolId, AddressStringFormat.Lowercase) !== poolId ||
      getPositionKey(position) === currentKey ||
      tickLower === undefined ||
      tickUpper === undefined
    ) {
      return []
    }
    const lower = tickToPrice({ tick: tickLower, decimals0, decimals1 })
    const upper = tickToPrice({ tick: tickUpper, decimals0, decimals1 })
    return [
      {
        key: getPositionKey(position),
        startTime: position.createdAt ?? 0,
        priceLower: priceInverted ? 1 / upper : lower,
        priceUpper: priceInverted ? 1 / lower : upper,
        inRange:
          liveTick !== undefined
            ? tickLower <= liveTick && liveTick < tickUpper
            : position.status === PositionStatus.IN_RANGE,
      },
    ]
  })
}
