"use client";

import { scaleTime } from "d3-scale";
import { bisector } from "d3-array";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ParentSize } from "@/lib/charts/primitives";
import { formatDateShort } from "@/lib/utils/formatDate";
import {
  ChartTooltipCard,
  niceTimeTicks,
  type Margin,
  type TooltipRow,
} from "@/components/ui/area-chart";

/**
 * ChartStack — one cursor, one card, one axis for a column of strips.
 *
 * The chart-consistency round (05-09-2026) found four hand-rolled copies of the
 * same device: a KPI rail beside a stack of 92px strips that share ONE hover
 * index and ONE card. The owner kept that anatomy (pick B) and asked that every
 * strip become the dashboard instrument, so the stack needs a controller that
 * the instrument did not have: something that owns the hovered bucket, tells
 * every member chart about it (AreaChart's `hoverIndex`/`onHoverChange`), draws
 * the dashboard's card once at the hovered bucket's x, and draws the shared
 * x-axis row in the instrument's chrome. Hand-rolled members (bar strips that
 * the instrument cannot express) read the same scale and index through
 * `useChartStack` and draw the exported crosshair themselves.
 *
 * Geometry contract: every member's plot spans the stack's width minus
 * `railWidth`, with the same `margin` — so the stack's own time scale IS each
 * member's x scale, and the card lands on the datum every strip is showing.
 */

export interface ChartStackContextValue {
  data: Record<string, unknown>[];
  xAccessor: (d: Record<string, unknown>) => Date;
  margin: Margin;
  railWidth: number;
  /** Width of the plot column (stack width − railWidth). */
  plotWidth: number;
  /** plotWidth − margin.left − margin.right. */
  innerWidth: number;
  xScale: ReturnType<typeof scaleTime<number>>;
  hoverIndex: number | null;
  setHoverIndex: (index: number | null) => void;
  /** Snap a plot-local pixel x (inside the margin) to the nearest bucket. */
  resolveIndex: (pixelX: number) => number | null;
}

const ChartStackContext = createContext<ChartStackContextValue | null>(null);

export function useChartStack(): ChartStackContextValue {
  const ctx = useContext(ChartStackContext);
  if (!ctx) {
    throw new Error("useChartStack must be used inside <ChartStack>.");
  }
  return ctx;
}

export interface ChartStackProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  /** The members' plot margin. Compact strips typically {top: 8, right: 16, bottom: 6, left: 44}. */
  margin: Margin;
  /**
   * Pixel width of the rail column to the left of every plot. Optional when
   * the rail carries `data-chart-stack-rail` — the stack then measures it, so
   * a responsive rail (w-40 sm:w-48) stays in step with the plots.
   */
  railWidth?: number;
  /** Card header for the hovered bucket (the bucket's identity). */
  title: (point: Record<string, unknown>, index: number) => ReactNode;
  /** Card rows for the hovered bucket — one per visible strip. */
  rows: (point: Record<string, unknown>, index: number) => TooltipRow[];
  /** Card pin, in stack pixels from the top. */
  cardTop?: number;
  className?: string;
  children: ReactNode;
}

export function ChartStack({
  data,
  xDataKey = "date",
  margin,
  railWidth: railWidthProp,
  title,
  rows,
  cardTop = 12,
  className = "",
  children,
}: ChartStackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverIndex, setHoverIndexState] = useState<number | null>(null);
  const [measuredRail, setMeasuredRail] = useState<number | null>(null);

  // Same-index calls are no-ops at the state layer already; this keeps the
  // callback identity stable so member charts do not re-bind handlers.
  const setHoverIndex = useCallback((index: number | null) => {
    setHoverIndexState((prev) => (prev === index ? prev : index));
  }, []);

  const xAccessor = useCallback(
    (d: Record<string, unknown>): Date => {
      const v = d[xDataKey];
      return v instanceof Date ? v : new Date(v as string | number);
    },
    [xDataKey]
  );

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <StackInner
            containerHeight={height}
            containerRef={containerRef}
            containerWidth={width}
            data={data}
            hoverIndex={hoverIndex}
            margin={margin}
            onMeasureRail={setMeasuredRail}
            railWidth={measuredRail ?? railWidthProp ?? 0}
            rows={rows}
            setHoverIndex={setHoverIndex}
            title={title}
            cardTop={cardTop}
            xAccessor={xAccessor}
          >
            {children}
          </StackInner>
        )}
      </ParentSize>
    </div>
  );
}

interface StackInnerProps {
  containerWidth: number;
  containerHeight: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  data: Record<string, unknown>[];
  xAccessor: (d: Record<string, unknown>) => Date;
  margin: Margin;
  railWidth: number;
  hoverIndex: number | null;
  setHoverIndex: (index: number | null) => void;
  onMeasureRail: (width: number | null) => void;
  title: ChartStackProps["title"];
  rows: ChartStackProps["rows"];
  cardTop: number;
  children: ReactNode;
}

function StackInner({
  containerWidth,
  containerHeight,
  containerRef,
  data,
  xAccessor,
  margin,
  railWidth,
  hoverIndex,
  setHoverIndex,
  onMeasureRail,
  title,
  rows,
  cardTop,
  children,
}: StackInnerProps) {
  // The rail is measured, not declared: `w-40 sm:w-48` is 160 or 192px
  // depending on the viewport, and the card's x must add the real one.
  useLayoutEffect(() => {
    const rail = containerRef.current?.querySelector<HTMLElement>("[data-chart-stack-rail]");
    onMeasureRail(rail ? rail.getBoundingClientRect().width : null);
  }, [containerRef, containerWidth, onMeasureRail]);

  const plotWidth = Math.max(0, containerWidth - railWidth);
  const innerWidth = Math.max(0, plotWidth - margin.left - margin.right);

  const xScale = useMemo(() => {
    const times = data.map((d) => xAccessor(d).getTime());
    const min = times.length ? Math.min(...times) : 0;
    const max = times.length ? Math.max(...times) : 1;
    return scaleTime<number>().range([0, innerWidth]).domain([min, max]);
  }, [data, xAccessor, innerWidth]);

  const bisectDate = useMemo(
    () => bisector<Record<string, unknown>, Date>((d) => xAccessor(d)).left,
    [xAccessor]
  );

  // The instrument's own snap rule, for hand-rolled members: nearest bucket
  // in TIME, raw pixel discarded.
  const resolveIndex = useCallback(
    (pixelX: number): number | null => {
      if (!data.length) return null;
      const x0 = xScale.invert(pixelX);
      const index = bisectDate(data, x0, 1);
      const d0 = data[index - 1];
      const d1 = data[index];
      if (!d0) return 0;
      if (d1) {
        const t0 = xAccessor(d0).getTime();
        const t1 = xAccessor(d1).getTime();
        if (x0.getTime() - t0 > t1 - x0.getTime()) return index;
      }
      return index - 1;
    },
    [data, xScale, bisectDate, xAccessor]
  );

  const value = useMemo<ChartStackContextValue>(
    () => ({
      data,
      xAccessor,
      margin,
      railWidth,
      plotWidth,
      innerWidth,
      xScale,
      hoverIndex,
      setHoverIndex,
      resolveIndex,
    }),
    [data, xAccessor, margin, railWidth, plotWidth, innerWidth, xScale, hoverIndex, setHoverIndex, resolveIndex]
  );

  const hovered = hoverIndex != null ? data[hoverIndex] : undefined;
  const cardX =
    hovered !== undefined ? railWidth + margin.left + (xScale(xAccessor(hovered)) ?? 0) : 0;

  return (
    <ChartStackContext.Provider value={value}>
      {children}
      <ChartTooltipCard
        containerHeight={containerHeight}
        containerRef={containerRef}
        containerWidth={containerWidth}
        rows={hovered !== undefined && hoverIndex != null ? rows(hovered, hoverIndex) : []}
        title={hovered !== undefined && hoverIndex != null ? title(hovered, hoverIndex) : undefined}
        top={cardTop}
        visible={hovered !== undefined}
        x={cardX}
      />
    </ChartStackContext.Provider>
  );
}

// ─── ChartStackAxis ──────────────────────────────────────────────────────────

export interface ChartStackAxisProps {
  numTicks?: number;
  formatLabel?: (date: Date) => string;
  /**
   * "nice" (default): nice-step ticks from niceTimeTicks — the instrument's
   * rule for calendar buckets. "buckets": ticks ON bucket dates, subsampled to
   * the budget — for rolled-up series (weeks, months) where a nice calendar
   * step would label instants no bucket starts on.
   */
  ticks?: "nice" | "buckets";
  className?: string;
}

/**
 * The shared x-axis row for a stack: the instrument's HTML axis chrome
 * (`text-xs text-neutral-500`, nice-step ticks, uniform by construction),
 * laid out on the stack's own scale so it agrees with every member. Render
 * it in the plot column (after the rail spacer); it fills its holder.
 */
export function ChartStackAxis({ numTicks = 10, formatLabel, ticks = "nice", className = "" }: ChartStackAxisProps) {
  const { xScale, margin, innerWidth, hoverIndex, data, xAccessor } = useChartStack();

  const labels = useMemo(() => {
    const [start, end] = xScale.domain();
    if (!(start && end) || innerWidth <= 0) return [];
    const budget = Math.max(2, Math.min(numTicks, Math.floor(innerWidth / 80)));
    const fmt = formatLabel ?? ((d: Date) => formatDateShort(d));
    let dates: Date[];
    if (ticks === "buckets") {
      const all = data.map((d) => xAccessor(d));
      const stride = Math.max(1, Math.ceil((all.length - 1) / Math.max(1, budget - 1)));
      dates = all.filter((_, i) => i % stride === 0);
    } else {
      dates = niceTimeTicks(start.getTime(), end.getTime(), budget);
    }
    return dates.map((date) => ({
      key: date.getTime(),
      x: margin.left + (xScale(date) ?? 0),
      label: fmt(date),
    }));
  }, [xScale, innerWidth, numTicks, formatLabel, margin.left, ticks, data, xAccessor]);

  const hovered = hoverIndex != null ? data[hoverIndex] : undefined;
  const crosshairX = hovered !== undefined ? margin.left + (xScale(xAccessor(hovered)) ?? 0) : null;

  return (
    <div className={`pointer-events-none relative h-7 ${className}`}>
      {labels.map((l) => {
        // Same fade rule as the instrument's XAxis: labels within 50px of the
        // crosshair step out of the way (20px ramp).
        let opacity = 1;
        if (crosshairX !== null) {
          const dist = Math.abs(l.x - crosshairX);
          opacity = dist < 50 ? 0 : dist < 70 ? (dist - 50) / 20 : 1;
        }
        return (
          <div
            className="absolute flex justify-center"
            key={l.key}
            style={{ left: l.x, top: 6, width: 0 }}
          >
            <span
              className="whitespace-nowrap text-neutral-500 text-xs"
              style={{ opacity, transition: "opacity 400ms var(--ease-apple)" }}
            >
              {l.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

ChartStackAxis.displayName = "ChartStackAxis";
