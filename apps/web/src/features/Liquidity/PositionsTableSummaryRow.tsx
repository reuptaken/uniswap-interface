import { Text } from '@universe/mycelium'
import { TestID } from '@universe/test'
import { useMemo } from 'react'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { Cell } from '~/components/Table/Cell'
import { TableText } from '~/components/Table/shared/TableText'
import { useFormatWholeFiat } from '~/features/Liquidity/hooks/useFormatWholeFiat'
import { usePositionsSummary } from '~/features/Liquidity/hooks/usePositionsSummary'
import type { ColumnId } from '~/features/Liquidity/PositionsTableColumns'
import type { PositionsSummary } from '~/features/Liquidity/utils/summarizePositions'

export function SummaryCellContent({
  summary,
  column,
}: {
  summary: PositionsSummary
  column: ColumnId
}): JSX.Element | null {
  const { formatPercent } = useLocalizationContext()
  const formatWholeFiat = useFormatWholeFiat()
  const { openCount, pnlUsd, pnlCount } = summary

  switch (column) {
    case 'pool':
      return (
        <Text variant="body3" fontWeight="600" color="$neutral1">
          Total · {openCount} open
        </Text>
      )
    case 'liquidity':
      return (
        <TableText variant="body3" fontWeight="600">
          {formatWholeFiat(summary.valueUsd)}
        </TableText>
      )
    case 'fees':
      return (
        <TableText variant="body3" fontWeight="600">
          {formatWholeFiat(summary.feesUsd)}
        </TableText>
      )
    case 'pnl':
      if (pnlUsd === undefined) {
        return (
          <TableText variant="body3" fontWeight="600">
            –
          </TableText>
        )
      }
      return (
        <TableText variant="body3" fontWeight="600" color={pnlUsd >= 0 ? '$statusSuccess' : '$statusCritical'}>
          {pnlUsd >= 0 ? '+' : ''}
          {formatWholeFiat(pnlUsd)}
          {pnlCount < openCount ? ` (${pnlCount}/${openCount})` : ''}
        </TableText>
      )
    case 'apr':
      return (
        <TableText variant="body3" fontWeight="600">
          {summary.feeApr === undefined ? '–' : formatPercent(summary.feeApr)}
        </TableText>
      )
    default:
      return null
  }
}

export interface SummaryRow {
  position?: undefined
  summary: PositionsSummary
  testId: string
}

/** Appends a non-link totals row over the open positions; the hidden-positions view has none. */
export function useRowsWithSummary<T>({
  rows,
  positions,
  hidden,
}: {
  rows: T[]
  positions: readonly PositionInfo[]
  hidden: boolean
}): (T | SummaryRow)[] {
  const summary = usePositionsSummary(positions)
  return useMemo(
    () =>
      hidden || summary.openCount === 0
        ? rows
        : [...rows, { summary, testId: `${TestID.PositionsTableRowPrefix}summary` }],
    [rows, summary, hidden],
  )
}

export function SummaryCell({
  loading,
  summary,
  column,
}: {
  loading: boolean
  summary: PositionsSummary
  column: ColumnId
}): JSX.Element {
  return (
    <Cell loading={loading} justifyContent={column === 'pool' ? 'flex-start' : 'flex-end'}>
      <SummaryCellContent summary={summary} column={column} />
    </Cell>
  )
}
