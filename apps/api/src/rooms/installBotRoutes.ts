import type { Express } from "express";
import { matchMaker } from "colyseus";
import { roomRegistry, type AegisRoom } from "#api/rooms/AegisRoom";

export function installBotRoutes(app: Express): void {
  app.post("/bot/join", async (req, res) => {
    const { roomId, reconnectionToken, botDeckId } = req.body ?? {};
    if (
      typeof roomId !== "string" ||
      !roomId ||
      roomId.length > 100 ||
      (botDeckId !== undefined && (typeof botDeckId !== "string" || botDeckId.length > 100))
    ) {
      res.status(400).json({ error: "invalid_bot_request" });
      return;
    }
    if (typeof reconnectionToken !== "string" || !reconnectionToken || reconnectionToken.length > 200) {
      res.status(403).json({ error: "room_authorization_required" });
      return;
    }
    const options = { reconnectionToken, botDeckId };
    const local = roomRegistry.get(roomId);
    let status: number;
    if (local) status = local.requestBot(options);
    else {
      const [listing] = await matchMaker.query({ roomId });
      if (!listing) {
        res.status(404).json({ error: "room_not_found" });
        return;
      }
      try {
        status = await matchMaker.remoteRoomCall<AegisRoom, "requestBot">(roomId, "requestBot", [options]);
      } catch {
        res.status(409).json({ error: "room_unavailable" });
        return;
      }
    }
    if (status === 200) res.json({ ok: true });
    else res.status(status).json({ error: status === 403 ? "room_authorization_required" : "room_ineligible" });
  });
}
