import fixture from "@api-fixtures/blast-digivolve-preserves-attack-target.fixture";
import { test, expect } from "@e2e/scenario-page";
import { GamePage } from "@e2e/game-page";
import { stubCardArtwork } from "@e2e/card-artwork";

test.beforeEach(async ({ page }) => stubCardArtwork(page));

test("the attack battles Jesmon GX after Gankoomon Blast Digivolves", async ({ scenario, page }) => {
  const refs = await scenario.openFixture(fixture);
  await scenario.resolveUntil((state) => state.phase === "Main" && !state.pendingDecision);
  await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
  const defenderId = refs.permanentId("gankoomon");
  const target = page.locator(`[data-drop="perm-opp"][data-id="${defenderId}"]`);
  await new GamePage(page).attack(refs.permanentId("attacker"), target);
  await scenario.resolveUntil(
    (state) =>
      !state.pendingDecision &&
      !state.combatWindow &&
      state.players[1]!.trash.some((card) => card.instanceId === refs.instanceId("jesmonGx")),
  );
  const events = (await scenario.presentation()).events;
  expect(events).toContainEqual(
    expect.objectContaining({
      kind: "attackDeclared",
      attackerPermanentId: refs.permanentId("attacker"),
      target: { kind: "permanent", permanentId: defenderId },
    }),
  );
  expect(events).toContainEqual(
    expect.objectContaining({ kind: "digivolved", cardId: "BT20-021", mechanic: "blast", permanentId: defenderId }),
  );
  expect(events).toContainEqual(expect.objectContaining({ kind: "battleCompared", defenderPermanentId: defenderId }));
  expect(events).toContainEqual(expect.objectContaining({ kind: "combatResolved", deletedPermanentIds: [defenderId] }));
  const after = await scenario.snapshot();
  expect(after.players[1]!.battleArea).toHaveLength(0);
  expect(after.players[1]!.securityCount).toBe(3);
  expect(after.players[1]!.trash.map((card) => card.instanceId)).toEqual(
    expect.arrayContaining([refs.instanceId("jesmonGx"), refs.instanceId("gankoomon")]),
  );
  expect(
    after.players[0]!.battleArea.find((permanent) => permanent.permanentId === refs.permanentId("attacker"))
      ?.isSuspended,
  ).toBe(true);
  await scenario.healthy();
});
