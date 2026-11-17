import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { UniverseChainId } from '@universe/chains'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { describe, expect, it } from 'vitest'
import { getRevertPositionUrl, getUniswapPositionUrl } from '~/features/Liquidity/PositionExternalLinks'

function makePosition(overrides: Partial<PositionInfo> = {}): PositionInfo {
  return {
    version: ProtocolVersion.V3,
    chainId: UniverseChainId.Base,
    tokenId: '6503552',
    ...overrides,
  } as PositionInfo
}

describe('getUniswapPositionUrl', () => {
  it('points at the same position page on app.uniswap.org', () => {
    expect(getUniswapPositionUrl(makePosition())).toBe('https://app.uniswap.org/positions/v3/base/6503552')
  })
})

describe('getRevertPositionUrl', () => {
  it('uses Revert chain names', () => {
    expect(getRevertPositionUrl(makePosition())).toBe('https://revert.finance/#/uniswap-position/base/6503552')
    expect(getRevertPositionUrl(makePosition({ chainId: UniverseChainId.Mainnet, tokenId: '1' }))).toBe(
      'https://revert.finance/#/uniswap-position/mainnet/1',
    )
  })

  it('has no link for V4 positions or chains Revert was not checked on', () => {
    expect(getRevertPositionUrl(makePosition({ version: ProtocolVersion.V4 } as Partial<PositionInfo>))).toBeUndefined()
    expect(getRevertPositionUrl(makePosition({ chainId: UniverseChainId.Optimism }))).toBeUndefined()
  })
})
