import { describe, expect, it, vi } from "vitest";
import type { Client } from "colyseus";
import { USED_DECK_CHANNEL, type UsedDeck } from "@aegis/shared/decks/UsedDeck";
import { AegisRoom, type AegisJoinOptions } from "#api/rooms/AegisRoom";
import { RED_DECK } from "#api/engine/testDecks";
import type { SeriesRecord } from "#api/rooms/series/SeriesDirectory";

function makeRoom() {
  const room = new AegisRoom();
  room.lock = vi.fn<() => Promise<void>>(async () => undefined);
  room.unlock = vi.fn<() => Promise<void>>(async () => undefined);
  room.setMatchmaking = vi.fn<() => Promise<void>>(async () => undefined);
  const registration = vi.spyOn(room, "onMessage");
  room.onCreate({ seed: 1 });
  const handler = registration.mock.calls.find(([channel]) => channel === "*")![1] as unknown as (
    recipient: Client,
    channel: string,
    payload: unknown,
  ) => void;
  return { room, request: (recipient: Client) => handler(recipient, USED_DECK_CHANNEL, {}) };
}

function client(sessionId: string): Client {
  return {
    sessionId,
    send: vi.fn<(channel: string, message: unknown) => void>(),
    view: undefined,
  } as unknown as Client;
}

const community = { id: "publication", author: { id: "author", displayName: "Original Author" } };

describe("authoritative used deck", () => {
  it("returns only the requesting player's immutable initial list after deck and source mutations", () => {
    const { room, request } = makeRoom();
    try {
      const owner = client("owner");
      const outsider = client("outsider");
      const deck = structuredClone(RED_DECK);
      const attribution = structuredClone(community);
      room.clients.push(owner);
      room.onJoin(owner, {
        displayName: "Owner",
        deck,
        deckId: "community-publication",
        deckName: "Original",
        community: attribution,
      });
      deck.mainDeck[0] = "BT1-010";
      attribution.author.displayName = "Republished";
      request(owner);
      const snapshot = vi
        .mocked(owner.send)
        .mock.calls.find(([channel]) => channel === USED_DECK_CHANNEL)![1] as UsedDeck;
      expect(snapshot.mainDeck).toEqual(RED_DECK.mainDeck);
      expect(snapshot.community).toEqual(community);
      expect(snapshot.deckName).toBe("Original");
      snapshot.mainDeck[0] = "BT1-011";
      request(owner);
      expect(vi.mocked(owner.send).mock.calls.at(-1)![1]).toMatchObject({ mainDeck: RED_DECK.mainDeck });
      request(outsider);
      expect(outsider.send).not.toHaveBeenCalled();
    } finally {
      room.onDispose();
    }
  });
  it("restores the frozen series deck and community attribution instead of a changed join payload", async () => {
    const { room, request } = makeRoom();
    try {
      const record = {
        seats: [
          {
            displayName: "Original Player",
            deck: structuredClone(RED_DECK),
            deckId: "used",
            deckName: "Original Deck",
            community,
          },
        ],
      } as unknown as SeriesRecord;
      Object.assign(room, {
        casualSeries: {
          continuation: record,
          seatForToken: () => 0,
          noteArrival: () => undefined,
          dispose: () => undefined,
        },
      });
      const owner = client("series-owner");
      const options: AegisJoinOptions = {
        displayName: "Changed",
        deck: { mainDeck: [], eggDeck: [] },
        deckName: "Changed Deck",
        community: { ...community, author: { ...community.author, displayName: "Changed Author" } },
        seriesToken: "seat-token",
      };
      expect(await room.onAuth(owner, options)).toBe(true);
      room.clients.push(owner);
      room.onJoin(owner, options);
      request(owner);
      expect(vi.mocked(owner.send).mock.calls.find(([channel]) => channel === USED_DECK_CHANNEL)![1]).toMatchObject({
        mainDeck: RED_DECK.mainDeck,
        deckName: "Original Deck",
        community,
      });
    } finally {
      room.onDispose();
    }
  });
});
