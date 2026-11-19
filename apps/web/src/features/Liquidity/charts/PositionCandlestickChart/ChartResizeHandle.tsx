import { Flex } from '@universe/mycelium'
import { useEffect, useRef } from 'react'
import { clampChartHeight } from '~/features/Liquidity/charts/PositionCandlestickChart/chartPreferencesStore'

const HANDLE_HEIGHT = 12
const GRIP_WIDTH = 40
const GRIP_HEIGHT = 4

/**
 * The grip on the chart's bottom edge (straddling it, taking no layout space): drag it up or down to change the chart's height. Reports each step while dragging
 * (onDrag) and the final height on release (onDragEnd), so the caller can keep moves local and save only the result.
 */
export function ChartResizeHandle({
  height,
  onDrag,
  onDragEnd,
}: {
  height: number
  onDrag: (height: number) => void
  onDragEnd: (height: number) => void
}): JSX.Element {
  const handleRef = useRef<HTMLDivElement>(null)
  // The latest values for the listeners, which are attached once.
  const latest = useRef({ height, onDrag, onDragEnd })
  latest.current = { height, onDrag, onDragEnd }

  useEffect(() => {
    const handle = handleRef.current
    if (!handle) {
      return undefined
    }
    let detach: (() => void) | undefined

    const onPointerDown = (down: PointerEvent): void => {
      down.preventDefault()
      const startY = down.clientY
      const startHeight = latest.current.height
      const heightAt = (event: PointerEvent): number => clampChartHeight(startHeight + event.clientY - startY)
      const previousCursor = document.body.style.cursor
      const previousUserSelect = document.body.style.userSelect
      // Keep the resize cursor and stop text selection while the pointer is anywhere on the page.
      document.body.style.cursor = 'row-resize'
      document.body.style.userSelect = 'none'

      const onMove = (event: PointerEvent): void => latest.current.onDrag(heightAt(event))
      const onUp = (event: PointerEvent): void => {
        detach?.()
        latest.current.onDragEnd(heightAt(event))
      }
      detach = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
        document.body.style.cursor = previousCursor
        document.body.style.userSelect = previousUserSelect
        detach = undefined
      }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
    }

    // Pointer-down's preventDefault doesn't stop the mouse-down that starts a text selection; this does.
    const onMouseDown = (event: MouseEvent): void => event.preventDefault()
    handle.addEventListener('pointerdown', onPointerDown)
    handle.addEventListener('mousedown', onMouseDown)
    return () => {
      handle.removeEventListener('pointerdown', onPointerDown)
      handle.removeEventListener('mousedown', onMouseDown)
      detach?.()
    }
  }, [])

  return (
    <Flex
      ref={handleRef}
      position="absolute"
      left={0}
      right={0}
      bottom={-HANDLE_HEIGHT / 2}
      zIndex={1}
      height={HANDLE_HEIGHT}
      centered
      cursor="row-resize"
      userSelect="none"
      group
      aria-label="Drag to resize the chart"
    >
      <Flex
        width={GRIP_WIDTH}
        height={GRIP_HEIGHT}
        borderRadius="$roundedFull"
        backgroundColor="$surface3"
        $group-hover={{ backgroundColor: '$neutral3' }}
      />
    </Flex>
  )
}
