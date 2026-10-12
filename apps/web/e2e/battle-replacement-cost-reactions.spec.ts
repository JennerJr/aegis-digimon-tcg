import fixture from "../../api/src/engine/scenarios/battle-replacement-cost-reactions.fixture";
import { test, expect } from "./scenario-page";

test("Titamon's battle prevention reacts before Examon's effect attack ends", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await scenario.evolve("Examon", refs.permanentId("attacker"));
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      !state.combatWindow &&
      !state.players[0]!.battleArea.some((permanent) => permanent.permanentId === refs.permanentId("attacker")),
    (decision) =>
      decision.options.selectionContext === "attackTarget"
        ? { instanceId: refs.permanentId("titamon") }
        : { accept: true },
  );
  const events = (await scenario.presentation()).events;
  const deleted = events.findIndex(
    (event) =>
      event.kind === "cardsMoved" &&
      event.deletedPermanents?.some((permanent) => permanent.permanentId === refs.permanentId("attacker")),
  );
  const ended = events.findIndex((event) => event.kind === "attackEnded");
  expect(deleted).toBeGreaterThanOrEqual(0);
  expect(deleted).toBeLessThan(ended);
  await scenario.healthy();
});
