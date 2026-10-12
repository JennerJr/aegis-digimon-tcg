import fixture from "../../api/src/engine/scenarios/rebootmon-link-overflow.fixture";
import { test, expect } from "./scenario-page";

test("Rebootmon can discard an old link and finish its attack", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture);

  await scenario.resolveUntil(
    (state) => !state.pendingDecision && !state.combatWindow && state.players[1]!.securityCount === 3,
    (decision) =>
      decision.options.selectionContext === "attackTarget"
        ? { instanceId: "player" }
        : decision.promptText === "Choose 1 link card to trash."
          ? { instanceId: refs.instanceId("oldLink") }
          : decision.kind === "selectCards"
            ? { instanceId: refs.instanceId("newLink") }
            : {},
  );
  const state = await scenario.snapshot();
  expect(
    state.players[0]!.battleArea.find((perm) => perm.permanentId === refs.permanentId("reboot"))!.linked.map(
      (card) => card.instanceId,
    ),
  ).toEqual(expect.arrayContaining([refs.instanceId("newLink"), refs.instanceId("otherLink")]));
  expect(state.players[0]!.trash.map((card) => card.instanceId)).toContain(refs.instanceId("oldLink"));
  await scenario.healthy();
});
