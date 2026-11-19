import { create, type StoreApi, type UseBoundStore } from 'zustand'

interface HighlightedPositionState {
  /** getPositionKey of the position pointed at in the position switcher, if any. */
  highlightedKey: string | undefined
  setHighlightedKey: (key: string | undefined) => void
}

/**
 * Lets the position switcher point out a position on the chart without re-rendering the page between them: the
 * switcher writes the hovered row, the chart reads it.
 */
export const useHighlightedPositionStore: UseBoundStore<StoreApi<HighlightedPositionState>> =
  create<HighlightedPositionState>((set) => ({
    highlightedKey: undefined,
    setHighlightedKey: (key: string | undefined): void => set({ highlightedKey: key }),
  }))
