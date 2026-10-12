import prepared0 from "../../api/src/engine/scenarios/magnaangemon-decision.fixture";
import { fixtureVariant, fixtureInstanceId, fixturePermanentId } from "../../api/src/engine/scenario/references";

const preparedFixtures = { "magnaangemon-decision": prepared0 };

import { test, expect, type DecisionPolicy } from "./scenario-page";

test.use({ holdBotAfterTurn: 1 });

for (const target of ["low", "high"] as const) {
  test(`Feedback #73: recovery reveals the required ${target} target choice and the game resumes`, async ({
    scenario,
    page,
  }) => {
    await page.setViewportSize({ width: target === "low" ? 1440 : 390, height: target === "low" ? 1000 : 844 });
    await page.addInitScript((dark) => localStorage.setItem("aegis:darkMode", String(dark)), target === "high");
    await scenario.openFixture(fixtureVariant(preparedFixtures, "magnaangemon-decision"));
    const policy: DecisionPolicy = (decision) => {
      for (const id of [fixtureInstanceId("feedback73-security-0-0"), fixtureInstanceId("feedback73-replacement")])
        if (decision.options.candidateInstanceIds?.includes(id)) return { instanceId: id };
      return {};
    };
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.phase === "Main" &&
        state.memory === 7 &&
        state.players[0]!.battleArea.some(
          (card) => card.topCard.instanceId === fixtureInstanceId("feedback73-security-0-0"),
        ),
      policy,
    );
    await scenario.idle();
    if (process.env.AEGIS_E2E_PRODUCTION === "true") {
      await expect(page.locator("style[data-vite-dev-id]")).toHaveCount(0);
      expect(await page.locator('link[rel="stylesheet"][href*="/assets/"]').count()).toBeGreaterThan(0);
    }
    expect((await scenario.snapshot()).players[0]!.securityCount).toBe(5);
    await scenario.evolve("Angemon", fixturePermanentId("dev-perm-0-feedback73-other"), true);
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.memory === 5 &&
        state.players[0]!.battleArea.some(
          (card) => card.topCard.instanceId === fixtureInstanceId("feedback73-other-evolution"),
        ),
    );
    await scenario.idle();
    const before = await scenario.snapshot();
    expect(before.players[0]!.securityCount).toBe(5);
    const base = before.players[0]!.battleArea.find(
      (card) => card.permanentId === fixturePermanentId("dev-perm-0-feedback73-base"),
    )!;
    let choices = 0;
    await scenario.evolve("MagnaAngemon", base.permanentId);
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        choices === 1 &&
        state.memory === (target === "low" ? 3 : 2) &&
        state.players[0]!.securityCount === 6,
      async (decision) => {
        expect(decision.kind).toBe("chooseTargets");
        expect(decision.sourceCardId).toBe("BT14-037");
        expect(decision.sourceInstanceId).toBe(fixtureInstanceId("feedback73-magna"));
        expect(decision.sourcePermanentId).toBe(base.permanentId);
        expect(decision.options.candidateInstanceIds).toEqual([
          fixturePermanentId("dev-perm-1-feedback73-low"),
          fixturePermanentId("dev-perm-1-feedback73-high"),
        ]);
        expect(decision.options.min).toBe(1);
        expect(decision.options.max).toBe(1);
        const atChoice = await scenario.snapshot();
        expect(atChoice.players[0]!.securityCount).toBe(6);
        expect(atChoice.memory).toBe(2);
        await expect(page.locator("[data-prompt-surface]")).toContainText("for each card in your security stack");
        await expect(page.getByRole("button", { name: /^(Confirm targets|Confirm)$/i })).toBeDisabled();
        choices++;
        return { instanceId: fixturePermanentId(`dev-perm-1-feedback73-${target}`) };
      },
    );
    const after = await scenario.snapshot();
    const magna = after.players[0]!.battleArea.find((card) => card.permanentId === base.permanentId)!;
    expect(magna.topCard.instanceId).toBe(fixtureInstanceId("feedback73-magna"));
    expect(magna.stack.map((card) => card.instanceId)).toEqual([
      ...base.stack.map((card) => card.instanceId),
      base.topCard.instanceId,
    ]);
    expect(after.players[0]!.hand.map((card) => card.instanceId)).toEqual([
      fixtureInstanceId("feedback73-reserve"),
      fixtureInstanceId("feedback73-deck-0-0"),
      fixtureInstanceId("feedback73-deck-0-1"),
      fixtureInstanceId("feedback73-deck-0-2"),
      fixtureInstanceId("feedback73-deck-0-3"),
      fixtureInstanceId("feedback73-deck-0-4"),
    ]);
    expect(after.players[0]!.deckCount).toBe(before.players[0]!.deckCount - 2);
    expect(after.players[0]!.trash).toHaveLength(0);
    expect(after.players[1]!.securityCount).toBe(5);
    expect(after.phase).toBe("Main");
    expect(after.turnSeat).toBe(0);
    const high = after.players[1]!.battleArea.find(
      (card) => card.permanentId === fixturePermanentId("dev-perm-1-feedback73-high"),
    )!;
    expect(high.currentDP).toBe(target === "high" ? 2000 : 8000);
    if (target === "low") {
      expect(after.players[1]!.battleArea.map((card) => card.permanentId)).toEqual([high.permanentId]);
      expect(after.players[1]!.trash.map((card) => card.instanceId)).toEqual([
        fixtureInstanceId("dev-stack-1-feedback73-low-0"),
        fixtureInstanceId("dev-field-1-feedback73-low"),
      ]);
    } else {
      expect(
        after.players[1]!.battleArea.find(
          (card) => card.permanentId === fixturePermanentId("dev-perm-1-feedback73-low"),
        )!.currentDP,
      ).toBe(1000);
      expect(after.players[1]!.trash).toHaveLength(0);
    }
    const events = (await scenario.presentation()).events;
    const trigger = events.findIndex((event) => event.kind === "effectTriggered" && event.sourceCardId === "BT14-037");
    const recovery = events.findIndex((event, index) => index > trigger && event.kind === "securityRecovered");
    const resolved = events.findIndex((event) => event.kind === "effectResolved" && event.sourceCardId === "BT14-037");
    expect(recovery).toBeGreaterThan(trigger);
    expect(resolved).toBeGreaterThan(recovery);
    expect(
      events.flatMap((event) =>
        event.kind === "memoryChanged" && event.reason === "digivolve" ? [[event.from, event.to]] : [],
      ),
    ).toEqual([
      [7, 5],
      [5, 2],
    ]);
    await scenario.healthy();
    await page.getByRole("button", { name: /^end turn$/i }).click();
    await scenario.resolveUntil((state) => state.turnSeat === 1 && !state.pendingDecision && state.memory === 3);
    expect(
      (await scenario.snapshot()).players[1]!.battleArea.find((card) => card.permanentId === high.permanentId)!
        .currentDP,
    ).toBe(8000);
    await scenario.healthy();
  });
}
