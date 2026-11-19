import { applyLiveFees } from '~/pages/Positions/useLivePositionInfo'
import { buildPositionInfo } from '~/test-utils/pools/liquidityServicePositionFixtures'

// The fixture is a mainnet ETH (18 decimals) / USDT (6 decimals) position.
const backendPosition = {
  ...buildPositionInfo({ liquidity: '1000000000000' }),
  token0PriceUsd: 2000,
  token1PriceUsd: 1,
}

describe('applyLiveFees', () => {
  it('shows the chain’s claimable fees, priced with the backend’s token prices', () => {
    const live = applyLiveFees(backendPosition, [5n * 10n ** 17n, 25_000_000n])

    expect(live.fee0Amount?.toExact()).toBe('0.5')
    expect(live.fee1Amount?.toExact()).toBe('25')
    expect(live.token0UncollectedFeesUsd).toBe(1000)
    expect(live.token1UncollectedFeesUsd).toBe(25)
    expect(live.uncollectedFeesUsd).toBe(1025)
  })

  it('leaves fees unpriced when the backend has no token price', () => {
    const live = applyLiveFees({ ...backendPosition, token0PriceUsd: undefined }, [10n ** 18n, 1_000_000n])

    expect(live.fee0Amount?.toExact()).toBe('1')
    expect(live.token0UncollectedFeesUsd).toBeUndefined()
    expect(live.uncollectedFeesUsd).toBe(backendPosition.uncollectedFeesUsd)
  })
})
