import { afterEach, describe, expect, it } from "vitest";
import { AccountStore } from "#api/accounts/AccountStore";
import { createMemoryPool } from "#api/db/memoryPool.fixture";

const stores: AccountStore[] = [];

afterEach(async () => {
  await Promise.all(stores.splice(0).map((store) => store.close()));
});

function store(): AccountStore {
  const value = new AccountStore(createMemoryPool());
  stores.push(value);
  return value;
}

describe("magic link request limits", () => {
  it("limits the normalized recipient across different caller addresses", async () => {
    const accounts = store();
    const now = Date.now();
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await accounts.allowMagicLinkRequest({ ip: `caller-${attempt}`, email: " Tamer@Example.com ", now })).toBe(
        true,
      );
    }
    expect(await accounts.allowMagicLinkRequest({ ip: "another-caller", email: "tamer@example.com", now })).toBe(false);
  });

  it("limits one caller sending to different recipients", async () => {
    const accounts = store();
    const now = Date.now();
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(await accounts.allowMagicLinkRequest({ ip: "caller", email: `tamer-${attempt}@example.com`, now })).toBe(
        true,
      );
    }
    expect(await accounts.allowMagicLinkRequest({ ip: "caller", email: "new@example.com", now })).toBe(false);
  });

  it("shares recipient limits between stores and resets at the window boundary", async () => {
    const accounts = store();
    const sibling = new AccountStore(accounts.pool);
    const now = Date.now();
    expect(await accounts.allowMagicLinkRequest({ ip: "caller", email: "tamer@example.com", now })).toBe(true);
    expect(await sibling.allowMagicLinkRequest({ ip: "caller", email: "tamer@example.com", now })).toBe(true);
    expect(await accounts.allowMagicLinkRequest({ ip: "caller", email: "tamer@example.com", now })).toBe(true);
    expect(await sibling.allowMagicLinkRequest({ ip: "caller", email: "tamer@example.com", now: now + 899_999 })).toBe(
      false,
    );
    expect(await sibling.allowMagicLinkRequest({ ip: "caller", email: "tamer@example.com", now: now + 900_000 })).toBe(
      true,
    );
  });

  it("removes expired tokens and stale limit keys without removing live tokens", async () => {
    const accounts = store();
    const now = Date.now();
    await accounts.createMagicLink("expired@example.com");
    await accounts.pool.query("UPDATE magic_links SET expires_at=$1", [now - 1]);
    await accounts.createMagicLink("live@example.com");
    await accounts.pool.query("INSERT INTO magic_link_request_limits VALUES ($1,$2,1)", ["stale", now - 86_400_001]);
    await accounts.allowMagicLinkRequest({ ip: "caller", email: "live@example.com", now });
    expect((await accounts.pool.query("SELECT email FROM magic_links")).rows).toEqual([{ email: "live@example.com" }]);
    expect(
      (await accounts.pool.query("SELECT key_hash FROM magic_link_request_limits WHERE key_hash=$1", ["stale"]))
        .rowCount,
    ).toBe(0);
  });
});
