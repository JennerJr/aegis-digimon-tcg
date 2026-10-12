import { UsedDeckDialog } from "@/game/UsedDeckDialog";
import { DECKS, copyDeckPreset, type DeckListing } from "@/game/decks";
import { saveDecks, loadDecks } from "@/identity";
import type { UsedDeck } from "@aegis/shared/decks/UsedDeck";
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "../../../i18n";
import { GameOverOverlay } from "./GameOverOverlay";
import type { SeriesView } from "../../seriesModel";

afterEach(cleanup);

function renderOverlay(cardsRevealed = false) {
  render(
    <I18nProvider>
      <GameOverOverlay
        result="win"
        reason="security"
        stats={[{ value: 7, label: "Turns" }]}
        cardsRevealed={cardsRevealed}
        onMenu={() => {}}
        onRematch={() => {}}
      />
    </I18nProvider>,
  );
}

describe("reviewing the board after the match", () => {
  it("folds the result into a bar and brings it back", () => {
    renderOverlay();
    expect(screen.getByRole("dialog")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("Victory");

    fireEvent.click(screen.getByRole("button", { name: "Show result" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Find rematch" })).toBeTruthy();
  });
});

describe("revealed cards hint", () => {
  it("points at the piles only once the server revealed them", () => {
    renderOverlay(true);
    fireEvent.click(screen.getByRole("button", { name: "View board" }));
    expect(screen.getByRole("status").textContent).toContain("Click a pile to see its cards");
  });
});

describe("best-of-three result", () => {
  const view = (fields: Partial<SeriesView>): SeriesView => ({
    bestOf: 3,
    gameNumber: 1,
    viewerWins: 0,
    opponentWins: 1,
    pips: ["loss", "pending", "pending"],
    stage: "choosing",
    viewerChooses: true,
    choiceSecondsLeft: 18,
    viewerGoesFirst: undefined,
    outcome: undefined,
    endReason: "",
    ...fields,
  });

  function renderSeries(fields: Partial<SeriesView>) {
    const calls: string[] = [];
    render(
      <I18nProvider>
        <GameOverOverlay
          result="loss"
          reason="security"
          stats={[]}
          onMenu={() => calls.push("menu")}
          onRematch={() => calls.push("rematch")}
          series={{
            view: view(fields),
            opponentName: "Nova",
            onChooseTurnOrder: (goFirst) => calls.push(goFirst ? "first" : "second"),
            onLeave: () => calls.push("leave"),
          }}
        />
      </I18nProvider>,
    );
    return calls;
  }

  it("lets the loser pick the turn order and leave, without the rematch actions", () => {
    const calls = renderSeries({});
    expect(screen.getByText("Game 1 of 3 · complete")).toBeTruthy();
    expect(screen.getByText("Picks Go first in 00:18")).toBeTruthy();
    expect(screen.getByText("Game 1: lost")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Find rematch" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Go second" }));
    fireEvent.click(screen.getByRole("button", { name: "Leave series" }));
    expect(calls).toEqual(["second", "leave"]);
  });

  it("tells the winner who is choosing", () => {
    renderSeries({ viewerChooses: false, viewerWins: 1, opponentWins: 0, pips: ["win", "pending", "pending"] });
    expect(screen.getByText("Nova is choosing who goes first")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Go first" })).toBeNull();
  });

  it("announces who starts the next game", () => {
    renderSeries({ stage: "starting", viewerChooses: false, viewerGoesFirst: false });
    expect(screen.getByText("Game 2 · Nova goes first")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Leave series" })).toBeNull();
  });

  it("ends with the series result and the usual actions", () => {
    const calls = renderSeries({
      stage: "over",
      outcome: "win",
      endReason: "won",
      viewerWins: 2,
      opponentWins: 1,
      pips: ["loss", "win", "win"],
    });
    expect(screen.getByText("Series won")).toBeTruthy();
    expect(screen.getByText("Series complete")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Find rematch" }));
    expect(calls).toEqual(["rematch"]);
  });

  it("explains a forfeit from the winner's side", () => {
    renderSeries({ stage: "over", outcome: "win", endReason: "forfeit", viewerWins: 1, opponentWins: 0 });
    expect(screen.getByText("Nova left the series.")).toBeTruthy();
  });
});

it("opens the exact used deck after a duel and saves an independent personal copy with attribution and artwork", () => {
  const original = DECKS[0]!;
  const snapshot: UsedDeck = {
    deckId: "community-used",
    deckName: "Deck at match start",
    mainDeck: [...original.mainDeck],
    eggDeck: [...original.eggDeck],
    mainDeckArts: [...original.mainDeck],
    eggDeckArts: [...original.eggDeck],
    format: "BT1",
    community: { id: "publication", author: { id: "author", displayName: "Original Author" } },
  };
  const onCopy = vi.fn<(deck: DeckListing) => void>((deck: DeckListing) => saveDecks([copyDeckPreset(deck, [])]));
  const view = render(
    <I18nProvider>
      <GameOverOverlay
        result="win"
        reason="security"
        stats={[]}
        onMenu={() => undefined}
        onRematch={() => undefined}
        onViewUsedDeck={() =>
          view.rerender(
            <I18nProvider>
              <UsedDeckDialog snapshot={snapshot} onCopy={onCopy} onClose={() => undefined} />
            </I18nProvider>,
          )
        }
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "View used deck" }));
  expect(screen.getByRole("heading", { name: /Deck at match start/ })).toBeTruthy();
  expect(screen.getByText("Original Author")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Use deck" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Copy to edit" }));
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Copied!" })).toHaveProperty("disabled", true);
  const saved = loadDecks()[0]!;
  expect(saved.id).not.toBe(snapshot.deckId);
  expect(saved.mainDeck).toEqual(snapshot.mainDeck);
  expect(saved.eggDeck).toEqual(snapshot.eggDeck);
  expect(saved.mainDeckArts).toEqual(snapshot.mainDeckArts);
  expect(saved.eggDeckArts).toEqual(snapshot.eggDeckArts);
  expect(saved.format).toBe("BT1");
  expect(saved.community).toEqual(snapshot.community);
  snapshot.mainDeck[0] = "BT1-010";
  snapshot.community!.author.displayName = "Changed author";
  expect(loadDecks()[0]!.mainDeck).toEqual(original.mainDeck);
  expect(loadDecks()[0]!.community!.author.displayName).toBe("Original Author");
  localStorage.removeItem("aegis:decks");
});
