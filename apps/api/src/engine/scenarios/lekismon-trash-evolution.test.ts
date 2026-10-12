import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/lekismon-trash-evolution.fixture";
import "#api/cards/BT25/BT25-017";
import "#api/cards/BT25/BT25-024";
import "#api/cards/BT25/BT25-026";

it.each([false, true])("Lekismon reacts to a red evolution only with Crescemon in trash=%s", async (inTrash) => {
  const own = fixture.board[0]!;
  const board = inTrash
    ? {
        ...fixture,
        board: {
          ...fixture.board,
          0: {
            ...own,
            hand: [{ card: "BT25-017", as: "flaremon" }],
            trash: ["BT24-100", { card: "BT25-026", as: "crescemon" }],
          },
        },
      }
    : fixture;
  const s = setupScenario(board, {
    autoAcceptOptional: true,
    autoSelectCards: true,
    autoChooseOption: true,
    declinePrompts: ["Attack", "Flaremon"],
  });
  const loop = s.engine.startTurnLoop();
  try {
    await settle(() => s.state.phase === Phase.Breeding);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("redEvolution").permanentId,
        instanceId: s.inst("flaremon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
    expect(s.perm("lekismon").topCard.cardId).toBe(inTrash ? "BT25-026" : "BT25-024");
    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("crescemon").instanceId)).toBe(!inTrash);
    expect(s.state.memory).toBe(inTrash ? 1 : 3);
    expect(
      s.events.some(
        (event) =>
          event.kind === "effectTriggered" &&
          event.sourceCardId === "BT25-024" &&
          event.timing === "whenOneOfYoursDigivolves",
      ),
    ).toBe(inTrash);
  } finally {
    s.engine.applyIntent(0, { type: "surrender" });
    await loop;
  }
});
