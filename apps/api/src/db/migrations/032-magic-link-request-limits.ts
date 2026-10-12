import type { Migration } from "#api/db/migrator";

export const magicLinkRequestLimits: Migration = {
  id: "032-magic-link-request-limits",
  up: `
    CREATE TABLE IF NOT EXISTS magic_link_request_limits (
      key_hash text PRIMARY KEY,
      window_started_at bigint NOT NULL,
      attempts integer NOT NULL CHECK (attempts >= 0)
    );
    CREATE INDEX IF NOT EXISTS magic_link_request_limits_window_idx ON magic_link_request_limits(window_started_at);
    CREATE INDEX IF NOT EXISTS magic_links_expiry_idx ON magic_links(expires_at)
  `,
};
