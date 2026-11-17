import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { EVMUniverseChainId } from '@universe/chains'
import { useMemo } from 'react'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { usePositionsMintData } from '~/features/Liquidity/hooks/usePositionMintData'
import {
  isOpenPosition,
  type PositionsSummary,
  summarizePositions,
} from '~/features/Liquidity/utils/summarizePositions'

/** Totals over the open positions passed in; histories come from the same cache the P/L cells fill. */
export function usePositionsSummary(positions: readonly PositionInfo[]): PositionsSummary {
  const openPositions = useMemo(() => positions.filter(isOpenPosition), [positions])
  const historyKeys = useMemo(
    () =>
      openPositions.flatMap((position) =>
        position.version === ProtocolVersion.V3
          ? [{ chainId: position.chainId as EVMUniverseChainId, tokenId: position.tokenId }]
          : [],
      ),
    [openPositions],
  )
  const histories = usePositionsMintData(historyKeys)
  const mintData = useMemo(() => {
    let v3Index = 0
    return openPositions.map((position) => (position.version === ProtocolVersion.V3 ? histories[v3Index++] : undefined))
  }, [openPositions, histories])

  return summarizePositions({ openPositions, mintData, nowMs: Date.now() })
}
