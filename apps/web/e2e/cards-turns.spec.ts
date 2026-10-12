import { fixtureZoneId } from "../../api/src/engine/scenario/references";
import fixtureTargetmonAssembly from "../../api/src/engine/scenarios/targetmon-assembly.fixture";
import fixtureKakkinmonOpponentEnd from "../../api/src/engine/scenarios/kakkinmon-opponent-end.fixture";
import fixtureKakkinmonOpponentEndEx13062Bt1009 from "../../api/src/engine/scenarios/kakkinmon-opponent-end-ex13-062-bt1-009.fixture";
import fixturePsychemonAssembly from "../../api/src/engine/scenarios/psychemon-assembly.fixture";
import fixturePatamonAngemon from "../../api/src/engine/scenarios/patamon-angemon.fixture";
import fixtureKnightmonAura from "../../api/src/engine/scenarios/knightmon-aura.fixture";
import fixtureMaterialSave from "../../api/src/engine/scenarios/material-save.fixture";
import fixtureCraniamonSuspend from "../../api/src/engine/scenarios/craniamon-suspend.fixture";
import fixturePsychemonDigixros from "../../api/src/engine/scenarios/psychemon-digixros.fixture";
import fixtureEggBreeding from "../../api/src/engine/scenarios/egg-breeding.fixture";
import fixtureDedigiMain from "../../api/src/engine/scenarios/dedigi-main.fixture";
import { fixtureInstanceId } from "../../api/src/engine/scenario/references";
import { test, expect } from "./scenario-page";

for (const [fixture, cost, reductionBlocked] of [
  [fixtureTargetmonAssembly, 3, false],
  [fixturePsychemonAssembly, 7, true],
] as const) {
  test(`${fixture.name}: Assembly includes Targetmon and pays ${cost} through the visible material gallery`, async ({
    scenario,
  }) => {
    await scenario.openFixture(fixture);
    await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
    const before = await scenario.snapshot();
    await scenario.play("KingSukamon", "Digimon");
    const panel = scenario.page.getByRole("dialog", { name: "＜Assembly＞ KingSukamon", exact: true });
    const materials = panel.locator(".material-prompt__body").getByRole("button");
    await expect(materials).toHaveCount(3);
    if (reductionBlocked)
      await expect(
        panel.getByText("Place cards from your trash under it to reduce its play cost by 0 (to 7).", { exact: false }),
      ).toBeVisible();
    await expect(panel.getByRole("img", { name: "Targetmon", exact: true })).toBeVisible();
    for (const material of await materials.all()) await material.click();
    await panel.getByRole("button", { name: "Assembly (3 cards)", exact: true }).click();
    await scenario.resolveUntil(
      (s) => s.players[0]!.battleArea.some((p) => p.topCard.cardId === "EX13-031") && !s.pendingDecision,
      () => ({ accept: false }),
    );
    const after = await scenario.snapshot();
    expect(after.memory).toBe(before.memory - cost);
    expect(
      after.players[0]!.battleArea.find((p) => p.topCard.cardId === "EX13-031")!.stack.map((c) => c.cardId),
    ).toEqual(["EX5-046", "EX13-028", "EX13-028"]);
    expect(after.players[0]!.trash).toHaveLength(0);
    await scenario.healthy();
  });
}

for (const cardId of ["BT23-027", "BT25-034"]) {
  test(`Patamon searches face-down security and evolves into ${cardId}`, async ({ scenario }) => {
    await scenario.openFixture(fixturePatamonAngemon);
    await scenario.resolveUntil(
      (s) => s.players[0]!.battleArea[0]?.topCard.cardId === cardId && !s.pendingDecision,
      (d) => ({
        cardId:
          d.kind === "selectCards" && d.options.visibleCards?.some((c) => c.cardId === cardId) ? cardId : "BT14-035",
      }),
    );
    const state = await scenario.snapshot();
    expect(state.players[0]!.battleArea[0]!.stack.some((c) => c.cardId === "BT14-033")).toBe(true);
    expect(state.players[0]!.securityCount).toBe(3);
    expect((await scenario.presentation()).events).toContainEqual(
      expect.objectContaining({
        kind: "cardsMoved",
        to: "security",
        instanceIds: [fixtureZoneId(fixturePatamonAngemon, 0, "hand", 0)],
      }),
    );
    expect(
      state.players[0]!.hand.some((card) => card.instanceId === fixtureZoneId(fixturePatamonAngemon, 0, "hand", 0)),
    ).toBe(false);
    await scenario.healthy();
  });
}

test("Knightmon's opponent-turn aura gives DarkKnightmon Reboot and Blocker", async ({ scenario }) => {
  await scenario.openFixture(fixtureKnightmonAura);
  await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
  const before = (await scenario.snapshot()).players[0]!.battleArea.find((p) => p.topCard.cardId === "BT19-063")!;
  await scenario.attack(before.permanentId);
  await scenario.resolveUntil(
    (s) =>
      !s.pendingDecision &&
      !s.combatWindow &&
      s.players[0]!.battleArea.find((p) => p.permanentId === before.permanentId)?.isSuspended === true,
  );
  await scenario.page.getByRole("button", { name: /^End turn$/i }).click();
  await scenario.resolveUntil((s) => s.turnSeat === 1 && !s.pendingDecision);
  const state = await scenario.snapshot();
  const dark = state.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT19-063")!;
  expect(dark.isSuspended).toBe(false);
  const field = scenario.page.locator(`[data-drop="perm-you"][data-id="${dark.permanentId}"]`);
  await expect(field.getByLabel(/Active keywords:.*Reboot/)).toBeVisible();
  await expect(field.getByLabel(/Active keywords:.*Blocker/)).toBeVisible();
  await scenario.healthy();
});

test("SkullKnightmon appears in Material Save and is replayed by DarkKnightmon", async ({ scenario }) => {
  const id = fixtureMaterialSave;
  await scenario.openFixture(id);
  await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
  const before = await scenario.snapshot();
  const dark = before.players[0]!.battleArea.find((p) => p.topCard.cardId === "BT19-063")!;
  const victim = before.players[1]!.battleArea[0]!;
  await scenario.page.locator(`[data-drop="perm-you"][data-id="${dark.permanentId}"]`).click();
  await scenario.page.getByRole("button", { name: "Attack", exact: true }).click();
  await scenario.page.locator(`[data-drop="perm-opp"][data-id="${victim.permanentId}"]`).click();
  const skull = fixtureZoneId(id, 0, "source", 0, 0);
  await scenario.resolveUntil(
    (s) =>
      s.players[0]!.battleArea.some((p) => p.topCard.instanceId === skull) && !s.pendingDecision && !s.combatWindow,
    (d) => ({ accept: true, ...(d.options.candidateInstanceIds?.includes(skull) ? { instanceId: skull } : {}) }),
  );
  const state = await scenario.snapshot();
  expect(state.players[0]!.trash.some((c) => c.instanceId === dark.topCard.instanceId)).toBe(true);
  expect(state.players[0]!.trash.some((c) => c.instanceId === skull)).toBe(false);
  await scenario.healthy();
});

test("Craniamon deletes both Digimon tied for lowest play cost when attacking", async ({ scenario }) => {
  await scenario.openFixture(fixtureCraniamonSuspend);
  await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
  const craniamon = (await scenario.snapshot()).players[0]!.battleArea[0]!;
  await scenario.attack(craniamon.permanentId);
  await scenario.resolveUntil((s) => !s.pendingDecision && !s.combatWindow && s.players[1]!.battleArea.length === 1);
  expect((await scenario.snapshot()).players[1]!.trash.filter((c) => c.cardId === "BT1-009")).toHaveLength(2);
  await scenario.healthy();
});

test("Psychemon allows DigiXros materials while preserving DarkKnightmon's full cost 8", async ({ scenario }) => {
  await scenario.openFixture(fixturePsychemonDigixros);
  await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
  const before = await scenario.snapshot();
  await scenario.play("DarkKnightmon", "Digimon");
  const panel = scenario.page.getByRole("dialog", { name: "＜DigiXros＞ DarkKnightmon", exact: true });
  await expect(panel.getByText(/−0 per card placed/)).toBeVisible();
  for (const name of ["SkullKnightmon", "DeadlyAxemon"])
    await panel
      .locator(".material-prompt__body")
      .getByRole("button", { name: `${name} (hand)`, exact: true })
      .click();
  await panel.getByRole("button", { name: "DigiXros (2 cards)", exact: true }).click();
  await scenario.resolveUntil(
    (s) => s.players[0]!.battleArea.some((p) => p.topCard.cardId === "BT19-063") && !s.pendingDecision,
    () => ({ accept: false }),
  );
  expect((await scenario.snapshot()).memory).toBe(before.memory - 8);
  expect((await scenario.snapshot()).players[0]!.battleArea[0]!.stack).toHaveLength(2);
  await scenario.healthy();
});

test("printed Dracomon X evolution costs 1 in breeding and the egg effect remains inactive", async ({ scenario }) => {
  await scenario.openFixture(fixtureEggBreeding, "normal", "none");
  await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
  const before = await scenario.snapshot();
  await scenario.hand("Dracomon (X Antibody)");
  await scenario.page.getByRole("button", { name: "Digivolve", exact: true }).click();
  await scenario.page.locator('[data-drop="breeding-you"]').click();
  await scenario.resolveUntil((s) => s.players[0]!.breeding?.topCard.cardId === "BT21-046" && !s.pendingDecision);
  expect((await scenario.snapshot()).memory).toBe(before.memory - 1);
  expect(
    (await scenario.presentation()).events.some((e) => e.kind === "effectTriggered" && e.sourceCardId === "EX13-005"),
  ).toBe(false);
  await scenario.healthy();
});

test.describe("opponent turn completion", () => {
  test.use({ holdBotAfterTurn: 4, botMainIntents: [{ type: "endPhase" }] });
  for (const fixture of [fixtureKakkinmonOpponentEnd, fixtureKakkinmonOpponentEndEx13062Bt1009]) {
    test(`${fixture.name}: Kakkinmon can suspend Craniamon at the opponent's turn end`, async ({ scenario }) => {
      await scenario.openFixture(fixture);
      await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
      const before = await scenario.snapshot();
      await scenario.page.getByRole("button", { name: /^End turn$/i }).click();
      // Observe the opponent's Main phase separately: real bot breeding and
      // think pacing are not one continuous effect-presentation sequence.
      await scenario.resolveUntil(
        (s) => s.turnSeat === 1 && s.phase === "Main" && !s.pendingDecision,
        () => ({ accept: false }),
      );
      await scenario.resolveUntil(
        (s) => s.turnSeat === 0 && s.turnCount >= 3 && !s.pendingDecision,
        () => ({ accept: true, cardId: "EX13-062" }),
      );
      const events = (await scenario.presentation()).events;
      expect(
        events.some(
          (e) =>
            e.kind === "cardsMoved" &&
            e.to === "suspended" &&
            e.instanceIds.includes(before.players[0]!.battleArea[0]!.permanentId),
        ),
      ).toBe(true);
      expect(events.some((e) => e.kind === "effectResolved" && e.sourceCardId === "P-245")).toBe(true);
      expect((await scenario.snapshot()).players[1]!.trash.filter((c) => c.cardId === "BT1-009")).toHaveLength(2);
      await scenario.healthy();
    });
  }
  test.describe("De-Digivolve opponent script", () => {
    test.use({
      botMainIntents: [
        { type: "playCard", instanceId: fixtureInstanceId("dedigi-main-1-hand-0-card"), useAs: "option" },
      ],
    });
    test("exposed Dracomon X and Davis & Ken both resolve on the next Main", async ({ scenario }) => {
      await scenario.openFixture(fixtureDedigiMain);
      await scenario.resolveUntil((s) => s.phase === "Main" && !s.pendingDecision);
      await scenario.page.getByRole("button", { name: /^End turn$/i }).click();
      await scenario.resolveUntil((s) => s.turnSeat === 1 && s.phase === "Main" && !s.pendingDecision);
      await scenario.resolveUntil(
        (s) => s.turnSeat === 0 && s.turnCount >= 3 && s.phase === "Breeding" && !s.pendingDecision,
        () => ({ accept: false }),
      );
      expect((await scenario.snapshot()).players[0]!.battleArea[0]!.topCard.cardId).toBe("BT21-046");
      await scenario.page.getByRole("button", { name: /^End breeding$/i }).click();
      await scenario.resolveUntil(
        (s) => s.players[0]!.battleArea[0]?.topCard.cardId === "EX13-018" && !s.pendingDecision,
      );
      const events = (await scenario.presentation()).events;
      for (const cardId of ["BT21-046", "BT8-088"])
        expect(
          events.some(
            (e) => e.kind === "effectResolved" && e.sourceCardId === cardId && e.timing === "OnStartMainPhase",
          ),
        ).toBe(true);
      await scenario.healthy();
    });
  });
});
