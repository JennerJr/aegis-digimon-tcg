import { describe, expect, it } from "vitest";
import { getCardDefinition, Phase } from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { settle, setupEngine } from "../../engine/testkit/harness.js";
import "./index.js";
import { compiled } from "./EX8-009.js";

describe("EX8-009", () => {
  it("matches the catalog's Guilmon (X Antibody) identity, evolution paths, and text", () =>
    expect(getCardDefinition("EX8-009")).toMatchObject({
      cardId: "EX8-009",
      nameEn: "Guilmon (X Antibody)",
      colors: ["Red", "Purple"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 2000,
      evoCosts: [
        { color: "Red", level: 2, memoryCost: 1 },
        { color: "Purple", level: 2, memoryCost: 1 },
      ],
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Dark Dragon", "X Antibody"],
      effectText:
        "[Digivolve][Gigimon]/[Guilmon]: Cost 0 \n\n[On Play] [When Digivolving] Reveal the top 3 cards of your deck. Add 1 card with [Growlmon]/[Gallantmon]\u00a0in its name and 1 [X Antibody] among them to the hand. Return the rest to the bottom of the deck.",
      inheritedEffectText: "[Your Turn] [Once Per Turn] When any of your opponent's Digimon is deleted, gain 1 memory.",
    }));

  it("matches the catalog's Guilmon (X Antibody) identity, evolution paths, and text", () =>
    expect(getCardDefinition("EX8-009")).toMatchObject({
      cardId: "EX8-009",
      nameEn: "Guilmon (X Antibody)",
      colors: ["Red", "Purple"],
      kinds: ["Digimon"],
      level: 3,
      playCost: 3,
      dp: 2000,
      evoCosts: [
        { color: "Red", level: 2, memoryCost: 1 },
        { color: "Purple", level: 2, memoryCost: 1 },
      ],
      forms: ["Rookie"],
      attributes: ["Virus"],
      types: ["Dark Dragon", "X Antibody"],
      effectText:
        "[Digivolve][Gigimon]/[Guilmon]: Cost 0 \n\n[On Play] [When Digivolving] Reveal the top 3 cards of your deck. Add 1 card with [Growlmon]/[Gallantmon]\u00a0in its name and 1 [X Antibody] among them to the hand. Return the rest to the bottom of the deck.",
      inheritedEffectText: "[Your Turn] [Once Per Turn] When any of your opponent's Digimon is deleted, gain 1 memory.",
    }));

  it("reveals 3 for Growlmon/Gallantmon and X Antibody cards on play and digivolving", () => {
    expect(compiled.effects?.find((entry) => entry.trigger === "OnPlay")?.actions[0]).toMatchObject({
      kind: "RevealAdd",
      revealCount: 3,
      add: [
        { count: 1, to: "hand" },
        { count: 1, to: "hand" },
      ],
    });
    expect(compiled.effects?.find((entry) => entry.trigger === "WhenDigivolving")?.actions[0]).toMatchObject({
      kind: "RevealAdd",
      revealCount: 3,
    });
  });
  it("inherits once-per-turn memory gain when an opposing Digimon is deleted during your turn", () =>
    expect(compiled.effects?.find((entry) => entry.isInherited)).toMatchObject({
      frequency: "OncePerTurn",
      actions: [{ kind: "SubTrigger", event: "onDeletionOf", actions: [{ kind: "GainMemory", amount: 1 }] }],
    }));
  it("selects the printed name and X Antibody matches from the live reveal", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX8-009", as: "guilmon" }],
          deck: [
            { card: "AD1-003", as: "growlmon" },
            { card: "BT9-109", as: "xantibody" },
            { card: "AD1-001", as: "decoy" },
            { card: "BT1-045", as: "anchor" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.hand.some((card) => card.cardId === "AD1-003") &&
        s.state.players[0]!.hand.some((card) => card.cardId === "BT9-109"),
    );
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(expect.arrayContaining(["AD1-003", "BT9-109"]));
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-045", "AD1-001"]);
  });

  it.each([
    ["BT9-109", "the X Antibody Option"],
    ["EX5-070", "X Antibody Proto Form's additional name"],
  ] as const)("adds %s through %s", async (xAntibodyOption, _label) => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX8-009", as: "guilmon" }],
          deck: [
            { card: "AD1-003", as: "growlmon" },
            { card: xAntibodyOption, as: "xAntibodyOption" },
            { card: "AD1-001", as: "decoy" },
            { card: "BT1-045", as: "anchor" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(
      () =>
        s.state.players[0]!.hand.some((card) => card.cardId === "AD1-003") &&
        s.state.players[0]!.hand.some((card) => card.cardId === xAntibodyOption),
    );
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["AD1-003", xAntibodyOption]),
    );
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-045", "AD1-001"]);
  });

  it("rejects a Digimon that only has the X Antibody trait", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX8-009", as: "guilmon" }],
          deck: [
            { card: "AD1-003", as: "growlmon" },
            { card: "BT10-080", as: "traitOnlyXAntibody" },
            { card: "AD1-001", as: "decoy" },
            { card: "BT1-045", as: "anchor" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "AD1-003"));
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["AD1-003"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-045", "BT10-080", "AD1-001"]);
  });

  it.each([
    ["BT19-009", "ST7-05", "EX8-015"],
    ["BT19-091", "BT19-009", "BT19-009"],
  ] as const)("feedback #49: %s / %s / %s provide only one name-search slot", async (...revealed) => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX2-008", as: "base" }],
          hand: [{ card: "EX8-009", as: "guilmon" }],
          deck: [
            { card: "BT1-045", as: "draw" },
            ...revealed.map((card, index) => ({ card, as: `reveal${index}` })),
            { card: "BT1-046", as: "anchor" },
          ],
        },
      },
      { autoOrderCards: false },
    );
    s.state.memory = 3;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("base").permanentId,
        instanceId: s.inst("guilmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "selectCards");
    const pick = s.state.pendingDecision!;
    const candidates = s.decisions.at(-1)!.req.options!.candidateInstanceIds!;
    expect(s.decisions.at(-1)!.req.options).toMatchObject({ min: 1, max: 1 });
    expect(candidates).toEqual(
      revealed[0] === "BT19-091"
        ? [s.inst("reveal1").instanceId, s.inst("reveal2").instanceId]
        : [s.inst("reveal0").instanceId, s.inst("reveal1").instanceId, s.inst("reveal2").instanceId],
    );
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: pick.decisionId,
        response: { kind: "selectCards", instanceIds: [candidates[0]!] },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "orderCards");
    const order = s.state.pendingDecision!;
    const remaining = [0, 1, 2]
      .map((index) => s.inst(`reveal${index}`).instanceId)
      .filter((id) => id !== candidates[0]);
    expect(s.decisions.at(-1)!.req.options!.candidateInstanceIds).toEqual(remaining);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: order.decisionId,
        response: { kind: "orderCards", order: [...remaining].reverse() },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        !s.state.pendingDecision &&
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX8-009"),
    );
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toEqual([s.inst("draw").instanceId, candidates[0]]);
    expect(s.state.players[0]!.deck.map((card) => card.instanceId)).toEqual([
      s.inst("anchor").instanceId,
      ...remaining.reverse(),
    ]);
    expect(s.state.memory).toBe(3);
    expect(s.perm("base").topCard.instanceId).toBe(s.inst("guilmon").instanceId);
    expect(s.perm("base").stack.map((card) => card.cardId)).toEqual(["EX2-008"]);
    expect(s.decisions.filter(({ req }) => req.sourceCardId === "EX8-009").map(({ req }) => req.kind)).toEqual([
      "selectCards",
      "orderCards",
    ]);
  });

  it("still adds X Antibody when no Growlmon or Gallantmon is revealed", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [{ card: "EX8-009", as: "guilmon" }],
          deck: [
            { card: "AD1-001", as: "decoy" },
            { card: "BT9-109", as: "xantibody" },
            { card: "BT1-045", as: "anchor" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 10;
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("guilmon").instanceId })).toEqual({
      ok: true,
    });
    await settle(() => s.state.players[0]!.hand.some((card) => card.cardId === "BT9-109"));
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(["BT9-109"]);
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["AD1-001", "BT1-045"]);
  });

  it("gains memory for only the first opposing deletion during its controller's turn", async () => {
    const s = setupEngine({
      0: {
        deck: ["BT1-045"],
        battleArea: [{ card: "BT1-009", as: "host", under: [{ card: "EX8-009", as: "guilmon" }] }],
      },
      1: {
        battleArea: [
          { card: "BT1-009", as: "opponent1" },
          { card: "BT1-010", as: "opponent2" },
          { card: "BT1-011", as: "opponent3" },
        ],
      },
    });
    await s.ready();
    s.state.turnSeat = 0;
    s.state.memory = 0;
    await advance(s.engine).verb.deletePermanent([s.perm("opponent1").permanentId], "byEffect");
    await settle(() => s.state.memory === 1);
    expect(s.state.memory).toBe(1);
    await advance(s.engine).verb.deletePermanent([s.perm("opponent2").permanentId], "byEffect");
    expect(s.state.memory).toBe(1);

    s.state.phase = Phase.End;
    const nextTurn = s.engine.runOneTurn();
    await settle(() => s.state.phase === Phase.Main && s.state.turnCount === 1);
    await advance(s.engine).verb.deletePermanent([s.perm("opponent3").permanentId], "byEffect");
    await settle(() => s.state.memory === 2);
    expect(s.state.memory).toBe(2);
    expect(s.engine.applyIntent(0, { type: "endPhase" })).toEqual({ ok: true });
    await nextTurn;
  });

  it("does not gain memory on the opponent's turn or when its host is deleted simultaneously (Q3874)", async () => {
    const opponentTurn = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "host", under: ["EX8-009"] }] },
      1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
    });
    await opponentTurn.ready();
    opponentTurn.state.turnSeat = 1;
    opponentTurn.state.memory = 0;
    await advance(opponentTurn.engine).verb.deletePermanent([opponentTurn.perm("opponent").permanentId], "byEffect");
    expect(opponentTurn.state.memory).toBe(0);

    const simultaneous = setupEngine({
      0: { battleArea: [{ card: "BT1-009", as: "host", under: ["EX8-009"] }] },
      1: { battleArea: [{ card: "BT1-009", as: "opponent" }] },
    });
    await simultaneous.ready();
    simultaneous.state.memory = 0;
    await advance(simultaneous.engine).verb.deletePermanent(
      [simultaneous.perm("host").permanentId, simultaneous.perm("opponent").permanentId],
      "byEffect",
    );
    expect(simultaneous.state.memory).toBe(0);
  });

  it.each(["BT12-001", "EX13-001"])("uses the %s Gigimon alternate for 0 in breeding", async (egg) => {
    const s = setupEngine({
      0: {
        breeding: { card: egg, as: "gigimon" },
        hand: [{ card: "EX8-009", as: "guilmon" }],
      },
    });
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("gigimon").permanentId,
        instanceId: s.inst("guilmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("gigimon").topCard.instanceId === s.inst("guilmon").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.perm("gigimon").topCard.cardId).toBe("EX8-009");
    expect(s.perm("gigimon").stack.map((card) => card.cardId)).toEqual([egg]);
    expect(s.state.pendingDecision).toBeUndefined();
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX8-009")).toBe(false);
  });

  it.each([
    ["BT1-001", "red Yokomon"],
    ["BT2-007", "purple Pagumon"],
  ] as const)("digivolves for 1 from the printed %s standard path (%s)", async (egg, _label) => {
    const s = setupEngine({
      0: { breeding: { card: egg, as: "egg" }, hand: [{ card: "EX8-009", as: "guilmon" }] },
    });
    s.state.memory = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("egg").permanentId,
        instanceId: s.inst("guilmon").instanceId,
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("egg").topCard.instanceId === s.inst("guilmon").instanceId);
    expect(s.state.memory).toBe(0);
    expect(s.perm("egg").stack.map((card) => card.cardId)).toEqual([egg]);
  });

  it("rejects a green Lv.2 standard path", async () => {
    const s = setupEngine({
      0: { breeding: { card: "BT1-007", as: "greenEgg" }, hand: [{ card: "EX8-009", as: "guilmon" }] },
    });
    s.state.memory = 1;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("greenEgg").permanentId,
        instanceId: s.inst("guilmon").instanceId,
      }),
    ).toEqual({ ok: false, reason: "invalid-evolution" });
  });

  it("finds both When Digivolving matches from a battle-area Guilmon base", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT2-009", as: "guilmonBase" }],
          hand: [{ card: "EX8-009", as: "guilmon" }],
          deck: [
            { card: "BT1-046", as: "digivolveDraw" },
            { card: "AD1-003", as: "growlmon" },
            { card: "EX5-070", as: "xAntibodyProtoForm" },
            { card: "AD1-001", as: "decoy" },
            { card: "BT1-045", as: "anchor" },
          ],
        },
      },
      { autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();
    expect(
      s.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: s.perm("guilmonBase").permanentId,
        instanceId: s.inst("guilmon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.hand.some((card) => card.cardId === "AD1-003") &&
        s.state.players[0]!.hand.some((card) => card.cardId === "EX5-070"),
    );
    expect(s.state.memory).toBe(0);
    expect(s.perm("guilmonBase").topCard.cardId).toBe("EX8-009");
    expect(s.state.players[0]!.hand.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT1-046", "AD1-003", "EX5-070"]),
    );
    expect(s.state.players[0]!.deck.map((card) => card.cardId)).toEqual(["BT1-045", "AD1-001"]);
  });
});
