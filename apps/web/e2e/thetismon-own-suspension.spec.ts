import fixture from "../../api/src/engine/scenarios/thetismon-own-suspension.fixture";
import { test, expect } from "./scenario-page";

test("Thetismon only reacts when its own Digimon suspends", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  for (const [alias, securityLeft, trashLeft, suspended] of [
    ["bystander", 3, 3, true],
    ["host", 2, 0, false],
  ] as const) {
    await scenario.attack(refs.permanentId(alias));
    await scenario.resolveUntil(
      (state) => state.players[1]!.securityCount === securityLeft && !state.pendingDecision && !state.combatWindow,
    );
    const after = await scenario.snapshot();
    expect(after.players[0]!.trash).toHaveLength(trashLeft);
    expect(
      after.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId(alias))!.isSuspended,
    ).toBe(suspended);
  }
  await scenario.healthy();
});
