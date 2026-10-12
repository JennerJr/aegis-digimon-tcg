import type { AddressInfo } from "node:net";
import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryPool } from "../db/memoryPool.fixture.js";
import { EmailQuotaExceededError, type Mailer } from "../email/mailer.js";
import { AccountStore } from "./AccountStore.js";
import { installAccountRoutes } from "./routes.js";

let close: (() => Promise<void>) | undefined;

afterEach(async () => {
  await close?.();
  close = undefined;
});

async function requestMagicLink(mailer: Mailer): Promise<Response> {
  const store = new AccountStore(createMemoryPool());
  const app = express();
  app.use(express.json());
  installAccountRoutes(
    app,
    store,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    mailer,
  );
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await store.close();
  };
  return fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/magic-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "Tamer@Example.com" }),
  });
}

describe("POST /auth/magic-link", () => {
  it("sends the sign-in link to the normalized address", async () => {
    const mailer = vi.fn<Mailer>(async () => undefined);

    const response = await requestMagicLink(mailer);

    expect(response.status).toBe(202);
    expect(mailer).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "tamer@example.com",
        html: expect.stringContaining("/auth/magic-link/consume?token="),
      }),
    );
  });

  it("tells the caller when every provider reached its daily limit", async () => {
    const response = await requestMagicLink(async () => {
      throw new EmailQuotaExceededError();
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "email_daily_limit" });
  });

  it("keeps delivery failures private", async () => {
    const response = await requestMagicLink(async () => {
      throw new Error("Resend responded 500");
    });

    expect(response.status).toBe(202);
  });
});

describe("magic link request throttling", () => {
  it("rejects repeated requests before creating a token or sending another email", async () => {
    const store = new AccountStore(createMemoryPool());
    const app = express();
    app.use(express.json());
    const mailer = vi.fn<Mailer>(async () => undefined);
    installAccountRoutes(
      app,
      store,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mailer,
    );
    const server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    close = async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await store.close();
    };
    const tokenCreation = vi.spyOn(store, "createMagicLink");
    const request = () =>
      fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/auth/magic-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "Tamer@Example.com" }),
      });
    for (let attempt = 0; attempt < 3; attempt++) expect((await request()).status).toBe(202);
    const rejected = await request();
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toEqual({ error: "too_many_requests" });
    expect(mailer).toHaveBeenCalledTimes(3);
    expect(tokenCreation).toHaveBeenCalledTimes(3);
    expect((await store.pool.query("SELECT token_hash FROM magic_links")).rowCount).toBe(3);
  });
});
