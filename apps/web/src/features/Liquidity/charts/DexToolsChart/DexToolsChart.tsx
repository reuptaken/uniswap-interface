import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { UniverseChainId } from '@universe/chains'
import { Flex } from '@universe/mycelium'

// DEXTools' own chain slugs; chains not listed get no DEXTools view rather than a guessed URL.
const DEXTOOLS_CHAIN_SLUGS: Partial<Record<UniverseChainId, string>> = {
  [UniverseChainId.Mainnet]: 'ether',
  [UniverseChainId.Base]: 'base',
  [UniverseChainId.ArbitrumOne]: 'arbitrum',
  [UniverseChainId.Optimism]: 'optimism',
  [UniverseChainId.Polygon]: 'polygon',
  [UniverseChainId.Bnb]: 'bnb',
  [UniverseChainId.Avalanche]: 'avalanche',
}

const CHART_BACKGROUND_DARK = '1F1F1F'
const CHART_BACKGROUND_LIGHT = 'F9F9F9'

/** DEXTools' embeddable pair chart, for V3 pools (addressed by pool contract) on supported chains. */
export function getDexToolsChartUrl({
  chainId,
  version,
  poolAddress,
  darkMode,
}: {
  chainId: UniverseChainId
  version: ProtocolVersion
  poolAddress: string
  darkMode: boolean
}): string | undefined {
  const chainSlug = DEXTOOLS_CHAIN_SLUGS[chainId]
  if (!chainSlug || version !== ProtocolVersion.V3 || !/^0x[0-9a-fA-F]{40}$/.test(poolAddress)) {
    return undefined
  }
  // DEXTools takes colors as hex without '#'; these match the app's surface2 so the chart sits like a card.
  const backgroundColor = darkMode ? CHART_BACKGROUND_DARK : CHART_BACKGROUND_LIGHT
  const params = new URLSearchParams({
    theme: darkMode ? 'dark' : 'light',
    chartType: '1',
    chartResolution: '15',
    drawingToolbars: 'false',
    tvPaneColor: backgroundColor,
    tvPlatformColor: backgroundColor,
    headerColor: backgroundColor,
  })
  return `https://www.dextools.io/widget-chart/en/${chainSlug}/pe-light/${poolAddress}?${params.toString()}`
}

// The widget has no option to hide its pair header (only its own fullscreen button does, inside the cross-origin
// frame), so the frame is shifted up by the header's height and the header is clipped away.
const DEXTOOLS_HEADER_HEIGHT = 62

export function DexToolsChart({ url, width, height }: { url: string; width: number; height: number }): JSX.Element {
  return (
    <Flex width={width} height={height} borderRadius="$rounded16" overflow="hidden">
      <iframe
        title="DEXTools chart"
        src={url}
        width={width}
        height={height + DEXTOOLS_HEADER_HEIGHT}
        style={{ border: 0, marginTop: -DEXTOOLS_HEADER_HEIGHT }}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </Flex>
  )
}
