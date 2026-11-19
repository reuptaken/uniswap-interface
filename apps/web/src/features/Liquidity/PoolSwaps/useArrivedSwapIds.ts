import { useEffect, useRef, useState } from 'react'
import type { PoolSwap } from '~/features/Liquidity/PoolSwaps/poolSwaps'

const NO_ARRIVALS: ReadonlySet<string> = new Set()

/**
 * The ids of the swaps that arrived with the latest read, so their rows can flash. The history loaded first doesn't
 * count, nor does a different pool's: only swaps that came in while watching.
 */
export function useArrivedSwapIds({
  swaps,
  poolAddress,
}: {
  swaps: readonly PoolSwap[] | undefined
  poolAddress: string
}): ReadonlySet<string> {
  const knownRef = useRef<{ poolAddress: string; ids: Set<string> } | undefined>(undefined)
  const [arrivedIds, setArrivedIds] = useState<ReadonlySet<string>>(NO_ARRIVALS)

  useEffect(() => {
    if (!swaps) {
      return
    }
    const known = knownRef.current
    if (known?.poolAddress !== poolAddress) {
      knownRef.current = { poolAddress, ids: new Set(swaps.map((swap) => swap.id)) }
      setArrivedIds(NO_ARRIVALS)
      return
    }
    const arrived = swaps.map((swap) => swap.id).filter((id) => !known.ids.has(id))
    if (arrived.length > 0) {
      arrived.forEach((id) => known.ids.add(id))
      setArrivedIds(new Set(arrived))
    }
  }, [swaps, poolAddress])

  return arrivedIds
}
