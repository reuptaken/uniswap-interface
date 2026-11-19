import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { persist } from 'zustand/middleware'

const STORAGE_KEY = 'uniswap_nav_collapsed'

interface NavCollapsedState {
  /** The top nav bar is folded away into a small logo in the corner, giving its height back to the page. */
  isCollapsed: boolean
  setCollapsed: (isCollapsed: boolean) => void
}

export const useNavCollapsedStore: UseBoundStore<StoreApi<NavCollapsedState>> = create<NavCollapsedState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      setCollapsed: (isCollapsed: boolean): void => set({ isCollapsed }),
    }),
    { name: STORAGE_KEY },
  ),
)
