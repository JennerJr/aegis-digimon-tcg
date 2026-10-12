import { describe, expect, it } from "vitest";
import { EffectDuration, EffectTiming } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { runtimeCompiledCard } from "../../engine/effects/interpreter.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import "./P-216.js";
import "../BT15/BT15-031.js";
import "../BT22/BT22-077.js";

describe("P-216 WaruMonzaemon", () => {
  it("has Blocker on the card and as an inherited keyword", () => {
    expect(
      runtimeCompiledCard("P-216")!
        .effects.filter((effect) => effect.trigger === "Static")
        .map((effect) => effect.keywords),
    ).toEqual([[{ keyword: "Blocker", raw: "＜Blocker＞" }], [{ keyword: "Blocker", raw: "＜Blocker＞" }]]);
  });

  it("plays a Dark Masters Digimon from hand, bars its digivolution, and deletes it at the current turn end", () => {
    expect(runtimeCompiledCard("P-216")!.effects.find((effect) => effect.trigger === "OnPlay")).toMatchObject({
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["hand"],
          payCost: false,
          optional: true,
          target: {
            count: 1,
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Dark Masters"], match: "trait" }],
            },
          },
        },
        { kind: "Restrict", target: { sameTarget: true }, restriction: "digivolve", duration: "permanent" },
        { kind: "DelayedDeletePlayed", timing: "endOfCurrentTurn" },
      ],
    });
  });

  it("plays a face-up Dark Masters Digimon from security and deletes it at your turn end", () => {
    expect(runtimeCompiledCard("P-216")!.effects.find((effect) => effect.trigger === "OnDeletion")).toMatchObject({
      actions: [
        {
          kind: "PlayWithoutCost",
          from: ["security"],
          payCost: false,
          optional: true,
          target: {
            count: 1,
            filter: {
              controller: "mine",
              kind: ["Digimon"],
              nameOrTrait: [{ tokens: ["Dark Masters"], match: "trait" }],
              faceUp: true,
            },
          },
        },
        { kind: "DelayedDeletePlayed", timing: "endOfOwnerTurn" },
      ],
    });
  });
});
describe("P-216 engine behavior", () => {
  it("plays a Dark Masters Digimon from hand on play", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "P-216", as: "waru" },
            { card: "BT15-031", as: "masters" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 20;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("waru").instanceId })).toEqual({ ok: true });
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("masters").instanceId),
    );
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("masters").instanceId)).toBe(
      true,
    );
    const played = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("masters").instanceId)!;
    expect(observe(s.engine).isRestricted(played, "digivolve")).toBe(true);

    await advance(s.engine).fireGlobal(EffectTiming.OnEndTurn);
    await settle(() => !s.state.players[0]!.battleArea.some((p) => p.permanentId === played.permanentId));
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === played.permanentId)).toBe(false);
  });

  it("plays a face-up Dark Masters Digimon from Security on deletion", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-216", as: "waru" }],
          security: [{ card: "BT15-031", as: "masters", faceUp: true }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("waru").permanentId]);
    await settle();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("masters").instanceId)).toBe(
      true,
    );
  });

  it("does not play a face-down Dark Masters Digimon from Security on deletion", async () => {
    const s = setupEngine(
      { 0: { battleArea: [{ card: "P-216", as: "waru" }], security: [{ card: "BT15-031", as: "masters" }] } },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("waru").permanentId]);
    await settle();
    expect(s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("masters").instanceId)).toBe(
      false,
    );
    expect(s.state.players[0]!.security.map((card) => card.instanceId)).toEqual([s.inst("masters").instanceId]);
  });

  it("deletes the security-played Dark Masters Digimon at its owner's turn end", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-216", as: "waru" }],
          security: [{ card: "BT15-031", as: "masters", faceUp: true }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    await advance(s.engine).verb.deletePermanent([s.perm("waru").permanentId]);
    await settle(() =>
      s.state.players[0]!.battleArea.some((p) => p.topCard.instanceId === s.inst("masters").instanceId),
    );
    const played = s.state.players[0]!.battleArea.find((p) => p.topCard.instanceId === s.inst("masters").instanceId)!;
    expect(observe(s.engine).isRestricted(played, "digivolve")).toBe(false);

    s.state.turnSeat = 0;
    await advance(s.engine).fireGlobal(EffectTiming.OnEndTurn);
    await settle(() => !s.state.players[0]!.battleArea.some((p) => p.permanentId === played.permanentId));
    expect(s.state.players[0]!.battleArea.some((p) => p.permanentId === played.permanentId)).toBe(false);
  });
});

describe("P-216 WaruMonzaemon — KB Q&A rulings", () => {
  type Setup = ReturnType<typeof setupEngine>;
  const onField = (s: Setup, instanceId: string) =>
    s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.instanceId === instanceId);

  it("deletes the Digimon its [On Deletion] played at the end of my turn (Q5962)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "P-216", as: "waru" }],
          security: [{ card: "BT15-031", as: "masters", faceUp: true }],
          deck: Array(10).fill("BT1-009"),
        },
        1: { deck: Array(10).fill("BT1-009"), security: 3 },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const mastersId = s.inst("masters").instanceId;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.deletePermanent([s.perm("waru").permanentId]);
    await settle(() => onField(s, mastersId) !== undefined && s.state.pendingDecision === undefined);
    expect(observe(s.engine).isRestricted(onField(s, mastersId)!, "digivolve")).toBe(false);

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(onField(s, mastersId)).toBeUndefined();
    expect(s.state.players[0]!.trash.map((card) => card.instanceId)).toContain(mastersId);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("keeps the [On Play]-played Digimon unable to digivolve after its turn-end deletion is prevented (Q5962)", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "P-216", as: "waru" }, { card: "BT15-031", as: "masters" }, "BT1-009"],
          deck: Array(10).fill("BT1-009"),
        },
        1: { deck: Array(10).fill("BT1-009"), security: 3 },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    const mastersId = s.inst("masters").instanceId;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("waru").instanceId })).toEqual({ ok: true });
    await settle(() => onField(s, mastersId) !== undefined && s.state.pendingDecision === undefined);
    await advance(s.engine).verb.restrict(
      onField(s, mastersId)!.permanentId,
      "beDeleted",
      EffectDuration.UntilOpponentTurnEnd,
    );

    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(1);
    expect(onField(s, mastersId)).toBeDefined();
    expect(observe(s.engine).isRestricted(onField(s, mastersId)!, "digivolve")).toBe(true);
    expect(s.engine.applyIntent(1, { type: "endPhase" })).toEqual({ ok: true });
    await advance(s.engine).waitForMainPhase(0);
    expect(onField(s, mastersId)).toBeDefined();
    expect(observe(s.engine).isRestricted(onField(s, mastersId)!, "digivolve")).toBe(true);
    expect(s.engine.applyIntent(0, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it.each([
    ["the end-of-turn effect first", "BT22-077", true],
    ["the scheduled deletion first", "Delete this Digimon", false],
  ] as const)(
    "lets the turn player order an end-of-turn effect and the [On Play] deletion: %s (Q5963)",
    async (_label, preferred, effectFirst) => {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "BT22-077", as: "dianamon", suspended: true }],
            hand: [
              { card: "P-216", as: "waru" },
              { card: "BT15-031", as: "masters" },
            ],
            deck: Array(10).fill("BT1-009"),
          },
          1: { deck: Array(10).fill("BT1-009"), security: 3 },
        },
        { autoAcceptOptional: true, autoSelectCards: true, preferTriggerKeys: [preferred] },
      );
      s.state.memory = 10;
      await s.ready();
      const mastersId = s.inst("masters").instanceId;
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("waru").instanceId })).toEqual({
        ok: true,
      });
      await settle(() => onField(s, mastersId) !== undefined && s.state.pendingDecision === undefined);
      await advance(s.engine).verb.suspend([s.perm("dianamon").permanentId]);

      expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
      await advance(s.engine).waitForMainPhase(1);

      expect(s.decisions.find(({ req }) => req.kind === "orderTriggers")?.seat).toBe(0);
      const effectIndex = s.events.findIndex(
        (event) => event.kind === "effectTriggered" && event.sourceCardId === "BT22-077",
      );
      const deletionIndex = s.events.findIndex(
        (event) => event.kind === "cardsMoved" && event.turnEndDeletion?.deletedCardId === "BT15-031",
      );
      expect(effectIndex).toBeGreaterThan(-1);
      expect(deletionIndex).toBeGreaterThan(-1);
      expect(effectIndex < deletionIndex).toBe(effectFirst);
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );
});
