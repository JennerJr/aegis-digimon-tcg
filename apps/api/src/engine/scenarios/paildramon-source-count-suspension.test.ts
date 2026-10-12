import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { observe } from "#api/engine/testkit/observe";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/paildramon-source-count-suspension.fixture";
import "#api/cards/BT16/BT16-025";

it.each([false, true])("Paildramon uses its actual source count for mass suspension with DNA=%s", async (dna) => {
  const own = fixture.board[0]!;
  const board = dna
    ? fixture
    : {
        ...fixture,
        board: { ...fixture.board, 0: { ...own, battleArea: [{ card: "BT1-037", as: "blue", under: ["BT1-030"] }] } },
      };
  const s = setupScenario(board, { autoAcceptOptional: true, autoSelectCards: true });
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    const result = dna
      ? s.engine.applyIntent(0, {
          type: "dnaDigivolve",
          instanceId: s.inst("paildramon").instanceId,
          materialPermanentIds: [s.perm("blue").permanentId, s.perm("green").permanentId],
        })
      : s.engine.applyIntent(0, {
          type: "digivolve",
          instanceId: s.inst("paildramon").instanceId,
          permanentId: s.perm("blue").permanentId,
        });
    expect(result).toEqual({ ok: true });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
    const evolved = s.state.players[0]!.battleArea.find(
      (perm) => perm.topCard.instanceId === s.inst("paildramon").instanceId,
    )!;
    expect(evolved.stack).toHaveLength(dna ? 3 : 2);
    expect(s.perm("noSources").isSuspended).toBe(true);
    expect(s.perm("twoSources").isSuspended).toBe(true);
    expect(s.perm("threeSources").isSuspended).toBe(dna);
    expect(s.perm("fourSources").isSuspended).toBe(false);
    expect(observe(s.engine).hasRestriction(s.perm("fourSources"), "unsuspend")).toBe(dna);
    expect(s.state.memory).toBe(dna ? 6 : 2);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
