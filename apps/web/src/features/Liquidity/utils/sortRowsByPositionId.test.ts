import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { describe, expect, it } from 'vitest'
import { sortRowsByPositionId } from '~/features/Liquidity/utils/sortRowsByPositionId'

function row(tokenId: string | undefined, version = ProtocolVersion.V3): { position?: PositionInfo; label: string } {
  return { position: { version, tokenId } as unknown as PositionInfo, label: tokenId ?? 'v2' }
}

const totals: { position?: PositionInfo; label: string } = { label: 'totals' }

describe('sortRowsByPositionId', () => {
  it('sorts numerically, not as strings', () => {
    const sorted = sortRowsByPositionId([row('6503552'), row('92090'), row('6436461')], 'asc')
    expect(sorted.map((r) => r.label)).toEqual(['92090', '6436461', '6503552'])
  })

  it('sorts descending', () => {
    const sorted = sortRowsByPositionId([row('5'), row('20'), row('100')], 'desc')
    expect(sorted.map((r) => r.label)).toEqual(['100', '20', '5'])
  })

  it('keeps rows without an id, like V2 pairs and the totals row, last in their original order', () => {
    const sorted = sortRowsByPositionId([row(undefined, ProtocolVersion.V2), row('9'), totals, row('3')], 'desc')
    expect(sorted.map((r) => r.label)).toEqual(['9', '3', 'v2', 'totals'])
  })
})
