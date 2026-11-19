import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { useMemo } from 'react'
import { useWalletPositions } from 'uniswap/src/features/positions/hooks/useWalletPositions'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { getPositionKey } from 'uniswap/src/features/positions/utils'
import { sortRowsByPositionId } from '~/features/Liquidity/utils/sortRowsByPositionId'

// NFT positions only: a V2 pair has no id or range.
const NFT_PROTOCOL_VERSIONS = [ProtocolVersion.V3, ProtocolVersion.V4]

export type NftPositionInfo = Extract<PositionInfo, { version: ProtocolVersion.V3 | ProtocolVersion.V4 }>

export function isNftPosition(position: PositionInfo): position is NftPositionInfo {
  return position.version === ProtocolVersion.V3 || position.version === ProtocolVersion.V4
}

/**
 * The open V3/V4 positions of `current`'s owner, by token id, from one GetWalletPositions request (react-query shares
 * it between callers). `current` is always included, as the page's own (live) copy, even once it's closed.
 */
export function useOwnerOpenPositions(current: PositionInfo | undefined): NftPositionInfo[] {
  const owner = current && isNftPosition(current) ? current.owner : undefined
  const { positions } = useWalletPositions({
    account: owner ?? '',
    protocolVersions: NFT_PROTOCOL_VERSIONS,
    disabled: !owner,
  })

  return useMemo(() => {
    if (!current || !isNftPosition(current)) {
      return []
    }
    const currentKey = getPositionKey(current)
    const others = positions.filter(
      (position): position is NftPositionInfo => isNftPosition(position) && getPositionKey(position) !== currentKey,
    )
    const rows = [...others, current].map((position) => ({ position }))
    return sortRowsByPositionId(rows, 'asc').map((row) => row.position)
  }, [positions, current])
}
