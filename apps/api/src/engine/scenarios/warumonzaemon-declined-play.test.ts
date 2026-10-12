import { describe, expect, it } from "vitest";
import { Phase } from "@aegis/shared/schema/enums";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import { observe } from "#api/engine/testkit/observe";
import fixture from "#api/engine/scenarios/warumonzaemon-declined-play.fixture";
import "#api/cards/P/P-216";
import "#api/cards/BT15/BT15-031";

describe("WaruMonzaemon declined free play", () => {
  it("keeps WaruMonzaemon unrestricted and alive after declining its On Play", async () => {
    const s = setupScenario(fixture, { autoDeclineOptional: true, autoSelectCards: true });
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const waru = s.inst("waru");
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: waru.instanceId })).toEqual({ ok: true });
      await settle(
        () =>
          s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === waru.instanceId) &&
          !s.state.pendingDecision,
      );
      const permanent = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === waru.instanceId)!;
      expect(observe(s.engine).isRestricted(permanent, "digivolve")).toBe(false);
      expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("master").instanceId);
      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);
      expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === waru.instanceId)).toBe(true);
    } finally {
      if (s.state.phase === Phase.Breeding) s.engine.applyIntent(s.state.turnSeat, { type: "endPhase" });
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  });
});
