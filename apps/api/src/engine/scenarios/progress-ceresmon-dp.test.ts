import { describe, expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/progress-ceresmon-dp.fixture";
import "#api/cards/BT24/BT24-018";
import "#api/cards/BT25/BT25-059";

describe("Progress against Ceresmon's suspension DP reduction", () => {
  it.each([
    { card: "BT24-018", checks: 1 },
    { card: "BT1-016", checks: 0 },
  ])("$card completes $checks security checks against Ceresmon", async ({ card, checks }) => {
    const s = setupScenario(
      { ...fixture, board: { ...fixture.board, 0: { ...fixture.board[0], battleArea: [{ card, as: "attacker" }] } } },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const id = s.perm("attacker").permanentId;
      expect(s.engine.applyIntent(0, { type: "attack", attackerPermanentId: id, target: { kind: "player" } })).toEqual({
        ok: true,
      });
      await settle(() => s.events.some((event) => event.kind === "attackEnded") && !s.state.pendingDecision);
      expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT25-059")).toBe(
        true,
      );
      expect(s.state.players[1]!.security).toHaveLength(4 - checks);
      const checked = s.events.findIndex((event) => event.kind === "securityChecked");
      const deleted = s.events.findIndex(
        (event) =>
          event.kind === "cardsMoved" && event.deletedPermanents?.some((permanent) => permanent.permanentId === id),
      );
      expect(checked >= 0).toBe(checks === 1);
      expect(deleted === -1 || deleted > checked).toBe(true);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
