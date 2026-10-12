import fixture from "../../api/src/engine/scenarios/warumonzaemon-security-play-evolution.fixture";
import { test, expect } from "./scenario-page";

test("a Dark Master played from security can evolve before its scheduled deletion", async ({ scenario }) => {
  const refs = await scenario.openFixture(fixture, "normal", "none");
  await scenario.resolveUntil((state) => state.turnSeat === 0 && state.phase === "Main" && !state.pendingDecision);
  await scenario.attack(refs.permanentId("waru"));
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      !state.combatWindow &&
      state.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("master")),
    () => ({ accept: true, instanceId: refs.instanceId("master") }),
  );
  const played = (await scenario.snapshot()).players[0]!.battleArea.find(
    (p) => p.topCard.instanceId === refs.instanceId("master"),
  )!;
  await scenario.evolve("Omnimon", played.permanentId);
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      state.players[0]!.battleArea.some((p) => p.topCard.instanceId === refs.instanceId("evolution")),
  );
  expect((await scenario.snapshot()).memory).toBe(4);
  await scenario.page.getByRole("button", { name: /^end turn$/i }).click();
  await scenario.resolveUntil((state) => state.turnSeat === 1 && !state.pendingDecision);
  const state = await scenario.snapshot();
  expect(state.players[0]!.battleArea.some((p) => p.permanentId === played.permanentId)).toBe(false);
  expect(state.players[0]!.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([refs.instanceId("master"), refs.instanceId("evolution")]),
  );
  await scenario.healthy();
});
