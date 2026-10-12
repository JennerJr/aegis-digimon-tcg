import { EffectTiming, Phase } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { type PermanentSpec, setupEngine, settle } from "../../engine/testkit/harness.js";
import "../BT2/BT2-013.js";
import "../BT4/BT4-038.js";
import "../BT6/BT6-070.js";
import "../BT6/BT6-082.js";
import { compiled } from "./BT10-016.js";
import "./BT10-112.js";

describe("BT10-016 Jesmon (X Antibody)", () => {
  it("encodes Piercing, exact Jesmon evolution for 0, player-wide DP, and the later-entrant attack watchers", () => {
    expect(compiled.effects[0]?.keywords).toEqual([expect.objectContaining({ keyword: "Piercing" })]);
    expect(compiled.digivolutionRequirement).toEqual([{ names: ["Jesmon"], cost: 0, isAlternate: true }]);
    const laterEntrantWatcher = (event: string) =>
      expect.objectContaining({
        kind: "SubTrigger",
        event,
        playerScoped: true,
        actions: [
          expect.objectContaining({
            kind: "GrantCanAttackUnsuspended",
            target: expect.objectContaining({ sourceRef: "triggerSubject", count: "all" }),
          }),
        ],
      });
    expect(compiled.effects[1]?.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "PlayWithoutCost", from: ["hand", "trash"], optional: true }),
        expect.objectContaining({
          kind: "ModifyDP",
          playerWide: true,
          amount: 2000,
          duration: "untilOpponentTurnEnd",
        }),
        expect.objectContaining({ kind: "GrantCanAttackUnsuspended", duration: "untilOpponentTurnEnd" }),
        laterEntrantWatcher("whenPlayed"),
        laterEntrantWatcher("whenMovedFromBreeding"),
      ]),
    );
  });

  it("plays a Sistermon and applies only one +2000 DP bonus when both gates match (Q1944)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-016", as: "base" }],
          hand: [
            { card: "BT10-016", as: "evolving" },
            { card: "BT6-082", as: "sister" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").currentDP === 13000 && observe(s.engine).canAttackUnsuspended(s.perm("base")));
    expect(s.perm("base").currentDP).toBe(13000);
    expect(
      s.state.players[0]!.battleArea.find((p) => p.topCard?.instanceId === s.inst("sister").instanceId)?.currentDP,
    ).toBe(5000);
    expect(observe(s.engine).canAttackUnsuspended(s.perm("base"))).toBe(true);
    expect(observe(s.engine).hasPierce(s.perm("base"))).toBe(true);
  });

  it("does not digivolve onto another Jesmon (X Antibody) through its exact [Jesmon] requirement", () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT10-016", as: "base" }],
          hand: [{ card: "BT10-016", as: "evolving" }],
        },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 1;

    const result = s.engine.applyIntent(0, {
      type: "digivolve",
      permanentId: s.perm("base").permanentId,
      instanceId: s.inst("evolving").instanceId,
    });

    expect(result).toEqual({ ok: false, reason: "invalid-evolution" });
    expect(s.perm("base").topCard.instanceId).not.toBe(s.inst("evolving").instanceId);
    expect(s.state.players[0]!.hand).toContainEqual(s.inst("evolving"));
    expect(s.state.memory).toBe(1);
    expect(s.perm("base").currentDP).toBe(11_000);
  });

  it("does not treat Jesmon (X Antibody) as the exact Jesmon source for its bonus", async () => {
    const s = setupEngine({
      0: { battleArea: [{ card: "BT10-016", as: "jesmonX", under: ["BT10-016"] }] },
    });

    await advance(s.engine).fire(EffectTiming.WhenDigivolving, s.perm("jesmonX"));

    expect(s.perm("jesmonX").currentDP).toBe(11_000);
    expect(observe(s.engine).canAttackUnsuspended(s.perm("jesmonX"))).toBe(false);
  });

  it("grants DP and unsuspended targets to current and later Digimon without bypassing summoning sickness (Q1945)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "BT6-016", as: "base" },
            { card: "BT10-008", as: "currentAlly" },
          ],
          hand: [
            { card: "BT10-016", as: "evolving" },
            { card: "BT10-008", as: "laterAlly" },
          ],
        },
        1: { battleArea: [{ card: "BT10-008", as: "unsuspendedOpponent" }] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 3;
    s.state.turnCount += 1;

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        observe(s.engine).canAttackUnsuspended(s.perm("currentAlly")) &&
        s.perm("currentAlly").attackablePermanentIds.includes(s.perm("unsuspendedOpponent").permanentId),
    );

    expect(s.perm("currentAlly").currentDP).toBe(4000);
    expect(s.perm("currentAlly").attackablePermanentIds).toContain(s.perm("unsuspendedOpponent").permanentId);

    expect(await advance(s.engine).verb.deletePermanent([s.perm("base").permanentId])).toBe(1);
    await advance(s.engine).verb.playInstances([s.inst("laterAlly").instanceId]);
    const later = s.state.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === s.inst("laterAlly").instanceId,
    )!;
    await settle(() => later.currentDP === 4000);

    expect(later.currentDP).toBe(4000);
    expect(observe(s.engine).canAttackUnsuspended(later)).toBe(true);
    expect(later.attackablePermanentIds).not.toContain(s.perm("unsuspendedOpponent").permanentId);
  });
});

describe("BT10-016 Jesmon (X Antibody) — later entrants", () => {
  it("gives a Digimon that later moves from breeding +2000 DP and unsuspended attack targets (Discord 1555352172206493706)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-016", as: "base" }],
          breeding: { card: "BT4-038", as: "breedingRush" },
          hand: [{ card: "BT10-016", as: "evolving" }],
        },
        1: { battleArea: [{ card: "BT10-008", as: "unsuspendedOpponent" }] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 3;
    s.state.turnCount += 1;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").currentDP === 13_000);

    s.state.phase = Phase.Breeding;
    expect(
      s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("breedingRush").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).canAttackUnsuspended(s.perm("breedingRush")));
    expect(s.perm("breedingRush").currentDP).toBe(s.perm("breedingRush").baseDP + 2000);

    s.state.phase = Phase.Main;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("breedingRush").permanentId,
        target: { kind: "permanent", permanentId: s.perm("unsuspendedOpponent").permanentId },
      }),
    ).toEqual({ ok: true });
  });

  it("preserves the later-entrant attack grant after its installer digivolves again", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-016", as: "base" }],
          breeding: { card: "BT4-038", as: "breedingRush" },
          hand: [
            { card: "BT10-016", as: "evolving" },
            { card: "BT10-112", as: "nextEvolution" },
          ],
          deck: Array(8).fill("BT10-008"),
        },
        1: { battleArea: [{ card: "BT10-008", as: "unsuspendedOpponent" }] },
      },
      { autoDeclineOptional: true },
    );
    s.state.memory = 10;
    s.state.turnCount += 1;
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("evolving").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("base").currentDP === 13_000);

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("nextEvolution").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("base").topCard.cardId === "BT10-112" &&
        s.state.pendingDecision === undefined &&
        s.engine.activeWindowToken === undefined &&
        s.engine.mainVerbContinuationsInFlight === 0,
    );

    s.state.phase = Phase.Breeding;
    expect(
      s.engine.applyIntent(0, { type: "moveFromBreeding", permanentId: s.perm("breedingRush").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => observe(s.engine).canAttackUnsuspended(s.perm("breedingRush")));
    expect(s.perm("breedingRush").currentDP).toBe(s.perm("breedingRush").baseDP + 2000);

    s.state.phase = Phase.Main;
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("breedingRush").permanentId,
        target: { kind: "permanent", permanentId: s.perm("unsuspendedOpponent").permanentId },
      }),
    ).toEqual({ ok: true });
  });
});

describe("BT10-016 Jesmon (X Antibody) — KB Q&A rulings", () => {
  async function borrowJesmonXThroughJesmonGxBlitz(opponentDigimon: PermanentSpec) {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT6-111", as: "base", under: ["BT2-013"] }],
          hand: [
            { card: "BT10-112", as: "jesmonGx" },
            { card: "BT10-016", as: "jesmonX" },
            { card: "BT6-082", as: "sistermonBlanc" },
          ],
          deck: ["BT1-001", "BT1-002", "BT1-003"],
        },
        1: {
          battleArea: [opponentDigimon],
          security: ["BT10-045", "BT10-045"],
          deck: ["BT1-007"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, preferTriggerKeys: ["BT2-013"] },
    );
    s.state.memory = 4;
    const sistermonBlancInPlay = () =>
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("sistermonBlanc").instanceId,
      );

    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("jesmonGx").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.engine.hasAcceptedBlitzAttack(s.perm("base").permanentId) &&
        sistermonBlancInPlay() &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("base").stack.some((card) => card.instanceId === s.inst("jesmonX").instanceId)).toBe(true);
    const player = s.state.players[0]!;
    // Only the digivolve draw may have happened before the Blitz attack is declared.
    expect(player.deck).toHaveLength(2);
    expect(player.hand).toHaveLength(1);
    return { s, player, sistermonBlancInPlay };
  }

  function declareBlitzAttack(s: ReturnType<typeof setupEngine>): void {
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: s.perm("base").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
  }

  it("holds the borrowed Sistermon Blanc On Play until the Blitz attack so the turn player orders it with When Attacking (Q2044)", async () => {
    const { s, player } = await borrowJesmonXThroughJesmonGxBlitz({ card: "BT10-045", as: "opponentTarget" });

    declareBlitzAttack(s);
    await settle(
      () =>
        player.deck.length === 1 &&
        s.state.players[1]!.battleArea.length === 0 &&
        s.state.pendingDecision === undefined,
    );

    const simultaneousOrder = s.decisions.find(
      ({ req }) => req.kind === "orderTriggers" && (req.options?.triggerCardIds ?? []).includes("BT6-082"),
    );
    expect(simultaneousOrder?.req.options?.triggerCardIds).toEqual(expect.arrayContaining(["BT6-082", "BT2-013"]));
    expect(player.hand).toHaveLength(2);
  });

  it("does not activate the pending Sistermon Blanc On Play once an On Deletion deletes it first (Q2045)", async () => {
    const { s, player, sistermonBlancInPlay } = await borrowJesmonXThroughJesmonGxBlitz({
      card: "BT6-070",
      as: "elecmon",
    });

    declareBlitzAttack(s);
    await settle(
      () =>
        s.state.players[1]!.battleArea.length === 0 && !sistermonBlancInPlay() && s.state.pendingDecision === undefined,
    );

    expect(player.trash.some((card) => card.instanceId === s.inst("sistermonBlanc").instanceId)).toBe(true);
    expect(player.deck).toHaveLength(2);
    expect(player.hand).toHaveLength(1);
  });
});
