import { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { AddressStringFormat, normalizeAddress } from '@universe/chains'
import { useEffect, useRef } from 'react'
import { getPositionKey } from 'uniswap/src/features/positions/utils'
import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { persist } from 'zustand/middleware'
import type { NftPositionInfo } from '~/features/Liquidity/hooks/useOwnerOpenPositions'

interface AutoSwitchState {
  /** Out of range, the position page moves on to the owner's nearest in-range position by itself. */
  isEnabled: boolean
  setEnabled: (isEnabled: boolean) => void
}

export const useAutoSwitchPositionStore: UseBoundStore<StoreApi<AutoSwitchState>> = create<AutoSwitchState>()(
  persist(
    (set) => ({
      isEnabled: false,
      setEnabled: (isEnabled: boolean): void => set({ isEnabled }),
    }),
    { name: 'uniswap_position_auto_switch' },
  ),
)

const lowercase = (address: string): string => normalizeAddress(address, AddressStringFormat.Lowercase)

/**
 * Whether a position is in range now. In the current position's pool that's read from the live pool tick (the same
 * read the page shows); for another pool only the backend's status is known, which can lag the chain.
 */
export function isInRange({
  position,
  current,
  liveTick,
}: {
  position: NftPositionInfo
  current: NftPositionInfo
  liveTick: number | undefined
}): boolean {
  const samePool = position.chainId === current.chainId && lowercase(position.poolId) === lowercase(current.poolId)
  if (samePool && liveTick !== undefined && position.tickLower !== undefined && position.tickUpper !== undefined) {
    return (
      Boolean(position.liquidity && position.liquidity !== '0') &&
      position.tickLower <= liveTick &&
      liveTick < position.tickUpper
    )
  }
  return position.status === PositionStatus.IN_RANGE
}

/** The in-range position to switch to: the one closest by token id to the current one; undefined if there's none. */
export function pickInRangePosition({
  current,
  positions,
  liveTick,
}: {
  current: NftPositionInfo
  positions: readonly NftPositionInfo[]
  liveTick: number | undefined
}): NftPositionInfo | undefined {
  const currentKey = getPositionKey(current)
  const currentId = BigInt(current.tokenId)
  const distance = (position: NftPositionInfo): bigint => {
    const difference = BigInt(position.tokenId) - currentId
    return difference < 0n ? -difference : difference
  }
  return positions
    .filter((position) => getPositionKey(position) !== currentKey && isInRange({ position, current, liveTick }))
    .reduce<NftPositionInfo | undefined>(
      (closest, position) => (closest === undefined || distance(position) < distance(closest) ? position : closest),
      undefined,
    )
}

/**
 * With auto-switch on, moves the page to the nearest in-range position (pickInRangePosition) as soon as the current
 * one is out of range. Waits for the live pool read, so a stale backend status never triggers a switch, and switches
 * at most once per position shown.
 */
export function useAutoSwitchPosition({
  current,
  positions,
  liveTick,
  isLive,
  onSwitch,
}: {
  current: NftPositionInfo | undefined
  positions: readonly NftPositionInfo[]
  liveTick: number | undefined
  /** The current position's range status comes from the chain, not just the backend. */
  isLive: boolean
  onSwitch: (position: NftPositionInfo) => void
}): void {
  const isEnabled = useAutoSwitchPositionStore((state) => state.isEnabled)
  const switchedFromRef = useRef<string | undefined>(undefined)

  useEffect(() => {
    if (!isEnabled || !current || !isLive || liveTick === undefined) {
      return
    }
    const currentKey = getPositionKey(current)
    if (switchedFromRef.current === currentKey || isInRange({ position: current, current, liveTick })) {
      return
    }
    const next = pickInRangePosition({ current, positions, liveTick })
    if (next) {
      switchedFromRef.current = currentKey
      onSwitch(next)
    }
  }, [isEnabled, current, positions, liveTick, isLive, onSwitch])
}
