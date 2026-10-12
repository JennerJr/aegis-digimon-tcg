import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/alphamon-venus-reactivation.fixture";
import "#api/cards/EX13/EX13-060";
import "#api/cards/BT10/BT10-042";
import "#api/cards/BT20/BT20-010";

it.each([false, true])(
  "Venusmon blocks Alphamon reactivation only with Security Attack (applied: %s)",
  async (applied) => {
    const board = applied
      ? fixture
      : {
          ...fixture,
          board: {
            ...fixture.board,
            1: { ...fixture.board[1], battleArea: [{ card: "BT10-042", as: "venus" }], hand: [] },
          },
        };
    const prepared = {
      ...board,
      board: {
        ...board.board,
        0: {
          ...board.board[0],
          hand: [...(board.board[0]?.hand ?? []), { card: "BT20-010", as: "secondChronicle" }],
        },
      },
    };
    const s = setupScenario(prepared, { autoAcceptOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const evolution = applied
        ? s.engine.applyIntent(1, {
            type: "digivolve",
            permanentId: s.perm("venus").permanentId,
            instanceId: s.inst("venusCard").instanceId,
          })
        : undefined;
      expect(evolution?.ok).toBe(applied ? true : undefined);
      await settle(
        () =>
          s.engine.mainVerbContinuationsInFlight === 0 &&
          !s.state.pendingDecision &&
          s.perm("venus").topCard.cardId === "BT10-042",
      );
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("chronicle").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () =>
          s.engine.mainVerbContinuationsInFlight === 0 &&
          !s.state.pendingDecision &&
          s.state.players[0]!.battleArea.some(
            (permanent) => permanent.topCard.instanceId === s.inst("chronicle").instanceId,
          ),
      );
      expect(s.perm("venus").currentDP).toBe(applied ? 12000 : 4000);
      expect(
        s.decisions.some(
          ({ req }) => req.kind === "optional" && req.promptText.includes("Then, you may activate 1 of this Digimon"),
        ),
      ).toBe(!applied);
      expect(
        s.events.some(
          (event) =>
            event.kind === "effectTriggered" && event.sourceCardId === "EX13-060" && event.timing === "WhenDigivolving",
        ),
      ).toBe(!applied);
      const securityAfterFirstEntry = s.state.players[1]!.security.length;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("secondChronicle").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () => s.state.turnSeat === 1 && !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0,
      );
      expect(s.perm("alphamon").isSuspended).toBe(true);
      expect(s.state.players[1]!.security).toHaveLength(securityAfterFirstEntry);
      expect(
        s.events.filter(
          (event) =>
            event.kind === "effectTriggered" && event.sourceCardId === "EX13-060" && event.timing === "whenPlayed",
        ),
      ).toHaveLength(1);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
