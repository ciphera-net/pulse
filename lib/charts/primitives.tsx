"use client";

import {
  line as d3Line,
  area as d3Area,
  pie as d3Pie,
  arc as d3Arc,
  type PieArcDatum,
  type CurveFactory,
} from "d3-shape";
import {
  type ReactNode,
  type Ref,
  type SVGProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ─── localPoint ─────────────────────────────────────────────────────────────

export function localPoint(
  nodeOrEvent: SVGElement | React.MouseEvent | MouseEvent,
  maybeEvent?: MouseEvent
): { x: number; y: number } | null {
  let node: SVGElement;
  let event: MouseEvent;

  if (maybeEvent) {
    node = nodeOrEvent as SVGElement;
    event = maybeEvent;
  } else {
    event = nodeOrEvent as MouseEvent;
    node = event.currentTarget as SVGElement;
  }

  if (!node) return null;
  const svg =
    "ownerSVGElement" in node
      ? node.ownerSVGElement ?? (node as unknown as SVGSVGElement)
      : (node as unknown as SVGSVGElement);
  const rect = svg.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

// ─── LinePath ───────────────────────────────────────────────────────────────

interface LinePathProps<T> extends Omit<SVGProps<SVGPathElement>, "x" | "y" | "data"> {
  data: T[];
  x: (d: T, i: number) => number;
  y: (d: T, i: number) => number;
  curve?: CurveFactory;
  defined?: (d: T, i: number) => boolean;
  innerRef?: Ref<SVGPathElement>;
}

export function LinePath<T>({
  data,
  x,
  y,
  curve,
  defined,
  innerRef,
  ...pathProps
}: LinePathProps<T>) {
  const generator = d3Line<T>().x(x).y(y);
  if (curve) generator.curve(curve);
  if (defined) generator.defined(defined);
  return (
    <path
      ref={innerRef}
      d={generator(data) ?? ""}
      fill="none"
      {...pathProps}
    />
  );
}

LinePath.displayName = "LinePath";

// ─── AreaClosed ─────────────────────────────────────────────────────────────

interface AreaClosedProps<T>
  extends Omit<SVGProps<SVGPathElement>, "x" | "y" | "data"> {
  data: T[];
  x: (d: T, i: number) => number;
  y: (d: T, i: number) => number;
  yScale: { range: () => number[] };
  curve?: CurveFactory;
  defined?: (d: T, i: number) => boolean;
  innerRef?: Ref<SVGPathElement>;
}

export function AreaClosed<T>({
  data,
  x,
  y,
  yScale,
  curve,
  defined,
  innerRef,
  ...pathProps
}: AreaClosedProps<T>) {
  const baseline = Math.max(...yScale.range());
  const generator = d3Area<T>()
    .x(x)
    .y0(baseline)
    .y1(y);
  if (curve) generator.curve(curve);
  if (defined) generator.defined(defined);
  return <path ref={innerRef} d={generator(data) ?? ""} {...pathProps} />;
}

AreaClosed.displayName = "AreaClosed";

// ─── Pie ────────────────────────────────────────────────────────────────────

interface PieProps<T> {
  data: T[];
  pieValue: (d: T) => number;
  innerRadius: number;
  outerRadius: number;
  padAngle?: number;
  children: (pie: {
    arcs: PieArcDatum<T>[];
    path: (arc: PieArcDatum<T>) => string | null;
  }) => ReactNode;
}

export function Pie<T>({
  data,
  pieValue,
  innerRadius,
  outerRadius,
  padAngle = 0,
  children,
}: PieProps<T>) {
  const pieGenerator = d3Pie<T>().value(pieValue).padAngle(padAngle).sort(null);
  const arcGenerator = d3Arc<PieArcDatum<T>>()
    .innerRadius(innerRadius)
    .outerRadius(outerRadius);
  const arcs = pieGenerator(data);
  return <>{children({ arcs, path: (a) => arcGenerator(a) })}</>;
}

Pie.displayName = "Pie";

// ─── GridRows ───────────────────────────────────────────────────────────────

interface GridRowsProps {
  scale: { ticks: (count?: number) => number[]; (v: number): number | undefined };
  width: number;
  numTicks?: number;
  tickValues?: number[];
  stroke?: string;
  strokeDasharray?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

export function GridRows({
  scale,
  width,
  numTicks,
  tickValues,
  stroke,
  strokeDasharray,
  strokeOpacity,
  strokeWidth,
}: GridRowsProps) {
  const ticks = tickValues ?? scale.ticks(numTicks);
  return (
    <g>
      {ticks.map((tick) => {
        const y = scale(tick);
        if (y == null) return null;
        return (
          <line
            key={tick}
            x1={0}
            x2={width}
            y1={y}
            y2={y}
            stroke={stroke}
            strokeDasharray={strokeDasharray}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
        );
      })}
    </g>
  );
}

GridRows.displayName = "GridRows";

// ─── GridColumns ────────────────────────────────────────────────────────────

interface GridColumnsProps {
  scale: { ticks: (count?: number) => number[]; (v: number): number | undefined };
  height: number;
  numTicks?: number;
  stroke?: string;
  strokeDasharray?: string;
  strokeOpacity?: number;
  strokeWidth?: number;
}

export function GridColumns({
  scale,
  height,
  numTicks,
  stroke,
  strokeDasharray,
  strokeOpacity,
  strokeWidth,
}: GridColumnsProps) {
  const ticks = scale.ticks(numTicks);
  return (
    <g>
      {ticks.map((tick) => {
        const x = scale(tick);
        if (x == null) return null;
        return (
          <line
            key={tick}
            x1={x}
            x2={x}
            y1={0}
            y2={height}
            stroke={stroke}
            strokeDasharray={strokeDasharray}
            strokeOpacity={strokeOpacity}
            strokeWidth={strokeWidth}
          />
        );
      })}
    </g>
  );
}

GridColumns.displayName = "GridColumns";

// ─── ParentSize ─────────────────────────────────────────────────────────────

interface ParentSizeProps {
  debounceTime?: number;
  children: (size: { width: number; height: number }) => ReactNode;
}

export function ParentSize({ debounceTime = 0, children }: ParentSizeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const update = useCallback(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setSize((prev) =>
      prev.width === width && prev.height === height
        ? prev
        : { width, height }
    );
  }, []);

  useEffect(() => {
    if (!ref.current) return;
    update();
    const observer = new ResizeObserver(() => {
      if (debounceTime > 0) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(update, debounceTime);
      } else {
        update();
      }
    });
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      clearTimeout(timeoutRef.current);
    };
  }, [update, debounceTime]);

  return (
    <div ref={ref} style={{ width: "100%", height: "100%" }}>
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}

ParentSize.displayName = "ParentSize";

// ─── LinearGradient ─────────────────────────────────────────────────────────

interface LinearGradientProps {
  id: string;
  from: string;
  to: string;
  fromOpacity?: number;
  toOpacity?: number;
  x1?: string;
  y1?: string;
  x2?: string;
  y2?: string;
}

export function LinearGradient({
  id,
  from,
  to,
  fromOpacity = 1,
  toOpacity = 1,
  x1 = "0",
  y1 = "0",
  x2 = "0",
  y2 = "1",
}: LinearGradientProps) {
  return (
    <defs>
      <linearGradient id={id} x1={x1} y1={y1} x2={x2} y2={y2}>
        <stop offset="0%" stopColor={from} stopOpacity={fromOpacity} />
        <stop offset="100%" stopColor={to} stopOpacity={toOpacity} />
      </linearGradient>
    </defs>
  );
}

LinearGradient.displayName = "LinearGradient";
