import { expect, it } from "vitest";
import { setupScenario } from "#api/engine/testkit/scenario";
import { advance } from "#api/engine/testkit/advance";
import { settle } from "#api/engine/testkit/harness";
import fixture from "#api/engine/scenarios/battle-replacement-cost-reactions.fixture";
import "#api/cards/BT25/BT25-084";
import "#api/cards/BT1/BT1-084";
import "#api/cards/BT23/BT23-047";
import "#api/cards/BT22/BT22-067";

it.each([false, true])(
  "resolves battle prevention's hand-trash reactions before an attack ends (effect attack: %s)",
  async (effectAttack) => {
    const preferred: string[] = [];
    const board = effectAttack
      ? fixture
      : {
          ...fixture,
          board: { ...fixture.board, 0: { ...fixture.board[0], battleArea: [{ card: "BT1-084", as: "attacker" }] } },
        };
    const s = setupScenario(board, { autoAcceptOptional: true, autoSelectCards: true, preferInstanceIds: preferred });
    preferred.push(s.perm("titamon").permanentId);
    const loop = s.engine.startTurnLoop();
    try {
      await advance(s.engine).waitForMainPhase(0);
      const attackerId = s.perm("attacker").permanentId;
      expect(
        s.engine.applyIntent(
          0,
          effectAttack
            ? {
                type: "digivolve",
                permanentId: attackerId,
                instanceId: s.inst("examon").instanceId,
                useAlternateCost: true,
              }
            : {
                type: "attack",
                attackerPermanentId: attackerId,
                target: { kind: "permanent", permanentId: s.perm("titamon").permanentId },
              },
        ),
      ).toEqual({ ok: true });
      await settle(() => s.events.some((event) => event.kind === "attackEnded") && !s.state.pendingDecision);
      const deleted = s.events.findIndex(
        (event) =>
          event.kind === "cardsMoved" &&
          event.deletedPermanents?.some((permanent) => permanent.permanentId === attackerId),
      );
      const ended = s.events.findIndex((event) => event.kind === "attackEnded");
      expect(s.state.players[1]!.trash).toHaveLength(2);
      expect(deleted).toBeGreaterThanOrEqual(0);
      expect(deleted).toBeLessThan(ended);
    } finally {
      s.engine.applyIntent(0, { type: "surrender" });
      await loop;
    }
  },
);
