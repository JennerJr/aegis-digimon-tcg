import type { CommunityRandomResult } from "@aegis/shared/decks/CommunityRandomResult";
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n";
import { Lobby, deckHasBetaCards, randomDeckPool } from "./Lobby";
import { DECKS, selectableDecks } from "../game/decks";

const randomCommunityDeck = vi.hoisted(() =>
  vi.fn<(...args: unknown[]) => Promise<CommunityRandomResult>>(async () => ({ deck: null, eligibleCount: 0 })),
);
vi.mock("@/community/client", () => ({ communityApi: { randomDeck: randomCommunityDeck } }));

const lookupPrivateRoom = vi.hoisted(() =>
  vi.fn<() => Promise<{ roomId: string; unlimited: boolean; format?: import("@aegis/shared").DeckFormat }>>(
    async () => ({
      roomId: "private-room",
      unlimited: false,
    }),
  ),
);
vi.mock("../net/client", () => ({ lookupPrivateRoom }));

// Existing configuration scenarios explicitly enter the advanced panel.
function renderConfiguredLobby(...args: Parameters<typeof render>) {
  const view = render(...args);
  const summary = view.container.querySelector(".lobby-advanced > summary");
  if (summary) fireEvent.click(summary);
  return view;
}

// EX13 is the beta fixture, so the clock stays before its 2026-10-02 release.
beforeEach(() => {
  randomCommunityDeck.mockResolvedValue({ deck: null, eligibleCount: 0 });
  lookupPrivateRoom.mockResolvedValue({ roomId: "private-room", unlimited: false });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-15T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  localStorage.removeItem("aegis:locale");
  localStorage.removeItem("aegis:match-timer");
});

const BEFORE_EX13_RELEASE = new Date("2026-10-01T12:00:00.000Z");

describe("famous deck selection", () => {
  beforeEach(() => vi.setSystemTime(BEFORE_EX13_RELEASE));
  afterEach(() => vi.useRealTimers());

  it("GitHub #5202: offers a separate Unlimited queue for a banned-card deck", () => {
    const onStart = vi.fn();
    const deck = { ...DECKS[0]!, mainDeck: [...DECKS[0]!.mainDeck] };
    deck.mainDeck.splice(0, 4, ...Array<string>(4).fill("BT5-109"));
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[deck]}
          activeDeckId={deck.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), {
      target: {
        value:
          (screen.getByRole("combobox", { name: "Rules" }) as HTMLSelectElement).value === "unlimited"
            ? "standard"
            : "unlimited",
      },
    });
    const launch = screen.getByRole("button", { name: "Enter queue" });
    expect((launch as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(launch);
    expect(onStart).toHaveBeenCalledWith("unlimited");
    expect(screen.getByRole("button", { name: /Quick Match/ }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("button", { name: /^Unlimited/ })).toBeNull();
    expect(screen.getByRole("switch", { name: "Match timer" })).toBeTruthy();
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), {
      target: {
        value:
          (screen.getByRole("combobox", { name: "Rules" }) as HTMLSelectElement).value === "unlimited"
            ? "standard"
            : "unlimited",
      },
    });
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("value", "standard");
    expect(screen.getByRole("button", { name: "Enter queue" })).toHaveProperty("disabled", true);
  });
  it("GitHub #5236: a personal beta bot deck routes random human practice through the beta room", async () => {
    const onStart = vi.fn();
    const human = { ...DECKS[0]!, id: "human", name: "Human" };
    const bot = { ...human, id: "personal-bot", name: "Personal beta bot", mainDeck: [...human.mainDeck] };
    bot.mainDeck[0] = "EX13-007";
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[human, bot]}
          activeDeckId={human.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    fireEvent.change(screen.getByLabelText("Bot's deck"), { target: { value: "mine:personal-bot" } });
    fireEvent.click(screen.getByRole("button", { name: /Surprise me/ }));
    fireEvent.click(screen.getByRole("button", { name: "Play vs Bot" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() =>
      expect(onStart.mock.calls[0]?.slice(0, 4)).toEqual(["bot", undefined, "mine:personal-bot", true]),
    );
  });
  it("translates automatic beta confirmation into Portuguese and confirms the human queue", () => {
    localStorage.setItem("aegis:locale", "pt-BR");
    const onStart = vi.fn();
    const deck = { ...DECKS[0]!, mainDeck: [...DECKS[0]!.mainDeck] };
    deck.mainDeck[0] = "EX13-007";
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[deck]}
          activeDeckId={deck.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );
    expect(screen.getAllByText("Deck de batalha").length).toBeGreaterThan(0);
    expect(screen.queryByText(/A partida começa assim/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Entrar na fila beta" }));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Jogar com cartas beta?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(onStart).toHaveBeenCalledWith("beta", undefined, undefined, true);
  });
  it("puts playable decks first, searches by name, and edits blocked decks", () => {
    const onSelectDeck = vi.fn();
    const onNav = vi.fn();
    const valid = { ...DECKS[0]!, id: "valid", name: "Playable build" };
    const invalid = { ...valid, id: "draft", name: "Draft build", mainDeck: [] };
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[invalid, valid]}
          activeDeckId={valid.id}
          onSelectDeck={onSelectDeck}
          onCopyDeck={() => undefined}
          onNav={onNav}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );
    const picker = within(screen.getByRole("region", { name: "Choose your battle deck" }));
    const region = within(screen.getByLabelText("Your decks"));
    const selectors = region
      .getAllByRole("button")
      .filter((button) => button.classList.contains("deck-list-card__selector"));
    expect(selectors.map((button) => button.getAttribute("aria-label"))).toEqual([valid.name, invalid.name]);
    expect((selectors[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(selectors[1]!);
    expect(onSelectDeck).not.toHaveBeenCalled();
    fireEvent.change(picker.getByRole("searchbox"), { target: { value: "DRAFT" } });
    expect(region.queryByRole("button", { name: valid.name })).toBeNull();
    fireEvent.click(region.getByRole("button", { name: "Edit" }));
    expect(onSelectDeck).toHaveBeenCalledWith(invalid.id);
    expect(onNav).toHaveBeenCalledWith("deck");
    fireEvent.change(picker.getByRole("searchbox"), { target: { value: "missing" } });
    expect(screen.getAllByText("No decks match your search.").length).toBe(2);
    expect(picker.getByRole("status").textContent).toBe("0 decks");
  });
  it("keeps ordinary decks in the normal queue without a beta checkbox", () => {
    const onStart = vi.fn();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole("checkbox", { name: "Beta battle mode" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Enter beta queue" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enter queue" }));
    expect(onStart).toHaveBeenCalled();
  });

  it("keeps a random choice hidden and passes a legal deck only when starting", async () => {
    const onStart = vi.fn();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    expect(screen.getByRole("button", { name: "Mystery selected" })).toBeTruthy();
    expect(screen.getAllByText("Mystery deck").length).toBeGreaterThan(0);
    expect(screen.getByText("A legal deck will be chosen when the match begins.")).toBeTruthy();
    expect(screen.queryByText(/Randomly selected/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Enter queue" }));

    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    const [startMode, code, botDeckId, betaBattleMode, deckId] = onStart.mock.calls[0]!;
    const drawn = selectableDecks(DECKS).find((deck) => deck.id === deckId);
    expect(drawn).toBeDefined();
    const drawnBeta = deckHasBetaCards(drawn!);
    expect([startMode, code, botDeckId]).toEqual([drawnBeta ? "beta" : "casual", undefined, undefined]);
    expect(betaBattleMode).toBe(drawnBeta ? true : undefined);
  });

  it("builds mystery pools by source and excludes drafts and beta cards", () => {
    const legal = { ...DECKS[0]!, id: "legal-personal" };
    const draft = { ...DECKS[0]!, id: "draft-personal", mainDeck: [] };
    const beta = { ...DECKS[0]!, id: "beta-personal", mainDeck: [...DECKS[0]!.mainDeck] };
    beta.mainDeck[0] = "EX13-007";

    expect(randomDeckPool([legal, draft, beta], "mine").map((deck) => deck.id)).toEqual([legal.id]);
    expect(randomDeckPool([legal, draft, beta], "mine", true).map((deck) => deck.id)).toEqual([legal.id, beta.id]);
    expect(randomDeckPool([legal, draft, beta], "famous")).not.toContainEqual(
      expect.objectContaining({ id: legal.id }),
    );
    expect(randomDeckPool([legal, draft, beta], "all")).toContainEqual(expect.objectContaining({ id: legal.id }));
  });

  it("draws a personal beta deck from the mystery pool and routes it to the beta queue", () => {
    const beta = { ...DECKS[0]!, id: "beta-personal", mainDeck: [...DECKS[0]!.mainDeck] };
    beta.mainDeck[0] = "EX13-007";
    const onStart = vi.fn();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[beta]}
          activeDeckId={beta.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    fireEvent.click(screen.getByRole("button", { name: "Mine" }));
    fireEvent.click(screen.getByRole("button", { name: "Enter queue" }));

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onStart.mock.calls[0]).toEqual(["beta", undefined, undefined, true, beta.id]);
  });

  it("lets an ordinary deck opt into the beta queue without the beta-card warning", () => {
    const onStart = vi.fn();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("checkbox", { name: /Play in the beta queue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enter beta queue" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onStart).toHaveBeenCalledWith("beta", undefined, undefined, true);
  });

  it("lets an ordinary deck face the beta bot", () => {
    const onStart = vi.fn();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Play in the beta queue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Play vs Bot" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(onStart).toHaveBeenCalledWith("bot", undefined, undefined, true);
  });

  it("hides the beta queue option when no set is in preview", () => {
    vi.setSystemTime(new Date("2026-10-15T12:00:00.000Z"));
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );

    expect(screen.queryByRole("checkbox", { name: /Play in the beta queue/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    expect(screen.queryByRole("checkbox", { name: /Play in the beta queue/ })).toBeNull();
  });

  it("routes every mystery draw to the beta queue once the player opts in", async () => {
    const onStart = vi.fn();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Play in the beta queue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Enter beta queue" }));

    await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
    const [startMode, , , betaBattleMode] = onStart.mock.calls[0]!;
    expect([startMode, betaBattleMode]).toEqual(["beta", true]);
  });

  it("automatically enables beta for an EX13 deck and still allows private matches", () => {
    const deck = { ...DECKS[0]!, mainDeck: [...DECKS[0]!.mainDeck] };
    deck.mainDeck[0] = "EX13-007";
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[deck]}
          activeDeckId={deck.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );
    expect(screen.queryByRole("button", { name: "Enter queue" })).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /Play in the beta queue/ })).toBeNull();
    expect((screen.getByRole("button", { name: "Enter beta queue" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    expect((screen.getByRole("button", { name: "Play vs Bot" }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Private Match/ }));
    expect((screen.getByRole("button", { name: "Create Room" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("confirms beta bot battles before starting", () => {
    const onStart = vi.fn();
    const deck = { ...DECKS[0]!, mainDeck: [...DECKS[0]!.mainDeck] };
    deck.mainDeck[0] = "EX13-007";
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[deck]}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    fireEvent.click(screen.getByRole("button", { name: "Play vs Bot" }));
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Play with beta cards?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onStart).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Play vs Bot" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onStart).toHaveBeenCalledWith("bot", undefined, undefined, true);
  });
  it("separates personal decks and groups available famous decks by collection", () => {
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[{ id: "mine", name: "My build", color: "Blue", blurb: "Custom", mainDeck: [], eggDeck: [] }]}
          activeDeckId="mine"
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );

    const personalDeck = within(screen.getByLabelText("Your decks")).getByRole("button", { name: /My build/ });
    const bt1 = screen.getByRole("region", { name: "BT1" });
    fireEvent.click(within(bt1).getByText("BT1"));
    const famousDeck = within(bt1).getByRole("button", { name: /Red Omnimon/ });
    expect(personalDeck.closest(".deck-list-card")).toBeTruthy();
    expect(famousDeck.closest(".deck-list-card")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Famous decks" })).toBeTruthy();
    for (const set of ["BT1", "EX2", "BT10", "BT19", "EX9"]) {
      expect(screen.getByRole("heading", { name: set })).toBeTruthy();
    }
  });

  it("searches famous decks across collapsed collections and filters by owner", () => {
    const onSelectDeck = vi.fn<(id: string) => void>();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[{ id: "mine", name: "My build", color: "Blue", blurb: "Custom", mainDeck: [], eggDeck: [] }]}
          activeDeckId="mine"
          onSelectDeck={onSelectDeck}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );

    const picker = within(screen.getByRole("region", { name: "Choose your battle deck" }));
    fireEvent.change(picker.getByRole("searchbox"), { target: { value: "omnimon" } });
    expect(picker.queryByRole("button", { name: /My build/ })).toBeNull();
    expect(picker.queryByRole("heading", { name: "EX2" })).toBeNull();
    const bt1 = picker.getByRole("region", { name: "BT1" });
    expect((bt1.querySelector("details") as HTMLDetailsElement).open).toBe(true);
    const useButtons = within(bt1).getAllByRole("button", { name: "Use deck" });
    expect(useButtons.length).toBeGreaterThan(0);
    fireEvent.click(useButtons[0]!);
    expect(onSelectDeck).toHaveBeenCalledWith("bt1-red-omnimon");

    fireEvent.change(picker.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.click(picker.getByRole("button", { name: /^Mine/ }));
    expect(picker.getByRole("button", { name: /My build/ })).toBeTruthy();
    expect(picker.queryByRole("heading", { name: "Famous decks" })).toBeNull();
    fireEvent.click(picker.getByRole("button", { name: /^Famous/ }));
    expect(picker.queryByRole("button", { name: /My build/ })).toBeNull();
    expect(picker.getByRole("heading", { name: "Famous decks" })).toBeTruthy();
  });

  it("narrows famous decks to one collection and ignores it for personal decks", () => {
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[{ id: "mine", name: "My build", color: "Blue", blurb: "Custom", mainDeck: [], eggDeck: [] }]}
          activeDeckId="mine"
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );

    const picker = within(screen.getByRole("region", { name: "Choose your battle deck" }));
    fireEvent.change(picker.getByRole("combobox", { name: "Collection" }), { target: { value: "EX2" } });
    expect(picker.queryByLabelText("Your decks")).toBeNull();
    expect(picker.queryByRole("heading", { name: "BT1" })).toBeNull();
    const ex2 = picker.getByRole("region", { name: "EX2" });
    expect(within(ex2).getAllByRole("button", { name: "Use deck" }).length).toBeGreaterThan(0);

    fireEvent.click(picker.getByRole("button", { name: /^Mine/ }));
    expect(picker.getByRole("button", { name: /My build/ })).toBeTruthy();
    expect((picker.getByRole("combobox", { name: "Collection" }) as HTMLSelectElement).disabled).toBe(true);
  });

  it("selects a famous preset without adding it to personal decks", () => {
    const onSelectDeck = vi.fn<(id: string) => void>();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[]}
          activeDeckId=""
          onSelectDeck={onSelectDeck}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );

    const ex2 = screen.getByRole("region", { name: "EX2" });
    expect(within(ex2).queryAllByRole("button", { name: "Use deck" })).toHaveLength(0);
    fireEvent.click(within(ex2).getByText("EX2"));
    expect(within(ex2).getAllByRole("button", { name: "Use deck" }).length).toBeGreaterThan(0);
    const bt1Group = screen.getByRole("region", { name: "BT1" });
    fireEvent.click(within(bt1Group).getByText("BT1"));
    fireEvent.click(within(bt1Group).getByRole("button", { name: /Red Omnimon/ }));

    expect(onSelectDeck).toHaveBeenCalledWith("bt1-red-omnimon");
    expect(screen.queryByRole("button", { name: /My build/ })).toBeNull();
  });
});

describe("invite links", () => {
  it("opens the private join form with the invited code filled in", async () => {
    const onStart = vi.fn();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[DECKS[0]!]}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
          invitedRoomCode="AB12CD"
        />
      </I18nProvider>,
    );
    expect((screen.getByLabelText("Enter room code") as HTMLInputElement).value).toBe("AB12CD");
    await waitFor(() => expect(screen.getByRole("button", { name: "Join Room" })).toHaveProperty("disabled", false));
    fireEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(onStart).toHaveBeenCalledWith("private_guest", "AB12CD");
  });
});

describe("famous deck list", () => {
  it("shows a famous deck's cards without copying it and can play it from the dialog", () => {
    const onSelectDeck = vi.fn<(id: string) => void>();
    const onCopyDeck = vi.fn();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[]}
          activeDeckId=""
          onSelectDeck={onSelectDeck}
          onCopyDeck={onCopyDeck}
          onNav={() => undefined}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );

    const bt1Group = screen.getByRole("region", { name: "BT1" });
    fireEvent.click(within(bt1Group).getByText("BT1"));
    const omnimonCard = within(bt1Group)
      .getByRole("button", { name: /Red Omnimon/ })
      .closest(".deck-list-card")!;
    fireEvent.click(within(omnimonCard as HTMLElement).getByRole("button", { name: "View list" }));

    const dialog = screen.getByRole("dialog", { name: /Red Omnimon/ });
    expect(within(dialog).getByText("50 cards + 5 eggs", { exact: false })).toBeTruthy();
    expect(within(dialog).getByRole("region", { name: "Digi-Egg deck · 5" })).toBeTruthy();
    expect(within(dialog).getAllByText(/^×\d$/).length).toBeGreaterThan(0);
    expect(onCopyDeck).not.toHaveBeenCalled();
    expect(onSelectDeck).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Use deck" }));
    expect(onSelectDeck).toHaveBeenCalledWith("bt1-red-omnimon");
    expect(screen.queryByRole("dialog", { name: /Red Omnimon/ })).toBeNull();
  });
});

describe("returning to a private room", () => {
  function renderRoom(host: boolean, onStart = vi.fn(), onLeavePrivateRoom = vi.fn()) {
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
          privateRoom={{ code: "ABC234", host }}
          onLeavePrivateRoom={onLeavePrivateRoom}
        />
      </I18nProvider>,
    );
    return { onStart, onLeavePrivateRoom };
  }

  it("lets the host reopen the room under the same code", () => {
    const { onStart } = renderRoom(true);
    expect(screen.getByText("Room ABC234")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reopen room" }));
    expect(onStart).toHaveBeenCalledWith("private_host", "ABC234");
  });

  it("lets the guest rejoin the room under the same code", () => {
    const { onStart } = renderRoom(false);
    fireEvent.click(screen.getByRole("button", { name: "Rejoin room" }));
    expect(onStart).toHaveBeenCalledWith("private_guest", "ABC234");
  });

  it("leaves the room on request", () => {
    const { onLeavePrivateRoom } = renderRoom(true);
    fireEvent.click(screen.getByRole("button", { name: "Leave room" }));
    expect(onLeavePrivateRoom).toHaveBeenCalledOnce();
  });
});

describe("optional match timer configuration", () => {
  it("updates host settings, hides them for guests and excludes practice", () => {
    const onTimerOptionsChange =
      vi.fn<(options: { matchTimer: boolean; timerStartSeconds: number; timerRefillSeconds: number }) => void>();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
          onTimerOptionsChange={onTimerOptionsChange}
        />
      </I18nProvider>,
    );
    const timerSwitch = screen.getByRole("switch", { name: "Match timer" });
    expect(timerSwitch.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(timerSwitch);
    expect(timerSwitch.getAttribute("aria-checked")).toBe("false");
    expect(onTimerOptionsChange).toHaveBeenLastCalledWith({
      matchTimer: false,
      timerStartSeconds: 300,
      timerRefillSeconds: 60,
    });
    fireEvent.click(timerSwitch);
    expect(timerSwitch.getAttribute("aria-checked")).toBe("true");
    expect(onTimerOptionsChange).toHaveBeenLastCalledWith({
      matchTimer: true,
      timerStartSeconds: 300,
      timerRefillSeconds: 60,
    });
    expect(screen.getByText("300s")).toBeTruthy();
    expect(screen.queryByText("+60s")).toBeNull();
    expect(screen.queryByText("+30s")).toBeNull();
    expect(screen.getByText("300s per turn · Resets each turn")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Private Match/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Time per turn" }), { target: { value: "60" } });
    expect(screen.queryByRole("combobox", { name: "Per-turn refill" })).toBeNull();
    expect(onTimerOptionsChange).toHaveBeenLastCalledWith({
      matchTimer: true,
      timerStartSeconds: 60,
      timerRefillSeconds: 60,
    });
    expect(screen.getByText("60s")).toBeTruthy();
    expect(screen.getByText("60s per turn · Resets each turn")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "Match timer" }));
    expect(onTimerOptionsChange).toHaveBeenLastCalledWith({
      matchTimer: false,
      timerStartSeconds: 60,
      timerRefillSeconds: 60,
    });
    expect(screen.queryByRole("combobox", { name: "Time per turn" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Match timer" }));
    expect(screen.getByText("60s per turn · Resets each turn")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Join" }));
    expect(screen.queryByRole("switch", { name: "Match timer" })).toBeNull();
    expect(screen.getByText("The host sets the format and timer for both players.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    expect(screen.queryByRole("switch", { name: "Match timer" })).toBeNull();
  });
});

describe("match format configuration", () => {
  afterEach(() => localStorage.removeItem("aegis:match-format"));

  it("sits beside the timer, remembers the choice and hides for guests and practice", () => {
    const onBestOfChange = vi.fn<(bestOf: 1 | 3) => void>();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
          onBestOfChange={onBestOfChange}
        />
      </I18nProvider>,
    );
    const bestOfThree = screen.getByRole("radio", { name: "Best of 3" });
    expect(screen.getByRole("radio", { name: "Best of 1" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(bestOfThree);
    expect(bestOfThree.getAttribute("aria-checked")).toBe("true");
    expect(onBestOfChange).toHaveBeenLastCalledWith(3);
    expect(localStorage.getItem("aegis:match-format")).toBe("3");
    expect(screen.getByText(/First to 2 wins/)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Match timer" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Private Match/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Join" }));
    expect(screen.queryByRole("radio", { name: "Best of 3" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    expect(screen.queryByRole("radio", { name: "Best of 3" })).toBeNull();
  });
});

describe("bot and private Unlimited selection", () => {
  function bannedDeck() {
    const deck = {
      ...DECKS[0]!,
      id: "unlimited-fixture",
      name: "Unlimited fixture",
      mainDeck: [...DECKS[0]!.mainDeck],
    };
    deck.mainDeck.splice(0, 4, "BT5-109", "BT5-109", "ST2-13", "ST2-13");
    return deck;
  }
  function setup(options: { invitedRoomCode?: string; printedOverflow?: boolean; beta?: boolean } = {}) {
    const deck = bannedDeck();
    if (options.printedOverflow) deck.mainDeck.splice(0, 5, ...Array<string>(5).fill("BT5-109"));
    if (options.beta) deck.mainDeck[5] = "EX13-007";
    const onStart = vi.fn<Parameters<typeof Lobby>[0]["onStart"]>();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[deck]}
          activeDeckId={deck.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
          invitedRoomCode={options.invitedRoomCode}
        />
      </I18nProvider>,
    );
    return { onStart, deck };
  }

  it("enables the human and custom bot deck only after selecting Unlimited, and toggles back", () => {
    const { onStart, deck } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    const botSelect = screen.getByLabelText("Bot's deck");
    expect(within(botSelect).getByRole("option", { name: deck.name })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Play vs Bot" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), {
      target: {
        value:
          (screen.getByRole("combobox", { name: "Rules" }) as HTMLSelectElement).value === "unlimited"
            ? "standard"
            : "unlimited",
      },
    });
    expect(within(botSelect).getByRole("option", { name: deck.name })).toHaveProperty("disabled", false);
    fireEvent.change(botSelect, { target: { value: `mine:${deck.id}` } });
    fireEvent.click(screen.getByRole("button", { name: "Play vs Bot" }));
    expect(onStart).toHaveBeenCalledWith("bot", undefined, `mine:${deck.id}`, false, undefined, true);
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), {
      target: {
        value:
          (screen.getByRole("combobox", { name: "Rules" }) as HTMLSelectElement).value === "unlimited"
            ? "standard"
            : "unlimited",
      },
    });
    expect(screen.getByRole("button", { name: "Play vs Bot" })).toHaveProperty("disabled", true);
  });

  it("keeps Unlimited when moving between Casual and Practice", () => {
    const { onStart } = setup();
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), { target: { value: "unlimited" } });
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    expect(screen.getByRole("button", { name: "Play vs Bot" })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: "Play vs Bot" }));
    expect(onStart).toHaveBeenLastCalledWith("bot", undefined, undefined, false, undefined, true);
    fireEvent.click(screen.getByRole("button", { name: /Quick Match/ }));
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("value", "unlimited");
    fireEvent.click(screen.getByRole("button", { name: "Enter queue" }));
    expect(onStart.mock.lastCall?.[0]).toBe("unlimited");
  });

  it("exposes the existing selector for private hosts and sends the selected mode", () => {
    const { onStart } = setup();
    fireEvent.click(screen.getByRole("button", { name: /Private Match/ }));
    expect(screen.getByRole("button", { name: "Create Room" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), {
      target: {
        value:
          (screen.getByRole("combobox", { name: "Rules" }) as HTMLSelectElement).value === "unlimited"
            ? "standard"
            : "unlimited",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Room" }));
    expect(onStart).toHaveBeenCalledWith("private_host", undefined, undefined, undefined, undefined, true);
  });

  it("loads the guest host mode before allowing a banned deck and gives no override", async () => {
    lookupPrivateRoom.mockResolvedValue({ roomId: "private-room", unlimited: true });
    const { onStart } = setup({ invitedRoomCode: "ABC234" });
    expect(screen.queryByRole("combobox", { name: "Rules" })).toBeNull();
    expect(screen.getByRole("button", { name: "Join Room" })).toHaveProperty("disabled", true);
    await screen.findByText("Host banlist: Unlimited");
    fireEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(onStart).toHaveBeenCalledWith("private_guest", "ABC234", undefined, undefined, undefined, true);
    fireEvent.change(screen.getByLabelText("Enter room code"), { target: { value: "NEW234" } });
    expect(screen.getByRole("button", { name: "Join Room" })).toHaveProperty("disabled", true);
  });

  it("keeps a banned guest deck disabled under the host's current banlist", async () => {
    setup({ invitedRoomCode: "ABC234" });
    await screen.findByText("Host banlist: Current banlist");
    expect(screen.getByRole("button", { name: "Join Room" })).toHaveProperty("disabled", true);
  });

  it.each([false, true])("ignores an older lookup arriving after the new host mode (%s)", async (unlimited) => {
    let resolveOld!: (rules: { roomId: string; unlimited: boolean }) => void;
    const oldLookup = new Promise<{ roomId: string; unlimited: boolean; format?: import("@aegis/shared").DeckFormat }>(
      (resolve) => {
        resolveOld = resolve;
      },
    );
    lookupPrivateRoom.mockResolvedValue({ roomId: "new-room", unlimited });
    lookupPrivateRoom.mockReturnValueOnce(oldLookup);
    const { onStart, deck } = setup({ invitedRoomCode: "ABC234" });
    await waitFor(() => expect(lookupPrivateRoom).toHaveBeenCalledWith("ABC234"));
    fireEvent.change(screen.getByLabelText("Enter room code"), { target: { value: "NEW234" } });
    const hostMode = `Host banlist: ${unlimited ? "Unlimited" : "Current banlist"}`;
    await screen.findByText(hostMode);
    await act(async () => resolveOld({ roomId: "old-room", unlimited: !unlimited }));

    expect(screen.getByText(hostMode)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join Room" })).toHaveProperty("disabled", !unlimited);
    const picker = within(screen.getByRole("region", { name: "Choose your battle deck" }));
    expect(picker.getByRole("button", { name: deck.name })).toHaveProperty("disabled", !unlimited);
    fireEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(onStart.mock.calls).toEqual(
      unlimited ? [["private_guest", "NEW234", undefined, undefined, undefined, true]] : [],
    );
  });

  it("does not enable a banned deck from an old Unlimited response while the new code is pending", async () => {
    let resolveOld!: (rules: { roomId: string; unlimited: boolean }) => void;
    let resolveNew!: (rules: { roomId: string; unlimited: boolean }) => void;
    lookupPrivateRoom.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
    );
    lookupPrivateRoom.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveNew = resolve;
      }),
    );
    const { onStart, deck } = setup({ invitedRoomCode: "ABC234" });
    await waitFor(() => expect(lookupPrivateRoom).toHaveBeenCalledWith("ABC234"));
    fireEvent.change(screen.getByLabelText("Enter room code"), { target: { value: "NEW234" } });
    await waitFor(() => expect(lookupPrivateRoom).toHaveBeenCalledWith("NEW234"));
    await act(async () => resolveOld({ roomId: "old-room", unlimited: true }));
    expect(screen.queryByText("Host banlist: Unlimited")).toBeNull();
    expect(screen.getByRole("button", { name: "Join Room" })).toHaveProperty("disabled", true);
    const picker = within(screen.getByRole("region", { name: "Choose your battle deck" }));
    expect(picker.getByRole("button", { name: deck.name })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(onStart).not.toHaveBeenCalled();
    await act(async () => resolveNew({ roomId: "new-room", unlimited: false }));
    expect(screen.getByText("Host banlist: Current banlist")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join Room" })).toHaveProperty("disabled", true);
  });

  it("retains printed limits when Unlimited is selected", () => {
    setup({ printedOverflow: true });
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), {
      target: {
        value:
          (screen.getByRole("combobox", { name: "Rules" }) as HTMLSelectElement).value === "unlimited"
            ? "standard"
            : "unlimited",
      },
    });
    expect(screen.getByRole("button", { name: "Play vs Bot" })).toHaveProperty("disabled", true);
  });

  it("keeps beta bot confirmation and Unlimited independent", () => {
    const { onStart } = setup({ beta: true });
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), {
      target: {
        value:
          (screen.getByRole("combobox", { name: "Rules" }) as HTMLSelectElement).value === "unlimited"
            ? "standard"
            : "unlimited",
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Play vs Bot" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(onStart).toHaveBeenCalledWith("bot", undefined, undefined, true, undefined, true);
  });

  it("localizes the host's mode in Portuguese", async () => {
    localStorage.setItem("aegis:locale", "pt-BR");
    lookupPrivateRoom.mockResolvedValue({ roomId: "private-room", unlimited: true });
    setup({ invitedRoomCode: "ABC234" });
    expect(await screen.findByText("Lista do anfitrião: Unlimited")).toBeTruthy();
  });
});

describe("historical and Pauper format selection", () => {
  it("starts a saved BT13 deck in that format and rejects cards released later", () => {
    const onStart = vi.fn();
    const deck = { ...DECKS[0]!, format: "BT13" as const, mainDeck: [...DECKS[0]!.mainDeck] };
    deck.mainDeck.splice(0, 4, ...Array<string>(4).fill("BT13-012"));
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[deck]}
          activeDeckId={deck.id}
          onSelectDeck={() => {}}
          onCopyDeck={() => {}}
          onNav={() => {}}
          onStart={onStart}
        />
      </I18nProvider>,
    );
    expect(screen.getByRole("combobox", { name: "Cards through" })).toHaveProperty("value", "BT13");
    fireEvent.click(screen.getByRole("button", { name: "Enter queue" }));
    expect(onStart).toHaveBeenCalledWith("casual", undefined, undefined, undefined, undefined, undefined, "BT13");
    fireEvent.change(screen.getByRole("combobox", { name: "Cards through" }), { target: { value: "all" } });
    expect(screen.getByRole("button", { name: "Enter queue" })).toHaveProperty("disabled", true);
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), { target: { value: "pauper" } });
    expect(screen.getByRole("button", { name: "Enter queue" })).toHaveProperty("disabled", true);
  });
});

describe("independent historical card pool and match rules", () => {
  const pauperDeck = {
    ...DECKS[0]!,
    id: "historical-eosmon",
    name: "Historical Eosmon",
    format: "BT13:pauper" as const,
    mainDeck: Array<string>(50).fill("BT6-085"),
    eggDeck: ["BT1-002"],
  };
  function setup(privateRoom?: import("./Lobby").PrivateRoom, invitedRoomCode?: string) {
    const onStart = vi.fn<import("react").ComponentProps<typeof Lobby>["onStart"]>();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[pauperDeck]}
          activeDeckId={pauperDeck.id}
          onSelectDeck={() => {}}
          onCopyDeck={() => {}}
          onNav={() => {}}
          onStart={onStart}
          privateRoom={privateRoom}
          invitedRoomCode={invitedRoomCode}
        />
      </I18nProvider>,
    );
    return onStart;
  }
  it.each([
    ["Quick Match", "Enter queue", "casual", "pauper"],
    ["Practice vs AI", "Play vs Bot", "bot", "pauper"],
    ["Private Match", "Create Room", "private_host", "pauper"],
    ["Quick Match", "Enter queue", "unlimited", "unlimited"],
    ["Practice vs AI", "Play vs Bot", "bot", "unlimited"],
    ["Private Match", "Create Room", "private_host", "unlimited"],
  ] as const)("starts %s in BT13 with %s (%s, %s)", (opponent, launch, mode, rules) => {
    const onStart = setup();
    fireEvent.click(screen.getByRole("button", { name: new RegExp(opponent) }));
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), { target: { value: rules } });
    expect(screen.getByRole("combobox", { name: "Cards through" })).toHaveProperty("value", "BT13");
    expect(screen.getByRole("button", { name: launch })).toHaveProperty("disabled", false);
    fireEvent.click(screen.getByRole("button", { name: launch }));
    expect(onStart.mock.lastCall?.[0]).toBe(mode);
    expect(onStart.mock.lastCall?.[5] === true).toBe(rules === "unlimited");
    expect(onStart.mock.lastCall?.[6]).toBe(`BT13:${rules}`);
  });
  it("retains each axis while changing the other and switching all opponent modes", () => {
    setup();
    fireEvent.change(screen.getByRole("combobox", { name: "Cards through" }), { target: { value: "BT12" } });
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("value", "pauper");
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), { target: { value: "unlimited" } });
    for (const opponent of ["Practice vs AI", "Private Match", "Quick Match"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(opponent) }));
      expect(screen.getByRole("combobox", { name: "Cards through" })).toHaveProperty("value", "BT12");
      expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("value", "unlimited");
    }
    fireEvent.change(screen.getByRole("combobox", { name: "Cards through" }), { target: { value: "all" } });
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("value", "unlimited");
  });
  it("filters random decks against the combined rules", () => {
    const rareDeck = { ...pauperDeck, id: "rare", mainDeck: [...pauperDeck.mainDeck] };
    rareDeck.mainDeck[0] = "BT5-109";
    const laterDeck = { ...pauperDeck, id: "later", mainDeck: [...pauperDeck.mainDeck] };
    laterDeck.mainDeck[0] = "BT14-033";
    expect(
      randomDeckPool([pauperDeck, rareDeck, laterDeck], "mine", false, false, "BT13:pauper").map((deck) => deck.id),
    ).toEqual([pauperDeck.id]);
    expect(
      randomDeckPool([pauperDeck, rareDeck, laterDeck], "mine", false, true, "BT13:unlimited").map((deck) => deck.id),
    ).toEqual([pauperDeck.id, rareDeck.id]);
  });
  it("shows fixed pool and rules to a returning private guest", () => {
    const onStart = setup({ code: "ABC234", host: false, format: "BT13:unlimited", unlimited: true });
    expect(screen.getByRole("combobox", { name: "Cards through" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("combobox", { name: "Cards through" })).toHaveProperty("value", "BT13");
    fireEvent.click(screen.getByRole("button", { name: "Rejoin room" }));
    expect(onStart).toHaveBeenCalledWith(
      "private_guest",
      "ABC234",
      undefined,
      undefined,
      undefined,
      true,
      "BT13:unlimited",
    );
  });
  it("inherits a code lookup's historical Pauper rules", async () => {
    lookupPrivateRoom.mockResolvedValue({ roomId: "private-room", unlimited: false, format: "BT13:pauper" });
    const onStart = setup(undefined, "ABC234");
    await screen.findByText("Host banlist: BT13 · Pauper · C / U");
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "Join Room" }));
    expect(onStart).toHaveBeenCalledWith(
      "private_guest",
      "ABC234",
      undefined,
      undefined,
      undefined,
      undefined,
      "BT13:pauper",
    );
  });
  it("lets a returning private host configure an independent bot match", () => {
    setup({ code: "ABC234", host: true, format: "BT13:unlimited", unlimited: true });
    fireEvent.click(screen.getByRole("button", { name: /Practice vs AI/ }));
    expect(screen.getByRole("combobox", { name: "Cards through" })).toHaveProperty("value", "BT13");
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("disabled", false);
    fireEvent.change(screen.getByRole("combobox", { name: "Rules" }), { target: { value: "pauper" } });
    expect(screen.getByRole("combobox", { name: "Cards through" })).toHaveProperty("value", "BT13");
    fireEvent.click(screen.getByRole("button", { name: /Private Match/ }));
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("value", "unlimited");
    expect(screen.getByRole("combobox", { name: "Rules" })).toHaveProperty("disabled", true);
  });
});

// Issue #56: players missed the queue's advanced settings behind a small grey line.
describe("the advanced settings toggle", () => {
  function renderLobby() {
    return render(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={[DECKS[0]!]}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={() => undefined}
        />
      </I18nProvider>,
    );
  }

  it("says what it holds, so it reads as settings rather than fine print", () => {
    const view = renderLobby();
    const summary = view.container.querySelector(".lobby-advanced > summary")!;
    expect(summary.textContent).toContain("Advanced settings");
    expect(summary.textContent).toContain("Card pool, rules, best-of, timer and more");
  });
});

describe("community mystery deck selection", () => {
  function renderMystery() {
    const onStart = vi.fn<(...args: unknown[]) => void>();
    renderConfiguredLobby(
      <I18nProvider>
        <Lobby
          player={{ name: "Tamer", color: "Blue", shards: 0 }}
          decks={DECKS}
          activeDeckId={DECKS[0]!.id}
          onSelectDeck={() => undefined}
          onCopyDeck={() => undefined}
          onNav={() => undefined}
          onStart={onStart}
        />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
    return onStart;
  }
  it("starts with the full community deck without requiring a borrowed or saved listing", async () => {
    const personal = DECKS[0]!;
    const deck = {
      id: "public-random",
      name: "Community Winner",
      author: { id: "author", displayName: "Deck Author" },
      colors: ["Red"],
      coverCardId: null,
      likeCount: 0,
      copyCount: 0,
      likedByMe: false,
      legal: true,
      publishedAt: 1,
      updatedAt: 1,
      status: "public" as const,
      mainDeck: [...personal.mainDeck],
      eggDeck: [...personal.eggDeck],
      mainDeckArts: [...personal.mainDeck],
      eggDeckArts: [...personal.eggDeck],
    };
    randomCommunityDeck.mockResolvedValueOnce({ deck, eligibleCount: 200 });
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const onStart = renderMystery();
      fireEvent.click(screen.getByRole("button", { name: "Enter queue" }));
      await waitFor(() => expect(onStart).toHaveBeenCalledTimes(1));
      expect(onStart.mock.calls[0]![4]).toMatchObject({
        id: "community-public-random",
        mainDeck: deck.mainDeck,
        eggDeck: deck.eggDeck,
        community: { id: deck.id, author: deck.author },
      });
      expect(randomCommunityDeck).toHaveBeenLastCalledWith({ format: "standard", betaAllowed: true });
    } finally {
      random.mockRestore();
    }
  });
  it("blocks duplicate starts and reports selection failure without silently excluding community decks", async () => {
    let rejectDraw: (reason: Error) => void = () => undefined;
    randomCommunityDeck.mockReturnValueOnce(
      new Promise((_, reject) => {
        rejectDraw = reject;
      }),
    );
    const onStart = renderMystery();
    fireEvent.click(screen.getByRole("button", { name: "Enter queue" }));
    expect(screen.getByRole("button", { name: "Enter queue" })).toHaveProperty("disabled", true);
    expect(screen.getByText("Drawing a deck…").getAttribute("role")).toBe("status");
    await act(async () => rejectDraw(new Error("Unavailable")));
    expect(screen.getByText("Could not draw a deck. Try again.")).toBeTruthy();
    expect(onStart).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Enter queue" })).toHaveProperty("disabled", false);
  });
});

it("does not launch a delayed mystery draw after leaving the lobby", async () => {
  let finish: (result: CommunityRandomResult) => void = () => undefined;
  randomCommunityDeck.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const onStart = vi.fn<(...args: unknown[]) => void>();
  const view = renderConfiguredLobby(
    <I18nProvider>
      <Lobby
        player={{ name: "Tamer", color: "Blue", shards: 0 }}
        decks={DECKS}
        activeDeckId={DECKS[0]!.id}
        onSelectDeck={() => undefined}
        onCopyDeck={() => undefined}
        onNav={() => undefined}
        onStart={onStart}
      />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Surprise me" }));
  fireEvent.click(screen.getByRole("button", { name: "Enter queue" }));
  view.unmount();
  await act(async () => finish({ deck: null, eligibleCount: 0 }));
  expect(onStart).not.toHaveBeenCalled();
});
