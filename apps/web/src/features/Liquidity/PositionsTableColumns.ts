import type { AppTFunction } from 'utilities/src/i18n/types'

export type ColumnId = 'pool' | 'position' | 'distribution' | 'liquidity' | 'fees' | 'pnl' | 'apr' | 'created' | 'menu'

export type SortDirection = 'asc' | 'desc'

// Server-side sort fields for GetWalletPositions. Fees has no client sort: the backend's fees sort
// reads every matched position on-chain at request time and silently falls back to the default
// order above a server-side ceiling, so its header stays plain.
export type ServerPositionSortField = 'distribution' | 'liquidity' | 'created_at' | 'apr'

// 'id' sorts the loaded rows client-side by NFT token id; the backend has no such sort.
export type PositionSortField = ServerPositionSortField | 'id'

export interface PositionSort {
  field: PositionSortField
  direction: SortDirection
}

export function getColumnLabel(id: ColumnId, t: AppTFunction): string {
  switch (id) {
    case 'pool':
      return t('liquidityPool.positions.table.column.pool')
    case 'position':
      return t('liquidityPool.positions.table.column.position')
    case 'distribution':
      return t('liquidityPool.positions.table.column.distribution')
    case 'liquidity':
      return t('common.value')
    case 'fees':
      return t('liquidityPool.positions.table.column.fees')
    case 'pnl':
      return 'P/L'
    case 'apr':
      return t('liquidityPool.positions.table.column.apr')
    case 'created':
      return t('liquidityPool.positions.table.column.created')
    case 'menu':
      return ''
    default:
      return id satisfies never
  }
}
