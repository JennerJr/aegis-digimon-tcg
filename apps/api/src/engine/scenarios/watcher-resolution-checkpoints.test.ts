import { describe, expect, it } from "vitest";
import fixture from "#api/engine/scenarios/watcher-resolution-checkpoints.fixture";
import zeroDpFixture from "#api/engine/scenarios/zero-dp-watcher-checkpoint.fixture";
import { setupScenario } from "#api/engine/testkit/scenario";
import { settle } from "#api/engine/testkit/harness";
import { Phase } from "@aegis/shared/schema/enums";
import "#api/cards/BT25/BT25-077";
import "#api/cards/BT25/BT25-039";
import "#api/cards/EX13/EX13-021";
import "#api/cards/EX13/EX13-045";
import "#api/cards/EX13/EX13-044";
import "#api/cards/BT25/BT25-059";
import "#api/cards/BT26/BT26-032";
import "#api/cards/BT26/BT26-033";
import "#api/cards/BT1/BT1-009";

describe("watcher resolution checkpoints", () => {
  it("deletes Breakdramon at zero DP before its pending battle effect activates", async () => {
    const preferred: string[] = [];
    const s = setupScenario(zeroDpFixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      preferInstanceIds: preferred,
    });
    preferred.push(s.perm("breakdramon").topCard.instanceId);
    await s.ready();
    s.state.phase = Phase.Main;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("arts-option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.state.players[1]!.trash.some((card) => card.cardId === "EX13-044") && s.state.pendingDecision === undefined,
    );
    expect(s.events.filter((event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-044")).toEqual(
      [],
    );
    expect(s.events.filter((event) => event.kind === "battleCompared")).toEqual([]);
  });
  it("finishes Bacchusmon's deletion before Wingdramon can unsuspend Examon", async () => {
    const preferred: string[] = [];
    const s = setupScenario(fixture, {
      autoAcceptOptional: true,
      autoSelectCards: true,
      autoChooseOption: true,
      preferTriggerKeys: ["BT25-077/ir-7-0"],
      preferInstanceIds: preferred,
    });
    preferred.push(s.perm("examon").topCard.instanceId);
    await s.ready();
    s.state.phase = Phase.Main;
    expect(
      s.engine.applyIntent(0, { type: "playCard", instanceId: s.inst("arts-option").instanceId, useAs: "option" }),
    ).toEqual({ ok: true });
    await settle(
      () =>
        s.events.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX13-021") ||
        s.state.players[1]!.trash.some((card) => card.cardId === "EX13-045"),
    );
    const relevant = s.events.filter(
      (event) => event.kind === "effectResolved" && ["BT25-077", "EX13-021"].includes(event.sourceCardId),
    );
    expect(relevant.some((event) => event.kind === "effectResolved" && event.sourceCardId === "EX13-021")).toBe(false);
    expect(relevant.some((event) => event.kind === "effectResolved" && event.sourceCardId === "BT25-077")).toBe(true);
    expect(s.state.players[1]!.trash.some((card) => card.cardId === "EX13-045")).toBe(true);
    expect(s.state.pendingDecision).toBeUndefined();
  });
});
