import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IPrimitivePaneRenderer,
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
}

interface Box {
  x1: number
  x2: number
  y1: number
  y2: number
}

class RectangleRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly box: Box | null,
    private readonly range: PositionRange | undefined,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { box, range } = this
    if (!box || !range) {
      return
    }
    target.useBitmapCoordinateSpace(({ context, horizontalPixelRatio, verticalPixelRatio, bitmapSize }) => {
      const left = Math.max(0, Math.round(box.x1 * horizontalPixelRatio))
      const right = Math.min(bitmapSize.width, Math.round(box.x2 * horizontalPixelRatio))
      const top = Math.round(Math.min(box.y1, box.y2) * verticalPixelRatio)
      const bottom = Math.round(Math.max(box.y1, box.y2) * verticalPixelRatio)
      if (right <= left) {
        return
      }
      context.fillStyle = range.fillColor
      context.fillRect(left, top, right - left, Math.max(1, bottom - top))
      context.strokeStyle = range.borderColor
      context.lineWidth = Math.max(1, Math.round(horizontalPixelRatio))
      context.strokeRect(left, top, right - left, Math.max(1, bottom - top))
    })
  }
}

/** Draws the position as a box: from its start to the latest candle, between its min and max price. */
export class PositionRangeRectangle implements ISeriesPrimitive<Time> {
  private attachedParams: SeriesAttachedParameter<Time> | undefined
  private range: PositionRange | undefined
  private candleTimes: number[] = []
  private box: Box | null = null

  private readonly paneView: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => new RectangleRenderer(this.box, this.range),
  }

  attached(params: SeriesAttachedParameter<Time>): void {
    this.attachedParams = params
  }

  detached(): void {
    this.attachedParams = undefined
  }

  setData({ range, candleTimes }: { range: PositionRange | undefined; candleTimes: number[] }): void {
    this.range = range
    this.candleTimes = candleTimes
    this.attachedParams?.requestUpdate()
  }

  /** Extends the box to a candle opened after the last data load. */
  extendTo(time: number): void {
    if (this.candleTimes.length > 0 && time > this.candleTimes[this.candleTimes.length - 1]) {
      this.candleTimes = [...this.candleTimes, time]
      this.attachedParams?.requestUpdate()
    }
  }

  updateAllViews(): void {
    const params = this.attachedParams
    const { range, candleTimes } = this
    this.box = null
    if (!params || !range || candleTimes.length === 0) {
      return
    }
    const lastTime = candleTimes[candleTimes.length - 1]
    if (range.startTime > lastTime) {
      return
    }
    // The time scale only maps times it has bars for, so snap the start to the first candle at or after it.
    const startCandle = candleTimes.find((time) => time >= range.startTime) ?? candleTimes[0]
    const timeScale = params.chart.timeScale()
    const x1 = timeScale.timeToCoordinate(startCandle as UTCTimestamp)
    const x2 = timeScale.timeToCoordinate(lastTime as UTCTimestamp)
    const y1 = params.series.priceToCoordinate(range.priceUpper)
    const y2 = params.series.priceToCoordinate(range.priceLower)
    if (x1 === null || x2 === null || y1 === null || y2 === null) {
      return
    }
    const halfBar = timeScale.options().barSpacing / 2
    this.box = { x1: x1 - halfBar, x2: x2 + halfBar, y1, y2 }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView]
  }
}
