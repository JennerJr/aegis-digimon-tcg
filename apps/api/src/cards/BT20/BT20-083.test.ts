import { getCardDefinition } from "@aegis/shared";
import { describe, expect, it } from "vitest";
import { advance } from "../../engine/testkit/advance.js";
import { matchNameOrTrait } from "../../engine/effects/interpreter.js";
import { drainMicrotasks, type SeatSpec, setupEngine, settle } from "../../engine/testkit/harness.js";
import { observe } from "../../engine/testkit/observe.js";
import { compiled } from "./BT20-083.js";
import "../BT1/BT1-085.js";
import "#api/cards/BT13/BT13-007";
import "./index.js";

describe("BT20-083 Omekamon", () => {
  it("has Blocker without granting an unprinted alternate name", () => {
    expect(compiled.effects.find((entry) => entry.trigger === "Static")).toMatchObject({
      keywords: [{ keyword: "Blocker" }],
    });
    expect(compiled.effects.flatMap((entry) => entry.actions)).not.toContainEqual(
      expect.objectContaining({ kind: "GrantStatic", grant: "name" }),
    );
  });

  it("limits the On Play Omnimon (X Antibody) digivolution to one or fewer security cards", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "OnPlay");
    expect(effect?.actions[0]).toMatchObject({
      kind: "Digivolve",
      condition: { kind: "securityAtMost", value: 1 },
      ignoreRequirements: true,
      payCost: false,
    });
  });

  it("places the deleted card under a King Drasil_7D6 in the breeding area", () => {
    const effect = compiled.effects.find((entry) => entry.trigger === "OnDeletion");
    expect(effect?.actions[0]).toMatchObject({
      kind: "PlaceUnder",
      target: { isSelf: true },
      underFilter: {
        controller: "mine",
        zone: "breeding",
        nameOrTrait: [{ tokens: ["King Drasil_7D6"], match: "nameExact" }],
      },
      position: "bottom",
    });
  });

  it("only plays Omekamon from this stack when the owner's security is removed", () => {
    const effect = compiled.effects.find((entry) => entry.isInherited);
    const watcher = effect?.actions[0];
    if (watcher?.kind !== "SubTrigger") throw new Error("Inherited security-removal watcher missing");
    expect(watcher).toMatchObject({
      kind: "SubTrigger",
      event: "whenSecurityRemoved",
      fireCondition: { kind: "triggerRemovedSecuritySeat", seat: "mine" },
    });
    expect(watcher.actions[0]).toMatchObject({
      kind: "PlayWithoutCost",
      fromOwnDigivolutionStack: true,
      payCost: false,
      target: { filter: { nameOrTrait: [{ tokens: ["Omekamon"], match: "nameExact" }] } },
      cost: { kind: "suspend", target: { isSelf: true } },
    });
    expect(effect?.isBreeding).toBe(true);
  });

  it("publishes the catalog identity and exact Omnimon name gate", () => {
    expect(getCardDefinition("BT20-083")).toMatchObject({
      cardId: "BT20-083",
      nameEn: "Omekamon",
      colors: ["White"],
      kinds: ["Digimon"],
      level: 4,
      playCost: 5,
      dp: 5000,
      forms: ["Champion"],
      attributes: ["Data"],
      types: ["Puppet", "X Antibody", "LIBERATOR"],
      effectText: expect.stringContaining("Omnimon (X Antibody)"),
      inheritedEffectText: expect.stringContaining("[Omekamon]"),
    });
    expect(compiled.coverage).toBe("full");
    expect(compiled.residual).toEqual([]);
    const exact = { tokens: ["Omnimon (X Antibody)"], match: "nameExact" as const };
    expect(matchNameOrTrait({ nameEn: "Omnimon (X Antibody)" }, exact)).toBe(true);
    expect(matchNameOrTrait({ nameEn: "Omnimon (X Antibody) Variant" }, exact)).toBe(false);
  });

  it("naturally free-evolves into Omnimon only at one or fewer security cards", async () => {
    for (const [securityCount, evolves] of [
      [0, true],
      [1, true],
      [2, false],
    ] as const) {
      const s = setupEngine(
        {
          0: {
            hand: [
              { card: "BT20-083", as: "omekamon" },
              { card: "BT10-086", as: "omnimon" },
            ],
            security: Array.from({ length: securityCount }, () => "BT20-010"),
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 5;
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("omekamon").instanceId })).toEqual({
        ok: true,
      });
      const expectedTop = evolves ? "BT10-086" : "BT20-083";
      await settle(() => s.state.players[0]!.battleArea[0]?.topCard.cardId === expectedTop);
      expect(s.state.players[0]!.battleArea[0]!.topCard.cardId).toBe(expectedTop);
    }
  });

  it.each([true, false])(
    "checks King Drasil before offering the free On Play evolution at zero security (present=%s)",
    async (hasKingDrasil) => {
      const s = setupEngine(
        {
          0: {
            breeding: hasKingDrasil ? { card: "BT13-007", as: "kingDrasil" } : undefined,
            hand: [
              { card: "BT20-083", as: "omekamon" },
              { card: "BT20-102", as: "omnimon" },
            ],
            security: [],
          },
        },
        { autoAcceptOptional: true, autoSelectCards: true },
      );
      s.state.memory = 5;
      await s.ready();
      expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("omekamon").instanceId })).toEqual({
        ok: true,
      });
      await drainMicrotasks();
      const evolves = !hasKingDrasil;
      expect(s.state.players[0]!.battleArea[0]?.topCard.cardId).toBe(evolves ? "BT20-102" : "BT20-083");
      expect(s.state.players[0]!.hand.some((card) => card.instanceId === s.inst("omnimon").instanceId)).toBe(!evolves);
      expect(s.state.players[0]!.security).toHaveLength(0);
    },
  );

  it("allows the printed On Play evolution to be declined", async () => {
    const s = setupEngine(
      {
        0: {
          hand: [
            { card: "BT20-083", as: "omekamon" },
            { card: "BT10-086", as: "omnimon" },
          ],
          security: ["BT20-010"],
        },
      },
      { autoAcceptOptional: false, autoDeclineOptional: true, autoSelectCards: true },
    );
    s.state.memory = 10;
    await s.ready();
    expect(s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("omekamon").instanceId })).toEqual({
      ok: true,
    });
    await drainMicrotasks();
    expect(s.events.some((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT20-083")).toBe(false);
    expect(s.state.players[0]!.battleArea[0]!.topCard.cardId).toBe("BT20-083");
    expect(s.state.players[0]!.hand.map((card) => card.instanceId)).toContain(s.inst("omnimon").instanceId);
  });

  it("uses the public Blocker window when an opponent attacks", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT20-083", as: "omekamon" }],
          security: ["BT20-010", "BT20-010"],
          deck: ["BT20-010", "BT20-010"],
        },
        1: { battleArea: [{ card: "BT20-010", dp: 5000, as: "attacker" }], deck: ["BT20-010", "BT20-010"] },
      },
      { autoDeclineOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "blockWindowOpened"));
    expect(
      s.engine.applyIntent(0, { type: "declareBlock", blockerPermanentId: s.perm("omekamon").permanentId }),
    ).toEqual({ ok: true });
    await settle(() => s.events.some((event) => event.kind === "combatResolved"));
    expect(s.state.players[0]!.security).toHaveLength(2);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it.each([true, false])("publicly resolves On Deletion placement under King Drasil (accept=%s)", async (accept) => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", under: [{ card: "BT20-083", as: "existingBottom" }], as: "kingDrasil" },
          battleArea: [{ card: "BT20-083", as: "omekamon" }],
          deck: ["BT20-010", "BT20-010"],
        },
        1: {
          battleArea: [{ card: "BT20-076", dp: 20000, as: "attacker" }],
          security: ["BT20-010", "BT20-010"],
          deck: ["BT20-010", "BT20-010"],
        },
      },
      { autoAcceptOptional: false, autoDeclineOptional: false, autoSelectCards: true },
    );
    const omekamonInstanceId = s.perm("omekamon").topCard.instanceId;
    const omekamonPermanentId = s.perm("omekamon").permanentId;
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    expect(
      s.engine.applyIntent(0, {
        type: "attack",
        attackerPermanentId: omekamonPermanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.perm("omekamon").isSuspended);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "permanent", permanentId: omekamonPermanentId },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.state.players[0]!.breeding?.stack[0]?.instanceId).toBe(
      accept ? omekamonInstanceId : s.inst("existingBottom").instanceId,
    );
    expect(s.state.players[0]!.trash.some((card) => card.instanceId === omekamonInstanceId)).toBe(!accept);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it.each([true, false])(
    "plays an Omekamon from its own breeding stack after the owner's security is removed (accept=%s)",
    async (accept) => {
      const s = setupEngine(
        {
          0: {
            breeding: { card: "BT13-007", under: [{ card: "BT20-083", as: "stackOmekamon" }] },
            battleArea: [{ card: "BT23-072", under: [{ card: "BT20-083", as: "unrelatedOmekamon" }] }],
            security: [{ card: "BT20-010", as: "security" }],
            deck: ["BT20-010", "BT20-010"],
          },
          1: {
            battleArea: [{ card: "BT20-076", dp: 20000, as: "attacker" }],
            deck: ["BT20-010", "BT20-010"],
          },
        },
        { autoAcceptOptional: false, autoDeclineOptional: false, autoSelectCards: true },
      );
      const loop = s.engine.startTurnLoop();
      await advance(s.engine).waitForMainPhase(0);
      advance(s.engine).endMainPhaseIfOpen(0);
      await advance(s.engine).waitForMainPhase(1);
      expect(
        s.engine.applyIntent(1, {
          type: "attack",
          attackerPermanentId: s.perm("attacker").permanentId,
          target: { kind: "player" },
        }),
      ).toEqual({ ok: true });
      await settle(() => s.state.pendingDecision?.kind === "optional");
      expect(s.state.pendingDecision?.kind).toBe("optional");
      expect(
        s.engine.applyIntent(0, {
          type: "respondDecision",
          decisionId: s.state.pendingDecision!.decisionId,
          response: { kind: "optional", accept },
        }),
      ).toEqual({ ok: true });
      await settle(
        () => !observe(s.engine).isAttacking() && s.events.some((event) => event.kind === "securityChecked"),
      );
      expect(observe(s.engine).isAttacking()).toBe(false);
      expect(s.events.some((event) => event.kind === "securityChecked")).toBe(true);
      expect(s.state.pendingDecision).toBeUndefined();

      expect(s.state.players[0]!.security).toHaveLength(0);
      expect(s.state.players[0]!.breeding?.isSuspended).toBe(accept);
      expect(
        s.state.players[0]!.battleArea.some((permanent) =>
          permanent.stack.some((card) => card.instanceId === s.inst("unrelatedOmekamon").instanceId),
        ),
      ).toBe(true);
      const played = s.state.players[0]!.battleArea.find((permanent) => permanent.topCard.cardId === "BT20-083");
      expect(played !== undefined).toBe(accept);
      const playedHasBlocker = played === undefined ? undefined : observe(s.engine).hasKeyword(played, "Blocker");
      expect(playedHasBlocker).toBe(accept ? true : undefined);
      expect(
        s.state.players[0]!.breeding?.stack.some((card) => card.instanceId === s.inst("stackOmekamon").instanceId),
      ).toBe(!accept);
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    },
  );

  it("does not fire the breeding inherited effect from a battle-area stack", async () => {
    const s = setupEngine(
      {
        0: {
          battleArea: [{ card: "BT23-072", under: [{ card: "BT20-083", as: "fieldStackOmekamon" }], as: "host" }],
          security: [{ card: "BT20-010", as: "security" }],
          deck: ["BT20-010", "BT20-010"],
        },
        1: {
          battleArea: [{ card: "BT20-076", dp: 20000, as: "attacker" }],
          deck: ["BT20-010", "BT20-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[0]!.security.length === 0 &&
        !s.events.some((event) => event.kind === "attackDeclared" && event.attackerCardId === "BT20-083"),
    );
    expect(s.state.players[0]!.battleArea).toHaveLength(1);
    expect(s.state.players[0]!.battleArea[0]!.topCard.cardId).toBe("BT23-072");
    expect(
      s.state.players[0]!.battleArea[0]!.stack.some(
        (card) => card.instanceId === s.inst("fieldStackOmekamon").instanceId,
      ),
    ).toBe(true);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });

  it("does not offer the inherited play when the breeding source is already suspended", async () => {
    const s = setupEngine(
      {
        0: {
          breeding: { card: "BT13-007", under: [{ card: "BT20-083", as: "stackOmekamon" }], as: "kingDrasil" },
          security: [{ card: "BT20-010", as: "security" }],
          deck: ["BT20-010", "BT20-010"],
        },
        1: {
          battleArea: [{ card: "BT20-076", as: "attacker", dp: 20000 }],
          deck: ["BT20-010", "BT20-010"],
        },
      },
      { autoAcceptOptional: true, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    await advance(s.engine).verb.suspend([s.perm("kingDrasil").permanentId], 0);
    expect(s.perm("kingDrasil").isSuspended).toBe(true);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.security.length === 0 && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.security).toHaveLength(0);
    expect(s.perm("kingDrasil").isSuspended).toBe(true);
    expect(
      s.state.players[0]!.breeding?.stack.some((card) => card.instanceId === s.inst("stackOmekamon").instanceId),
    ).toBe(true);
    expect(s.state.players[0]!.battleArea).toHaveLength(0);
    expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
    await loop;
  });
});

describe("BT20-083 Omekamon — KB Q&A rulings", () => {
  async function attackOwnerSecurity(board: SeatSpec, options: { autoAcceptOptional: boolean }) {
    const s = setupEngine(
      {
        0: { ...board, deck: ["BT20-010", "BT20-010"] },
        1: {
          battleArea: [{ card: "BT20-076", dp: 20000, as: "attacker" }],
          deck: ["BT20-010", "BT20-010"],
        },
      },
      { autoAcceptOptional: options.autoAcceptOptional, autoDeclineOptional: false, autoSelectCards: true },
    );
    const loop = s.engine.startTurnLoop();
    await advance(s.engine).waitForMainPhase(0);
    advance(s.engine).endMainPhaseIfOpen(0);
    await advance(s.engine).waitForMainPhase(1);
    const memoryBeforeAttack = s.state.memory;
    expect(
      s.engine.applyIntent(1, {
        type: "attack",
        attackerPermanentId: s.perm("attacker").permanentId,
        target: { kind: "player" },
      }),
    ).toEqual({ ok: true });
    const finish = async () => {
      expect(s.engine.applyIntent(1, { type: "surrender" })).toEqual({ ok: true });
      await loop;
    };
    return { s, memoryBeforeAttack, finish };
  }

  it("activates the [Breeding] inherited effect only from the breeding area, not from a battle-area stack (Q4409)", async () => {
    const { s, finish } = await attackOwnerSecurity(
      {
        breeding: { card: "BT13-007", under: [{ card: "BT20-083", as: "breedingOmekamon" }], as: "kingDrasil" },
        battleArea: [{ card: "BT23-072", under: [{ card: "BT20-083", as: "fieldOmekamon" }], as: "fieldHost" }],
        security: ["BT20-010"],
      },
      { autoAcceptOptional: true },
    );
    await settle(
      () =>
        !observe(s.engine).isAttacking() &&
        s.state.players[0]!.security.length === 0 &&
        s.state.pendingDecision === undefined,
    );
    expect(s.perm("kingDrasil").isSuspended).toBe(true);
    expect(
      s.state.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === s.inst("breedingOmekamon").instanceId,
      ),
    ).toBe(true);
    expect(s.perm("fieldHost").isSuspended).toBe(false);
    expect(s.perm("fieldHost").stack.map((card) => card.instanceId)).toContain(s.inst("fieldOmekamon").instanceId);
    expect(s.state.players[0]!.battleArea).toHaveLength(2);
    await finish();
  });

  it("resolves the [Security] effect of the checked card before Omekamon's security-removed effect (Q4410)", async () => {
    const { s, finish } = await attackOwnerSecurity(
      {
        breeding: { card: "BT13-007", under: [{ card: "BT20-083", as: "breedingOmekamon" }], as: "kingDrasil" },
        security: [{ card: "BT1-085", as: "securityTai" }],
      },
      { autoAcceptOptional: false },
    );
    await settle(() => s.state.pendingDecision?.kind === "optional");
    expect(s.state.pendingDecision?.kind).toBe("optional");
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("securityTai").instanceId,
    ]);
    expect(
      s.engine.applyIntent(0, {
        type: "respondDecision",
        decisionId: s.state.pendingDecision!.decisionId,
        response: { kind: "optional", accept: true },
      }),
    ).toEqual({ ok: true });
    await settle(() => s.state.players[0]!.battleArea.length === 2 && s.state.pendingDecision === undefined);
    expect(s.state.players[0]!.battleArea.map((permanent) => permanent.topCard.instanceId)).toEqual([
      s.inst("securityTai").instanceId,
      s.inst("breedingOmekamon").instanceId,
    ]);
    await finish();
  });

  it("can suspend the breeding-area Digimon to play this Omekamon from its own digivolution cards (Q4411)", async () => {
    const { s, memoryBeforeAttack, finish } = await attackOwnerSecurity(
      {
        breeding: { card: "BT13-007", under: [{ card: "BT20-083", as: "breedingOmekamon" }], as: "kingDrasil" },
        security: ["BT20-010"],
      },
      { autoAcceptOptional: true },
    );
    await settle(() => !observe(s.engine).isAttacking() && s.state.players[0]!.battleArea.length === 1);
    expect(s.perm("kingDrasil").isSuspended).toBe(true);
    expect(s.state.players[0]!.breeding?.stack.map((card) => card.instanceId)).not.toContain(
      s.inst("breedingOmekamon").instanceId,
    );
    expect(s.state.players[0]!.battleArea[0]!.topCard.instanceId).toBe(s.inst("breedingOmekamon").instanceId);
    expect(s.state.memory).toBe(memoryBeforeAttack);
    await finish();
  });
});
