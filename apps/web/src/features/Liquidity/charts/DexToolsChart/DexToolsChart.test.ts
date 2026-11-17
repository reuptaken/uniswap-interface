import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { UniverseChainId } from '@universe/chains'
import { describe, expect, it } from 'vitest'
import { getDexToolsChartUrl } from '~/features/Liquidity/charts/DexToolsChart/DexToolsChart'

const POOL = '0xd0b53D9277642d899DF5C87A3966A349A798F224'

describe('getDexToolsChartUrl', () => {
  it('builds the pair widget URL with the chain slug and theme', () => {
    const url = getDexToolsChartUrl({
      chainId: UniverseChainId.Base,
      version: ProtocolVersion.V3,
      poolAddress: POOL,
      darkMode: true,
    })
    expect(url).toBe(
      `https://www.dextools.io/widget-chart/en/base/pe-light/${POOL}?theme=dark&chartType=1&chartResolution=15&drawingToolbars=false&tvPaneColor=1F1F1F&tvPlatformColor=1F1F1F&headerColor=1F1F1F`,
    )
  })

  it('uses DEXTools’ name for Ethereum mainnet', () => {
    const url = getDexToolsChartUrl({
      chainId: UniverseChainId.Mainnet,
      version: ProtocolVersion.V3,
      poolAddress: POOL,
      darkMode: false,
    })
    expect(url).toContain('/en/ether/pe-light/')
    expect(url).toContain('theme=light')
    expect(url).toContain('tvPaneColor=F9F9F9')
  })

  it('is unavailable for V4 pool ids and unsupported chains', () => {
    const v4PoolId = `0x${'ab'.repeat(32)}`
    expect(
      getDexToolsChartUrl({
        chainId: UniverseChainId.Base,
        version: ProtocolVersion.V4,
        poolAddress: v4PoolId,
        darkMode: true,
      }),
    ).toBeUndefined()
    expect(
      getDexToolsChartUrl({
        chainId: UniverseChainId.Zora,
        version: ProtocolVersion.V3,
        poolAddress: POOL,
        darkMode: true,
      }),
    ).toBeUndefined()
  })
})
