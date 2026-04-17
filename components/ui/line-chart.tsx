"use client";

import { curveMonotoneX } from "@visx/curve";
import { localPoint } from "@visx/event";
import { GridRows } from "@visx/grid";
import { ParentSize } from "@visx/responsive";
import { scaleLinear, scalePoint } from "@visx/scale";
import { LinePath } from "@visx/shape";
import {
  AnimatePresence,
  motion,
  useSpring,
} from "framer-motion";
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
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import useMeasure from "react-use-measure";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { type CurveFactory } from "d3-shape";
import {
  SPRING,
  TIMING,
  EASE_APPLE,
  DURATION_FAST,
  DURATION_SLOW,
} from "@/lib/motion";

// ─── Utils ────────────────────────────────────────────────────────────────────

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── CSS Vars ─────────────────────────────────────────────────────────────────

const chartCssVars = {
  background: "var(--chart-background)",
  grid: "var(--chart-grid)",
  crosshair: "var(--chart-crosshair)",
  label: "var(--chart-label)",
};

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface LineConfig {
  dataKey: string;
  stroke: string;
  strokeWidth: number;
  strokeDasharray?: string;
  showDots: boolean;
  curve: CurveFactory;
}

interface TooltipState {
  point: Record<string, unknown>;
  index: number;
  x: number;
  yPositions: Record<string, number>;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface LineChartContextValue {
  data: Record<string, unknown>[];
  xScale: ReturnType<typeof scalePoint<string>>;
  yScale: ReturnType<typeof scaleLinear<number>>;
  width: number;
  height: number;
  innerWidth: number;
  innerHeight: number;
  margin: Margin;
  xDataKey: string;
  lines: LineConfig[];
  tooltipData: TooltipState | null;
  containerRef: RefObject<HTMLDivElement | null>;
  isLoaded: boolean;
}

const LineChartContext = createContext<LineChartContextValue | null>(null);

export function useLineChart(): LineChartContextValue {
  const ctx = useContext(LineChartContext);
  if (!ctx) {
    throw new Error("useLineChart must be used within a <LineChart>");
  }
  return ctx;
}

// ─── Tooltip internals ────────────────────────────────────────────────────────

interface TooltipContentProps {
  title?: string;
  rows: { color: string; label: string; value: string | number }[];
  children?: ReactNode;
}

function TooltipContent({ title, rows, children }: TooltipContentProps) {
  const [measureRef, bounds] = useMeasure({ debounce: 0, scroll: false });
  const [committedHeight, setCommittedHeight] = useState<number | null>(null);
  const hasChildren = !!children;

  useEffect(() => {
    if (bounds.height > 0) setCommittedHeight(bounds.height);
  }, [bounds.height]);

  return (
    <motion.div
      animate={committedHeight !== null ? { height: committedHeight } : undefined}
      className="overflow-hidden"
      initial={false}
      transition={committedHeight !== null ? SPRING : { duration: 0 }}
    >
      <div className="px-3 py-2.5" ref={measureRef}>
        {title && (
          <div className="mb-2 font-medium text-neutral-400 text-xs">{title}</div>
        )}
        <div className="space-y-1.5">
          {rows.map((row) => (
            <div
              className="flex items-center justify-between gap-4"
              key={`${row.label}-${row.color}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: row.color }}
                />
                <span className="text-neutral-400 text-sm">{row.label}</span>
              </div>
              <span className="font-medium text-white text-sm tabular-nums">
                {typeof row.value === "number"
                  ? row.value.toLocaleString()
                  : row.value}
              </span>
            </div>
          ))}
        </div>
        <AnimatePresence mode="wait">
          {hasChildren && (
            <motion.div
              animate={{ opacity: 1, filter: "blur(0px)" }}
              className="mt-2"
              exit={{ opacity: 0, filter: "blur(4px)" }}
              initial={{ opacity: 0, filter: "blur(4px)" }}
              key="children"
              transition={TIMING}
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

TooltipContent.displayName = "TooltipContent";

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
      if (w > 0 && w !== tooltipWidth) setTooltipWidth(w);
      if (h > 0 && h !== tooltipHeight) setTooltipHeight(h);
    }
  }, [tooltipWidth, tooltipHeight]);

  const shouldFlipX = x + tooltipWidth + offset > containerWidth;
  const targetX = shouldFlipX ? x - offset - tooltipWidth : x + offset;
  const targetY = Math.max(
    offset,
    Math.min(y - tooltipHeight / 2, containerHeight - tooltipHeight - offset)
  );

  const prevFlipRef = useRef(shouldFlipX);
  const [flipKey, setFlipKey] = useState(0);
  useEffect(() => {
    if (prevFlipRef.current !== shouldFlipX) {
      setFlipKey((k) => k + 1);
      prevFlipRef.current = shouldFlipX;
    }
  }, [shouldFlipX]);

  const springConfig = { stiffness: 100, damping: 20 };
  const animatedLeft = useSpring(targetX, springConfig);
  const animatedTop = useSpring(targetY, springConfig);

  useEffect(() => {
    animatedLeft.set(targetX);
  }, [targetX, animatedLeft]);
  useEffect(() => {
    animatedTop.set(targetY);
  }, [targetY, animatedTop]);

  const transformOrigin = shouldFlipX ? "right top" : "left top";
  const container = containerRef.current;
  if (!(mounted && container && visible)) return null;

  return createPortal(
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className={cn("pointer-events-none absolute z-50", className)}
      exit={{ opacity: 0, scale: 0.92, y: 4 }}
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      ref={tooltipRef}
      style={{ left: animatedLeft, top: animatedTop }}
      transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
    >
      <motion.div
        animate={{ scale: 1, opacity: 1, x: 0 }}
        className="min-w-[140px] overflow-hidden rounded-lg glass-overlay text-white shadow-lg"
        initial={{ scale: 0.85, opacity: 0, x: shouldFlipX ? 20 : -20 }}
        key={flipKey}
        style={{ transformOrigin }}
        transition={SPRING}
      >
        {children}
      </motion.div>
    </motion.div>,
    container
  );
}

TooltipBox.displayName = "TooltipBox";

// ─── Crosshair ────────────────────────────────────────────────────────────────

function Crosshair({ x, height }: { x: number; height: number }) {
  const uniqueId = useId();
  const gradientId = `line-crosshair-${uniqueId}`;
  const springConfig = { stiffness: 300, damping: 30 };
  const animatedX = useSpring(x, springConfig);
  useEffect(() => {
    animatedX.set(x);
  }, [x, animatedX]);

  return (
    <g>
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="0%" y1="0%" y2="100%">
          <stop
            offset="0%"
            style={{ stopColor: chartCssVars.crosshair, stopOpacity: 0 }}
          />
          <stop
            offset="10%"
            style={{ stopColor: chartCssVars.crosshair, stopOpacity: 1 }}
          />
          <stop
            offset="90%"
            style={{ stopColor: chartCssVars.crosshair, stopOpacity: 1 }}
          />
          <stop
            offset="100%"
            style={{ stopColor: chartCssVars.crosshair, stopOpacity: 0 }}
          />
        </linearGradient>
      </defs>
      <motion.line
        stroke={`url(#${gradientId})`}
        strokeWidth={1}
        x1={animatedX}
        x2={animatedX}
        y1={0}
        y2={height}
      />
    </g>
  );
}

// ─── HoverDot ─────────────────────────────────────────────────────────────────

function HoverDot({
  x,
  y,
  color,
}: {
  x: number;
  y: number;
  color: string;
}) {
  const springConfig = { stiffness: 300, damping: 30 };
  const animX = useSpring(x, springConfig);
  const animY = useSpring(y, springConfig);
  useEffect(() => {
    animX.set(x);
  }, [x, animX]);
  useEffect(() => {
    animY.set(y);
  }, [y, animY]);

  return (
    <motion.circle
      cx={animX}
      cy={animY}
      fill={color}
      r={4.5}
      stroke={chartCssVars.background}
      strokeWidth={2}
    />
  );
}

// ─── ChartTooltip ─────────────────────────────────────────────────────────────

export interface ChartTooltipProps {
  showCrosshair?: boolean;
  showDots?: boolean;
  content?: (props: {
    point: Record<string, unknown>;
    index: number;
  }) => ReactNode;
  rows?: (point: Record<string, unknown>) => {
    color: string;
    label: string;
    value: string | number;
  }[];
  children?: ReactNode;
  className?: string;
}

export function ChartTooltip({
  showCrosshair = true,
  showDots = true,
  content,
  rows: rowsRenderer,
  children,
  className = "",
}: ChartTooltipProps) {
  const {
    tooltipData,
    width,
    height,
    margin,
    innerHeight,
    lines,
    xDataKey,
    containerRef,
  } = useLineChart();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const visible = tooltipData !== null;
  const x = tooltipData?.x ?? 0;
  const xWithMargin = x + margin.left;

  const tooltipRows = useMemo(() => {
    if (!tooltipData) return [];
    if (rowsRenderer) return rowsRenderer(tooltipData.point);
    return lines.map((line) => ({
      color: line.stroke,
      label: line.dataKey,
      value: (tooltipData.point[line.dataKey] as number) ?? 0,
    }));
  }, [tooltipData, lines, rowsRenderer]);

  const title = useMemo(() => {
    if (!tooltipData) return undefined;
    return String(tooltipData.point[xDataKey] ?? "");
  }, [tooltipData, xDataKey]);

  const container = containerRef.current;
  if (!(mounted && container)) return null;

  const firstLineY = lines[0]
    ? (tooltipData?.yPositions[lines[0].dataKey] ?? 0)
    : 0;

  return createPortal(
    <>
      {showCrosshair && visible && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          height="100%"
          width="100%"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            <Crosshair height={innerHeight} x={x} />
          </g>
        </svg>
      )}
      {showDots && visible && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          height="100%"
          width="100%"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {lines.map((line) => (
              <HoverDot
                color={line.stroke}
                key={line.dataKey}
                x={x}
                y={tooltipData?.yPositions[line.dataKey] ?? 0}
              />
            ))}
          </g>
        </svg>
      )}
      <TooltipBox
        className={className}
        containerHeight={height}
        containerRef={containerRef}
        containerWidth={width}
        visible={visible}
        x={xWithMargin}
        y={firstLineY + margin.top}
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
    </>,
    container
  );
}

ChartTooltip.displayName = "ChartTooltip";

// ─── Grid ─────────────────────────────────────────────────────────────────────

export interface GridProps {
  numTicks?: number;
  tickValues?: number[];
  stroke?: string;
  strokeDasharray?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
  fade?: boolean;
}

export function Grid({
  numTicks = 5,
  tickValues,
  stroke = chartCssVars.grid,
  strokeDasharray = "4,4",
  strokeOpacity = 1,
  strokeWidth = 1,
  fade = true,
}: GridProps) {
  const { yScale, innerWidth, innerHeight } = useLineChart();
  const uniqueId = useId();
  const maskId = `line-grid-mask-${uniqueId}`;
  const gradientId = `line-grid-grad-${uniqueId}`;

  return (
    <g className="line-chart-grid">
      {fade && (
        <defs>
          <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" style={{ stopColor: "white", stopOpacity: 0 }} />
            <stop
              offset="10%"
              style={{ stopColor: "white", stopOpacity: 1 }}
            />
            <stop
              offset="90%"
              style={{ stopColor: "white", stopOpacity: 1 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "white", stopOpacity: 0 }}
            />
          </linearGradient>
          <mask id={maskId}>
            <rect
              fill={`url(#${gradientId})`}
              height={innerHeight}
              width={innerWidth}
              x="0"
              y="0"
            />
          </mask>
        </defs>
      )}
      <g mask={fade ? `url(#${maskId})` : undefined}>
        <GridRows
          numTicks={tickValues ? undefined : numTicks}
          scale={yScale}
          stroke={stroke}
          strokeDasharray={strokeDasharray}
          strokeOpacity={strokeOpacity}
          strokeWidth={strokeWidth}
          tickValues={tickValues}
          width={innerWidth}
        />
      </g>
    </g>
  );
}

Grid.displayName = "Grid";

// ─── XAxis ────────────────────────────────────────────────────────────────────

export interface XAxisProps {
  maxLabels?: number;
  formatLabel?: (label: string) => string;
}

export function XAxis({ maxLabels = 12, formatLabel }: XAxisProps) {
  const { xScale, margin, containerRef, tooltipData } = useLineChart();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const labels = useMemo(() => {
    const domain = xScale.domain();
    let items = domain.map((label) => ({
      label,
      x: (xScale(label) ?? 0) + margin.left,
    }));
    if (items.length > maxLabels) {
      const step = Math.ceil(items.length / maxLabels);
      items = items.filter((_, i) => i % step === 0);
    }
    return items;
  }, [xScale, margin.left, maxLabels]);

  const crosshairX = tooltipData ? tooltipData.x + margin.left : null;
  const container = containerRef.current;
  if (!(mounted && container)) return null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {labels.map((item) => {
        let opacity = 1;
        if (crosshairX !== null) {
          const dist = Math.abs(item.x - crosshairX);
          if (dist < 30) opacity = 0;
          else if (dist < 60) opacity = (dist - 30) / 30;
        }
        return (
          <div
            className="absolute"
            key={item.label}
            style={{
              left: item.x,
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
              {formatLabel ? formatLabel(item.label) : item.label}
            </motion.span>
          </div>
        );
      })}
    </div>,
    container
  );
}

XAxis.displayName = "XAxis";

// ─── YAxis ────────────────────────────────────────────────────────────────────

export interface YAxisProps {
  numTicks?: number;
  formatValue?: (value: number) => string;
}

export function YAxis({ numTicks = 5, formatValue }: YAxisProps) {
  const { yScale, margin, containerRef } = useLineChart();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    setContainer(containerRef.current);
  }, [containerRef]);

  const ticks = useMemo(() => {
    const [min, max] = yScale.domain() as [number, number];
    const step = (max - min) / (numTicks - 1);
    return Array.from({ length: numTicks }, (_, i) => {
      const value = min + step * i;
      const label = formatValue
        ? formatValue(value)
        : value >= 1000
        ? `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
        : Math.round(value).toLocaleString();
      return { value, y: (yScale(value) ?? 0) + margin.top, label };
    });
  }, [yScale, margin.top, numTicks, formatValue]);

  if (!container) return null;

  return createPortal(
    <div className="pointer-events-none absolute inset-0">
      {ticks.map((tick) => (
        <div
          className="absolute"
          key={tick.value}
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

// ─── Line ─────────────────────────────────────────────────────────────────────

export interface LineProps {
  dataKey: string;
  stroke?: string;
  strokeWidth?: number;
  strokeDasharray?: string;
  showDots?: boolean;
  curve?: CurveFactory;
  colorIndex?: number;
}

export function Line({
  dataKey,
  stroke,
  strokeWidth = 2,
  strokeDasharray,
  showDots = false,
  curve = curveMonotoneX,
  colorIndex = 0,
}: LineProps) {
  const { data, xScale, yScale, xDataKey, innerHeight, isLoaded } =
    useLineChart();
  const resolvedStroke = stroke ?? chartColors[colorIndex % chartColors.length] ?? "var(--chart-1)";

  // Entrance animation via stroke-dashoffset
  const pathRef = useRef<SVGPathElement>(null);
  const [pathLength, setPathLength] = useState(0);

  useEffect(() => {
    if (pathRef.current) {
      const len = pathRef.current.getTotalLength();
      if (len > 0) setPathLength(len);
    }
  });

  const points = useMemo(
    () =>
      data
        .map((d) => {
          const xVal = String(d[xDataKey] ?? "");
          const yVal = typeof d[dataKey] === "number" ? (d[dataKey] as number) : null;
          if (yVal === null) return null;
          const xPos = xScale(xVal);
          const yPos = yScale(yVal);
          if (xPos === undefined || yPos === undefined) return null;
          return { x: xPos, y: yPos };
        })
        .filter((p): p is { x: number; y: number } => p !== null),
    [data, dataKey, xDataKey, xScale, yScale]
  );

  if (points.length < 2) return null;

  return (
    <g>
      {/* The actual line — rendered first so we can measure totalLength */}
      <LinePath
        curve={curve}
        data={points}
        defined={(p) => p !== null}
        innerRef={pathRef}
        stroke={resolvedStroke}
        strokeDasharray={strokeDasharray}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={strokeWidth}
        x={(p) => p.x}
        y={(p) => p.y}
        style={
          pathLength > 0
            ? {
                strokeDasharray: pathLength,
                strokeDashoffset: isLoaded ? 0 : pathLength,
                transition: isLoaded
                  ? "stroke-dashoffset 0.9s cubic-bezier(0.16, 1, 0.3, 1)"
                  : "none",
              }
            : undefined
        }
        fill="none"
      />

      {/* Optional static dots at each data point */}
      {showDots &&
        points.map((p, i) => (
          <circle
            cx={p.x}
            cy={p.y}
            fill={resolvedStroke}
            key={i}
            r={3}
            stroke={chartCssVars.background}
            strokeWidth={1.5}
          />
        ))}
    </g>
  );
}

Line.displayName = "Line";

// ─── extractLineConfigs ───────────────────────────────────────────────────────

function extractLineConfigs(children: ReactNode): LineConfig[] {
  const configs: LineConfig[] = [];
  let colorIndex = 0;
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const type = child.type as { displayName?: string };
    if (type.displayName !== "Line") return;
    const p = child.props as LineProps;
    if (!p.dataKey) return;
    configs.push({
      dataKey: p.dataKey,
      stroke:
        p.stroke ??
        chartColors[colorIndex % chartColors.length] ??
        "var(--chart-1)",
      strokeWidth: p.strokeWidth ?? 2,
      strokeDasharray: p.strokeDasharray,
      showDots: p.showDots ?? false,
      curve: p.curve ?? curveMonotoneX,
    });
    colorIndex++;
  });
  return configs;
}

// ─── LineChartInner ───────────────────────────────────────────────────────────

interface LineChartInnerProps {
  width: number;
  height: number;
  data: Record<string, unknown>[];
  xDataKey: string;
  margin: Margin;
  containerRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}

function LineChartInner({
  width,
  height,
  data,
  xDataKey,
  margin,
  containerRef,
  children,
}: LineChartInnerProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [tooltipData, setTooltipData] = useState<TooltipState | null>(null);

  const innerWidth = width - margin.left - margin.right;
  const innerHeight = height - margin.top - margin.bottom;

  const lines = useMemo(() => extractLineConfigs(children), [children]);

  const xScale = useMemo(() => {
    const domain = data.map((d) => String(d[xDataKey] ?? ""));
    return scalePoint<string>({
      range: [0, innerWidth],
      domain,
      padding: 0.5,
    });
  }, [data, xDataKey, innerWidth]);

  const yScale = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const line of lines) {
      for (const d of data) {
        const v = d[line.dataKey];
        if (typeof v === "number") {
          if (v < min) min = v;
          if (v > max) max = v;
        }
      }
    }
    if (!isFinite(min) || !isFinite(max)) {
      min = 0;
      max = 100;
    }
    const padding = (max - min) * 0.1 || 10;
    return scaleLinear<number>({
      range: [innerHeight, 0],
      domain: [Math.max(0, min - padding), max + padding],
      nice: true,
    });
  }, [data, lines, innerHeight]);

  // Trigger entrance animation on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsLoaded(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const handleMouseMove = useCallback(
    (event: React.MouseEvent<SVGRectElement>) => {
      const point = localPoint(event);
      if (!point) return;
      const chartX = point.x - margin.left;

      // Snap to nearest domain point
      const domain = xScale.domain();
      let nearest = domain[0] ?? "";
      let nearestDist = Infinity;
      for (const label of domain) {
        const px = xScale(label) ?? 0;
        const dist = Math.abs(px - chartX);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = label;
        }
      }
      const idx = domain.indexOf(nearest);
      if (idx < 0) return;
      const d = data[idx];
      if (!d) return;

      const snapX = xScale(nearest) ?? 0;
      const yPositions: Record<string, number> = {};
      for (const line of lines) {
        const v = d[line.dataKey];
        if (typeof v === "number") yPositions[line.dataKey] = yScale(v) ?? 0;
      }
      setTooltipData({ point: d, index: idx, x: snapX, yPositions });
    },
    [xScale, yScale, data, lines, margin]
  );

  const handleMouseLeave = useCallback(() => {
    setTooltipData(null);
  }, []);

  if (width < 10 || height < 10) return null;

  const contextValue: LineChartContextValue = {
    data,
    xScale,
    yScale,
    width,
    height,
    innerWidth,
    innerHeight,
    margin,
    xDataKey,
    lines,
    tooltipData,
    containerRef,
    isLoaded,
  };

  return (
    <LineChartContext.Provider value={contextValue}>
      <svg aria-hidden="true" height={height} width={width}>
        <g transform={`translate(${margin.left},${margin.top})`}>
          {children}
          {/* Transparent hit area for mouse events */}
          <rect
            fill="transparent"
            height={innerHeight}
            onMouseLeave={handleMouseLeave}
            onMouseMove={handleMouseMove}
            style={{ cursor: "crosshair", touchAction: "none" }}
            width={innerWidth}
            x={0}
            y={0}
          />
        </g>
      </svg>
    </LineChartContext.Provider>
  );
}

// ─── LineChart ────────────────────────────────────────────────────────────────

export interface LineChartProps {
  data: Record<string, unknown>[];
  xDataKey?: string;
  margin?: Partial<Margin>;
  className?: string;
  aspectRatio?: string;
  children: ReactNode;
}

const DEFAULT_MARGIN: Margin = { top: 20, right: 24, bottom: 40, left: 48 };

export function LineChart({
  data,
  xDataKey = "date",
  margin: marginProp,
  className = "",
  aspectRatio = "2 / 1",
  children,
}: LineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const margin = { ...DEFAULT_MARGIN, ...marginProp };

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          "relative flex w-full items-center justify-center",
          className
        )}
        style={{ aspectRatio }}
      >
        <span className="text-neutral-500 text-sm">No data</span>
      </div>
    );
  }

  return (
    <div
      className={cn("relative w-full", className)}
      ref={containerRef}
      style={{ aspectRatio, touchAction: "none" }}
    >
      <ParentSize debounceTime={10}>
        {({ width, height }) => (
          <LineChartInner
            containerRef={containerRef}
            data={data}
            height={height}
            margin={margin}
            width={width}
            xDataKey={xDataKey}
          >
            {children}
          </LineChartInner>
        )}
      </ParentSize>
    </div>
  );
}

LineChart.displayName = "LineChart";
export default LineChart;
