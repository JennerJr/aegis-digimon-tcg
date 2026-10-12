import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/assembly-preserves-unused-entry-trigger.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

for (const declineFirst of [true, false]) {
  test(`Alphamon's Assembly entry preserves the later attack only if unused: ${declineFirst}`, async ({
    scenario,
    page,
  }) => {
    const refs = await scenario.openFixture(fixture);
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    await scenario.play("Alphamon", "Digimon");
    const panel = page.getByRole("dialog", { name: "＜Assembly＞ Alphamon", exact: true });
    const materials = panel.locator(".material-prompt__body").getByRole("button");
    await expect(materials).toHaveCount(3);
    for (const material of await materials.all()) await material.click();
    await panel.getByRole("button", { name: "Assembly (3 cards)", exact: true }).click();
    let endOfTurn = false;
    await scenario.resolveUntil(
      (state) => state.turnSeat === 1 && !state.pendingDecision && !state.combatWindow,
      async (decision) => {
        if (decision.promptText?.includes("You may play 1 [Chronicle]")) endOfTurn = true;
        if (decision.kind === "orderTriggers") return { triggerCardId: "EX13-060" };
        if (decision.promptText?.includes("activate 1 of this Digimon's"))
          return { accept: !endOfTurn && !declineFirst };
        if (decision.kind === "optional" && decision.promptText?.includes("1 of your Digimon may attack"))
          return { accept: endOfTurn };
        if (decision.options.selectionContext === "attackSource" || decision.kind === "chooseTargets") {
          const played = (await scenario.snapshot()).players[0]!.battleArea.find(
            ({ topCard }) => topCard.instanceId === refs.instanceId("playedGrademon"),
          );
          return { instanceId: played!.permanentId };
        }
        return {};
      },
    );
    const after = await scenario.snapshot();
    const alphamon = after.players[0]!.battleArea.find(
      ({ topCard }) => topCard.instanceId === refs.instanceId("alphamon"),
    );
    expect(alphamon?.stack.map(({ instanceId }) => instanceId).sort()).toEqual(
      ["levelFive", "levelFour", "levelThree"].map((alias) => refs.instanceId(alias)).sort(),
    );
    expect(
      after.players[0]!.battleArea.some(({ topCard }) => topCard.instanceId === refs.instanceId("playedGrademon")),
    ).toBe(true);
    expect(after.players[1]!.securityCount).toBe(declineFirst ? 2 : 3);
    expect((await scenario.presentation()).events.filter((event) => event.kind === "attackDeclared")).toHaveLength(
      declineFirst ? 1 : 0,
    );
    await scenario.healthy();
  });
}
