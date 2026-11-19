import { Flex, Text } from '@universe/mycelium'
import { useEffect, useState } from 'react'
import { colors } from 'ui/src/theme'
import { pad2, TABULAR_NUMBERS } from '~/features/Liquidity/PoolSwaps/swapTableCells'

const UPDATE_DOT_SIZE = 6
const TICK_MS = 1000
// Lands a tick safely past the second boundary, not a hair before it.
const TICK_SLACK_MS = 5

/** hh:mm:ss, local time. */
export function formatClock(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
}

/**
 * The current time, ticking every second, with a dot that flashes each time the swaps are read (updatedAt
 * changes), whether or not the read found new swaps. Its own component, so the per-second tick re-renders only this.
 */
export function LiveClock({ updatedAt }: { updatedAt: number }): JSX.Element {
  const [now, setNow] = useState(() => new Date())

  // Each tick is scheduled for just after the next whole second, so the shown second never repeats or skips the way a
  // drifting fixed interval's can.
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const tick = (): void => {
      const date = new Date()
      setNow(date)
      timeout = setTimeout(tick, TICK_MS - date.getMilliseconds() + TICK_SLACK_MS)
    }
    tick()
    return () => clearTimeout(timeout)
  }, [])

  return (
    <Flex row alignItems="center" gap="$spacing6">
      {/* Keyed on the read time: each read mounts a fresh dot, which replays the flash. */}
      {updatedAt > 0 && (
        <Flex
          key={updatedAt}
          className="pool-swaps-update-dot"
          width={UPDATE_DOT_SIZE}
          height={UPDATE_DOT_SIZE}
          borderRadius="$roundedFull"
          backgroundColor={colors.blueBase}
        />
      )}
      <Text variant="body3" color="$neutral2" style={TABULAR_NUMBERS}>
        {formatClock(now)}
      </Text>
    </Flex>
  )
}
