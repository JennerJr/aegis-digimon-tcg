import fixture from "../../api/src/engine/scenarios/candlemon-reveal-categories.fixture";
import { test, expect } from "./scenario-page";

for (const first of ["bothCategories", "dataOnly"]) {
  test(`Candlemon resolves both categories after ${first} is selected first`, async ({ scenario }) => {
    const refs = await scenario.openFixture(fixture);
    await scenario.play("Candlemon", "Digimon");
    let selections = 0;
    await scenario.resolveUntil(
      (state) =>
        !state.pendingDecision &&
        state.players[0]!.battleArea.some((perm) => perm.topCard.instanceId === refs.instanceId("candlemon")),
      (decision) => {
        if (decision.kind !== "selectCards") return {};
        selections += 1;
        return { instanceId: refs.instanceId(selections === 1 ? first : "bothCategories") };
      },
    );
    const state = await scenario.snapshot();
    const ids = state.players[0]!.hand.map((card) => card.instanceId);
    expect(ids).toContain(refs.instanceId("bothCategories"));
    expect(ids.includes(refs.instanceId("dataOnly"))).toBe(first === "dataOnly");
    expect(selections).toBe(first === "dataOnly" ? 2 : 1);
    await scenario.healthy();
  });
}
