import fixture from "../../api/src/engine/scenarios/watcher-resolution-checkpoints.fixture";
import { test, expect } from "./scenario-page";

test("Bacchusmon deletes Examon before its inherited unsuspend and the presentation queue drains", async ({
  scenario,
}) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.play("Jupitermon", "Option");
  await scenario.page.getByRole("button", { name: "Use as Option", exact: true }).click();
  await scenario.resolveUntil(
    (state) => state.players[1]!.trash.some((card) => card.cardId === "EX13-045") && !state.pendingDecision,
    (decision) => ({
      triggerCardId: "BT25-077",
      cardId: decision.sourceCardId === "BT25-077" ? "EX13-045" : undefined,
      instanceId: decision.options.candidateInstanceIds?.includes(refs.instanceId("bacchusmon"))
        ? refs.instanceId("bacchusmon")
        : undefined,
    }),
  );
  const state = await scenario.snapshot();
  expect(state.players[0]!.battleArea.some((permanent) => permanent.topCard.cardId === "BT25-077")).toBe(true);
  expect(state.players[1]!.trash.some((card) => card.cardId === "EX13-021")).toBe(true);
  expect(state.players[1]!.battleArea).toEqual([]);
  await scenario.healthy();
});
