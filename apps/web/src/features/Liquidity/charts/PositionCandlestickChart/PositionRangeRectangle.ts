import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import { MismatchDirection } from 'lightweight-charts'
import type {
  MouseEventParams,
  IPrimitivePaneRenderer,
  PrimitiveHoveredItem,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from 'lightweight-charts'

export interface PositionRange {
  /** Position start, unix seconds; clamped to the first candle when older than the loaded data. */
  startTime: number
  priceLower: number
  priceUpper: number
  fillColor: string
  borderColor: string
  /** Brighter border while the pointer is over the box. */
  hoverBorderColor: string
  /** Drawn as if hovered, e.g. while its row is hovered in the position switcher. */
  highlighted?: boolean
  /** Makes the box clickable: a click on it reports this key. */
  selectKey?: string
}

interface Box {
  x1: number
  x2: number
  y1: number
  y2: number
  fillColor: string
  borderColor: string
  hoverBorderColor: string
  highlighted: boolean
  selectKey: string | undefined
}

/** The innermost box under a point, so a range nested in a wider one can still be picked out. */
function boxAt({ boxes, point }: { boxes: readonly Box[]; point: { x: number; y: number } }): Box | undefined {
  let hit: Box | undefined
  let hitArea = Infinity
  for (const box of boxes) {
    const top = Math.min(box.y1, box.y2)
    const bottom = Math.max(box.y1, box.y2)
    if (point.x < box.x1 || point.x > box.x2 || point.y < top || point.y > bottom) {
      continue
    }
    const area = (box.x2 - box.x1) * (bottom - top)
    if (area < hitArea) {
      hit = box
      hitArea = area
    }
  }
  return hit
}

class RectanglesRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly boxes: readonly Box[],
    private readonly hovered: Box | undefined,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio, bitmapSize }) => {
      for (const box of this.boxes) {
        const rawLeft = Math.round(box.x1 * horizontalPixelRatio)
        const rawRight = Math.round(box.x2 * horizontalPixelRatio)
        const rawTop = Math.round(Math.min(box.y1, box.y2) * verticalPixelRatio)
        const rawBottom = Math.round(Math.max(box.y1, box.y2) * verticalPixelRatio)
        // A wide range (full range above all) maps far off the pane; clamp so the canvas gets sane numbers.
        const left = Math.max(0, rawLeft)
        const right = Math.min(bitmapSize.width, rawRight)
        const top = Math.max(0, rawTop)
        const bottom = Math.min(bitmapSize.height, rawBottom)
        if (right <= left || bottom <= top) {
          continue
        }
        context.fillStyle = box.fillColor
        context.fillRect(left, top, right - left, bottom - top)

        // Outline only the sides that are on screen: a side cut off by the pane edge isn't the range's bound, and
        // stroking it there would draw a border the range doesn't have.
        const isHovered = box === this.hovered || box.highlighted
        context.strokeStyle = isHovered ? box.hoverBorderColor : box.borderColor
        context.lineWidth = Math.max(1, Math.round(horizontalPixelRatio))
        context.beginPath()
        if (rawTop >= 0) {
          context.moveTo(left, top)
          context.lineTo(right, top)
        }
        if (rawBottom <= bitmapSize.height) {
          context.moveTo(left, bottom)
          context.lineTo(right, bottom)
        }
        if (rawLeft >= 0) {
          context.moveTo(left, top)
          context.lineTo(left, bottom)
        }
        if (rawRight <= bitmapSize.width) {
          context.moveTo(right, top)
          context.lineTo(right, bottom)
        }
        context.stroke()
      }
    })
  }
}

/**
 * Draws positions as boxes: from each one's start to the latest candle, between its min and max price; later ranges
 * paint over earlier ones. The end is read off the series on every redraw, so the boxes follow each new candle,
 * whether a refetch or the live price added it.
 */
export class PositionRangeRectangle implements ISeriesPrimitive<Time> {
  private attachedParams: SeriesAttachedParameter<Time> | undefined
  private ranges: readonly PositionRange[] = []
  private candleTimes: number[] = []
  private boxes: Box[] = []
  private hoverPoint: { x: number; y: number } | undefined
  private onSelect: ((key: string) => void) | undefined

  private readonly onClick = (event: MouseEventParams<Time>): void => {
    const key = event.point ? boxAt({ boxes: this.boxes, point: event.point })?.selectKey : undefined
    if (key !== undefined) {
      this.onSelect?.(key)
    }
  }

  private readonly onCrosshairMove = (event: MouseEventParams<Time>): void => {
    const point = event.point
    const before = this.hoverPoint ? boxAt({ boxes: this.boxes, point: this.hoverPoint }) : undefined
    this.hoverPoint = point ? { x: point.x, y: point.y } : undefined
    const after = this.hoverPoint ? boxAt({ boxes: this.boxes, point: this.hoverPoint }) : undefined
    if (before !== after) {
      this.attachedParams?.requestUpdate()
    }
  }

  private readonly paneView: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () =>
      new RectanglesRenderer(
        this.boxes,
        this.hoverPoint ? boxAt({ boxes: this.boxes, point: this.hoverPoint }) : undefined,
      ),
  }

  attached(params: SeriesAttachedParameter<Time>): void {
    this.attachedParams = params
    params.chart.subscribeCrosshairMove(this.onCrosshairMove)
    params.chart.subscribeClick(this.onClick)
  }

  detached(): void {
    this.attachedParams?.chart.unsubscribeCrosshairMove(this.onCrosshairMove)
    this.attachedParams?.chart.unsubscribeClick(this.onClick)
    this.attachedParams = undefined
  }

  setData({
    ranges,
    candleTimes,
    onSelect,
  }: {
    ranges: readonly PositionRange[]
    candleTimes: number[]
    /** Called with a clicked box's selectKey. */
    onSelect?: (key: string) => void
  }): void {
    this.ranges = ranges
    this.onSelect = onSelect
    this.candleTimes = candleTimes
    this.attachedParams?.requestUpdate()
  }

  updateAllViews(): void {
    const params = this.attachedParams
    const { ranges, candleTimes } = this
    this.boxes = []
    if (!params || ranges.length === 0 || candleTimes.length === 0) {
      return
    }
    const latest = params.series.dataByIndex(Number.MAX_SAFE_INTEGER, MismatchDirection.NearestLeft)
    if (!latest) {
      return
    }
    const lastTime = Number(latest.time)
    const timeScale = params.chart.timeScale()
    const x2 = timeScale.timeToCoordinate(lastTime as UTCTimestamp)
    if (x2 === null) {
      return
    }
    const halfBar = timeScale.options().barSpacing / 2
    for (const range of ranges) {
      if (range.startTime > lastTime) {
        continue
      }
      // The time scale only maps times it has bars for, so snap the start to the first candle at or after it; a
      // position younger than the loaded candles starts on the live one.
      const startCandle = candleTimes.find((time) => time >= range.startTime) ?? lastTime
      const x1 = timeScale.timeToCoordinate(startCandle as UTCTimestamp)
      const y1 = params.series.priceToCoordinate(range.priceUpper)
      const y2 = params.series.priceToCoordinate(range.priceLower)
      if (x1 === null || y1 === null || y2 === null) {
        continue
      }
      this.boxes.push({
        x1: x1 - halfBar,
        x2: x2 + halfBar,
        y1,
        y2,
        fillColor: range.fillColor,
        borderColor: range.borderColor,
        hoverBorderColor: range.hoverBorderColor,
        highlighted: range.highlighted ?? false,
        selectKey: range.selectKey,
      })
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView]
  }

  /** The chart asks this on each pointer move; a clickable box under the pointer gets a pointer cursor. */
  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const selectKey = boxAt({ boxes: this.boxes, point: { x, y } })?.selectKey
    return selectKey === undefined
      ? null
      : { externalId: selectKey, zOrder: 'bottom', cursorStyle: 'pointer', hitTestPriority: 0 }
  }
}
