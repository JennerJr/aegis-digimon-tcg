import type { Server } from "colyseus";
import {
  ROOM_TYPE,
  ROOM_TYPE_UNLIMITED,
  ROOM_TYPE_BETA,
  ROOM_TYPE_BETA_BOT,
  ROOM_TYPE_BOT,
  ROOM_TYPE_PRIVATE,
  ROOM_TYPE_RANKED,
  ROOM_TYPE_TOURNAMENT,
} from "@aegis/shared";
import { AegisRoom } from "./AegisRoom.js";

const publicMode = {
  allowUnlimitedSelection: false,
  allowFormatSelection: false,
  unlimitedRoom: false,
  private: false,
  botRoom: false,
  rankedRoom: false,
  tournamentRoom: false,
};

/** Register the same immutable mode boundaries in production and websocket tests. */
export function defineAegisRooms(gameServer: Pick<Server, "define">): void {
  // Explicit false values are security boundaries: Colyseus merges handler options
  // over client-supplied create options, so clients cannot promote another room type
  // into bot mode by sending `{ botRoom: true }` themselves.
  gameServer
    .define(ROOM_TYPE, AegisRoom, { ...publicMode, allowFormatSelection: true, betaBattleRoom: false })
    .filterBy(["matchTimer", "bestOf", "format", "allowRollback"]);
  gameServer
    .define(ROOM_TYPE_UNLIMITED, AegisRoom, {
      ...publicMode,
      allowFormatSelection: true,
      unlimitedRoom: true,
      betaBattleRoom: false,
    })
    .filterBy(["matchTimer", "bestOf", "format", "allowRollback"]);
  gameServer.define(ROOM_TYPE_BOT, AegisRoom, {
    ...publicMode,
    botRoom: true,
    allowUnlimitedSelection: true,
    allowFormatSelection: true,
    betaBattleRoom: false,
  });
  gameServer.define(ROOM_TYPE_BETA_BOT, AegisRoom, {
    ...publicMode,
    botRoom: true,
    allowUnlimitedSelection: true,
    allowFormatSelection: true,
    betaBattleRoom: true,
  });
  gameServer.define(ROOM_TYPE_RANKED, AegisRoom, { ...publicMode, rankedRoom: true, betaBattleRoom: false });
  gameServer
    .define(ROOM_TYPE_BETA, AegisRoom, {
      ...publicMode,
      betaBattleRoom: true,
    })
    .filterBy(["matchTimer", "bestOf", "allowRollback"]);
  // Filtered by BOTH tournament join keys: the legacy flow matches a room per bracket match, the
  // program flow one per Tournament Game, and neither may ever land in the other's room.
  gameServer
    .define(ROOM_TYPE_TOURNAMENT, AegisRoom, { ...publicMode, tournamentRoom: true, betaBattleRoom: false })
    .filterBy(["tournamentMatchId", "tournamentGameId"]);
  // Invite-only, so unreleased-product cards are legal here: both seats opted in by sharing
  // the code, and no public queue or statistic depends on the result.
  gameServer.define(ROOM_TYPE_PRIVATE, AegisRoom, {
    ...publicMode,
    private: true,
    allowUnlimitedSelection: true,
    allowFormatSelection: true,
    betaBattleRoom: true,
  });
}
