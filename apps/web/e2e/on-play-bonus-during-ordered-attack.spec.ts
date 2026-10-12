import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/on-play-bonus-during-ordered-attack.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

for (const first of ["EX13-060", "EX13-057"]) {
  test(`Grademon checks its attack bonus with ${first} resolving first`, async ({ scenario, page }) => {
    const refs = await scenario.openFixture(fixture);
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    await page.getByRole("button", { name: /^end turn$/i }).click();
    await scenario.resolveUntil(
      (state) => state.turnSeat === 1 && !state.pendingDecision && !state.combatWindow,
      async (decision) => {
        if (decision.kind === "orderTriggers") return { triggerCardId: first };
        if (
          decision.promptText?.includes("activate 1 of this Digimon's") ||
          decision.promptText?.includes("This Digimon may digivolve")
        )
          return { accept: false };
        if (decision.options.selectionContext === "attackSource" || decision.kind === "chooseTargets") {
          const grademon = (await scenario.snapshot()).players[0]!.battleArea.find(
            (permanent) => permanent.topCard.instanceId === refs.instanceId("grademon"),
          );
          return { instanceId: grademon!.permanentId };
        }
        return {};
      },
    );
    const after = await scenario.snapshot();
    const grademon = after.players[0]!.battleArea.find(
      (permanent) => permanent.topCard.instanceId === refs.instanceId("grademon"),
    );
    const duringAttack = first === "EX13-060";
    expect(grademon?.currentDP).toBe(duringAttack ? 12000 : 7000);
    expect(grademon?.immuneToOpponentDigimonEffects).toBe(duringAttack);
    expect(after.players[1]!.securityCount).toBe(2);
    const events = (await scenario.presentation()).events;
    const attack = events.findIndex((event) => event.kind === "attackDeclared");
    const onPlay = events.findIndex(
      (event) => event.kind === "effectTriggered" && event.sourceCardId === "EX13-057" && event.timing === "OnPlay",
    );
    expect(attack).toBeGreaterThan(-1);
    expect(onPlay).toBeGreaterThan(-1);
    expect(onPlay > attack).toBe(duringAttack);
    await scenario.healthy();
  });
}
