import { describe, expect, it } from "vitest";
import { setupEngine, settle } from "#api/engine/testkit/harness";
import { fireSubTrigger, fireSubTriggerSnapshot, prepareSubTrigger } from "#api/engine/gameEngine/subTriggers";
import { buildEffectContext, cardSourceOf } from "#api/engine/gameEngine/effectContext";
import { runSubTrigger } from "#api/engine/effects/interpreter/actions/subTrigger";
import "#api/cards/BT1/BT1-009";
import "#api/cards/BT1/BT1-010";
import "#api/cards/BT1/BT1-015";

describe("standalone watcher resolution boundaries", () => {
  for (const placement of ["top", "stack", "linked"] as const) {
    it(`keeps an already-activated self grant from ${placement} after its recipient digivolves`, async () => {
      const s = setupEngine({
        0: {
          battleArea: [
            {
              card: "BT1-009",
              as: "recipient",
              ...(placement === "stack"
                ? { under: [{ card: "BT1-009", as: "installer" }] }
                : placement === "linked"
                  ? { linked: [{ card: "BT1-009", as: "installer" }] }
                  : {}),
            },
          ],
          hand: [{ card: "BT1-015", as: "evolution" }],
          deck: Array(8).fill("BT1-009"),
        },
      });
      s.state.memory = 10;
      await s.ready();
      await runSubTrigger(
        buildEffectContext(
          s.engine,
          cardSourceOf(s.engine, placement === "top" ? s.perm("recipient").topCard : s.inst("installer")),
          {},
        ),
        {
          kind: "SubTrigger",
          event: "endOfTurn",
          on: { filter: { isSelfRef: true }, count: 1, isSelf: true },
          once: true,
          actions: [{ kind: "GainMemory", amount: 1 }],
        },
      );
      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("recipient").permanentId,
          instanceId: s.inst("evolution").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(
        () =>
          s.perm("recipient").topCard.cardId === "BT1-015" &&
          s.state.pendingDecision === undefined &&
          s.engine.activeWindowToken === undefined &&
          s.engine.mainVerbContinuationsInFlight === 0,
      );
      const memoryBefore = s.state.memory;
      await fireSubTrigger(s.engine, "endOfTurn", { turnSeat: 0 });
      expect(s.state.memory).toBe(memoryBefore + 1);
      await fireSubTrigger(s.engine, "endOfTurn", { turnSeat: 0 });
      expect(s.state.memory).toBe(memoryBefore + 1);
      expect(s.perm("recipient").stack.some((card) => card.cardId === "BT1-009")).toBe(true);
    });
  }
  for (const snapshot of [false, true]) {
    it(`preserves a contextless delayed consequence beside a resident ${snapshot ? "snapshot" : "immediate"} watcher`, async () => {
      const s = setupEngine({ 0: { battleArea: [{ card: "BT1-009", as: "watcher" }] } });
      await s.ready();
      const resolved: string[] = [];
      s.engine.subTriggers.subscribe({
        event: "endOfTurn",
        sourcePermanentId: s.perm("watcher").permanentId,
        once: false,
        description: "resident end-of-turn watcher",
        run: async () => {
          resolved.push("resident");
        },
      });
      s.engine.subTriggers.subscribe({
        event: "endOfTurn",
        once: true,
        description: "already-activated delayed consequence",
        run: async () => {
          resolved.push("delayed");
        },
      });
      if (snapshot) {
        await fireSubTriggerSnapshot(s.engine, s.engine.subTriggers.subscriptionsFor("endOfTurn"), { turnSeat: 0 });
      } else {
        await fireSubTrigger(s.engine, "endOfTurn", { turnSeat: 0 });
      }
      expect(resolved).toEqual(["resident", "delayed"]);
      await fireSubTrigger(s.engine, "endOfTurn", { turnSeat: 0 });
      expect(resolved).toEqual(["resident", "delayed", "resident"]);
      expect(s.state.pendingDecision).toBeUndefined();
    });
  }
  for (const prepared of [false, true]) {
    it(`drains a suspension reaction after the ${prepared ? "prepared" : "immediate"} watcher finishes`, async () => {
      const s = setupEngine({
        0: { battleArea: [{ card: "BT1-009", as: "watcher" }] },
        1: { battleArea: [{ card: "BT1-010", as: "target" }] },
      });
      await s.ready();
      const resolved: string[] = [];
      s.engine.subTriggers.subscribe({
        event: "endOfTurn",
        sourcePermanentId: s.perm("watcher").permanentId,
        once: true,
        description: "suspension followed by another action",
        run: async (ctx) => {
          resolved.push("start");
          await ctx.fx.suspend([s.perm("target").permanentId]);
          resolved.push("finish");
        },
      });
      s.engine.subTriggers.subscribe({
        event: "whenSuspended",
        sourcePermanentId: s.perm("target").permanentId,
        once: false,
        description: "reaction to suspension",
        run: async () => {
          resolved.push("reaction");
        },
      });
      if (prepared) {
        await prepareSubTrigger(s.engine, "endOfTurn", { turnSeat: 0 })();
      } else {
        await fireSubTrigger(s.engine, "endOfTurn", { turnSeat: 0 });
      }
      expect(resolved).toEqual(["start", "finish", "reaction"]);
      expect(s.perm("target").isSuspended).toBe(true);
      expect(s.state.pendingDecision).toBeUndefined();
    });
    it(`finishes a ${prepared ? "prepared" : "immediate"} watcher before reactions to the Digimon it plays`, async () => {
      const s = setupEngine({
        0: {
          battleArea: [{ card: "BT1-009", as: "watcher" }],
          hand: [{ card: "BT1-010", as: "played" }],
        },
      });
      await s.ready();
      const resolved: string[] = [];
      s.engine.subTriggers.subscribe({
        event: "endOfTurn",
        sourcePermanentId: s.perm("watcher").permanentId,
        once: true,
        description: "play followed by another action",
        run: async (ctx) => {
          resolved.push("start");
          await ctx.fx.playInstances([s.inst("played").instanceId]);
          resolved.push("finish");
        },
      });
      s.engine.subTriggers.subscribe({
        event: "whenPlayed",
        sourcePermanentId: s.perm("watcher").permanentId,
        once: false,
        description: "reaction to the played Digimon",
        run: async () => {
          resolved.push("reaction");
        },
      });
      if (prepared) {
        await prepareSubTrigger(s.engine, "endOfTurn", { turnSeat: 0 })();
      } else {
        await fireSubTrigger(s.engine, "endOfTurn", { turnSeat: 0 });
      }
      expect(resolved).toEqual(["start", "finish", "reaction"]);
      expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT1-010")).toBe(true);
      expect(s.state.pendingDecision).toBeUndefined();
    });
  }
});
