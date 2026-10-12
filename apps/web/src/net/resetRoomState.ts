import { Decoder } from "@colyseus/schema";
import { GameState } from "@aegis/shared/schema/GameState";
import type { AegisRoom } from "@/net/client";

export function resetRoomState(room: AegisRoom): void {
  const serializer = Reflect.get(room, "serializer") as { state: GameState; decoder: Decoder<GameState> };
  const state = new GameState();
  serializer.decoder = new Decoder(state);
  serializer.state = state;
}
