import { PositionStatus } from '@uniswap/client-data-api/dist/data/v1/poolTypes_pb'
import type { Currency, Price } from '@uniswap/sdk-core'
import { nearestUsableTick, TickMath } from '@uniswap/v3-sdk'
import { Flex, Text } from '@universe/mycelium'
import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import { Check } from 'ui/src/components/icons/Check'
import { useLocalizationContext } from 'uniswap/src/features/language/LocalizationContext'
import { getPositionUrl } from 'uniswap/src/features/positions/getPositionUrl'
import type { PositionInfo } from 'uniswap/src/features/positions/types'
import { getPositionKey } from 'uniswap/src/features/positions/utils'
import { NumberType } from 'utilities/src/format/types'
import { Dropdown, InternalMenuItem } from '~/components/Dropdowns/Dropdown'
import { useAutoSwitchPositionStore } from '~/features/Liquidity/hooks/useAutoSwitchPosition'
import { useHighlightedPositionStore } from '~/features/Liquidity/hooks/useHighlightedPositionStore'
import {
  isNftPosition,
  type NftPositionInfo,
  useOwnerOpenPositions,
} from '~/features/Liquidity/hooks/useOwnerOpenPositions'

const STABLECOIN_SYMBOLS = ['USDC', 'USDT', 'DAI', 'BUSD', 'FRAX', 'LUSD']

function statusColor(status: PositionStatus): string {
  switch (status) {
    case PositionStatus.IN_RANGE:
      return '$statusSuccess'
    case PositionStatus.OUT_OF_RANGE:
      return '$statusCritical'
    default:
      return '$neutral3'
  }
}

/** The position's price bounds, quoted in its stablecoin when it has one, else token1 per token0. */
function rangePrices(position: NftPositionInfo): [Price<Currency, Currency>, Price<Currency, Currency>] | undefined {
  const sdkPosition = position.position
  if (!sdkPosition) {
    return undefined
  }
  const lower = sdkPosition.token0PriceLower
  const upper = sdkPosition.token0PriceUpper
  const quotedInToken0 = STABLECOIN_SYMBOLS.includes(position.currency0Amount.currency.symbol ?? '')
  return quotedInToken0 ? [upper.invert(), lower.invert()] : [lower, upper]
}

function isFullRange(position: NftPositionInfo): boolean {
  const { tickLower, tickUpper, tickSpacing } = position
  if (tickLower === undefined || tickUpper === undefined || !tickSpacing) {
    return false
  }
  return (
    tickLower <= nearestUsableTick(TickMath.MIN_TICK, tickSpacing) &&
    tickUpper >= nearestUsableTick(TickMath.MAX_TICK, tickSpacing)
  )
}

function PositionOption({ position }: { position: NftPositionInfo }): JSX.Element {
  const { t } = useTranslation()
  const { formatNumberOrString } = useLocalizationContext()
  const symbol0 = position.currency0Amount.currency.symbol
  const symbol1 = position.currency1Amount.currency.symbol
  const feeAmount = position.feeTier?.feeAmount
  const range = useMemo(() => {
    if (isFullRange(position)) {
      return t('common.fullRange')
    }
    const prices = rangePrices(position)
    if (!prices) {
      return undefined
    }
    const format = (price: Price<Currency, Currency>): string =>
      formatNumberOrString({ value: price.toSignificant(6), type: NumberType.TokenNonTx })
    return `${format(prices[0])} – ${format(prices[1])}`
  }, [position, formatNumberOrString, t])

  return (
    <Flex row alignItems="center" justifyContent="space-between" gap="$gap16" flex={1} minWidth={0}>
      <Flex row alignItems="center" gap="$gap8" flexShrink={0}>
        <Flex width={8} height={8} borderRadius="$roundedFull" backgroundColor={statusColor(position.status)} />
        <Text variant="buttonLabel3">#{position.tokenId}</Text>
        <Text variant="body3" color="$neutral2">
          {symbol0}/{symbol1}
          {feeAmount !== undefined ? ` ${feeAmount / 10_000}%` : ''}
        </Text>
      </Flex>
      {range && (
        <Text
          variant="body3"
          color="$neutral1"
          textAlign="right"
          flexShrink={0}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {range}
        </Text>
      )}
    </Flex>
  )
}

/**
 * Switches between the owner's open positions. One GetWalletPositions request lists them all with ids and ranges;
 * the current position always appears, from the page's own (live) data, even once it's closed.
 */
export function PositionSwitcher({ current }: { current: PositionInfo }): JSX.Element | null {
  const navigate = useNavigate()
  const [isOpen, setIsOpen] = useState(false)
  const setHighlightedKey = useHighlightedPositionStore((state) => state.setHighlightedKey)
  const setAutoSwitchEnabled = useAutoSwitchPositionStore((state) => state.setEnabled)
  const toggleOpen = useCallback(
    (open: boolean): void => {
      setIsOpen(open)
      // A row can close the menu under the pointer without a hover-out, so drop its highlight here.
      if (!open) {
        setHighlightedKey(undefined)
      }
    },
    [setHighlightedKey],
  )
  const options = useOwnerOpenPositions(current)
  const currentKey = getPositionKey(current)

  if (!isNftPosition(current) || options.length < 2) {
    return null
  }
  const currentIndex = options.findIndex((position) => getPositionKey(position) === currentKey)

  return (
    // The dropdown's wrapper fills its parent; this keeps it to the trigger's width at the row's end.
    <Flex flexShrink={0}>
      <Dropdown
        isOpen={isOpen}
        toggleOpen={toggleOpen}
        alignRight
        buttonStyle={{ height: 32, borderRadius: '$rounded12', borderWidth: '$spacing1', borderColor: '$surface3' }}
        dropdownStyle={{ minWidth: 440, maxHeight: 400 }}
        menuLabel={
          <Flex row alignItems="center" gap="$spacing6">
            <Text variant="buttonLabel3">#{current.tokenId}</Text>
            <Text variant="body3" color="$neutral2">
              {currentIndex + 1}/{options.length}
            </Text>
          </Flex>
        }
      >
        {options.map((position) => {
          const key = getPositionKey(position)
          return (
            <InternalMenuItem
              key={key}
              // Points the position out on the chart while the row is hovered.
              onHoverIn={() => setHighlightedKey(key)}
              onHoverOut={() => setHighlightedKey(undefined)}
              onPress={() => {
                toggleOpen(false)
                if (key !== currentKey) {
                  // A position picked by hand overrides auto-switch, which would otherwise move straight off it.
                  setAutoSwitchEnabled(false)
                  navigate(getPositionUrl(position))
                }
              }}
            >
              <PositionOption position={position} />
              {/* A fixed slot, so the selected row's range lines up with the others. */}
              <Flex width={16} flexShrink={0}>
                {key === currentKey && <Check size="$icon.16" color="$accent1" strokeWidth={4} />}
              </Flex>
            </InternalMenuItem>
          )
        })}
      </Dropdown>
    </Flex>
  )
}
