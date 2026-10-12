import type { GameEngine } from "#api/engine/GameEngine";
import type { ArmedSubTrigger } from "#api/engine/gameEngine/subTriggerIdentity";
import type { CollectedEffect } from "#api/engine/effects/collect";
import { drainPendingAttackTriggers } from "#api/engine/gameEngine/timing/fire";

export async function resolveDerivedDuringAttackStep({
  engine,
  olderWatchers,
  olderNested,
}: {
  engine: GameEngine;
  olderWatchers: ReadonlySet<ArmedSubTrigger>;
  olderNested: ReadonlySet<CollectedEffect>;
}): Promise<void> {
  if (
    engine.attackStepPauseDepth === 0 ||
    engine.effectResolutionDepth > 0 ||
    engine.optionResolutionDepth > 0 ||
    engine.activeWindowToken === undefined
  )
    return;
  const heldWatchers = engine.pendingWindowSubTriggers.filter((item) => olderWatchers.has(item));
  const heldNested = engine.pendingNestedTimingEffects.filter((pending) => olderNested.has(pending));
  if (
    heldWatchers.length === engine.pendingWindowSubTriggers.length &&
    heldNested.length === engine.pendingNestedTimingEffects.length
  )
    return;
  engine.pendingWindowSubTriggers = engine.pendingWindowSubTriggers.filter((item) => !olderWatchers.has(item));
  engine.pendingNestedTimingEffects = engine.pendingNestedTimingEffects.filter((pending) => !olderNested.has(pending));
  try {
    await drainPendingAttackTriggers(engine);
  } finally {
    engine.pendingWindowSubTriggers = [...heldWatchers, ...engine.pendingWindowSubTriggers];
    engine.pendingNestedTimingEffects = [...heldNested, ...engine.pendingNestedTimingEffects];
  }
}
