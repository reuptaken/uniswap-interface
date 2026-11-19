import { useWalletPositions } from 'uniswap/src/features/positions/hooks/useWalletPositions'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { getPositionKey } from 'uniswap/src/features/positions/utils'
import { useAutoSwitchPositionStore } from '~/features/Liquidity/hooks/useAutoSwitchPosition'
import { useHighlightedPositionStore } from '~/features/Liquidity/hooks/useHighlightedPositionStore'
import { PositionSwitcher } from '~/features/Liquidity/PositionSwitcher'
import { mocked } from '~/test-utils/mocked'
import { buildPositionInfo } from '~/test-utils/pools/liquidityServicePositionFixtures'
import { fireEvent, render, screen } from '~/test-utils/render'

const navigate = vi.fn()

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}))

vi.mock('uniswap/src/features/positions/hooks/useWalletPositions', () => ({
  useWalletPositions: vi.fn(),
}))

function positionWithId(tokenId: string): PositionInfo {
  return { ...buildPositionInfo({ liquidity: '1000000000000' }), tokenId } as PositionInfo
}

function mockOwnerPositions(positions: PositionInfo[]): void {
  mocked(useWalletPositions).mockReturnValue({ positions } as unknown as ReturnType<typeof useWalletPositions>)
}

describe('PositionSwitcher', () => {
  beforeEach(() => {
    navigate.mockReset()
  })

  it('stays hidden when the owner has no other open position', () => {
    const current = positionWithId('20')
    mockOwnerPositions([current])

    render(<PositionSwitcher current={current} />)

    expect(screen.queryByText('#20')).toBeNull()
  })

  it('lists the owner’s positions by id and opens the one picked', () => {
    const current = positionWithId('20')
    mockOwnerPositions([positionWithId('30'), current, positionWithId('10')])

    render(<PositionSwitcher current={current} />)

    expect(screen.getByText('2/3')).toBeDefined()
    fireEvent.click(screen.getByText('2/3'))
    // The adaptive dropdown also mounts a copy of its menu, so read the menu that renders last.
    const ids = screen.getAllByText(/^#\d+$/).map((element) => element.textContent)
    expect(ids.slice(-3)).toEqual(['#10', '#20', '#30'])

    fireEvent.click(screen.getAllByText('#30').at(-1)!)
    expect(navigate).toHaveBeenCalledWith('/positions/v4/ethereum/30')
  })

  it('points out the hovered row’s position for the chart, and lets go when the pointer leaves', () => {
    const current = positionWithId('20')
    const other = positionWithId('30')
    mockOwnerPositions([current, other])

    render(<PositionSwitcher current={current} />)
    fireEvent.click(screen.getByText('1/2'))
    const row = screen.getAllByText('#30').at(-1)!

    fireEvent.pointerEnter(row)
    expect(useHighlightedPositionStore.getState().highlightedKey).toBe(getPositionKey(other))

    fireEvent.pointerLeave(row)
    expect(useHighlightedPositionStore.getState().highlightedKey).toBeUndefined()
  })
})

describe('PositionSwitcher and auto-switch', () => {
  it('turns auto-switch off when a position is picked by hand', () => {
    useAutoSwitchPositionStore.getState().setEnabled(true)
    const current = positionWithId('20')
    mockOwnerPositions([current, positionWithId('30')])

    render(<PositionSwitcher current={current} />)
    fireEvent.click(screen.getByText('1/2'))
    fireEvent.click(screen.getAllByText('#30').at(-1)!)

    expect(useAutoSwitchPositionStore.getState().isEnabled).toBe(false)
  })
})
