import { expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/apollomon-end-turn-play.fixture";
import "#api/cards/BT24/BT24-085";
import "#api/cards/BT25/BT25-094";
import "#api/cards/BT25/BT25-018";
import "#api/cards/BT20/BT20-020";
import "#api/cards/BT1/BT1-107";
import "#api/cards/BT2/BT2-087";

it.each([false, true])(
  "Imperialdramon gates Cosmic Area's end-turn Apollomon play with prohibition applied=%s",
  async (applied) => {
    const board = applied
      ? fixture
      : {
          ...fixture,
          board: {
            ...fixture.board,
            1: { ...fixture.board[1], battleArea: [{ card: "BT20-020", as: "imperial" }], hand: [] },
          },
        };
    const preferred: string[] = [];
    const s = setupScenario(board, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      preferInstanceIds: preferred,
      declinePrompts: ["Attack"],
    });
    preferred.push(s.inst("cosmic").instanceId, s.inst("apollomon").instanceId);
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(1);
      const evolution = applied
        ? s.engine.applyIntent(1, {
            type: "digivolve",
            instanceId: s.inst("fighter").instanceId,
            permanentId: s.perm("imperial").permanentId,
          })
        : undefined;
      expect(evolution?.ok).toBe(applied ? true : undefined);
      await settle(() => !s.state.pendingDecision && s.engine.mainVerbContinuationsInFlight === 0);
      expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
      await settle(() => s.state.turnSeat === 0 && s.state.phase === Phase.Breeding && !s.state.pendingDecision);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(0);
      expect(s.state.memory).toBe(4);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("initialPayment").instanceId })).toEqual({
        ok: true,
      });
      await settle(
        () => s.engine.mainVerbContinuationsInFlight === 0 && !s.state.pendingDecision && s.state.memory === 1,
      );
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("memoryPayment").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => s.state.turnSeat === 1);
      expect(
        s.state.players[0]!.battleArea.some((perm) => perm.topCard.instanceId === s.inst("apollomon").instanceId),
      ).toBe(!applied);
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("apollomon").instanceId)).toBe(applied);
      const memoryChanges = s.events.flatMap((event) => (event.kind === "memoryChanged" ? [event.to] : []));
      expect(memoryChanges).toContain(-5);
      expect(memoryChanges.includes(-9)).toBe(!applied);
      expect(s.state.players[0]!.security.at(-1)?.instanceId).toBe(s.inst("cosmic").instanceId);
      expect(s.perm("danKanan").isSuspended).toBe(true);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
