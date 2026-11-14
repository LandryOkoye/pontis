// Small charts drawn in SVG. They only ever plot real values from the API or the chain.
import { useEffect, useRef, useState } from "react";
import type { Tone } from "../lib/copy.ts";
import { cn } from "../lib/cn.ts";
import { TONE_DOT } from "./ui/primitives.tsx";

const TONE_HEX: Record<Tone, string> = {
  gold: "#5ed472",
  parity: "#4fc98d",
  similar: "#a99cf2",
  ion: "#7fa8ea",
  warn: "#dfa64e",
  danger: "#e8705f",
  neutral: "#70707a",
};

export interface Slice {
  label: string;
  value: number;
  tone: Tone;
}

/** Ring chart for a handful of categories, with its legend. */
export function Donut({
  slices,
  centerLabel,
  centerValue,
}: {
  slices: Slice[];
  centerLabel: string;
  centerValue: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const r = 42;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative size-[132px] shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="-rotate-90"
          role="img"
          aria-label={`${centerLabel}: ${slices.map((s) => `${s.label} ${s.value}`).join(", ")}`}
        >
          <circle cx="50" cy="50" r={r} fill="none" stroke="#1f1f23" strokeWidth="9" />
          {total > 0 &&
            slices
              .filter((s) => s.value > 0)
              .map((slice) => {
                const length = (slice.value / total) * circumference;
                const dash = `${Math.max(0, length - 2)} ${circumference}`;
                const node = (
                  <circle
                    key={slice.label}
                    cx="50"
                    cy="50"
                    r={r}
                    fill="none"
                    stroke={TONE_HEX[slice.tone]}
                    strokeWidth="9"
                    strokeDasharray={dash}
                    strokeDashoffset={-offset}
                  />
                );
                offset += length;
                return node;
              })}
        </svg>
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="num text-2xl leading-none">{centerValue}</span>
          <span className="mt-1 text-[11px] text-faint">{centerLabel}</span>
        </div>
      </div>
      <ul className="min-w-[140px] flex-1 space-y-2">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center justify-between gap-4 text-[13px]">
            <span className="flex items-center gap-2 text-muted">
              <span className={cn("size-2 rounded-[3px]", TONE_DOT[slice.tone])} aria-hidden />
              {slice.label}
            </span>
            <span className="num text-text">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Stepped area chart of a running count over time (e.g. settled conversions). */
export function StepArea({
  points,
  height = 120,
  label,
}: {
  points: { at: number; value: number }[];
  height?: number;
  label: string;
}) {
  const width = 600;
  if (points.length < 2) {
    return (
      <div className="grid place-items-center text-[13px] text-faint" style={{ height }}>
        Not enough activity to chart yet.
      </div>
    );
  }
  const minX = (points[0] as { at: number }).at;
  const maxX = (points[points.length - 1] as { at: number }).at;
  const maxY = Math.max(...points.map((p) => p.value), 1);
  const x = (at: number) => ((at - minX) / Math.max(1, maxX - minX)) * width;
  const y = (value: number) => height - 8 - (value / maxY) * (height - 24);
  let line = `M0 ${y(points[0]?.value ?? 0)}`;
  for (const point of points.slice(1))
    line += ` H${x(point.at).toFixed(1)} V${y(point.value).toFixed(1)}`;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
      aria-label={label}
    >
      <defs>
        <linearGradient id="step-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5ed472" stopOpacity="0.14" />
          <stop offset="1" stopColor="#5ed472" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((f) => (
        <path
          key={f}
          d={`M0 ${height * f}H${width}`}
          stroke="#1f1f23"
          strokeDasharray="2 6"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      <path d={`${line} V${height} H0 Z`} fill="url(#step-fill)" />
      <path
        d={line}
        fill="none"
        stroke="#5ed472"
        strokeWidth="1.75"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** A labelled horizontal meter. `fraction` is 0..1. */
export function Meter({
  fraction,
  tone = "gold",
  label,
}: {
  fraction: number;
  tone?: Tone;
  label: string;
}) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100;
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className="h-1.5 w-full overflow-hidden rounded-full bg-line"
    >
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${pct}%`, background: TONE_HEX[tone] }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Market charts (synthetic data in mock mode; see BACKEND-REQUESTS.md §6).

const UP = "#4fc98d";
const DOWN = "#e8705f";

/** Tiny trend line for table rows. Colour follows the direction of the series. */
export function Sparkline({
  values,
  width = 120,
  height = 36,
  label,
}: {
  values: number[];
  width?: number;
  height?: number;
  label: string;
}) {
  if (values.length < 2) return <span className="text-faint">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - 3 - ((v - min) / span) * (height - 6),
  ]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x!.toFixed(1)} ${y!.toFixed(1)}`).join("");
  const color = (values[values.length - 1] as number) >= (values[0] as number) ? UP : DOWN;
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={label}
    >
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

const fmtTime = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const fmtDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const fmtMonth = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit" });
const fmtFull = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function axisLabel(t: number, range: string): string {
  const d = new Date(t);
  if (range === "24h") return fmtTime.format(d);
  if (range === "1W" || range === "1M") return fmtDay.format(d);
  return fmtMonth.format(d);
}

const priceText = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Price area chart with volume bars, a y-axis, a time axis and a crosshair tooltip. */
export function PriceChart({
  points,
  range,
  multiplier = 1,
  prefix = "$",
  height = 400,
  ariaLabel,
}: {
  points: { t: number; price: number; volume: number }[];
  range: string;
  /** Scales price, e.g. circulating supply to show market cap. */
  multiplier?: number;
  prefix?: string;
  height?: number;
  ariaLabel: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(900);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    setWidth(Math.max(280, Math.floor(node.getBoundingClientRect().width) || 900));
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const padR = 72;
  const padB = 28;
  const padT = 16;
  const plotW = width - padR;
  const plotH = height - padB - padT;
  const volH = plotH * 0.16;

  const data = points.map((p) => ({ ...p, price: p.price * multiplier }));
  if (data.length < 2)
    return (
      <div ref={box} className="grid place-items-center text-sm text-faint" style={{ height }}>
        No market data for this range.
      </div>
    );

  const prices = data.map((p) => p.price);
  const lo = Math.min(...prices);
  const hi = Math.max(...prices);
  const pad = (hi - lo || hi * 0.01) * 0.12;
  const yMin = lo - pad;
  const yMax = hi + pad;
  const x = (i: number) => (i / (data.length - 1)) * plotW;
  const y = (v: number) => padT + (1 - (v - yMin) / (yMax - yMin)) * (plotH - volH * 0.4);
  const maxVol = Math.max(...data.map((p) => p.volume), 1);
  const up =
    (data[data.length - 1] as { price: number }).price >= (data[0] as { price: number }).price;
  const color = up ? UP : DOWN;
  const line = data
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.price).toFixed(1)}`)
    .join("");
  const area = `${line}L${plotW} ${padT + plotH}L0 ${padT + plotH}Z`;
  const first = (data[0] as { price: number }).price;
  const last = data[data.length - 1] as { price: number };
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) * (i + 0.5)) / 5);
  const xTicks = Array.from({ length: 6 }, (_, i) => Math.round((i / 5) * (data.length - 1)));
  const gid = `pc-${range}`;
  const h = hover === null ? null : data[hover];

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round((px / plotW) * (data.length - 1)))));
  };

  return (
    <div ref={box} className="relative select-none" style={{ height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className="touch-pan-y"
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity="0.12" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {yTicks.map((v) => (
          <g key={v}>
            <path d={`M0 ${y(v)}H${plotW}`} stroke="#1f1f23" strokeDasharray="2 6" />
            <text x={plotW + 10} y={y(v) + 4} fontSize="11" fill="#70707a">
              {prefix}
              {priceText(v)}
            </text>
          </g>
        ))}
        {data.map((p, i) => {
          const bh = (p.volume / maxVol) * volH;
          const bw = Math.max(1, plotW / data.length - 1);
          return (
            <rect
              key={p.t}
              x={x(i) - bw / 2}
              y={padT + plotH - bh}
              width={bw}
              height={bh}
              fill={color}
              opacity={0.16}
            />
          );
        })}
        <path d={`M0 ${y(first)}H${plotW}`} stroke="#70707a" strokeDasharray="1 4" opacity="0.7" />
        <path d={area} fill={`url(#${gid})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
        {xTicks.map((i) => (
          <text
            key={i}
            x={Math.min(plotW - 22, Math.max(22, x(i)))}
            y={height - 8}
            fontSize="11"
            textAnchor="middle"
            fill="#70707a"
          >
            {axisLabel((data[i] as { t: number }).t, range)}
          </text>
        ))}
        <g>
          <rect
            x={plotW + 4}
            y={y(last.price) - 10}
            width={padR - 6}
            height="20"
            rx="5"
            fill={color}
          />
          <text
            x={plotW + 4 + (padR - 6) / 2}
            y={y(last.price) + 4}
            fontSize="11"
            textAnchor="middle"
            fill="#06150b"
          >
            {priceText(last.price)}
          </text>
        </g>
        {h && hover !== null && (
          <g pointerEvents="none">
            <path
              d={`M${x(hover)} ${padT}V${padT + plotH}`}
              stroke="#a1a1aa"
              strokeDasharray="3 4"
              opacity="0.7"
            />
            <circle
              cx={x(hover)}
              cy={y(h.price)}
              r="4.5"
              fill="#09090a"
              stroke={color}
              strokeWidth="2"
            />
          </g>
        )}
      </svg>
      <img
        src="/brand/pontis-logo.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute bottom-10 right-24 h-6 w-auto opacity-30"
      />
      {h && hover !== null && (
        <div
          className="pointer-events-none absolute top-6 z-10 w-[190px] rounded-lg border border-line-strong bg-panel-2 p-3 text-[12px]"
          style={{ left: Math.min(Math.max(8, x(hover) + 14), plotW - 196) }}
        >
          <p className="text-muted">{fmtFull.format(new Date(h.t))}</p>
          <p className="mt-1.5 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-muted">
              <span className="size-2 rounded-full" style={{ background: color }} aria-hidden />
              {prefix === "$" ? "Price" : "Value"}
            </span>
            <span className="num text-text">
              {prefix}
              {priceText(h.price)}
            </span>
          </p>
          <p className="mt-1 flex items-center justify-between">
            <span className="text-muted">Volume</span>
            <span className="num text-text">${priceText(h.volume)}</span>
          </p>
        </div>
      )}
    </div>
  );
}
