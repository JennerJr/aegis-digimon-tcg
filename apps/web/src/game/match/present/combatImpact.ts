import type { Dispatch, SetStateAction } from "react";
import type { AnimationStep } from "../../animationQueue";
import type { FieldClashScene } from "../../fieldClash";
import { fieldClashImpactAtMs } from "../../fieldClash";
import { COMBAT_IMPACT_TOTAL_MS } from "../../timings";
import { waitForCombatImpactClock } from "./combatImpactClock";
import { createPresentationGate, type PresentationGate } from "../presentationGate";
import { waitForAttackArrowClock } from "../../attackArrowClock";

/**
 * The blow a battle lands: the full clash for a battle whose defender is known, and the bare
 * impact for a combat deletion with no scene to cut.
 *
 * Both are decoration — they play in `live` mode only — and both take the one impact track,
 * where each blow queues behind any still landing: an effect's battle and the attack around
 * it are both shown. A queued blow starts late, so each loser's burst waits on its own blow
 * through `landedByPermanent`.
 */
export function enqueueCombatImpact({
  clashScenes,
  beaten,
  after,
  setFieldClash,
  setCombatImpactIds,
  enqueue,
}: {
  clashScenes: readonly FieldClashScene[];
  beaten: ReadonlySet<string>;
  after?: PresentationGate;
  setFieldClash: Dispatch<SetStateAction<FieldClashScene | null>>;
  setCombatImpactIds: Dispatch<SetStateAction<ReadonlySet<string>>>;
  enqueue: (step: AnimationStep) => void;
}): { completion?: PresentationGate; landedByPermanent: ReadonlyMap<string, PresentationGate> } {
  let completion: PresentationGate | undefined;
  const landedByPermanent = new Map<string, PresentationGate>();
  for (const scene of clashScenes) {
    const landed = createPresentationGate();
    landed.after = after;
    completion = landed;
    const impacted: ReadonlySet<string> = new Set(scene.loserPermanentIds);
    for (const permanentId of impacted) landedByPermanent.set(permanentId, landed);
    enqueue({
      id: `field-clash-${scene.key}`,
      track: "combatImpact",
      onDiscard: () => landed.release(),
      async run(context) {
        try {
          if (context.mode !== "live") return;
          setFieldClash(scene);
          await context.wait(fieldClashImpactAtMs(scene));
          await waitForAttackArrowClock(scene.arrowKey, scene.attacker.permanentId, context);
          if (context.cancelled) return;
          setCombatImpactIds(impacted);
          await context.wait(COMBAT_IMPACT_TOTAL_MS);
          await waitForCombatImpactClock(scene.loserPermanentIds, context);
        } finally {
          landed.release();
          setFieldClash((current) => (current?.key === scene.key ? null : current));
          setCombatImpactIds((current) => (current === impacted ? new Set() : current));
        }
      },
    });
  }
  if (beaten.size === 0) return { completion, landedByPermanent };
  const landed = createPresentationGate();
  landed.after = after;
  const impacted: ReadonlySet<string> = new Set(beaten);
  for (const permanentId of impacted) landedByPermanent.set(permanentId, landed);
  enqueue({
    id: `combat-impact-${[...beaten].join(",")}`,
    track: "combatImpact",
    onDiscard: () => landed.release(),
    async run(context) {
      try {
        if (context.mode !== "live") return;
        setCombatImpactIds(impacted);
        await context.wait(COMBAT_IMPACT_TOTAL_MS);
        await waitForCombatImpactClock([...beaten], context);
      } finally {
        landed.release();
        setCombatImpactIds((current) => (current === impacted ? new Set() : current));
      }
    },
  });
  return { completion: landed, landedByPermanent };
}
