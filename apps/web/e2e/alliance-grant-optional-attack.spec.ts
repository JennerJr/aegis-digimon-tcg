import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import { allianceGrantOptionalAttack } from "@api-fixtures/alliance-grant-optional-attack.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

for (const { simultaneousWatcher, presetActivation } of [
  { simultaneousWatcher: false, presetActivation: false },
  { simultaneousWatcher: true, presetActivation: false },
  { simultaneousWatcher: true, presetActivation: true },
]) {
  test(`Alliance remains after declining the attack with simultaneous watcher ${simultaneousWatcher} and activation preset ${presetActivation}`, async ({
    scenario,
    page,
  }) => {
    const refs = await scenario.openFixture(allianceGrantOptionalAttack({ simultaneousWatcher }));
    await scenario.play("Gabumon", "Digimon");
    let attackChoices = 0;
    await scenario.resolveUntil(
      (state) => attackChoices === (simultaneousWatcher ? 2 : 1) && !state.pendingDecision && state.memory === 7,
      async (decision) => {
        if (decision.kind === "orderTriggers" && presetActivation) {
          const preset = page.getByRole("group", { name: /Lillymon/ });
          await expect(preset).toBeVisible();
          await preset.getByRole("button", { name: "Yes", exact: true }).click();
          await expect(preset.getByRole("button", { name: "Yes", exact: true })).toHaveAttribute(
            "aria-pressed",
            "true",
          );
        }
        if (decision.kind === "chooseTargets") {
          expect(decision.options.selectionContext).not.toBe("attackSource");
          return { instanceId: refs.permanentId("allianceRecipient") };
        }
        if (decision.kind === "optional") {
          attackChoices += 1;
          expect(decision.options.selectionContext).toBe("attackSource");
          await expect(page.getByRole("button", { name: "No, decline", exact: true })).toBeVisible();
          return { accept: false };
        }
        return {};
      },
    );
    const after = await scenario.snapshot();
    expect(attackChoices).toBe(simultaneousWatcher ? 2 : 1);
    expect(after.pendingDecision).toBeUndefined();
    expect(after.combatWindow).toBeUndefined();
    expect(after.players[1]!.securityCount).toBe(2);
    expect(after.players[0]!.battleArea.every((permanent) => !permanent.isSuspended)).toBe(true);
    await expect(
      page
        .locator(`[data-id="${refs.permanentId("allianceRecipient")}"][role="button"]`)
        .getByLabel(/Active keywords:.*Alliance/),
    ).toBeVisible();
    expect(
      after.players[0]!.battleArea.some(
        (permanent) => permanent.topCard.instanceId === refs.instanceId("playedAdventure"),
      ),
    ).toBe(true);
    expect((await scenario.presentation()).events.some((event) => event.kind === "attackDeclared")).toBe(false);
    await scenario.healthy();
  });
}
