import { expect, it, vi } from "vitest";
import type { AnimationStep, AnimationStepContext } from "@/game/animationQueue";
import { createPresentationGate, observeGateExpiry, waitForGate } from "@/game/match/presentationGate";
import { enqueueCombatImpact } from "@/game/match/present/combatImpact";

it("starts the impact wait budget after preceding effects settle", async () => {
  vi.useFakeTimers();
  const precedingEffects = createPresentationGate();
  const steps: AnimationStep[] = [];
  const { completion } = enqueueCombatImpact({
    clashScenes: [],
    beaten: new Set(["loser"]),
    after: precedingEffects,
    setFieldClash: vi.fn<Parameters<typeof enqueueCombatImpact>[0]["setFieldClash"]>(),
    setCombatImpactIds: vi.fn<Parameters<typeof enqueueCombatImpact>[0]["setCombatImpactIds"]>(),
    enqueue: (step) => steps.push(step),
  });
  const expiries: string[] = [];
  const stop = observeGateExpiry(({ label }) => expiries.push(label));
  const context: AnimationStepContext = { mode: "live", cancelled: false, skipping: false, wait: async () => {} };
  let finished = false;
  const waiting = waitForGate(completion, context, 5000, "impact").then((outcome) => {
    finished = true;
    return outcome;
  });
  try {
    await vi.advanceTimersByTimeAsync(6200);
    expect(finished).toBe(false);
    precedingEffects.release();
    await steps[0]!.run({ ...context, mode: "replay" });
    expect(await waiting).toBe("released");
    expect(expiries).toEqual([]);
  } finally {
    precedingEffects.release();
    completion?.release();
    stop();
    vi.useRealTimers();
  }
});
