import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import type { SortDirection } from '~/features/Liquidity/PositionsTableColumns'

function positionId(position: PositionInfo | undefined): bigint | undefined {
  if (!position || position.version === ProtocolVersion.V2) {
    return undefined
  }
  try {
    return BigInt(position.tokenId)
  } catch {
    return undefined
  }
}

/** Orders rows by NFT token id; rows without one (V2 pairs, the totals row) keep their order at the end. */
export function sortRowsByPositionId<T extends { position?: PositionInfo }>(
  rows: readonly T[],
  direction: SortDirection,
): T[] {
  const withIds = rows.map((row, index) => ({ row, index, id: positionId(row.position) }))
  withIds.sort((a, b) => {
    if (a.id === undefined || b.id === undefined) {
      return a.id === undefined && b.id === undefined ? a.index - b.index : a.id === undefined ? 1 : -1
    }
    if (a.id === b.id) {
      return a.index - b.index
    }
    const ascending = a.id < b.id ? -1 : 1
    return direction === 'asc' ? ascending : -ascending
  })
  return withIds.map(({ row }) => row)
}
