import { Flex, Text } from '@universe/mycelium'
import { CheckboxCompat as Checkbox } from '@universe/mycelium/checkbox-compat'
import { MouseoverTooltip } from '~/components/Tooltip'
import { useAutoSwitchPositionStore } from '~/features/Liquidity/hooks/useAutoSwitchPosition'

/** The position page's auto-switch option (see useAutoSwitchPosition); remembered across visits. */
export function AutoSwitchToggle(): JSX.Element {
  const isEnabled = useAutoSwitchPositionStore((state) => state.isEnabled)
  const setEnabled = useAutoSwitchPositionStore((state) => state.setEnabled)

  return (
    <MouseoverTooltip
      text="When this position goes out of range, switch to the owner’s in-range position closest to it by id"
      placement="bottom"
    >
      <Flex row alignItems="center" gap="$spacing6">
        <Checkbox size="$icon.16" checked={isEnabled} onPress={() => setEnabled(!isEnabled)} />
        {/* The label toggles too; only one element handles each click, so it never flips twice. */}
        <Text
          variant="body3"
          color="$neutral2"
          userSelect="none"
          cursor="pointer"
          onPress={() => setEnabled(!isEnabled)}
        >
          Auto-switch
        </Text>
      </Flex>
    </MouseoverTooltip>
  )
}
