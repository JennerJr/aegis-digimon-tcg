import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { installAccountRoutes } from "#api/accounts/routes";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function callback(
  query: string,
  cookie?: string,
): Promise<{ response: Response; discord: Mock<(url: string) => Promise<Response>> }> {
  const store = new AccountStore(createMemoryPool());
  const app = express();
  installAccountRoutes(app, store);
  vi.stubEnv("DISCORD_CLIENT_ID", "local-client");
  vi.stubEnv("DISCORD_CLIENT_SECRET", "local-secret");
  vi.stubEnv("DISCORD_REDIRECT_URI", "http://localhost/callback");
  const originalFetch = globalThis.fetch;
  const discord = vi.fn<(url: string) => Promise<Response>>(
    async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith("/token") ? { access_token: "local-token" } : { id: "local-user", username: "LocalTamer" },
        ),
        { status: 200 },
      ),
  );
  vi.stubGlobal("fetch", async (url: string, options?: RequestInit) =>
    String(url).startsWith("https://discord.com/") ? discord(String(url)) : originalFetch(url, options),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  };
  const response = await fetch(
    `http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/discord/callback?${query}`,
    {
      redirect: "manual",
      headers: cookie ? { Cookie: cookie } : {},
    },
  );
  return { response, discord };
}

describe("Discord OAuth state validation", () => {
  it.each([
    ["code=local-code", undefined],
    ["code=local-code&state=", "aegis_oauth_state="],
    ["code=local-code&state=expected", undefined],
    ["code=local-code", "aegis_oauth_state=expected"],
    ["code=local-code&state=wrong", "aegis_oauth_state=expected"],
    ["code=local-code&state=expected&state=expected", "aegis_oauth_state=expected"],
    ["state=expected", "aegis_oauth_state=expected"],
  ])("rejects missing, malformed or mismatched state before exchanging a code: %s", async (query, cookie) => {
    const { response, discord } = await callback(query, cookie);
    expect(response.status).toBe(400);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(discord).not.toHaveBeenCalled();
  });

  it("issues a session only when the callback matches the browser state cookie", async () => {
    const { response, discord } = await callback("code=local-code&state=expected", "aegis_oauth_state=expected");
    expect(response.status).toBe(302);
    expect(response.headers.get("set-cookie")).toContain("aegis_session=");
    expect(response.headers.get("set-cookie")).toContain("aegis_oauth_state=; ");
    expect(discord).toHaveBeenCalledTimes(2);
  });
});
