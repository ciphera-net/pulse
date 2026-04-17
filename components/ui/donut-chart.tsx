"use client";

import { Pie } from "@visx/shape";
import {
  AnimatePresence,
  motion,
  useSpring,
} from "framer-motion";
import {
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
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { SPRING, TIMING, EASE_APPLE, DURATION_FAST } from "@/lib/motion";

// ─── Utils ────────────────────────────────────────────────────────────────────

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const chartColors = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const chartCssVars = {
  background: "var(--chart-background)",
};

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DonutSlice {
  label: string;
  value: number;
  fill?: string;
}

interface ResolvedSlice extends DonutSlice {
  fill: string;
}

// ─── Tooltip internals ────────────────────────────────────────────────────────

interface TooltipBoxProps {
  x: number;
  y: number;
  visible: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  containerWidth: number;
  containerHeight: number;
  offset?: number;
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
  children,
}: TooltipBoxProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipWidth, setTooltipWidth] = useState(160);
  const [tooltipHeight, setTooltipHeight] = useState(60);
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
      className="pointer-events-none absolute z-50"
      exit={{ opacity: 0, scale: 0.92, y: 4 }}
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      ref={tooltipRef}
      style={{ left: animatedLeft, top: animatedTop }}
      transition={{ duration: DURATION_FAST, ease: EASE_APPLE }}
    >
      <motion.div
        animate={{ scale: 1, opacity: 1, x: 0 }}
        className="min-w-[130px] overflow-hidden rounded-lg glass-overlay text-white shadow-lg"
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

// ─── DonutSegment ─────────────────────────────────────────────────────────────

interface DonutSegmentProps {
  arcPath: string;
  fill: string;
  label: string;
  value: number;
  total: number;
  cx: number;
  cy: number;
  startAngle: number;
  endAngle: number;
  index: number;
  isHovered: boolean;
  onHover: (index: number, event: React.MouseEvent<SVGPathElement>) => void;
  onLeave: () => void;
  containerRef: RefObject<HTMLDivElement | null>;
  containerWidth: number;
  containerHeight: number;
  containerOffsetLeft: number;
  containerOffsetTop: number;
}

function DonutSegment({
  arcPath,
  fill,
  label,
  value,
  total,
  cx,
  cy,
  startAngle,
  endAngle,
  index,
  isHovered,
  onHover,
  onLeave,
  containerRef,
  containerWidth,
  containerHeight,
  containerOffsetLeft,
  containerOffsetTop,
}: DonutSegmentProps) {
  // Compute outward translate direction from centroid angle
  const midAngle = (startAngle + endAngle) / 2;
  const dx = Math.cos(midAngle - Math.PI / 2) * 6;
  const dy = Math.sin(midAngle - Math.PI / 2) * 6;

  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<SVGPathElement>) => {
    setTooltipPos({
      x: e.clientX - containerOffsetLeft,
      y: e.clientY - containerOffsetTop,
    });
    onHover(index, e);
  };

  const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";

  return (
    <>
      <motion.path
        animate={{
          x: isHovered ? dx : 0,
          y: isHovered ? dy : 0,
          opacity: 1,
          scale: 1,
        }}
        d={arcPath}
        fill={fill}
        initial={{ opacity: 0, scale: 0.6 }}
        onMouseLeave={onLeave}
        onMouseMove={handleMouseMove}
        style={{ cursor: "pointer", transformOrigin: `${cx}px ${cy}px` }}
        transition={{
          ...SPRING,
          opacity: { ...TIMING, delay: index * 0.07 },
          scale: { ...SPRING, delay: index * 0.07 },
          x: { type: "spring", stiffness: 400, damping: 35 },
          y: { type: "spring", stiffness: 400, damping: 35 },
        }}
      />
      <AnimatePresence>
        {isHovered && (
          <TooltipBox
            containerHeight={containerHeight}
            containerRef={containerRef}
            containerWidth={containerWidth}
            visible={isHovered}
            x={tooltipPos.x}
            y={tooltipPos.y}
          >
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: fill }}
                />
                <span className="text-neutral-400 text-sm">{label}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-neutral-500 text-xs">{pct}%</span>
                <span className="font-medium text-white text-sm tabular-nums">
                  {value.toLocaleString()}
                </span>
              </div>
            </div>
          </TooltipBox>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── DonutChart ───────────────────────────────────────────────────────────────

export interface DonutChartProps {
  data: DonutSlice[];
  innerRadius?: number;
  className?: string;
  centerLabel?: ReactNode;
  size?: number;
}

export function DonutChart({
  data,
  innerRadius: innerRadiusRatio = 0.6,
  className = "",
  centerLabel,
  size = 220,
}: DonutChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [containerBounds, setContainerBounds] = useState({
    left: 0,
    top: 0,
    width: size,
    height: size,
  });

  // Resolve fills
  const resolvedData: ResolvedSlice[] = useMemo(
    () =>
      data.map((slice, i) => ({
        ...slice,
        fill: slice.fill ?? chartColors[i % chartColors.length] ?? "var(--chart-1)",
      })),
    [data]
  );

  const total = useMemo(
    () => resolvedData.reduce((sum, s) => sum + s.value, 0),
    [resolvedData]
  );

  // Update container bounds on mount and resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setContainerBounds({
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cx = size / 2;
  const cy = size / 2;
  const outerRadius = size / 2 - 4; // 4px padding
  const innerR = outerRadius * innerRadiusRatio;

  if (!data || data.length === 0) {
    return (
      <div
        className={cn(
          "relative flex items-center justify-center",
          className
        )}
        style={{ width: size, height: size }}
      >
        <span className="text-neutral-500 text-sm">No data</span>
      </div>
    );
  }

  return (
    <div
      className={cn("relative inline-flex flex-col items-center", className)}
      ref={containerRef}
    >
      <svg height={size} width={size}>
        <g transform={`translate(${cx},${cy})`}>
          <Pie
            data={resolvedData}
            innerRadius={innerR}
            outerRadius={outerRadius}
            padAngle={0.025}
            pieValue={(d) => d.value}
          >
            {(pie) =>
              pie.arcs.map((arc, i) => {
                const [arcPath] = [pie.path(arc) ?? ""];
                const startAngle = arc.startAngle;
                const endAngle = arc.endAngle;
                const slice = resolvedData[i]!;

                return (
                  <DonutSegment
                    arcPath={arcPath}
                    containerHeight={containerBounds.height}
                    containerOffsetLeft={containerBounds.left}
                    containerOffsetTop={containerBounds.top}
                    containerRef={containerRef}
                    containerWidth={containerBounds.width}
                    cx={0}
                    cy={0}
                    endAngle={endAngle}
                    fill={slice.fill}
                    index={i}
                    isHovered={hoveredIndex === i}
                    key={slice.label}
                    label={slice.label}
                    onHover={(idx) => setHoveredIndex(idx)}
                    onLeave={() => setHoveredIndex(null)}
                    startAngle={startAngle}
                    total={total}
                    value={slice.value}
                  />
                );
              })
            }
          </Pie>
        </g>

        {/* Center label slot */}
        {centerLabel && (
          <foreignObject
            height={innerR * 2}
            width={innerR * 2}
            x={cx - innerR}
            y={cy - innerR}
          >
            <div
              className="flex h-full w-full items-center justify-center text-center"
              style={{ pointerEvents: "none" }}
            >
              {centerLabel}
            </div>
          </foreignObject>
        )}
      </svg>
    </div>
  );
}

DonutChart.displayName = "DonutChart";

// ─── DonutLegend ──────────────────────────────────────────────────────────────

export interface DonutLegendProps {
  data: DonutSlice[];
  className?: string;
}

export function DonutLegend({ data, className = "" }: DonutLegendProps) {
  const total = data.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {data.map((slice, i) => {
        const fill =
          slice.fill ?? chartColors[i % chartColors.length] ?? "var(--chart-1)";
        const pct = total > 0 ? ((slice.value / total) * 100).toFixed(1) : "0.0";
        return (
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center justify-between gap-3"
            initial={{ opacity: 0, x: -8 }}
            key={slice.label}
            transition={{ ...TIMING, delay: i * 0.07 }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: fill }}
              />
              <span className="truncate text-neutral-400 text-sm">
                {slice.label}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-neutral-500 text-xs tabular-nums">
                {pct}%
              </span>
              <span className="font-medium text-white text-sm tabular-nums">
                {slice.value.toLocaleString()}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

DonutLegend.displayName = "DonutLegend";

export default DonutChart;
