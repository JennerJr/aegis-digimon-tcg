import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/ascension-choice.fixture";
import "#api/cards/BT25/BT25-034";
import "#api/cards/BT25/BT25-040";
import "#api/cards/BT2/BT2-087";
import "#api/cards/BT4/BT4-104";

for (const card of ["BT25-034", "BT25-040"]) {
  it.each([false, true])(
    `${card} moves only its deleted top card to security when Ascension is accepted=%s`,
    async (accept) => {
      const own = fixture.board[0]!;
      const under = card === "BT25-040" ? [{ card: "BT1-051", as: "digivolutionCard" }] : [];
      const board = {
        ...fixture,
        board: {
          ...fixture.board,
          0: { ...own, battleArea: [{ card, as: "angel", top: { card, as: "ascendingCard" }, under }] },
        },
      };
      const s = setupScenario(board, {
        autoAcceptOptional: true,
        autoSelectCards: true,
        declinePrompts: accept ? ["Barrier"] : ["Barrier", "Ascension"],
      });
      const id = s.inst("ascendingCard").instanceId;
      const permanentId = s.perm("angel").permanentId;
      const underIds = under.map((entry) => s.inst(entry.as).instanceId);
      const loop = s.engine.startTurnLoop();
      try {
        await settle(() => s.state.phase === Phase.Breeding);
        expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
        await advance(s.engine).waitForMainPhase(0);
        expect(
          s.engine.applyIntent(0, {
            type: "attack",
            attackerPermanentId: permanentId,
            target: { kind: "player" },
          }),
        ).toEqual({ ok: true });
        await settle(
          () =>
            s.engine.mainVerbContinuationsInFlight === 0 &&
            !s.state.pendingDecision &&
            !s.state.players[0]!.battleArea.some((perm) => perm.permanentId === permanentId),
        );
        expect(s.state.players[0]!.security).toHaveLength(accept ? 4 : 3);
        expect(s.state.players[0]!.security[0]?.instanceId === id).toBe(accept);
        expect(s.state.players[0]!.trash.some((entry) => entry.instanceId === id)).toBe(!accept);
        expect(s.state.players[0]!.trash.map((entry) => entry.instanceId)).toEqual(expect.arrayContaining(underIds));
        expect(s.decisions.some(({ req }) => req.promptText.includes("Ascension"))).toBe(true);
      } finally {
        s.engine.applyIntent(0, { type: "surrender" });
        await loop;
      }
    },
  );

  it(`${card} does not ascend when directly trashed from security`, async () => {
    const board = {
      ...fixture,
      board: {
        ...fixture.board,
        0: {
          ...fixture.board[0],
          battleArea: [{ card: "BT2-087", as: "colorSource" }],
          hand: [{ card: "BT4-104", as: "blindingRay" }],
          security: [{ card, as: "ascendingCard" }, "BT1-010", "BT1-010"],
        },
      },
    };
    const s = setupScenario(board, { autoAcceptOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await settle(() => s.state.phase === Phase.Breeding);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("blindingRay").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision);
      expect(s.state.players[0]!.security).toHaveLength(2);
      expect(s.state.players[0]!.trash.map((entry) => entry.instanceId)).toContain(s.inst("ascendingCard").instanceId);
      expect(s.decisions.some(({ req }) => req.promptText.includes("Ascension"))).toBe(false);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
}
