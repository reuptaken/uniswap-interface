import type { CanvasRenderingTarget2D } from 'fancy-canvas'
import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from 'lightweight-charts'

/** A stretch of prices with constant active liquidity: between two neighbouring initialized ticks. */
export interface LiquiditySegment {
  /** The tick the stretch starts at (its lower end in pool terms). */
  tick: number
  priceFrom: number
  priceTo: number
  liquidity: number
}

interface Bar {
  y1: number
  y2: number
  liquidity: number
}

// The widest bar, as a share of the pane: wide enough to read, narrow enough to leave the candles clear.
const MAX_WIDTH_SHARE = 0.18

class LiquidityDepthRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly bars: readonly Bar[],
    private readonly color: string,
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace(({ context, verticalPixelRatio, bitmapSize }) => {
      // Scaled to the deepest bar on screen, so the shape near the price stays readable however deep the pool is
      // far away from it.
      const visible = this.bars.filter((bar) => {
        const top = Math.min(bar.y1, bar.y2) * verticalPixelRatio
        const bottom = Math.max(bar.y1, bar.y2) * verticalPixelRatio
        return bottom >= 0 && top <= bitmapSize.height
      })
      const deepest = Math.max(0, ...visible.map((bar) => bar.liquidity))
      if (deepest <= 0) {
        return
      }
      const maxWidth = bitmapSize.width * MAX_WIDTH_SHARE
      context.fillStyle = this.color
      for (const bar of visible) {
        const width = Math.round((bar.liquidity / deepest) * maxWidth)
        const top = Math.max(0, Math.round(Math.min(bar.y1, bar.y2) * verticalPixelRatio))
        const bottom = Math.min(bitmapSize.height, Math.round(Math.max(bar.y1, bar.y2) * verticalPixelRatio))
        if (width > 0) {
          context.fillRect(bitmapSize.width - width, top, width, Math.max(1, bottom - top))
        }
      }
    })
  }
}

/**
 * The pool's liquidity by price, as faint horizontal bars along the chart's right edge: where the depth sits relative
 * to the candles and the position's range, on the same price scale.
 */
export class LiquidityDepthPrimitive implements ISeriesPrimitive<Time> {
  private attachedParams: SeriesAttachedParameter<Time> | undefined
  private segments: readonly LiquiditySegment[] = []
  private color = 'transparent'
  private bars: Bar[] = []

  private readonly paneView: IPrimitivePaneView = {
    zOrder: () => 'bottom',
    renderer: () => new LiquidityDepthRenderer(this.bars, this.color),
  }

  attached(params: SeriesAttachedParameter<Time>): void {
    this.attachedParams = params
  }

  detached(): void {
    this.attachedParams = undefined
  }

  setData({ segments, color }: { segments: readonly LiquiditySegment[]; color: string }): void {
    this.segments = segments
    this.color = color
    this.attachedParams?.requestUpdate()
  }

  updateAllViews(): void {
    const series = this.attachedParams?.series
    this.bars = []
    if (!series) {
      return
    }
    for (const segment of this.segments) {
      const y1 = series.priceToCoordinate(segment.priceFrom)
      const y2 = series.priceToCoordinate(segment.priceTo)
      if (y1 !== null && y2 !== null && segment.liquidity > 0) {
        this.bars.push({ y1, y2, liquidity: segment.liquidity })
      }
    }
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView]
  }
}
