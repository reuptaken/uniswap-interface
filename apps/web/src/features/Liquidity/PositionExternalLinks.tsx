import { ProtocolVersion } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import { UniverseChainId } from '@universe/chains'
import { Anchor, Flex } from '@universe/mycelium'
import { UniswapLogo } from 'ui/src/components/icons/UniswapLogo'
import { getPositionUrl } from 'uniswap/src/features/positions/getPositionUrl'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { MouseoverTooltip } from '~/components/Tooltip'

const UNISWAP_APP_URL = 'https://app.uniswap.org'
const REVERT_ICON_URL = 'https://revert.finance/assets/favicon-32x32.png'
const ICON_SIZE = 16

// Revert's chain names in its position URLs, checked against its site; other chains get no Revert link.
const REVERT_CHAIN_SLUGS: Partial<Record<UniverseChainId, string>> = {
  [UniverseChainId.Mainnet]: 'mainnet',
  [UniverseChainId.Base]: 'base',
  [UniverseChainId.ArbitrumOne]: 'arbitrum',
  [UniverseChainId.Polygon]: 'polygon',
  [UniverseChainId.Bnb]: 'bnb',
}

export function getUniswapPositionUrl(position: PositionInfo): string {
  return `${UNISWAP_APP_URL}${getPositionUrl(position)}`
}

export function getRevertPositionUrl(position: PositionInfo): string | undefined {
  const chainSlug = REVERT_CHAIN_SLUGS[position.chainId]
  if (position.version !== ProtocolVersion.V3 || !chainSlug) {
    return undefined
  }
  return `https://revert.finance/#/uniswap-position/${chainSlug}/${position.tokenId}`
}

function ExternalIconLink({ href, label, children }: { href: string; label: string; children: JSX.Element }) {
  return (
    <MouseoverTooltip text={label} placement="top">
      <Anchor
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={label}
        opacity={0.6}
        hoverStyle={{ opacity: 1 }}
        display="flex"
      >
        {children}
      </Anchor>
    </MouseoverTooltip>
  )
}

/** Grey links to the same position on app.uniswap.org and, where it supports it, on Revert. */
export function PositionExternalLinks({ position }: { position: PositionInfo }): JSX.Element {
  const revertUrl = getRevertPositionUrl(position)
  return (
    <Flex row gap="$gap8" alignItems="center">
      <ExternalIconLink href={getUniswapPositionUrl(position)} label="Open on Uniswap">
        <UniswapLogo size={ICON_SIZE} color="$neutral2" />
      </ExternalIconLink>
      {revertUrl && (
        <ExternalIconLink href={revertUrl} label="Open on Revert">
          <img
            src={REVERT_ICON_URL}
            alt=""
            width={ICON_SIZE}
            height={ICON_SIZE}
            referrerPolicy="no-referrer"
            style={{ filter: 'grayscale(1)' }}
          />
        </ExternalIconLink>
      )}
    </Flex>
  )
}
