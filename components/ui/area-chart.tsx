"use client";

import { curveMonotoneX } from "d3-shape";
import { scaleLinear, scaleTime } from "d3-scale";
import type { ScaleBand } from "d3-scale";
import { localPoint, AreaClosed, LinePath, GridColumns, GridRows, ParentSize } from "@/lib/charts/primitives";
import { formatDateShort, formatDateFull } from "@/lib/utils/formatDate";
import { bisector } from "d3-array";
import { motion, useSpring } from "framer-motion";
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactElement,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { SPRING, TIMING, EASE_APPLE, DURATION_FAST, DURATION_SLOW } from "@/lib/motion";

// ─── Utils ───────────────────────────────────────────────────────────────────

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Chart Context ───────────────────────────────────────────────────────────

// biome-ignore lint/suspicious/noExplicitAny: d3 curve factory type
type CurveFactory = any;

type ScaleLinearType<Output, _Input = number> = ReturnType<
  typeof scaleLinear<Output>
>;
type ScaleTimeType<Output, _Input = Date | number> = ReturnType<
  typeof scaleTime<Output>
>;
type ScaleBandType<Domain extends { toString(): string }> = ScaleBand<Domain>;

export const chartCssVars = {
  background: "var(--chart-background)",
  foreground: "var(--chart-foreground)",
  foregroundMuted: "var(--chart-foreground-muted)",
  label: "var(--chart-label)",
  linePrimary: "var(--chart-line-primary)",
  lineSecondary: "var(--chart-line-secondary)",
  crosshair: "var(--chart-crosshair)",
  grid: "var(--chart-grid)",
  indicatorColor: "var(--chart-indicator-color)",
  indicatorSecondaryColor: "var(--chart-indicator-secondary-color)",
  markerBackground: "var(--chart-marker-background)",
  markerBorder: "var(--chart-marker-border)",
  markerForeground: "var(--chart-marker-foreground)",
  badgeBackground: "var(--chart-marker-badge-background)",
  badgeForeground: "var(--chart-marker-badge-foreground)",
  segmentBackground: "var(--chart-segment-background)",
  segmentLine: "var(--chart-segment-line)",
};

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface TooltipData {
  point: Record<string, unknown>;
  index: number;
  x: number;
  yPositions: Record<string, number>;
  xPositions?: Record<string, number>;
}

export interface LineConfig {
  dataKey: string;
  stroke: string;
  strokeWidth: number;
  // Mirrors the Area's own missingAsZero so the tooltip layer anchors a
  // missing bucket exactly where the line plots it — see
  // resolveTooltipYPositions.
  missingAsZero: boolean;
}

export interface ChartSelection {
  startX: number;
  endX: number;
  startIndex: number;
  endIndex: number;
  active: boolean;
}

export interface ChartContextValue {
  data: Record<string, unknown>[];
  xScale: ScaleTimeType<number, number>;
  yScale: ScaleLinearType<number, number>;
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margin: Margin;
  columnWidth: number;
  tooltipData: TooltipData | null;
  setTooltipData: Dispatch<SetStateAction<TooltipData | null>>;
  containerRef: RefObject<HTMLDivElement | null>;
  lines: LineConfig[];
  isLoaded: boolean;
  animationDuration: number;
  xAccessor: (d: Record<string, unknown>) => Date;
  dateLabels: string[];
  selection?: ChartSelection | null;
  clearSelection?: () => void;
  barScale?: ScaleBandType<string>;
  bandWidth?: number;
  hoveredBarIndex?: number | null;
  setHoveredBarIndex?: (index: number | null) => void;
  barXAccessor?: (d: Record<string, unknown>) => string;
  orientation?: "vertical" | "horizontal";
  stacked?: boolean;
  stackOffsets?: Map<number, Map<string, number>>;
  // Nice y-axis tick values, computed ONCE with the domain (niceYDomain) so
  // Grid and YAxis always draw the same human-step lines.
  yTickValues?: number[];
}

const ChartContext = createContext<ChartContextValue | null>(null);

function ChartProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ChartContextValue;
}) {
  return (
    <ChartContext.Provider value={value}>{children}</ChartContext.Provider>
  );
}

function useChart(): ChartContextValue {
  const context = useContext(ChartContext);
  if (!context) {
    throw new Error(
      "useChart must be used within a ChartProvider. " +
        "Make sure your component is wrapped in <AreaChart>."
    );
  }
  return context;
}

// ─── useChartInteraction ─────────────────────────────────────────────────────

type ScaleTime = ReturnType<typeof scaleTime<number>>;
type ScaleLinear = ReturnType<typeof scaleLinear<number>>;

interface UseChartInteractionParams {
  xScale: ScaleTime;
  yScale: ScaleLinear;
  data: Record<string, unknown>[];
  lines: LineConfig[];
  margin: Margin;
  xAccessor: (d: Record<string, unknown>) => Date;
  bisectDate: (
    data: Record<string, unknown>[],
    date: Date,
    lo: number
  ) => number;
  canInteract: boolean;
}

interface ChartInteractionResult {
  tooltipData: TooltipData | null;
  setTooltipData: Dispatch<SetStateAction<TooltipData | null>>;
  selection: ChartSelection | null;
  clearSelection: () => void;
  interactionHandlers: {
    onMouseMove?: (event: React.MouseEvent<SVGGElement>) => void;
    onMouseLeave?: () => void;
    onMouseDown?: (event: React.MouseEvent<SVGGElement>) => void;
    onMouseUp?: () => void;
    onTouchStart?: (event: React.TouchEvent<SVGGElement>) => void;
    onTouchMove?: (event: React.TouchEvent<SVGGElement>) => void;
    onTouchEnd?: () => void;
  };
  interactionStyle: React.CSSProperties;
}

function useChartInteraction({
  xScale,
  yScale,
  data,
  lines,
  margin,
  xAccessor,
  bisectDate,
  canInteract,
}: UseChartInteractionParams): ChartInteractionResult {
  const [tooltipData, setTooltipData] = useState<TooltipData | null>(null);
  const [selection, setSelection] = useState<ChartSelection | null>(null);

  const isDraggingRef = useRef(false);
  const dragStartXRef = useRef<number>(0);

  // The tooltip target only ever changes when the pointer crosses into the
  // next bucket's half — same index and same snapped x means the identical
  // object stays, so nothing downstream (crosshair, dot, card, highlight
  // segment) re-renders mid-bucket. This is what makes the cursor stick.
  const applyTooltip = useCallback((tooltip: TooltipData) => {
    setTooltipData((prev) =>
      prev && prev.index === tooltip.index && prev.x === tooltip.x
        ? prev
        : tooltip
    );
  }, []);

  const resolveTooltipFromX = useCallback(
    (pixelX: number): TooltipData | null => {
      const x0 = xScale.invert(pixelX);
      const index = bisectDate(data, x0, 1);
      const d0 = data[index - 1];
      const d1 = data[index];

      if (!d0) {
        return null;
      }

      let d = d0;
      let finalIndex = index - 1;
      if (d1) {
        const d0Time = xAccessor(d0).getTime();
        const d1Time = xAccessor(d1).getTime();
        if (x0.getTime() - d0Time > d1Time - x0.getTime()) {
          d = d1;
          finalIndex = index;
        }
      }

      const yPositions = resolveTooltipYPositions(d, lines, yScale);

      return {
        point: d,
        index: finalIndex,
        x: xScale(xAccessor(d)) ?? 0,
        yPositions,
      };
    },
    [xScale, yScale, data, lines, xAccessor, bisectDate]
  );

  const resolveIndexFromX = useCallback(
    (pixelX: number): number => {
      const x0 = xScale.invert(pixelX);
      const index = bisectDate(data, x0, 1);
      const d0 = data[index - 1];
      const d1 = data[index];
      if (!d0) {
        return 0;
      }
      if (d1) {
        const d0Time = xAccessor(d0).getTime();
        const d1Time = xAccessor(d1).getTime();
        if (x0.getTime() - d0Time > d1Time - x0.getTime()) {
          return index;
        }
      }
      return index - 1;
    },
    [xScale, data, xAccessor, bisectDate]
  );

  const getChartX = useCallback(
    (
      event: React.MouseEvent<SVGGElement> | React.TouchEvent<SVGGElement>,
      touchIndex = 0
    ): number | null => {
      let point: { x: number; y: number } | null = null;

      if ("touches" in event) {
        const touch = event.touches[touchIndex];
        if (!touch) {
          return null;
        }
        const svg = event.currentTarget.ownerSVGElement;
        if (!svg) {
          return null;
        }
        point = localPoint(svg, touch as unknown as MouseEvent);
      } else {
        point = localPoint(event);
      }

      if (!point) {
        return null;
      }
      return point.x - margin.left;
    },
    [margin.left]
  );

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGGElement>) => {
      const chartX = getChartX(event);
      if (chartX === null) {
        return;
      }

      if (isDraggingRef.current) {
        const startX = Math.min(dragStartXRef.current, chartX);
        const endX = Math.max(dragStartXRef.current, chartX);
        setSelection({
          startX,
          endX,
          startIndex: resolveIndexFromX(startX),
          endIndex: resolveIndexFromX(endX),
          active: true,
        });
        return;
      }

      const tooltip = resolveTooltipFromX(chartX);
      if (tooltip) {
        applyTooltip(tooltip);
      }
    },
    [getChartX, resolveTooltipFromX, resolveIndexFromX, applyTooltip]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipData(null);
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
    setSelection(null);
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<SVGGElement>) => {
      const chartX = getChartX(event);
      if (chartX === null) {
        return;
      }
      isDraggingRef.current = true;
      dragStartXRef.current = chartX;
      setTooltipData(null);
      setSelection(null);
    },
    [getChartX]
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
    }
    setSelection(null);
  }, []);

  const handleTouchStart = useCallback(
    (event: React.TouchEvent<SVGGElement>) => {
      if (event.touches.length === 1) {
        event.preventDefault();
        const chartX = getChartX(event, 0);
        if (chartX === null) {
          return;
        }
        const tooltip = resolveTooltipFromX(chartX);
        if (tooltip) {
          applyTooltip(tooltip);
        }
      } else if (event.touches.length === 2) {
        event.preventDefault();
        setTooltipData(null);
        const x0 = getChartX(event, 0);
        const x1 = getChartX(event, 1);
        if (x0 === null || x1 === null) {
          return;
        }
        const startX = Math.min(x0, x1);
        const endX = Math.max(x0, x1);
        setSelection({
          startX,
          endX,
          startIndex: resolveIndexFromX(startX),
          endIndex: resolveIndexFromX(endX),
          active: true,
        });
      }
    },
    [getChartX, resolveTooltipFromX, resolveIndexFromX, applyTooltip]
  );

  const handleTouchMove = useCallback(
    (event: React.TouchEvent<SVGGElement>) => {
      if (event.touches.length === 1) {
        event.preventDefault();
        const chartX = getChartX(event, 0);
        if (chartX === null) {
          return;
        }
        const tooltip = resolveTooltipFromX(chartX);
        if (tooltip) {
          applyTooltip(tooltip);
        }
      } else if (event.touches.length === 2) {
        event.preventDefault();
        const x0 = getChartX(event, 0);
        const x1 = getChartX(event, 1);
        if (x0 === null || x1 === null) {
          return;
        }
        const startX = Math.min(x0, x1);
        const endX = Math.max(x0, x1);
        setSelection({
          startX,
          endX,
          startIndex: resolveIndexFromX(startX),
          endIndex: resolveIndexFromX(endX),
          active: true,
        });
      }
    },
    [getChartX, resolveTooltipFromX, resolveIndexFromX, applyTooltip]
  );

  const handleTouchEnd = useCallback(() => {
    setTooltipData(null);
    setSelection(null);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
  }, []);

  const interactionHandlers = canInteract
    ? {
        onMouseMove: handleMouseMove,
        onMouseLeave: handleMouseLeave,
        onMouseDown: handleMouseDown,
        onMouseUp: handleMouseUp,
        onTouchStart: handleTouchStart,
        onTouchMove: handleTouchMove,
        onTouchEnd: handleTouchEnd,
      }
    : {};

  const interactionStyle: React.CSSProperties = {
    cursor: canInteract ? "crosshair" : "default",
    touchAction: "none",
  };

  return {
    tooltipData,
    setTooltipData,
    selection,
    clearSelection,
    interactionHandlers,
    interactionStyle,
  };
}

// ─── Tooltip Components ──────────────────────────────────────────────────────

// DateTicker

const TICKER_ITEM_HEIGHT = 24;

interface DateTickerProps {
  currentIndex: number;
  labels: string[];
  visible: boolean;
}

function DateTicker({ currentIndex, labels, visible }: DateTickerProps) {
  const parsedLabels = useMemo(() => {
    return labels.map((label) => {
      const parts = label.split(" ");
      const month = parts[0] || "";
      const day = parts[1] || "";
      return { month, day, full: label };
    });
  }, [labels]);

  const monthIndices = useMemo(() => {
    const uniqueMonths: string[] = [];
    const indices: number[] = [];

    parsedLabels.forEach((label, index) => {
      if (uniqueMonths.length === 0 || uniqueMonths.at(-1) !== label.month) {
        uniqueMonths.push(label.month);
        indices.push(index);
      }
    });

    return { uniqueMonths, indices };
  }, [parsedLabels]);

  const currentMonthIndex = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= parsedLabels.length) {
      return 0;
    }
    const currentMonth = parsedLabels[currentIndex]?.month;
    return monthIndices.uniqueMonths.indexOf(currentMonth || "");
  }, [currentIndex, parsedLabels, monthIndices]);

  const prevMonthIndexRef = useRef(-1);

  const dayY = useSpring(0, { stiffness: 400, damping: 35 });
  const monthY = useSpring(0, { stiffness: 400, damping: 35 });

  useEffect(() => {
    dayY.set(-currentIndex * TICKER_ITEM_HEIGHT);
  }, [currentIndex, dayY]);

  useEffect(() => {
    if (currentMonthIndex >= 0) {
      const isFirstRender = prevMonthIndexRef.current === -1;
      const monthChanged = prevMonthIndexRef.current !== currentMonthIndex;

      if (isFirstRender || monthChanged) {
        monthY.set(-currentMonthIndex * TICKER_ITEM_HEIGHT);
        prevMonthIndexRef.current = currentMonthIndex;
      }
    }
  }, [currentMonthIndex, monthY]);

  if (!visible || labels.length === 0) {
    return null;
  }

  return (
    <motion.div
      className="overflow-hidden rounded-none bg-zinc-100 px-4 py-1 text-zinc-900"
      layout
      transition={{
        layout: SPRING,
      }}
    >
      <div className="relative h-6 overflow-hidden">
        <div className="flex items-center justify-center gap-1">
          <div className="relative h-6 overflow-hidden">
            <motion.div className="flex flex-col" style={{ y: monthY }}>
              {monthIndices.uniqueMonths.map((month) => (
                <div
                  className="flex h-6 shrink-0 items-center justify-center"
                  key={month}
                >
                  <span className="whitespace-nowrap font-medium text-sm">
                    {month}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
          <div className="relative h-6 overflow-hidden">
            <motion.div className="flex flex-col" style={{ y: dayY }}>
              {parsedLabels.map((label, index) => (
                <div
                  className="flex h-6 shrink-0 items-center justify-center"
                  key={`${label.day}-${index}`}
                >
                  <span className="whitespace-nowrap font-medium text-sm">
                    {label.day}
                  </span>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

DateTicker.displayName = "DateTicker";

// TooltipDot

interface TooltipDotProps {
  x: number;
  y: number;
  visible: boolean;
  color: string;
  size?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

function TooltipDot({
  x,
  y,
  visible,
  color,
  size = 5,
  strokeColor = chartCssVars.background,
  strokeWidth = 2,
}: TooltipDotProps) {
  if (!visible) {
    return null;
  }

  // Position is NOT animated: the dot sits exactly on the hovered datum and
  // steps bucket-to-bucket with the crosshair. Interpolating it draws points
  // on the line that no datum occupies.
  return (
    <circle
      cx={x}
      cy={y}
      fill={color}
      r={size}
      stroke={strokeColor}
      strokeWidth={strokeWidth}
    />
  );
}

TooltipDot.displayName = "TooltipDot";

// TooltipIndicator

type IndicatorWidth = number | "line" | "thin" | "medium" | "thick";

interface TooltipIndicatorProps {
  x: number;
  height: number;
  visible: boolean;
  width?: IndicatorWidth;
  span?: number;
  columnWidth?: number;
  colorEdge?: string;
  colorMid?: string;
  fadeEdges?: boolean;
  gradientId?: string;
}

function resolveWidth(width: IndicatorWidth): number {
  if (typeof width === "number") {
    return width;
  }
  switch (width) {
    case "line":
      return 1;
    case "thin":
      return 2;
    case "medium":
      return 4;
    case "thick":
      return 8;
    default:
      return 1;
  }
}

function TooltipIndicator({
  x,
  height,
  visible,
  width = "line",
  span,
  columnWidth,
  colorEdge = chartCssVars.crosshair,
  colorMid = chartCssVars.crosshair,
  fadeEdges = true,
  gradientId = "tooltip-indicator-gradient",
}: TooltipIndicatorProps) {
  const pixelWidth =
    span !== undefined && columnWidth !== undefined
      ? span * columnWidth
      : resolveWidth(width);

  if (!visible) {
    return null;
  }

  const edgeOpacity = fadeEdges ? 0 : 1;

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop
            offset="0%"
            style={{ stopColor: colorEdge, stopOpacity: edgeOpacity }}
          />
          <stop offset="10%" style={{ stopColor: colorEdge, stopOpacity: 1 }} />
          <stop offset="50%" style={{ stopColor: colorMid, stopOpacity: 1 }} />
          <stop offset="90%" style={{ stopColor: colorEdge, stopOpacity: 1 }} />
          <stop
            offset="100%"
            style={{ stopColor: colorEdge, stopOpacity: edgeOpacity }}
          />
        </linearGradient>
      </defs>
      {/* x is NOT animated: the cursor line snaps to the hovered datum's
          exact scaled x and jumps bucket-to-bucket — the "stick" is the
          whole interaction. */}
      <rect
        fill={`url(#${gradientId})`}
        height={height}
        width={pixelWidth}
        x={x - pixelWidth / 2}
        y={0}
      />
    </g>
  );
}

TooltipIndicator.displayName = "TooltipIndicator";

// TooltipContent

export interface TooltipRow {
  color: string;
  label: string;
  value: string | number;
}

interface TooltipContentProps {
  title?: ReactNode;
  rows: TooltipRow[];
  children?: ReactNode;
}

function TooltipContent({ title, rows, children }: TooltipContentProps) {
  // The card's box is NOT animated — no measured-height spring, no marker
  // fade. Its size is a constant of the view (owner ruling, 01-09-2026:
  // same height/width all the time), so nothing here may resize mid-hover.
  return (
    <div>
      {title && (
        <div className="border-b border-border bg-white/[0.04] px-3 py-2 font-semibold text-white text-xs">
          {title}
        </div>
      )}
      <div className="space-y-1.5 px-3 py-2.5">
        {rows.map((row) => (
          <div
            className="flex items-center justify-between gap-5"
            key={`${row.label}-${row.color}`}
          >
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
              />
              <span className="whitespace-nowrap font-medium text-neutral-300 text-sm">
                {row.label}
              </span>
            </div>
            <span className="whitespace-nowrap font-semibold text-white text-sm tabular-nums">
              {typeof row.value === "number"
                ? row.value.toLocaleString()
                : row.value}
            </span>
          </div>
        ))}
      </div>

      {children && <div className="px-3 pb-2.5">{children}</div>}
    </div>
  );
}

TooltipContent.displayName = "TooltipContent";

// TooltipBox

interface TooltipBoxProps {
  x: number;
  y: number;
  visible: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  containerWidth: number;
  containerHeight: number;
  offset?: number;
  className?: string;
  children: ReactNode;
  left?: number | ReturnType<typeof useSpring>;
  top?: number | ReturnType<typeof useSpring>;
}

function TooltipBox({
  x,
  y,
  visible,
  containerRef,
  containerWidth,
  containerHeight,
  offset = 16,
  className = "",
  children,
  left: leftOverride,
  top: topOverride,
}: TooltipBoxProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipWidth, setTooltipWidth] = useState(180);
  const [tooltipHeight, setTooltipHeight] = useState(80);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (tooltipRef.current) {
      const w = tooltipRef.current.offsetWidth;
      const h = tooltipRef.current.offsetHeight;
      if (w > 0 && w !== tooltipWidth) {
        setTooltipWidth(w);
      }
      if (h > 0 && h !== tooltipHeight) {
        setTooltipHeight(h);
      }
    }
  }, [tooltipWidth, tooltipHeight]);

  const shouldFlipX = x + tooltipWidth + offset > containerWidth;
  const targetX = shouldFlipX ? x - offset - tooltipWidth : x + offset;

  const targetY = Math.max(
    offset,
    Math.min(y - tooltipHeight / 2, containerHeight - tooltipHeight - offset)
  );

  // The card's position is NOT spring-animated: it steps bucket-to-bucket in
  // lockstep with the crosshair (only its show/hide fades, below). A gliding
  // card lags the snapped cursor and dissolves the stuck-to-the-point feel.
  const finalLeft = leftOverride ?? targetX;
  const finalTop = topOverride ?? targetY;

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }


  if (!visible) {
    return null;
  }

  // Opacity-only entrance, fixed w-48 box, and no re-mount on a side flip:
  // the card's size may never change while hovering (owner ruling,
  // 01-09-2026) — the mount scale, the flip-pop and the flexible min-width
  // all read as the tooltip shrinking mid-hover.
  // Position gets Vemetric's exact glide — 100ms ease on reposition (their
  // tooltip wrapper's tuned animationDuration over the library default
  // easing) — so the side-flip near the right edge slides instead of
  // teleporting. Scoped to left/top only: the entrance fade is JS-driven
  // and the crosshair/dot stay instant.
  return createPortal(
    <motion.div
      animate={{ opacity: 1 }}
      className={cn("pointer-events-none absolute z-50", className)}
      initial={{ opacity: 0 }}
      ref={tooltipRef}
      style={{
        left: finalLeft,
        top: finalTop,
        transition: "left 100ms ease, top 100ms ease",
      }}
      transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
    >
      {/* w-56 fits the longest row on one line ("Visit duration | 15m 58s"
          ≈ 210px incl. padding) — rows are nowrap, so a narrower box would
          clip, and wrapping is what the fixed-size ruling forbids. */}
      <div className="w-56 overflow-hidden rounded-none bg-popover border border-border text-white">
        {children}
      </div>
    </motion.div>,
    container
  );
}

TooltipBox.displayName = "TooltipBox";

// ChartTooltip

export interface ChartTooltipProps {
  showDatePill?: boolean;
  showCrosshair?: boolean;
  showDots?: boolean;
  content?: (props: {
    point: Record<string, unknown>;
    index: number;
  }) => ReactNode;
  rows?: (point: Record<string, unknown>) => TooltipRow[];
  /** Custom header-strip content (e.g. an hourly bucket span). Falls back to
   *  the bar accessor, then a full formatted date. */
  title?: (point: Record<string, unknown>) => ReactNode;
  children?: ReactNode;
  className?: string;
}

export function ChartTooltip({
  showDatePill = true,
  showCrosshair = true,
  showDots = true,
  content,
  rows: rowsRenderer,
  title: titleRenderer,
  children,
  className = "",
}: ChartTooltipProps) {
  const {
    tooltipData,
    width,
    height,
    innerHeight,
    margin,
    columnWidth,
    lines,
    xAccessor,
    dateLabels,
    containerRef,
    orientation,
    barXAccessor,
  } = useChart();

  const isHorizontal = orientation === "horizontal";

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const visible = tooltipData !== null;
  const x = tooltipData?.x ?? 0;
  const xWithMargin = x + margin.left;

  const firstLineDataKey = lines[0]?.dataKey;
  const firstLineY = firstLineDataKey
    ? (tooltipData?.yPositions[firstLineDataKey] ?? 0)
    : 0;
  const yWithMargin = firstLineY + margin.top;

  const tooltipRows = useMemo(() => {
    if (!tooltipData) {
      return [];
    }

    if (rowsRenderer) {
      return rowsRenderer(tooltipData.point);
    }

    return lines.map((line) => ({
      color: line.stroke,
      label: line.dataKey,
      value: (tooltipData.point[line.dataKey] as number) ?? 0,
    }));
  }, [tooltipData, lines, rowsRenderer]);

  const title = useMemo(() => {
    if (!tooltipData) {
      return undefined;
    }
    if (titleRenderer) {
      return titleRenderer(tooltipData.point);
    }
    if (barXAccessor) {
      return barXAccessor(tooltipData.point);
    }
    return formatDateFull(xAccessor(tooltipData.point));
  }, [tooltipData, titleRenderer, barXAccessor, xAccessor]);

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }


  const tooltipContent = (
    <>
      {showCrosshair && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          height="100%"
          width="100%"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            <TooltipIndicator
              colorEdge={chartCssVars.crosshair}
              colorMid={chartCssVars.crosshair}
              columnWidth={columnWidth}
              fadeEdges
              height={innerHeight}
              visible={visible}
              width="line"
              x={x}
            />
          </g>
        </svg>
      )}

      {showDots && visible && !isHorizontal && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          height="100%"
          width="100%"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {lines.map((line) => {
              // No entry = missing bucket on a line that does not plot
              // missing-as-zero: the dot HIDES rather than sit at a
              // fabricated position (a bare `?? 0` here is the chart TOP).
              const dotY = tooltipData?.yPositions[line.dataKey];
              return (
                <TooltipDot
                  color={line.stroke}
                  key={line.dataKey}
                  strokeColor={chartCssVars.background}
                  visible={visible && dotY !== undefined}
                  x={tooltipData?.xPositions?.[line.dataKey] ?? x}
                  y={dotY ?? 0}
                />
              );
            })}
          </g>
        </svg>
      )}

      <TooltipBox
        className={className}
        containerHeight={height}
        containerRef={containerRef}
        containerWidth={width}
        top={isHorizontal ? undefined : margin.top}
        visible={visible}
        x={xWithMargin}
        y={isHorizontal ? yWithMargin : margin.top}
      >
        {content ? (
          content({
            point: tooltipData?.point ?? {},
            index: tooltipData?.index ?? 0,
          })
        ) : (
          <TooltipContent rows={tooltipRows} title={title}>
            {children}
          </TooltipContent>
        )}
      </TooltipBox>

      {showDatePill && dateLabels.length > 0 && visible && !isHorizontal && (
        <div
          className="pointer-events-none absolute z-50"
          style={{
            left: xWithMargin,
            transform: "translateX(-50%)",
            bottom: 4,
          }}
        >
          <DateTicker
            currentIndex={tooltipData?.index ?? 0}
            labels={dateLabels}
            visible={visible}
          />
        </div>
      )}
    </>
  );

  return createPortal(tooltipContent, container);
}

ChartTooltip.displayName = "ChartTooltip";

// ─── Grid ────────────────────────────────────────────────────────────────────

/**
 * How many horizontal ticks actually FIT, capped by the caller's request.
 *
 * `numTicks` is an upper bound, not a demand — the same contract XAxis already
 * applies on the width axis (see its `widthBudget`). Without a height budget a
 * wide-aspect chart (3.5/1) on a phone is only ~93px of plot area, and 5-6
 * 12px labels drew on top of each other as an illegible vertical smear on the
 * public share dashboard. One label per 32px keeps them legibly apart.
 *
 * Desktop is unaffected: a 3.5/1 chart in a ~900px column has ~257px of inner
 * height, a budget of 9, so `min(5, 9)` is still 5.
 */
// Y domain top + tick values, computed TOGETHER so the axis always lands on
// human steps ({1, 2, 2.5, 5} × 10^k — 2.5 only at integer magnitudes, so a
// sub-integer axis never shows quarter steps a one-decimal formatter would
// mangle). Replaces domain([0, max*1.1]).nice() + even division by tick
// count, which produced 0.22-step ticks on sparse ratio charts and, via
// float drift (100 * 1.1 = 110.00000000000001 → .nice() → 120), a 120%
// bounce-rate axis. Step ≥ padded/5 guarantees at most 5 intervals, so the
// standard numTicks={6} callers never need thinning.
export function niceYDomain(rawMax: number): { top: number; ticks: number[] } {
  const max = rawMax > 0 ? rawMax : 100;
  const padded = max * 1.05; // headroom so the stroke never clips the frame
  const rawStep = padded / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const norm = rawStep / mag;
  const mult = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 && mag >= 1 ? 2.5 : norm <= 5 ? 5 : 10;
  const step = mult * mag;
  const intervals = Math.max(1, Math.ceil(padded / step - 1e-9));
  // Significant digits, not fixed decimals: toFixed(6) collapsed every tick
  // to 0 for maxima below ~5e-7 (adversarial review, 19-08-2026), handing
  // d3 a degenerate [0, 0] domain. toPrecision keeps tiny magnitudes exact
  // while still absorbing float artifacts like 3 * 0.2 = 0.6000000000000001.
  const round = (v: number) => Number(v.toPrecision(12));
  return {
    top: round(intervals * step),
    ticks: Array.from({ length: intervals + 1 }, (_, i) => round(i * step)),
  };
}

// Where a value plots vertically. A number plots at its scaled position; a
// missing value plots at the ZERO LINE when missingAsZero is set (owner
// decision 19-08-2026: the line never disappears) — and only in the legacy
// neither-flag case at pixel 0, the chart TOP, which is why the flags exist.
// Pure so the top-vs-bottom distinction is unit-testable: the two failure
// modes look identical in code review and completely different on screen.
export function resolvePlottedY(
  value: unknown,
  scale: (n: number) => number | undefined,
  missingAsZero: boolean
): number {
  if (typeof value === "number") return scale(value) ?? 0;
  return missingAsZero ? (scale(0) ?? 0) : 0;
}

// Where the hover dot (the tooltip's line anchor) sits for each line at a
// bucket. A number anchors at its scaled position. A missing value anchors at
// the ZERO LINE when that line plots missing-as-zero — the dot must ride the
// plotted line, never detach from it (measured 22-08-2026: a null bucket left
// no entry here and the dot call-site's `?? 0` fallback parked it at the
// chart TOP while the line sat on the zero line). Without the flag a missing
// bucket yields NO entry and the dot hides — pinning it anywhere would
// fabricate a measurement the tooltip's em dash just denied.
export function resolveTooltipYPositions(
  point: Record<string, unknown>,
  lines: readonly Pick<LineConfig, "dataKey" | "missingAsZero">[],
  scale: (n: number) => number | undefined
): Record<string, number> {
  const yPositions: Record<string, number> = {};
  for (const line of lines) {
    const value = point[line.dataKey];
    if (typeof value === "number") {
      yPositions[line.dataKey] = scale(value) ?? 0;
    } else if (line.missingAsZero) {
      yPositions[line.dataKey] = scale(0) ?? 0;
    }
  }
  return yPositions;
}

// Thin a nice tick array to fit a row budget WITHOUT breaking the steps:
// only strides that divide the interval count evenly are allowed, else fall
// back to the endpoints. Uneven gridline spacing reads as a rendering bug.
export function thinTicks(values: number[], target: number): number[] {
  if (values.length <= target) return values;
  const intervals = values.length - 1;
  for (let stride = 2; stride <= intervals; stride++) {
    if (intervals % stride === 0 && intervals / stride + 1 <= target) {
      return values.filter((_, i) => i % stride === 0);
    }
  }
  return [values[0], values[values.length - 1]];
}

export function fitRowTickCount(numTicks: number, innerHeight: number): number {
  if (!(innerHeight > 0)) return numTicks;
  return Math.max(2, Math.min(numTicks, Math.floor(innerHeight / 32) + 1));
}

export interface GridProps {
  horizontal?: boolean;
  vertical?: boolean;
  numTicksRows?: number;
  numTicksColumns?: number;
  rowTickValues?: number[];
  stroke?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  strokeDasharray?: string;
  fadeHorizontal?: boolean;
  fadeVertical?: boolean;
}

export function Grid({
  horizontal = true,
  vertical = false,
  numTicksRows = 5,
  numTicksColumns = 10,
  rowTickValues,
  stroke = chartCssVars.grid,
  strokeOpacity = 1,
  strokeWidth = 1,
  strokeDasharray,
  fadeHorizontal = true,
  fadeVertical = false,
}: GridProps) {
  const { xScale, yScale, innerWidth, innerHeight, orientation, barScale, yTickValues } =
    useChart();

  // Grid rows come from the chart root's nice tick values (thinned with the
  // same budget YAxis uses, so gridlines and labels can never disagree); the
  // even-division fallback survives only for charts that pass an explicit
  // yScale without nice ticks.
  const computedRowTicks = useMemo(() => {
    if (rowTickValues) return rowTickValues;
    const count = fitRowTickCount(numTicksRows, innerHeight);
    if (yTickValues && yTickValues.length >= 2) return thinTicks(yTickValues, count);
    const domain = yScale.domain() as [number, number];
    const min = domain[0];
    const max = domain[1];
    const step = (max - min) / (count - 1);
    return Array.from({ length: count }, (_, i) => min + step * i);
  }, [yScale, numTicksRows, rowTickValues, innerHeight, yTickValues]);

  const isHorizontalBarChart = orientation === "horizontal" && barScale;
  const columnScale = isHorizontalBarChart ? yScale : xScale;
  const uniqueId = useId();

  const hMaskId = `grid-rows-fade-${uniqueId}`;
  const hGradientId = `${hMaskId}-gradient`;
  const vMaskId = `grid-cols-fade-${uniqueId}`;
  const vGradientId = `${vMaskId}-gradient`;

  return (
    <g className="chart-grid">
      {horizontal && fadeHorizontal && (
        <defs>
          <linearGradient id={hGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" style={{ stopColor: "white", stopOpacity: 0 }} />
            <stop offset="10%" style={{ stopColor: "white", stopOpacity: 1 }} />
            <stop offset="90%" style={{ stopColor: "white", stopOpacity: 1 }} />
            <stop
              offset="100%"
              style={{ stopColor: "white", stopOpacity: 0 }}
            />
          </linearGradient>
          <mask id={hMaskId}>
            <rect
              fill={`url(#${hGradientId})`}
              height={innerHeight}
              width={innerWidth}
              x="0"
              y="0"
            />
          </mask>
        </defs>
      )}

      {vertical && fadeVertical && (
        <defs>
          <linearGradient id={vGradientId} x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: "white", stopOpacity: 0 }} />
            <stop offset="10%" style={{ stopColor: "white", stopOpacity: 1 }} />
            <stop offset="90%" style={{ stopColor: "white", stopOpacity: 1 }} />
            <stop
              offset="100%"
              style={{ stopColor: "white", stopOpacity: 0 }}
            />
          </linearGradient>
          <mask id={vMaskId}>
            <rect
              fill={`url(#${vGradientId})`}
              height={innerHeight}
              width={innerWidth}
              x="0"
              y="0"
            />
          </mask>
        </defs>
      )}

      {horizontal && (
        <g mask={fadeHorizontal ? `url(#${hMaskId})` : undefined}>
          <GridRows
            scale={yScale}
            stroke={stroke}
            strokeDasharray={strokeDasharray}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
            tickValues={computedRowTicks}
            width={innerWidth}
          />
        </g>
      )}
      {vertical && columnScale && typeof columnScale === "function" && (
        <g mask={fadeVertical ? `url(#${vMaskId})` : undefined}>
          <GridColumns
            height={innerHeight}
            numTicks={numTicksColumns}
            // biome-ignore lint/suspicious/noExplicitAny: union scale type narrowed by typeof guard above
            scale={columnScale as any}
            stroke={stroke}
            strokeDasharray={strokeDasharray}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
        </g>
      )}
    </g>
  );
}

Grid.displayName = "Grid";

// ─── XAxis ───────────────────────────────────────────────────────────────────

export interface XAxisProps {
  numTicks?: number;
  tickerHalfWidth?: number;
  formatLabel?: (date: Date) => string;
}

interface XAxisLabelProps {
  label: string;
  x: number;
  crosshairX: number | null;
  isHovering: boolean;
  tickerHalfWidth: number;
}

function XAxisLabel({
  label,
  x,
  crosshairX,
  isHovering,
  tickerHalfWidth,
}: XAxisLabelProps) {
  const fadeBuffer = 20;
  const fadeRadius = tickerHalfWidth + fadeBuffer;

  let opacity = 1;
  if (isHovering && crosshairX !== null) {
    const distance = Math.abs(x - crosshairX);
    if (distance < tickerHalfWidth) {
      opacity = 0;
    } else if (distance < fadeRadius) {
      opacity = (distance - tickerHalfWidth) / fadeBuffer;
    }
  }

  return (
    <div
      className="absolute"
      style={{
        left: x,
        bottom: 12,
        width: 0,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <motion.span
        animate={{ opacity }}
        className="whitespace-nowrap text-neutral-500 text-xs"
        initial={{ opacity: 1 }}
        transition={{ duration: DURATION_SLOW, ease: EASE_APPLE }}
      >
        {label}
      </motion.span>
    </div>
  );
}

export function XAxis({ numTicks = 5, tickerHalfWidth = 50, formatLabel }: XAxisProps) {
  const { xScale, margin, tooltipData, containerRef, innerWidth } = useChart();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const labelsToShow = useMemo(() => {
    const domain = xScale.domain();
    const startDate = domain[0];
    const endDate = domain[1];

    if (!(startDate && endDate)) {
      return [];
    }

    const startTime = startDate.getTime();
    const endTime = endDate.getTime();
    const rangeMs = endTime - startTime;
    // numTicks is an upper bound — narrow charts (mobile 390px) fit fewer
    // DD/MM labels before they collide, so budget ~80px per tick.
    const widthBudget = innerWidth > 0 ? Math.floor(innerWidth / 80) : numTicks;
    const tickCount = Math.max(2, Math.min(numTicks, widthBudget));

    // Generate all natural boundary dates, then thin to fit numTicks
    const allDates: Date[] = [];

    const HOUR = 3_600_000;
    const DAY = 86_400_000;

    if (rangeMs <= 2 * HOUR) {
      // Minute-level: snap to 5-minute boundaries
      const first = new Date(startDate);
      first.setUTCSeconds(0, 0);
      first.setUTCMinutes(Math.ceil(first.getUTCMinutes() / 5) * 5);
      for (let t = first.getTime(); t <= endTime; t += 5 * 60_000) {
        allDates.push(new Date(t));
      }
    } else if (rangeMs <= 3 * DAY) {
      // Hour-level: snap to 3-hour boundaries (00:00, 03:00, 06:00, ...)
      const step = 3;
      const first = new Date(startDate);
      first.setUTCMinutes(0, 0, 0);
      first.setUTCHours(Math.ceil(first.getUTCHours() / step) * step);
      for (let t = first.getTime(); t <= endTime; t += step * HOUR) {
        allDates.push(new Date(t));
      }
    } else if (rangeMs <= 90 * DAY) {
      // Day-level: snap to midnight of each day
      const first = new Date(startDate);
      first.setUTCHours(0, 0, 0, 0);
      if (first.getTime() < startTime) first.setUTCDate(first.getUTCDate() + 1);
      for (let t = first.getTime(); t <= endTime; t += DAY) {
        allDates.push(new Date(t));
      }
    } else {
      // Month-level: snap to 1st of each month
      const first = new Date(startDate);
      first.setUTCDate(1);
      first.setUTCHours(0, 0, 0, 0);
      if (first.getTime() < startTime) first.setUTCMonth(first.getUTCMonth() + 1);
      while (first.getTime() <= endTime) {
        allDates.push(new Date(first));
        first.setUTCMonth(first.getUTCMonth() + 1);
      }
    }

    // Thin to numTicks by picking evenly spaced indices
    let dates: Date[];
    if (allDates.length <= tickCount) {
      dates = allDates;
    } else {
      dates = [];
      for (let i = 0; i < tickCount; i++) {
        const idx = Math.round(i * (allDates.length - 1) / (tickCount - 1));
        dates.push(allDates[idx]);
      }
    }

    const defaultFormat = (d: Date) => formatDateShort(d);
    const fmt = formatLabel ?? defaultFormat;

    return dates.map((date) => ({
      date,
      x: (xScale(date) ?? 0) + margin.left,
      label: fmt(date),
    }));
  }, [xScale, margin.left, numTicks, formatLabel, innerWidth]);

  const isHovering = tooltipData !== null;
  const crosshairX = tooltipData ? tooltipData.x + margin.left : null;

  const container = containerRef.current;
  if (!(mounted && container)) {
    return null;
  }


  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {labelsToShow.map((item) => (
        <XAxisLabel
          crosshairX={crosshairX}
          isHovering={isHovering}
          key={`${item.label}-${item.x}`}
          label={item.label}
          tickerHalfWidth={tickerHalfWidth}
          x={item.x}
        />
      ))}
    </div>,
    container
  );
}

XAxis.displayName = "XAxis";

// ─── YAxis ───────────────────────────────────────────────────────────────────

export interface YAxisProps {
  numTicks?: number;
  formatValue?: (value: number) => string;
}

export function YAxis({
  numTicks = 5,
  formatValue,
}: YAxisProps) {
  const { yScale, margin, containerRef, innerHeight, yTickValues } = useChart();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    setContainer(containerRef.current);
  }, [containerRef]);

  const ticks = useMemo(() => {
    // Thin to what the plot height can show without labels colliding.
    const count = fitRowTickCount(numTicks, innerHeight);
    // Nice tick values from the chart root when present (the same array Grid
    // thins, so lines and labels agree); even division only as the fallback.
    let values: number[];
    if (yTickValues && yTickValues.length >= 2) {
      values = thinTicks(yTickValues, count);
    } else {
      const domain = yScale.domain() as [number, number];
      const min = domain[0];
      const max = domain[1];
      const step = (max - min) / (count - 1);
      values = Array.from({ length: count }, (_, i) => min + step * i);
    }

    return values.map((value) => ({
      value,
      y: (yScale(value) ?? 0) + margin.top,
      label: formatValue
        ? formatValue(value)
        : value >= 1000
          ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
          : value.toLocaleString(),
    }));
  }, [yScale, margin.top, numTicks, formatValue, innerHeight, yTickValues]);

  if (!container) {
    return null;
  }

  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <div
          key={tick.value}
          className="absolute"
          style={{
            left: 0,
            top: tick.y,
            width: margin.left - 8,
            display: "flex",
            justifyContent: "flex-end",
            transform: "translateY(-50%)",
          }}
        >
          <span className="whitespace-nowrap text-neutral-500 text-xs tabular-nums">
            {tick.label}
          </span>
        </div>
      ))}
    </div>,
    container
  );
}

YAxis.displayName = "YAxis";

// ─── Area ────────────────────────────────────────────────────────────────────

export interface AreaProps {
  dataKey: string;
  fill?: string;
  fillOpacity?: number;
  stroke?: string;
  strokeWidth?: number;
  curve?: CurveFactory;
  animate?: boolean;
  showLine?: boolean;
  showHighlight?: boolean;
  gradientToOpacity?: number;
  fadeEdges?: boolean;
  /**
   * Draw a gap where the point's value is not a number (null/undefined),
   * instead of plotting it at 0. For series where a missing bucket means
   * "no data", not "measured zero" — plotting it would fabricate the zero.
   */
  breakAtMissing?: boolean;
  // Unmeasured buckets plot AT ZERO — the line always runs edge to edge
  // (owner decision 19-08-2026: "no disappearing charts"). The tooltip still
  // reads the ORIGINAL value, so an empty hour shows '—', never a fake "0s":
  // continuity is a rendering choice, not a data claim. Mutually exclusive
  // with breakAtMissing.
  missingAsZero?: boolean;
  /**
   * Fade the stroke's first/last 15% via a gradient. Default preserves the
   * house look; the dashboard charts pass false — the sharp-chart round
   * (01-09-2026) wants the line crisp to both edges, and a faded edge would
   * eat the dashed today-tail.
   */
  fadeStrokeEdges?: boolean;
  /**
   * Index of the LAST COMPLETE bucket. Everything after it renders as a
   * dashed 5 5 tail sharing that transition point (the in-progress "today"
   * bucket device, sharp-chart round 01-09-2026). The gradient underlay
   * still covers the full series, so the fill runs continuously beneath the
   * dashes. Undefined = no tail.
   */
  dashedTailFrom?: number;
}

export function Area({
  dataKey,
  fill = chartCssVars.linePrimary,
  fillOpacity = 0.4,
  stroke,
  strokeWidth = 2,
  curve = curveMonotoneX,
  animate = true,
  showLine = true,
  showHighlight = true,
  gradientToOpacity = 0,
  fadeEdges = false,
  breakAtMissing = false,
  missingAsZero = false,
  fadeStrokeEdges = true,
  dashedTailFrom,
}: AreaProps) {
  const {
    data,
    xScale,
    yScale,
    innerHeight,
    innerWidth,
    tooltipData,
    selection,
    isLoaded,
    animationDuration,
    xAccessor,
  } = useChart();

  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);
  const [clipWidth, setClipWidth] = useState(0);
  const [hasMounted, setHasMounted] = useState(false);

  useEffect(() => { setHasMounted(true); }, []);

  const uniqueId = useId();
  const gradientId = useMemo(
    () => `area-gradient-${dataKey}-${Math.random().toString(36).slice(2, 9)}`,
    [dataKey]
  );
  const strokeGradientId = useMemo(
    () =>
      `area-stroke-gradient-${dataKey}-${Math.random().toString(36).slice(2, 9)}`,
    [dataKey]
  );
  const edgeMaskId = `area-edge-mask-${dataKey}-${uniqueId}`;
  const edgeGradientId = `${edgeMaskId}-gradient`;

  const resolvedStroke = stroke || fill;


  // The measured length must track the GEOMETRY: d is a function of the
  // data, the scales, the curve and the metric, and a measurement keyed only
  // on mount-ish inputs goes stale the moment the deck switches metrics —
  // findLengthAtX then binary-searches a 10,000-unit path inside a 900-unit
  // bound and every highlight segment lands wrong (customer report,
  // 22-08-2026: the line lit at the hovered point AND again near the right
  // edge — the dash pattern wrapping, reproduced with a flat→spiky metric
  // switch measuring 904 vs 10,430).
  // biome-ignore lint/correctness/useExhaustiveDependencies: data/dataKey/xScale/yScale/curve/missingAsZero are the inputs that shape the path's d attribute, read via pathRef
  useEffect(() => {
    if (pathRef.current && animate) {
      const len = pathRef.current.getTotalLength();
      if (len > 0) {
        setPathLength(len);
        if (!isLoaded) {
          requestAnimationFrame(() => {
            setClipWidth(innerWidth);
          });
        }
      }
    }
  }, [animate, innerWidth, isLoaded, data, dataKey, xScale, yScale, curve, missingAsZero]);

  const findLengthAtX = useCallback(
    (targetX: number): number => {
      const path = pathRef.current;
      if (!path || pathLength === 0) {
        return 0;
      }
      let low = 0;
      let high = pathLength;
      const tolerance = 0.5;

      while (high - low > tolerance) {
        const mid = (low + high) / 2;
        const point = path.getPointAtLength(mid);
        if (point.x < targetX) {
          low = mid;
        } else {
          high = mid;
        }
      }
      return (low + high) / 2;
    },
    [pathLength]
  );

  const segmentBounds = useMemo(() => {
    if (!pathRef.current || pathLength === 0) {
      return { startLength: 0, segmentLength: 0, isActive: false };
    }

    if (selection?.active) {
      const startLength = findLengthAtX(selection.startX);
      const endLength = findLengthAtX(selection.endX);
      return {
        startLength,
        segmentLength: endLength - startLength,
        isActive: true,
      };
    }

    if (!tooltipData) {
      return { startLength: 0, segmentLength: 0, isActive: false };
    }

    const idx = tooltipData.index;
    const startIdx = Math.max(0, idx - 1);
    const endIdx = Math.min(data.length - 1, idx + 1);

    const startPoint = data[startIdx];
    const endPoint = data[endIdx];
    if (!(startPoint && endPoint)) {
      return { startLength: 0, segmentLength: 0, isActive: false };
    }

    const startX = xScale(xAccessor(startPoint)) ?? 0;
    const endX = xScale(xAccessor(endPoint)) ?? 0;

    const startLength = findLengthAtX(startX);
    const endLength = findLengthAtX(endX);

    return {
      startLength,
      segmentLength: endLength - startLength,
      isActive: true,
    };
  }, [
    tooltipData,
    selection,
    data,
    xScale,
    pathLength,
    xAccessor,
    findLengthAtX,
  ]);

  // The gap's ONLY job is "never repeat". Sizing it to the measured length
  // makes correctness depend on the measurement being current — the wrap bug
  // above. A large constant makes a second bright segment geometrically
  // impossible for any real chart, including the one frame between a path
  // change and the re-measure effect.
  // The dash window is NOT spring-animated: the lit segment steps
  // bucket-to-bucket with the snapped crosshair; easing it leaves the
  // highlight trailing a cursor that has already jumped.
  const highlightDasharray = `${segmentBounds.segmentLength} 100000`;
  const highlightDashoffset = -segmentBounds.startLength;

  const getY = useCallback(
    (d: Record<string, unknown>) => resolvePlottedY(d[dataKey], yScale, missingAsZero),
    [dataKey, yScale, missingAsZero]
  );

  const isHovering = tooltipData !== null || selection?.active === true;
  const easing = "var(--ease-apple)";

  return (
    <>
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop
            offset="0%"
            style={{ stopColor: fill, stopOpacity: fillOpacity }}
          />
          <stop
            offset="100%"
            style={{ stopColor: fill, stopOpacity: gradientToOpacity }}
          />
        </linearGradient>

        <linearGradient id={strokeGradientId} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop
            offset="0%"
            style={{ stopColor: resolvedStroke, stopOpacity: 0 }}
          />
          <stop
            offset="15%"
            style={{ stopColor: resolvedStroke, stopOpacity: 1 }}
          />
          <stop
            offset="85%"
            style={{ stopColor: resolvedStroke, stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: resolvedStroke, stopOpacity: 0 }}
          />
        </linearGradient>

        {fadeEdges && (
          <>
            <linearGradient
              id={edgeGradientId}
              x1="0%"
              x2="100%"
              y1="0%"
              y2="0%"
            >
              <stop
                offset="0%"
                style={{ stopColor: "white", stopOpacity: 0 }}
              />
              <stop
                offset="20%"
                style={{ stopColor: "white", stopOpacity: 1 }}
              />
              <stop
                offset="80%"
                style={{ stopColor: "white", stopOpacity: 1 }}
              />
              <stop
                offset="100%"
                style={{ stopColor: "white", stopOpacity: 0 }}
              />
            </linearGradient>
            <mask id={edgeMaskId}>
              <rect
                fill={`url(#${edgeGradientId})`}
                height={innerHeight}
                width={innerWidth}
                x="0"
                y="0"
              />
            </mask>
          </>
        )}
      </defs>

      {animate && (
        <defs>
          <clipPath id={`grow-clip-area-${dataKey}`}>
            <rect
              height={innerHeight + 20}
              style={{
                transition:
                  !isLoaded && clipWidth > 0
                    ? `width ${animationDuration}ms ${easing}`
                    : "none",
              }}
              width={isLoaded ? innerWidth : clipWidth}
              x={0}
              y={0}
            />
          </clipPath>
        </defs>
      )}

      <g clipPath={animate ? `url(#grow-clip-area-${dataKey})` : undefined}>
        <motion.g
          animate={{ opacity: isHovering && showHighlight ? 0.6 : 1 }}
          initial={{ opacity: 1 }}
          transition={{ duration: DURATION_SLOW, ease: EASE_APPLE }}
        >
          <g mask={fadeEdges ? `url(#${edgeMaskId})` : undefined}>
            <AreaClosed
              curve={curve}
              data={data}
              defined={breakAtMissing ? (d) => typeof d[dataKey] === "number" : undefined}
              fill={`url(#${gradientId})`}
              x={(d) => xScale(xAccessor(d)) ?? 0}
              y={getY}
              yScale={yScale}
            />
          </g>

          {showLine && (() => {
            const hasTail =
              dashedTailFrom != null &&
              dashedTailFrom >= 0 &&
              dashedTailFrom < data.length - 1;
            const solidData = hasTail ? data.slice(0, dashedTailFrom + 1) : data;
            const strokePaint = fadeStrokeEdges
              ? `url(#${strokeGradientId})`
              : resolvedStroke;
            return (
              <motion.g
                initial={hasMounted ? false : { pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 0.6, ease: EASE_APPLE }}
              >
                <LinePath
                  curve={curve}
                  data={solidData}
                  defined={breakAtMissing ? (d) => typeof d[dataKey] === "number" : undefined}
                  innerRef={pathRef}
                  stroke={strokePaint}
                  strokeLinecap="round"
                  strokeWidth={strokeWidth}
                  x={(d) => xScale(xAccessor(d)) ?? 0}
                  y={getY}
                />
                {/* A one-point series draws NO line segment — without a
                    standing marker the day's first hour renders an empty
                    chart (the dot people saw was only the hover dot). */}
                {solidData.length === 1 && (() => {
                  const y0 = getY(solidData[0]);
                  return Number.isFinite(y0) ? (
                    <circle
                      cx={xScale(xAccessor(solidData[0])) ?? 0}
                      cy={y0 as number}
                      fill={resolvedStroke}
                      r={3}
                    />
                  ) : null;
                })()}
                {hasTail && (
                  <LinePath
                    curve={curve}
                    data={data.slice(dashedTailFrom)}
                    defined={breakAtMissing ? (d) => typeof d[dataKey] === "number" : undefined}
                    stroke={resolvedStroke}
                    strokeDasharray="5 5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={strokeWidth}
                    x={(d) => xScale(xAccessor(d)) ?? 0}
                    y={getY}
                  />
                )}
              </motion.g>
            );
          })()}

        </motion.g>
      </g>

      {/* Plain <path>, NOT motion.path: framer captures style dash values
          into MotionValues at mount and ignores later plain updates, which
          froze the lit window at its first-hover position (01-09). The
          window must re-render per bucket; the fade feel comes from the
          base line's animated dim, which sits pixel-identical underneath. */}
      {showHighlight &&
        showLine &&
        isHovering &&
        isLoaded &&
        pathRef.current && (
          <path
            d={pathRef.current.getAttribute("d") || ""}
            fill="none"
            stroke={resolvedStroke}
            strokeDasharray={highlightDasharray}
            strokeDashoffset={highlightDashoffset}
            strokeLinecap="round"
            strokeWidth={strokeWidth}
          />
        )}
    </>
  );
}

Area.displayName = "Area";

// ─── Segment Components ──────────────────────────────────────────────────────

export function SegmentBackground() {
  const { selection, innerHeight } = useChart();

  if (!selection?.active) {
    return null;
  }

  const x = Math.min(selection.startX, selection.endX);
  const width = Math.abs(selection.endX - selection.startX);

  return (
    <motion.rect
      animate={{ opacity: 0.15 }}
      fill={chartCssVars.linePrimary}
      height={innerHeight}
      initial={{ opacity: 0 }}
      rx={4}
      transition={TIMING}
      width={width}
      x={x}
      y={0}
    />
  );
}

SegmentBackground.displayName = "SegmentBackground";

export function SegmentLineFrom() {
  const { selection, innerHeight } = useChart();

  if (!selection?.active) {
    return null;
  }

  const x = Math.min(selection.startX, selection.endX);

  return (
    <motion.line
      animate={{ opacity: 1 }}
      initial={{ opacity: 0 }}
      stroke={chartCssVars.linePrimary}
      strokeDasharray="4,3"
      strokeWidth={1.5}
      transition={TIMING}
      x1={x}
      x2={x}
      y1={0}
      y2={innerHeight}
    />
  );
}

SegmentLineFrom.displayName = "SegmentLineFrom";

export function SegmentLineTo() {
  const { selection, innerHeight } = useChart();

  if (!selection?.active) {
    return null;
  }

  const x = Math.max(selection.startX, selection.endX);

  return (
    <motion.line
      animate={{ opacity: 1 }}
      initial={{ opacity: 0 }}
      stroke={chartCssVars.linePrimary}
      strokeDasharray="4,3"
      strokeWidth={1.5}
      transition={TIMING}
      x1={x}
      x2={x}
      y1={0}
      y2={innerHeight}
    />
  );
}

SegmentLineTo.displayName = "SegmentLineTo";

// ─── Pattern Components ──────────────────────────────────────────────────────

export interface PatternLinesProps {
  id: string;
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  orientation?: ("diagonal" | "horizontal" | "vertical")[];
}

export function PatternLines({
  id,
  width = 6,
  height = 6,
  stroke = "var(--chart-line-primary)",
  strokeWidth = 1,
  orientation = ["diagonal"],
}: PatternLinesProps) {
  const paths: string[] = [];

  for (const o of orientation) {
    if (o === "diagonal") {
      paths.push(`M0,${height}l${width},${-height}`);
      paths.push(`M${-width / 4},${height / 4}l${width / 2},${-height / 2}`);
      paths.push(`M${(3 * width) / 4},${height + height / 4}l${width / 2},${-height / 2}`);
    } else if (o === "horizontal") {
      paths.push(`M0,${height / 2}l${width},0`);
    } else if (o === "vertical") {
      paths.push(`M${width / 2},0l0,${height}`);
    }
  }

  return (
    <defs>
      <pattern
        id={id}
        width={width}
        height={height}
        patternUnits="userSpaceOnUse"
      >
        <path
          d={paths.join(" ")}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="square"
        />
      </pattern>
    </defs>
  );
}

PatternLines.displayName = "PatternLines";

export interface PatternAreaProps {
  dataKey: string;
  fill?: string;
  curve?: CurveFactory;
}

export function PatternArea({
  dataKey,
  fill = "url(#area-pattern)",
  curve = curveMonotoneX,
}: PatternAreaProps) {
  const { data, xScale, yScale, xAccessor } = useChart();

  const getY = useCallback(
    (d: Record<string, unknown>) => {
      const value = d[dataKey];
      return typeof value === "number" ? (yScale(value) ?? 0) : 0;
    },
    [dataKey, yScale]
  );

  return (
    <AreaClosed
      curve={curve}
      data={data}
      fill={fill}
      x={(d) => xScale(xAccessor(d)) ?? 0}
      y={getY}
      yScale={yScale}
    />
  );
}

PatternArea.displayName = "PatternArea";

// ─── AreaChart ───────────────────────────────────────────────────────────────

function isPostOverlayComponent(child: ReactElement): boolean {
  const childType = child.type as {
    displayName?: string;
    name?: string;
    __isChartMarkers?: boolean;
  };

  if (childType.__isChartMarkers) {
    return true;
  }

  const componentName =
    typeof child.type === "function"
      ? childType.displayName || childType.name || ""
      : "";

  return componentName === "ChartMarkers" || componentName === "MarkerGroup";
}

function extractAreaConfigs(children: ReactNode): LineConfig[] {
  const configs: LineConfig[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }

    const childType = child.type as {
      displayName?: string;
      name?: string;
    };
    const componentName =
      typeof child.type === "function"
        ? childType.displayName || childType.name || ""
        : "";

    const props = child.props as AreaProps | undefined;
    const isAreaComponent =
      componentName === "Area" ||
      child.type === Area ||
      (props && typeof props.dataKey === "string" && props.dataKey.length > 0);

    if (isAreaComponent && props?.dataKey) {
      configs.push({
        dataKey: props.dataKey,
        stroke: props.stroke || props.fill || "var(--chart-line-primary)",
        strokeWidth: props.strokeWidth || 2,
        missingAsZero: props.missingAsZero ?? false,
      });
    }
  });

  return configs;
}

export interface AreaChartProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  margin?: Partial<Margin>;
  animationDuration?: number;
  aspectRatio?: string;
  // Fill the parent's height instead of deriving height from width via
  // aspectRatio. The parent must have a definite height (grid/flex stretch or
  // a min-height) or the chart collapses to zero.
  fillParent?: boolean;
  // Hard ceiling for the y domain (e.g. 100 for percentage metrics). Without
  // it, nice-step rounding can print a 125% gridline over a bounce-rate
  // series — an axis claiming a value the metric cannot take.
  yCap?: number;
  // Fixed x domain (e.g. the full site day for the Today view). Without it
  // the axis is data-derived, and a day 34 minutes old collapses to a single
  // instant — one floating dot on an axis-less void (04-09-2026). The line
  // GROWS into a fixed domain instead; future buckets stay empty, never
  // zero-filled.
  xDomain?: [Date, Date];
  // Count metrics only: whole-number y ticks. The nice-step ladder emits
  // fractional ticks for tiny domains and the integer formatter collapses
  // them into duplicates ("2, 1, 1, 0" on a max-1 day, 04-09-2026).
  integerYTicks?: boolean;
  className?: string;
  children: ReactNode;
}

const DEFAULT_MARGIN: Margin = { top: 40, right: 40, bottom: 40, left: 40 };

interface ChartInnerProps {
  width: number;
  height: number;
  data: Record<string, unknown>[];
  xDataKey: string;
  margin: Margin;
  animationDuration: number;
  yCap?: number;
  xDomain?: [Date, Date];
  integerYTicks?: boolean;
  children: ReactNode;
  containerRef: RefObject<HTMLDivElement | null>;
}

function ChartInner({
  width,
  height,
  data,
  xDataKey,
  margin,
  animationDuration,
  yCap,
  xDomain,
  integerYTicks,
  children,
  containerRef,
}: ChartInnerProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  const lines = useMemo(() => extractAreaConfigs(children), [children]);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const xAccessor = useCallback(
    (d: Record<string, unknown>): Date => {
      const value = d[xDataKey];
      return value instanceof Date ? value : new Date(value as string | number);
    },
    [xDataKey]
  );

  const bisectDate = useMemo(
    () => bisector<Record<string, unknown>, Date>((d) => xAccessor(d)).left,
    [xAccessor]
  );

  const xScale = useMemo(() => {
    const dates = data.map((d) => xAccessor(d));
    const minTime = Math.min(...dates.map((d) => d.getTime()));
    const maxTime = Math.max(...dates.map((d) => d.getTime()));

    // A fixed domain (the Today view's full site day) wins over the data's
    // extent: the line grows into it, and a bucket's x never shifts as the
    // day fills in. Data-derived otherwise.
    return scaleTime()
      .range([0, innerWidth])
      .domain(xDomain ? [xDomain[0].getTime(), xDomain[1].getTime()] : [minTime, maxTime]);
  }, [innerWidth, data, xAccessor, xDomain]);

  const columnWidth = useMemo(() => {
    if (data.length < 2) {
      return 0;
    }
    return innerWidth / (data.length - 1);
  }, [innerWidth, data.length]);

  const { yScale, yTickValues } = useMemo(() => {
    let maxValue = 0;
    for (const line of lines) {
      for (const d of data) {
        const value = d[line.dataKey];
        if (typeof value === "number" && value > maxValue) {
          maxValue = value;
        }
      }
    }

    // Domain and ticks come from ONE computation (see niceYDomain) so the
    // axis lands on human steps and Grid/YAxis can never disagree.
    let { top, ticks } = niceYDomain(maxValue);
    if (yCap != null && top > yCap) {
      // A capped metric (percentages) never exceeds its cap, so quarter steps
      // of the cap replace the nice-step ladder that overshot it.
      top = yCap;
      ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * yCap);
    }
    if (integerYTicks) {
      // Count metrics: whole-number ticks only. On a tiny domain the nice
      // ladder emits fractions that an integer formatter collapses into
      // duplicate labels ("2, 1, 1, 0" on a max-1 day).
      ticks = Array.from(new Set(ticks.map((t) => Math.round(t)))).filter((t) => t <= top);
    }
    return {
      yScale: scaleLinear().range([innerHeight, 0]).domain([0, top]),
      yTickValues: ticks,
    };
  }, [innerHeight, data, lines, yCap, integerYTicks]);

  const dateLabels = useMemo(() => {
    if (data.length < 2) return data.map((d) => xAccessor(d).toLocaleDateString("en-GB", { month: "short", day: "numeric" }));
    const first = xAccessor(data[0]).getTime();
    const last = xAccessor(data[data.length - 1]).getTime();
    const rangeMs = last - first;
    const isIntraday = rangeMs <= 86_400_000 * 2;
    return data.map((d) => {
      const date = xAccessor(d);
      if (isIntraday) {
        return `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
      }
      return date.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
    });
  }, [data, xAccessor]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoaded(true);
    }, animationDuration);
    return () => clearTimeout(timer);
  }, [animationDuration]);

  const canInteract = isLoaded;

  const {
    tooltipData,
    setTooltipData,
    selection,
    clearSelection,
    interactionHandlers,
    interactionStyle,
  } = useChartInteraction({
    xScale,
    yScale,
    data,
    lines,
    margin,
    xAccessor,
    bisectDate,
    canInteract,
  });

  if (width < 10 || height < 10) {
    return null;
  }

  const preOverlayChildren: ReactElement[] = [];
  const postOverlayChildren: ReactElement[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }

    if (isPostOverlayComponent(child)) {
      postOverlayChildren.push(child);
    } else {
      preOverlayChildren.push(child);
    }
  });

  const contextValue = {
    data,
    xScale,
    yScale,
    width,
    height,
    innerWidth,
    innerHeight,
    margin,
    columnWidth,
    tooltipData,
    setTooltipData,
    containerRef,
    lines,
    isLoaded,
    animationDuration,
    xAccessor,
    dateLabels,
    selection,
    clearSelection,
    yTickValues,
  };

  return (
    <ChartProvider value={contextValue}>
      <svg aria-hidden="true" height={height} width={width}>
        <defs>
          <clipPath id="chart-area-grow-clip">
            <rect
              height={innerHeight + 20}
              style={{
                transition: isLoaded
                  ? "none"
                  : `width ${animationDuration}ms var(--ease-apple)`,
              }}
              width={isLoaded ? innerWidth : 0}
              x={0}
              y={0}
            />
          </clipPath>
        </defs>

        <rect fill="transparent" height={height} width={width} x={0} y={0} />

        <g
          {...interactionHandlers}
          style={interactionStyle}
          transform={`translate(${margin.left},${margin.top})`}
        >
          <rect
            fill="transparent"
            height={innerHeight}
            width={innerWidth}
            x={0}
            y={0}
          />

          {preOverlayChildren}
          {postOverlayChildren}
        </g>
      </svg>
    </ChartProvider>
  );
}

export function AreaChart({
  data,
  xDataKey = "date",
  margin: marginProp,
  animationDuration = 1100,
  aspectRatio = "2 / 1",
  fillParent = false,
  yCap,
  xDomain,
  integerYTicks,
  className = "",
  children,
}: AreaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const margin = { ...DEFAULT_MARGIN, ...marginProp };

  return (
    <div
      className={cn("relative w-full", fillParent && "h-full", className)}
      ref={containerRef}
      style={fillParent ? { touchAction: "none" } : { aspectRatio, touchAction: "none" }}
    >
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <ChartInner
            animationDuration={animationDuration}
            containerRef={containerRef}
            data={data}
            height={height}
            integerYTicks={integerYTicks}
            margin={margin}
            width={width}
            xDataKey={xDataKey}
            xDomain={xDomain}
            yCap={yCap}
          >
            {children}
          </ChartInner>
        )}
      </ParentSize>
    </div>
  );
}

export default AreaChart;
