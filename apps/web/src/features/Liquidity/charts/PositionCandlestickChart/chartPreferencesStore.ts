import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { persist } from 'zustand/middleware'

export const DEFAULT_CHART_HEIGHT = 440
export const MIN_CHART_HEIGHT = 260
export const MAX_CHART_HEIGHT = 1200

export function clampChartHeight(height: number): number {
  return Math.round(Math.min(MAX_CHART_HEIGHT, Math.max(MIN_CHART_HEIGHT, height)))
}

interface ChartPreferencesState {
  /** The candle chart's volume pane is shown; closing it gives its height back to the price pane. */
  showVolume: boolean
  setShowVolume: (showVolume: boolean) => void
  /** The candle chart's height in px, set by dragging its bottom edge. */
  chartHeight: number
  setChartHeight: (chartHeight: number) => void
}

export const useChartPreferencesStore: UseBoundStore<StoreApi<ChartPreferencesState>> = create<ChartPreferencesState>()(
  persist(
    (set) => ({
      showVolume: true,
      setShowVolume: (showVolume: boolean): void => set({ showVolume }),
      chartHeight: DEFAULT_CHART_HEIGHT,
      setChartHeight: (chartHeight: number): void => set({ chartHeight: clampChartHeight(chartHeight) }),
    }),
    { name: 'uniswap_position_chart_preferences' },
  ),
)
