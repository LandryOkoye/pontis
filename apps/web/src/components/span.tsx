// The Span: Pontis's signature visual. Two representations stand as piers; what connects them
// shows the compatibility class. Only an approved direct equivalent has a complete, live span.
import type { CompatibilityClassification } from "@pontis/domain";
import { useId } from "react";
import { cn } from "../lib/cn.ts";

type SpanState = CompatibilityClassification | "NONE" | "PENDING";

const STROKE: Record<SpanState, string> = {
  DIRECT_EQUIVALENT: "#5ed472",
  ECONOMICALLY_SIMILAR: "#b7a4ff",
  INCOMPATIBLE: "#f27a63",
  SUSPENDED: "#f2ae52",
  NONE: "#29402f",
  PENDING: "#6b8274",
};

interface Props {
  from: string;
  to: string;
  state: SpanState;
  /** Shown on the keystone, e.g. "1 : 10". */
  keystone?: string;
  caption?: string;
  className?: string;
}

export function Span({ from, to, state, keystone, caption, className }: Props) {
  const id = useId();
  const stroke = STROKE[state];
  const complete = state === "DIRECT_EQUIVALENT";
  const broken = state === "INCOMPATIBLE" || state === "NONE";
  const label = `${from} to ${to}: ${state === "NONE" ? "no relationship" : state.replaceAll("_", " ").toLowerCase()}`;
  // Arch from the left pier (90,150) to the right pier (510,150), apex at y=40.
  const arch = "M90 150 C 90 20, 510 20, 510 150";
  const leftHalf = "M90 150 C 90 78, 190 44, 262 40";
  const rightHalf = "M510 150 C 510 78, 410 44, 338 40";
  const hangers = [150, 210, 270, 330, 390, 450];
  const archY = (x: number) => {
    // Sample the cubic at the t whose x matches (the curve is symmetric and monotone in x).
    const t = (x - 90) / 420;
    return (
      150 * (1 - t) ** 3 + 3 * 20 * (1 - t) ** 2 * t + 3 * 20 * (1 - t) * t ** 2 + 150 * t ** 3
    );
  };

  return (
    <figure className={cn("w-full", className)}>
      <svg
        viewBox="0 0 600 200"
        role="img"
        aria-label={label}
        className="h-auto w-full overflow-visible"
      >
        <defs>
          <linearGradient id={`${id}-g`} x1="0" x2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0.25" />
            <stop offset="0.5" stopColor={stroke} />
            <stop offset="1" stopColor={stroke} stopOpacity="0.25" />
          </linearGradient>
          <radialGradient id={`${id}-glow`}>
            <stop offset="0" stopColor={stroke} stopOpacity="0.35" />
            <stop offset="1" stopColor={stroke} stopOpacity="0" />
          </radialGradient>
        </defs>

        {complete && <ellipse cx="300" cy="70" rx="210" ry="80" fill={`url(#${id}-glow)`} />}

        {/* deck */}
        <path d="M40 150H560" stroke="#29402f" strokeWidth="1.5" />
        <path d="M40 156H560" stroke="#1b2b21" strokeWidth="1" strokeDasharray="2 6" />

        {broken ? (
          <>
            <path
              d={leftHalf}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={state === "NONE" ? "3 7" : undefined}
            />
            <path
              d={rightHalf}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray={state === "NONE" ? "3 7" : undefined}
            />
            {state === "INCOMPATIBLE" && (
              <path
                d="M290 30l20 20M310 30l-20 20"
                stroke={stroke}
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </>
        ) : (
          <>
            <path
              d={arch}
              fill="none"
              stroke={`url(#${id}-g)`}
              strokeWidth={complete ? 2.5 : 2}
              strokeLinecap="round"
              strokeDasharray={complete ? undefined : "8 8"}
            />
            {hangers.map((x) => (
              <path
                key={x}
                d={`M${x} ${archY(x) + 2}V150`}
                stroke={stroke}
                strokeOpacity={complete ? 0.4 : 0.2}
                strokeWidth="1"
              />
            ))}
            {complete && (
              <path
                d={arch}
                fill="none"
                stroke="#d9f7e2"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeDasharray="4 44"
                className="animate-flow"
              />
            )}
          </>
        )}

        {/* piers */}
        {[
          { x: 90, text: from },
          { x: 510, text: to },
        ].map((pier) => (
          <g key={pier.x}>
            <rect
              x={pier.x - 5}
              y="150"
              width="10"
              height="34"
              rx="2"
              fill="#16261c"
              stroke="#29402f"
            />
            <circle cx={pier.x} cy="150" r="6" fill="#050a07" stroke={stroke} strokeWidth="2" />
            <text
              x={pier.x}
              y="199"
              textAnchor="middle"
              className="fill-text font-mono"
              fontSize="13"
            >
              {pier.text}
            </text>
          </g>
        ))}

        {keystone && !broken && (
          <g>
            <rect
              x="248"
              y="38"
              width="104"
              height="30"
              rx="15"
              fill="#050a07"
              stroke={stroke}
              strokeOpacity="0.7"
            />
            <text
              x="300"
              y="58"
              textAnchor="middle"
              className="font-mono"
              fontSize="13.5"
              fill={stroke}
            >
              {keystone}
            </text>
          </g>
        )}
      </svg>
      {caption && (
        <figcaption className="mt-2 text-center text-[13px] text-muted">{caption}</figcaption>
      )}
    </figure>
  );
}
