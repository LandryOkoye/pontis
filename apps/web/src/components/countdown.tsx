import { useEffect, useState } from "react";
import { cn } from "../lib/cn.ts";

/** Milliseconds until `expiresAt`, ticking four times a second; 0 once it has passed. */
export function useCountdown(expiresAt: string | undefined): number {
  const target = expiresAt ? Date.parse(expiresAt) : 0;
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));
  useEffect(() => {
    if (!target) return;
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [target]);
  return target ? left : 0;
}

/** Ring that drains over the quote's 60 second life and turns amber, then red, near the end. */
export function CountdownRing({
  msLeft,
  totalMs = 60_000,
  size = 72,
}: {
  msLeft: number;
  totalMs?: number;
  size?: number;
}) {
  const seconds = Math.ceil(msLeft / 1000);
  const fraction = Math.min(1, msLeft / totalMs);
  const r = 30;
  const circumference = 2 * Math.PI * r;
  const tone =
    seconds === 0
      ? "text-faint"
      : seconds <= 10
        ? "text-danger"
        : seconds <= 20
          ? "text-warn"
          : "text-gold";
  return (
    <div
      role="timer"
      aria-label={seconds > 0 ? `Quote expires in ${seconds} seconds` : "Quote expired"}
      className={cn("relative grid shrink-0 place-items-center", tone)}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 72 72" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.14"
          strokeWidth="3"
        />
        <circle
          cx="36"
          cy="36"
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: "stroke-dashoffset 0.25s linear" }}
        />
      </svg>
      <span className="num text-lg leading-none">{seconds}</span>
      <span className="absolute bottom-3 font-mono text-[8px] uppercase tracking-widest opacity-60">
        sec
      </span>
    </div>
  );
}
