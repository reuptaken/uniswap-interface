import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { describe, expect, it } from 'vitest'
import { getPositionPnlUsd } from '~/features/Liquidity/utils/positionPnl'

const WETH_DECIMALS = 18
const USDC_DECIMALS = 6

function makePosition(overrides: Partial<PositionInfo> = {}): PositionInfo {
  return {
    version: ProtocolVersion.V3,
    currency0Amount: { currency: { decimals: WETH_DECIMALS } },
    currency1Amount: { currency: { decimals: USDC_DECIMALS } },
    totalValueUsd: 9_000,
    uncollectedFeesUsd: 300,
    token0PriceUsd: 2_000,
    token1PriceUsd: 1,
    ...overrides,
  } as unknown as PositionInfo
}

const depositedTenThousandUsdc = {
  totalDeposited0: 0n,
  totalDeposited1: 10_000n * 10n ** BigInt(USDC_DECIMALS),
  totalCollected0: 0n,
  totalCollected1: 0n,
}

describe('getPositionPnlUsd', () => {
  it('is value plus uncollected fees minus deposits', () => {
    expect(getPositionPnlUsd(makePosition(), depositedTenThousandUsdc)).toBeCloseTo(-700)
  })

  it('counts collected amounts, withdrawn principal included, as returned to the owner', () => {
    const halfEthCollected = { ...depositedTenThousandUsdc, totalCollected0: 5n * 10n ** 17n }
    expect(getPositionPnlUsd(makePosition(), halfEthCollected)).toBeCloseTo(300)
  })

  it('prices deposits of both tokens at the backend prices', () => {
    const oneEthAndUsdc = { ...depositedTenThousandUsdc, totalDeposited0: 10n ** 18n }
    expect(getPositionPnlUsd(makePosition(), oneEthAndUsdc)).toBeCloseTo(-2_700)
  })

  it('is unavailable until the history has loaded', () => {
    expect(
      getPositionPnlUsd(makePosition(), { ...depositedTenThousandUsdc, totalDeposited0: undefined }),
    ).toBeUndefined()
  })

  it('is unavailable without backend prices or valuation', () => {
    expect(getPositionPnlUsd(makePosition({ token0PriceUsd: undefined }), depositedTenThousandUsdc)).toBeUndefined()
    expect(getPositionPnlUsd(makePosition({ totalValueUsd: undefined }), depositedTenThousandUsdc)).toBeUndefined()
  })

  it('is unavailable for V4 positions, whose history is not loaded', () => {
    expect(getPositionPnlUsd(makePosition({ version: ProtocolVersion.V4 }), depositedTenThousandUsdc)).toBeUndefined()
  })
})
