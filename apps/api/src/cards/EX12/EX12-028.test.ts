import { describe, expect, it } from "vitest";
import {
  digivolutionRequirementsFor,
  dnaDigivolutionRequirementsFor,
  EffectTiming,
  getCardDefinition,
} from "@aegis/shared";
import { advance } from "../../engine/testkit/advance.js";
import { observe } from "../../engine/testkit/observe.js";
import { setupEngine, settle } from "../../engine/testkit/harness.js";
import { compiled } from "./EX12-028.js";
import "../index.js";

describe("EX12-028 Gusokumon", () => {
  it("maps the printed evolution routes, keywords, once-per-turn watcher, and inherited redirect", () => {
    const card = getCardDefinition("EX12-028");
    expect(card).toMatchObject({
      nameEn: "Gusokumon",
      colors: ["Blue", "Black"],
      playCost: 8,
      dp: 8000,
      level: 5,
      forms: ["Ultimate"],
      attributes: ["Vaccine"],
      types: ["Crustacean", "DS"],
      evoCosts: [
        { color: "Blue", level: 4, memoryCost: 4 },
        { color: "Black", level: 4, memoryCost: 4 },
      ],
    });
    expect(card?.effectText).toContain("[DNA Digivolve] Blue/Purple Lv.4 + Black/Yellow Lv.4 : Cost 0");
    expect(card?.inheritedEffectText).toContain("change the attack target");
    expect(compiled.digivolutionRequirement).toEqual([{ level: 4, traits: ["DS"], cost: 3, isAlternate: true }]);
    expect(compiled.dnaDigivolveRequirement).toEqual([
      {
        cost: 0,
        materials: [
          { color: "Blue", level: 4 },
          { color: "Black", level: 4 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Blue", level: 4 },
          { color: "Yellow", level: 4 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Purple", level: 4 },
          { color: "Black", level: 4 },
        ],
      },
      {
        cost: 0,
        materials: [
          { color: "Purple", level: 4 },
          { color: "Yellow", level: 4 },
        ],
      },
    ]);

    expect(compiled.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ trigger: "Static", keywords: [{ keyword: "Blocker", raw: "＜Blocker＞" }] }),
        expect.objectContaining({
          trigger: "Static",
          keywords: [{ keyword: "Decode", raw: "＜Decode (Lv.4 or lower w/[DS] trait)＞" }],
        }),
      ]),
    );
    expect(
      compiled.effects.find((effect) => effect.actions.some((action) => action.kind === "SubTrigger")),
    ).toMatchObject({
      frequency: "OncePerTurn",
      actions: [{ kind: "SubTrigger", event: "whenAttacking" }],
    });
    expect(
      compiled.effects.find((effect) =>
        effect.actions.some((action) => action.kind === "Replacement" && action.event === "wouldLeavePlay"),
      ),
    ).toMatchObject({
      trigger: "AllTurns",
      actions: [
        {
          kind: "Replacement",
          event: "wouldLeavePlay",
          leaveCause: "otherThanBattle",
          sourceFilter: { isSelfRef: true },
          actions: [
            {
              kind: "PlayWithoutCost",
              from: ["digivolutionCards"],
              payCost: false,
              playedByDecode: true,
              optional: true,
              target: {
                filter: {
                  hostFilter: { isSelfRef: true },
                  levelComparison: { op: "lte", value: 4 },
                  nameOrTrait: [{ tokens: ["DS"], match: "trait" }],
                },
              },
            },
          ],
        },
      ],
    });
    expect(compiled.effects.find((effect) => effect.isInherited)).toMatchObject({
      trigger: "OpponentsTurn",
      frequency: "OncePerTurn",
      actions: [
        { kind: "SubTrigger", event: "whenOpponentAttacks", actions: [{ kind: "RedirectAttack", optional: true }] },
      ],
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
  });

  it("executes Decode before an effect-caused leave but not a battle leave", async () => {
    const byEffect = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-028", as: "host", under: [{ card: "EX12-027", as: "decodeTarget" }] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await byEffect.ready();
    const hostId = byEffect.perm("host").permanentId;
    const targetId = byEffect.inst("decodeTarget").instanceId;

    expect(await advance(byEffect.engine).verb.deletePermanent([hostId], "byEffect")).toBe(1);
    await settle(() =>
      byEffect.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === targetId),
    );
    expect(byEffect.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === hostId)).toBe(false);

    const byBattle = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-028", as: "host", under: [{ card: "EX12-027", as: "decodeTarget" }] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await byBattle.ready();
    const battleTargetId = byBattle.inst("decodeTarget").instanceId;
    expect(await advance(byBattle.engine).verb.deletePermanent([byBattle.perm("host").permanentId], "byBattle")).toBe(
      1,
    );
    expect(
      byBattle.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === battleTargetId),
    ).toBe(false);
  });

  it("does not Decode a level-5 DS source above the printed ceiling", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-028", as: "host", under: [{ card: "EX12-028", as: "tooHigh" }] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const targetId = s.inst("tooHigh").instanceId;

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === targetId)).toBe(false);
  });

  it("Decodes only from its own digivolution cards, never from a neighbor's stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-028", as: "host" },
            { card: "BT1-010", as: "neighbor", under: [{ card: "EX12-027", as: "foreign" }] },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();
    const foreignId = s.inst("foreign").instanceId;

    expect(await advance(s.engine).verb.deletePermanent([s.perm("host").permanentId], "byEffect")).toBe(1);
    await settle();

    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.instanceId === foreignId)).toBe(false);
    expect(s.perm("neighbor").stack.some((card) => card.instanceId === foreignId)).toBe(true);
  });

  it("places one DS card, de-digivolves one opponent, and gains memory at 0 or less", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-028", as: "host" }],
          hand: [{ card: "EX12-023", as: "material" }],
        },
        1: {
          battleArea: [
            { card: "BT1-083", as: "target", under: ["BT1-001"] },
            { card: "BT1-013", as: "attacker" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenAttacking", {
      attackerPermanentId: s.perm("attacker").permanentId,
    });
    await settle(
      () =>
        s.perm("host").stack.length === 1 &&
        s.state.players[1]!.trash.some((card) => card.cardId === "BT1-001") &&
        s.state.pendingDecision === undefined,
    );

    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["EX12-023"]);
    expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(
      expect.arrayContaining(["BT1-083", "BT1-001"]),
    );
    expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT1-001")).toBe(false);
    expect(s.state.memory).toBe(1);
  });

  it("does not resolve the dependent effects without a DS card in hand and is once per turn", async () => {
    const s = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-028", as: "host" }] },
        1: {
          battleArea: [
            { card: "BT1-083", as: "target", under: ["BT1-001"] },
            { card: "BT1-013", as: "attacker" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenAttacking", {
      attackerPermanentId: s.perm("attacker").permanentId,
    });
    await settle();
    expect(s.perm("host").stack).toHaveLength(0);
    expect(s.perm("target").stack).toHaveLength(1);
    expect(s.state.memory).toBe(0);

    const withMaterial = setupEngine(
      {
        0: { battleArea: [{ card: "EX12-028", as: "host" }], hand: [{ card: "EX12-023", as: "material" }] },
        1: {
          battleArea: [
            { card: "BT1-083", as: "target", under: ["BT1-001"] },
            { card: "BT1-013", as: "attacker" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    withMaterial.state.memory = 1;
    await withMaterial.ready();
    const event = { attackerPermanentId: withMaterial.perm("attacker").permanentId };
    await advance(withMaterial.engine).fireSubTrigger("whenAttacking", event);
    await settle(() => withMaterial.perm("host").stack.length === 1);
    await advance(withMaterial.engine).fireSubTrigger("whenAttacking", event);
    await settle();
    expect(withMaterial.perm("host").stack).toHaveLength(1);
    expect(withMaterial.state.memory).toBe(1);
  });

  it("honors a declined placement and suppresses everything after it (Q6758)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-028", as: "host" }],
          hand: [{ card: "EX12-023", as: "material" }],
        },
        1: {
          battleArea: [
            { card: "BT1-083", as: "target", under: ["BT1-009", "EX12-024", "EX12-032"] },
            { card: "BT1-013", as: "attacker" },
          ],
        },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenAttacking", {
      attackerPermanentId: s.perm("attacker").permanentId,
    });
    await settle(() => s.state.pendingDecision === undefined);

    expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("material").instanceId)).toBe(true);
    expect(s.perm("host").stack).toHaveLength(0);
    expect(s.perm("target").topCard?.cardId).toBe("BT1-083");
    expect(s.state.memory).toBe(0);
  });

  it("gains one memory from a negative gauge position after paying the placement (Q6759)", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "EX12-028", as: "host" }],
          hand: [{ card: "EX12-023", as: "material" }],
        },
        1: {
          battleArea: [
            { card: "BT1-083", as: "target", under: ["BT1-009", "EX12-024", "EX12-032"] },
            { card: "BT1-013", as: "attacker" },
          ],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = -2;
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenAttacking", {
      attackerPermanentId: s.perm("attacker").permanentId,
    });
    await settle(() => s.perm("host").stack.length === 1);

    expect(s.state.memory).toBe(-1);
  });

  it("reads its owner's side of the memory gauge when the opponent attacks on their turn (Q6759)", async () => {
    for (const [turnPlayerMemory, memoryAfter] of [
      [2, 1],
      [-1, -1],
    ] as const) {
      const s = setupEngine(
        {
          0: {
            battleArea: [{ card: "EX12-028", as: "host" }],
            hand: [{ card: "EX12-023", as: "material" }],
          },
          1: {
            battleArea: [
              { card: "BT1-083", as: "target", under: ["BT1-001"] },
              { card: "BT1-013", as: "attacker" },
            ],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.turnSeat = 1;
      s.state.memory = turnPlayerMemory;
      await s.ready();

      await advance(s.engine).fireSubTrigger("whenAttacking", {
        attackerPermanentId: s.perm("attacker").permanentId,
      });
      await settle(
        () =>
          s.perm("host").stack.length === 1 &&
          s.state.players[1]!.trash.some((card) => card.cardId === "BT1-001") &&
          s.state.pendingDecision === undefined,
      );

      expect(s.state.players[1]!.trash.map((card) => card.cardId)).toEqual(
        expect.arrayContaining(["BT1-083", "BT1-001"]),
      );
      expect(s.state.players[1]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT1-001")).toBe(false);
      expect(s.state.memory).toBe(memoryAfter);
    }
  });

  it("triggers from one of its controller's attacks because the printed watcher sees any Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-028", as: "host" },
            { card: "BT1-013", as: "attacker" },
          ],
          hand: [{ card: "EX12-023", as: "material" }],
        },
        1: { battleArea: [{ card: "BT1-083", as: "target", under: ["BT1-009", "EX12-024", "EX12-032"] }] },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    await s.ready();

    await advance(s.engine).fireSubTrigger("whenAttacking", {
      attackerPermanentId: s.perm("attacker").permanentId,
    });
    await settle(() => s.perm("host").stack.length === 1);

    expect(s.perm("target").topCard?.cardId).toBe("EX12-032");
  });

  it("runs the attack watcher through a public attack and resolves its placement, peel, and memory gain", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-028", as: "host" },
            { card: "BT1-013", as: "attacker", dp: 12000 },
          ],
          hand: [{ card: "EX12-023", as: "material" }],
        },
        1: {
          battleArea: [{ card: "BT1-083", as: "target", suspended: true, under: ["BT1-001"] }],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    s.state.memory = 0;
    await s.ready();
    const attackerId = s.perm("attacker").permanentId;
    const peeledId = s.inst("target").instanceId;

    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: attackerId,
        target: { kind: "permanent", permanentId: s.perm("target").permanentId },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.perm("host").stack.length === 1 &&
        s.state.players[1]!.battleArea.length === 0 &&
        s.state.players[1]!.trash.some((card) => card.instanceId === peeledId),
    );

    expect(s.events.some((event) => event.kind === "attackDeclared" && event.attackerPermanentId === attackerId)).toBe(
      true,
    );
    expect(s.perm("host").stack.map((card) => card.cardId)).toEqual(["EX12-023"]);
    expect(s.state.players[1]!.trash.map((card) => card.cardId).sort()).toEqual(["BT1-001", "BT1-083"]);
    expect(s.state.memory).toBe(1);
    expect(s.state.pendingDecision).toBeUndefined();
  });

  it("redirects an opponent attack to an inherited DS Digimon", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-015", as: "host", under: ["EX12-028"] },
            { card: "EX12-023", as: "redirect" },
          ],
        },
        1: { battleArea: [{ card: "BT1-009", as: "attacker" }], security: ["BT1-010"] },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 1;
    await s.ready();
    const redirectId = s.perm("redirect").permanentId;

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "combatResolved"));

    expect(s.state.players[1]!.security).toHaveLength(1);
    expect(s.state.players[0]!.battleArea.some((permanent) => permanent.permanentId === redirectId)).toBe(false);
  });

  it("uses the inherited redirect only once across two opponent attacks", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [
            { card: "EX12-015", as: "host", under: ["EX12-028"] },
            { card: "EX12-023", as: "firstRedirect" },
            { card: "EX12-023", as: "secondRedirect" },
          ],
        },
        1: {
          battleArea: [
            { card: "BT1-009", as: "firstAttacker" },
            { card: "BT1-009", as: "secondAttacker" },
          ],
          security: ["BT1-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true, autoChooseOption: true, autoOrderTriggers: true },
    );
    s.state.turnSeat = 1;
    await s.ready();

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("firstAttacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.filter((event) => event.kind === "combatResolved").length === 1);
    expect(s.state.players[1]!.security).toHaveLength(1);

    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("secondAttacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "gameOver"));
    expect(s.events.at(-1)).toMatchObject({ kind: "gameOver", result: { outcome: "win", winnerSeat: 1 } });

    expect(s.state.players[0]!.battleArea.filter((permanent) => permanent.topCard?.cardId === "EX12-023")).toHaveLength(
      1,
    );
  });

  it("uses both normal colors and the alternate DS evolution route", async () => {
    expect(digivolutionRequirementsFor("EX12-028")).toEqual([{ level: 4, traits: ["DS"], cost: 3, isAlternate: true }]);

    for (const [baseCardId, useAlternateCost, startingMemory] of [
      ["AD1-010", false, 4],
      ["BT10-061", false, 4],
      ["EX8-058", true, 3],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [{ card: baseCardId, as: "base" }],
          hand: [{ card: "EX12-028", as: "gusokumon" }],
        },
      });
      s.state.memory = startingMemory;
      await s.ready();

      expect(
        s.engine.applyIntent(0, {
          type: "digivolve",
          permanentId: s.perm("base").permanentId,
          instanceId: s.inst("gusokumon").instanceId,
          useAlternateCost,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.perm("base").topCard?.cardId === "EX12-028");
      expect(s.state.memory).toBe(0);
    }
  });

  it("DNA digivolves through all four printed color combinations for zero", async () => {
    expect(dnaDigivolutionRequirementsFor("EX12-028")).toEqual(compiled.dnaDigivolveRequirement);

    for (const [firstCardId, secondCardId] of [
      ["AD1-010", "BT10-061"],
      ["AD1-010", "BT1-051"],
      ["BT10-074", "BT10-061"],
      ["BT10-074", "BT1-051"],
    ] as const) {
      const s = setupEngine({
        0: {
          battleArea: [
            { card: firstCardId, as: "first" },
            { card: secondCardId, as: "second" },
          ],
          hand: [{ card: "EX12-028", as: "gusokumon" }],
        },
      });

      expect(
        s.engine.applyIntent(0, {
          type: "dnaDigivolve",
          materialPermanentIds: [s.perm("first").permanentId, s.perm("second").permanentId],
          instanceId: s.inst("gusokumon").instanceId,
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.players[0]!.battleArea.some((permanent) => permanent.topCard?.cardId === "EX12-028"));
      expect(s.state.memory).toBe(0);
    }
  });

  it("rejects an off-color non-DS evolution base and an invalid DNA pair", () => {
    const evolution = setupEngine({
      0: {
        battleArea: [{ card: "BT1-014", as: "base" }],
        hand: [{ card: "EX12-028", as: "gusokumon" }],
      },
    });
    expect(
      evolution.engine.applyIntent(0, {
        type: "digivolve",
        permanentId: evolution.perm("base").permanentId,
        instanceId: evolution.inst("gusokumon").instanceId,
        useAlternateCost: true,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));

    const dna = setupEngine({
      0: {
        battleArea: [
          { card: "AD1-010", as: "first" },
          { card: "BT10-074", as: "second" },
        ],
        hand: [{ card: "EX12-028", as: "gusokumon" }],
      },
    });
    expect(
      dna.engine.applyIntent(0, {
        type: "dnaDigivolve",
        materialPermanentIds: [dna.perm("first").permanentId, dna.perm("second").permanentId],
        instanceId: dna.inst("gusokumon").instanceId,
      }),
    ).toEqual(expect.objectContaining({ ok: false }));
  });

  it("exposes Blocker and Decode only while Gusokumon is the top card", async () => {
    const s = setupEngine({
      0: {
        battleArea: [
          { card: "EX12-028", as: "source" },
          { card: "BT1-010", as: "plainHost", under: ["EX12-028"] },
        ],
      },
    });
    await s.ready();

    expect(observe(s.engine).hasKeyword(s.perm("source"), "Blocker")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("source"), "Decode")).toBe(true);
    expect(observe(s.engine).hasKeyword(s.perm("plainHost"), "Blocker")).toBe(false);
    expect(observe(s.engine).hasKeyword(s.perm("plainHost"), "Decode")).toBe(false);
  });

  it("registers through the compiled IR module", () => {
    expect(EffectTiming.None).toBeDefined();
    expect(compiled.effects).toHaveLength(5);
  });
});
