import { Button, Flex } from '@universe/mycelium'
import type { MenuOptionItem } from 'uniswap/src/components/menus/ContextMenu'

// One step below the smallest button size's 12px; Button's size presets don't go lower.
const LABEL_STYLE = { fontSize: 11 } as const

/** A card's liquidity actions as compact, uniformly secondary buttons. */
export function PositionCardActions({ options }: { options: (MenuOptionItem | undefined)[] }): JSX.Element | null {
  const shown = options.filter((option): option is MenuOptionItem => option !== undefined)
  if (shown.length === 0) {
    return null
  }
  return (
    <Flex row gap="$gap8" flexWrap="wrap">
      {shown.map((option) => (
        <Button
          key={option.label}
          size="xxsmall"
          emphasis="secondary"
          fill={false}
          px="$spacing6"
          py="$spacing4"
          onPress={option.onPress}
        >
          <Button.Text style={LABEL_STYLE}>{option.label}</Button.Text>
        </Button>
      ))}
    </Flex>
  )
}
