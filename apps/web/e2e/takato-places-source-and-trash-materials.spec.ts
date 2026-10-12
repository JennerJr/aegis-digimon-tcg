import { test, expect } from "@e2e/scenario-page";
import { stubCardArtwork } from "@e2e/card-artwork";
import fixture from "@api-fixtures/takato-places-source-and-trash-materials.fixture";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

for (const digivolve of [false, true]) {
  test(`Takato places itself and the trash materials with evolution ${digivolve}`, async ({ scenario, page }) => {
    const refs = await scenario.openFixture(fixture);
    await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
    await page.locator(`[data-id="${refs.permanentId("sourceTakato")}"][role="button"]`).click();
    await page.getByRole("button", { name: /^Activate effect: \[Main\]/ }).click();
    const materials = ["sourceTakato", "trashGrowlmon", "trashWarGrowlmon"].map((alias) => refs.instanceId(alias));
    let orders = 0;
    await scenario.resolveUntil(
      (state) =>
        orders === 1 &&
        !state.pendingDecision &&
        state.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("guilmon"))?.topCard
          .cardId === (digivolve ? "BT12-018" : "BT12-007"),
      (decision) => {
        if (decision.kind === "orderCards") {
          orders += 1;
          expect(decision.options.candidateInstanceIds?.toSorted()).toEqual(materials.toSorted());
          return {};
        }
        if (decision.kind === "selectCards") {
          expect(decision.options.candidateInstanceIds).toEqual([refs.instanceId("gallantmon")]);
          return { instanceId: refs.instanceId("gallantmon") };
        }
        return { accept: digivolve };
      },
    );
    const after = await scenario.snapshot();
    const human = after.players[0]!;
    const host = human.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("guilmon"))!;
    expect(
      host.stack
        .slice(0, 3)
        .map((card) => card.instanceId)
        .toSorted(),
    ).toEqual(materials.toSorted());
    expect(human.battleArea.some((permanent) => permanent.permanentId === refs.permanentId("sourceTakato"))).toBe(
      false,
    );
    expect(human.battleArea.map((permanent) => permanent.permanentId)).toEqual(
      expect.arrayContaining([
        refs.permanentId("otherTakato"),
        refs.permanentId("fieldGrowlmon"),
        refs.permanentId("fieldWarGrowlmon"),
      ]),
    );
    expect(human.trash.map((card) => card.instanceId)).toEqual([refs.instanceId("trashTakato")]);
    expect(after.memory).toBe(digivolve ? 6 : 10);
    expect(after.turnSeat).toBe(0);
    expect(after.phase).toBe("Main");
    expect(after.pendingDecision).toBeUndefined();
    await scenario.healthy();
  });
}
