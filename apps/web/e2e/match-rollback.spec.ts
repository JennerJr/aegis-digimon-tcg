import { resetRoomState } from "../src/net/resetRoomState";
import { ROLLBACK_RESET_CHANNEL } from "@aegis/shared/protocol/RollbackKind";
import { test, expect } from "@playwright/test";
import type { AegisRoom } from "@/net/client";
import { GameState } from "@aegis/shared/schema/GameState";
import { Client } from "@colyseus/sdk";
import { RollbackKind, ROLLBACK_CHANNEL } from "@aegis/shared/protocol/RollbackKind";
import { RED_DECK, BLUE_DECK } from "../../api/dist/engine/testDecks.js";
import { roomRegistry } from "../../api/dist/rooms/AegisRoom.js";
import fixture from "../../api/src/engine/scenarios/matchRollback.fixture";
import { ScenarioPage } from "./scenario-page";
import { startBrowserServer, useBrowserFixture } from "./server";

test("bot undo and turn rollback fully synchronize hidden hands and public permanents, then allow play", async ({
  page,
}) => {
  const server = await startBrowserServer({ holdBotAfterTurn: 1 });
  try {
    const scenario = new ScenarioPage(page, useBrowserFixture);
    await scenario.openFixture(fixture, "normal", "end", true);
    await scenario.idle();
    await page.getByRole("button", { name: "Rollback", exact: true }).click();
    await expect(page.getByRole("button", { name: "Undo last action", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Return to turn start", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Undo last action", exact: true })).not.toBeVisible();
    const initial = await scenario.snapshot();
    await scenario.play("Monodramon", "Digimon");
    await expect.poll(async () => (await scenario.snapshot()).players[0]!.hand.length).toBe(1);
    await page.getByRole("button", { name: "Rollback", exact: true }).click();
    await page.getByRole("button", { name: "Undo last action", exact: true }).click();
    await expect.poll(async () => (await scenario.snapshot()).rollbackRevision).toBe(1);
    await expect(page.getByTestId("hand").getByRole("img", { name: "Monodramon", exact: true })).toBeVisible();
    const restored = await scenario.snapshot();
    expect(restored.players[0]!.hand.map((card: { instanceId: string }) => card.instanceId)).toEqual(
      initial.players[0]!.hand.map((card: { instanceId: string }) => card.instanceId),
    );
    expect(restored.players[0]!.battleArea).toHaveLength(initial.players[0]!.battleArea.length);
    expect(restored.players[1]!.hand).toHaveLength(0);
    await page.getByRole("button", { name: "Rollback", exact: true }).click();
    await page.getByRole("button", { name: "Return to turn start", exact: true }).click();
    await expect.poll(async () => (await scenario.snapshot()).rollbackRevision).toBe(2);
    await expect(page.getByRole("button", { name: /^end breeding$/i })).toBeEnabled();
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await expect(page.getByRole("button", { name: /^end turn$/i })).toBeEnabled();
    await scenario.idle();
    await scenario.play("Monodramon", "Digimon");
    await scenario.idle();
    expect((await scenario.snapshot()).players[0]!.battleArea).toHaveLength(initial.players[0]!.battleArea.length + 1);
    expect(scenario.errors).toEqual([]);
  } finally {
    await page.close();
    await server.close();
  }
});

test("opponent consent stays accessible over a pending effect and restores that action on both live clients", async ({
  page,
}) => {
  const server = await startBrowserServer();
  let opponent: AegisRoom | undefined;
  try {
    await page.addInitScript((deck) => {
      localStorage.setItem("aegis:locale", "en");
      localStorage.setItem("aegis.action-confirmation.enabled", "false");
      window.browserTestMode = "casual";
      window.browserTestOptions = { displayName: "Rollback human", seed: 0, deck, allowRollback: true };
    }, RED_DECK);
    await page.goto("/e2e/harness.html");
    await expect
      .poll(() => [...roomRegistry.values()].find((candidate) => candidate.state.players.length === 1)?.roomId)
      .toBeTruthy();
    const room = [...roomRegistry.values()].find((candidate) => candidate.state.players.length === 1)!;
    opponent = await new Client(server.directEndpoint).joinById<GameState>(room.roomId, {
      displayName: "Opponent",
      deck: BLUE_DECK,
      allowRollback: true,
    });
    opponent.onMessage("*", () => {});
    opponent.onMessage(ROLLBACK_RESET_CHANNEL, () => resetRoomState(opponent!));
    Reflect.set(room, "scenarioFixture", fixture);
    Reflect.get(room, "startScenarioNow").call(room);
    const scenario = new ScenarioPage(page);
    await page.getByRole("button", { name: /^end breeding$/i }).click();
    await scenario.play("Agumon", "Digimon");
    await expect.poll(async () => (await scenario.snapshot()).pendingDecision?.kind).toBe("selectCards");
    opponent.send(ROLLBACK_CHANNEL, { type: "request", kind: RollbackKind.ACTION.value, revision: 0 });
    const consent = page.getByRole("dialog", { name: "Rollback", exact: true });
    await expect(consent).toBeVisible();
    await consent.getByRole("button", { name: "Accept", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect.poll(async () => (await scenario.snapshot()).rollbackRevision).toBe(1);
    await expect.poll(() => opponent!.state.rollbackRevision).toBe(1);
    await expect(page.getByTestId("hand").getByRole("img", { name: "Agumon", exact: true })).toBeVisible();
    expect(opponent.state.players[0]!.hand).toHaveLength(0);
    expect(opponent.state.pendingDecision).toBeUndefined();
    await scenario.play("Agumon", "Digimon");
    await expect.poll(async () => (await scenario.snapshot()).pendingDecision?.kind).toBe("selectCards");
    expect(scenario.errors).toEqual([]);
  } finally {
    await opponent?.leave();
    await page.close();
    await server.close();
  }
});
