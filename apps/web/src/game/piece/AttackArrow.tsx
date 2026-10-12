import { useId, useState, type CSSProperties } from "react";
import type { ArrowPoint } from "./types";
import type { AttackArrowClock } from "../attackArrowClock";

/**
 * A trail of filled chevrons points between the real card edges. Each trail ends
 * at its own target; it never continues across the art to another zone.
 */
export function AttackArrow({
  from,
  to,
  kind = "attack",
  tracking = false,
  attackKey,
  sourcePermanentId,
  targetKeys,
  clock,
}: {
  from: ArrowPoint;
  to: ArrowPoint | readonly ArrowPoint[];
  kind?: "attack" | "effect";
  tracking?: boolean;
  attackKey?: string;
  sourcePermanentId?: string;
  targetKeys?: readonly string[];
  clock?: AttackArrowClock;
}) {
  const revealId = useId();
  // Applied once on mount. Updating endpoints must not move an existing CSS clock.
  const [elapsedMs] = useState(() =>
    clock ? clock.elapsedMs + Math.max(0, performance.now() - clock.observedAtMs) * (clock.playbackRate ?? 1) : 0,
  );
  const targets = Array.isArray(to) ? (to as readonly ArrowPoint[]) : [to as ArrowPoint];
  return (
    <svg
      className={`game-attack-arrow game-attack-arrow--${kind}${tracking ? " game-attack-arrow--tracking" : ""}`}
      aria-hidden="true"
      focusable="false"
      data-attack-key={attackKey}
      data-attack-source={sourcePermanentId}
      data-attack-targets={targetKeys ? JSON.stringify(targetKeys) : undefined}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        zIndex: 60,
        pointerEvents: "none",
        ...({ "--attack-arrow-delay": `${-elapsedMs}ms` } as CSSProperties),
      }}
    >
      {targets.map((target, index) => {
        const dx = target.x - from.x;
        const dy = target.y - from.y;
        const distance = Math.hypot(dx, dy);
        if (distance < 1) return null;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const width = Math.min(28, Math.max(22, distance * 0.085));
        const headLength = Math.min(24, distance * 0.4);
        const count = Math.max(0, Math.min(40, Math.floor((distance - headLength - 26) / 28) + 1));
        const lastPosition = distance - headLength - 14;
        const clipId = `${revealId}-${index}`;
        return (
          <g
            key={index}
            fill={`var(--battle-arrow-${kind})`}
            transform={`translate(${from.x} ${from.y}) rotate(${angle})`}
            style={{ "--arrow-distance": `${distance}px` } as CSSProperties}
          >
            {tracking ? (
              <defs>
                <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
                  <rect className="game-attack-arrow__reveal" x="0" y="-24" width={distance} height="48" />
                </clipPath>
              </defs>
            ) : null}
            <g clipPath={tracking ? `url(#${clipId})` : undefined}>
              {Array.from({ length: count }, (_, step) => {
                const position = lastPosition - (count - step - 1) * 28;
                const progress = (step + 1) / Math.max(1, count);
                return (
                  <g key={step} transform={`translate(${position} 0)`} opacity={0.25 + progress * 0.6}>
                    <path
                      className="game-attack-arrow__chevron"
                      d="M-6,-12 L6,0 L-6,12 L-12,12 L0,0 L-12,-12 Z"
                      transform={`scale(${width / 24})`}
                      style={{ "--arrow-step": step } as CSSProperties}
                    />
                  </g>
                );
              })}
            </g>
            <g transform={`translate(${distance} 0)`}>
              <g className={tracking ? "game-attack-arrow__tip" : undefined}>
                <path
                  className="game-attack-arrow__head"
                  d={`M0,0 L${-headLength},${-headLength / 2} L${-headLength},${headLength / 2} Z`}
                  style={{ "--arrow-step": count } as CSSProperties}
                />
              </g>
            </g>
          </g>
        );
      })}
    </svg>
  );
}
