# Public community feedback hub

The community hub lives at `/feedback`. Everyone can read public topics and share
their URLs. Signing in is required to publish, reply, support ideas, confirm that a
bug also affects them, report content, or follow updates.

## Topics and discussion

New topics use the existing Bug, Improvement and Other types. Reports support
up to 20,000 characters, safe Markdown formatting and a preview. Topics and replies
are text-only for now: there are no upload, paste-image or drop-image controls.
The upload endpoint returns 410 and nonempty attachment lists are rejected by the
publication and reply APIs. Existing image attachments retain their original
read-access and moderation rules; no existing data is deleted.

Text drafts for new topics are saved on the device for the signed-in account and
expire after 24 hours. Reply text drafts survive reloads within the current browser
session. Navigation is guarded while a draft is dirty or a submission is running.

The author follows their topic automatically. Following is optional for other
readers, and everyone, including the author, can unfollow. Public replies and
visible triage changes notify followers through the existing account inbox.
Comments from administrators are marked as official responses.

Comments are loaded chronologically in pages of 20. New replies are displayed
immediately, and loading more comments preserves the rest of the discussion.
Support is idempotent per account and does not determine the team's priorities.

## Pending community roadmap

`/feedback/roadmap` shows pending improvements only. It has no release-note tab,
release catalog, delivered column or already-available feature section.

The API serves a curated snapshot at `/feedback/roadmap`, owned by
`apps/api/src/bugs/communityRoadmap.ts`. The snapshot was reviewed on 2026-10-12
against production improvement reports through the `oracle-vps` SSH alias and the
Discord suggestions forum through the Aegis MCP `list_bugs` and `get_bug` tools.
Production was queried in a read-only transaction with statement and lock timeouts.
The preview uses its isolated local database; it does not connect to production.
After merging local main on the same day, the snapshot was checked again against
the v1.25 implementation and newly completed requests were removed.

The catalog contains 21 pending themes, with English, Brazilian Portuguese and
Spanish summaries and public Discord source links where available. Website reports
are represented by editorial summaries and a source label, without exposing authors,
account IDs, private report URLs or original submissions. It is a reviewed snapshot,
not an automatic synchronization job; later status changes require updating the
catalog and review date. No new persistence schema or production writes are needed.

| Column          | Curated stage | Public improvement status |
| --------------- | ------------- | ------------------------- |
| Planned         | `planned`     | Curated team decisions    |
| In development  | `development` | `in_progress`             |
| Under review    | `review`      | `triaged`                 |
| Community ideas | `idea`        | `new`                     |

Public topic queries always filter to Improvement and exclude completed topics.
Each topic-backed column shows the 20 most recent discussions and links to the
complete filtered list. Curated suggestions link directly to their original Discord
threads. Neither a request nor support counts promise a release date.

### Review decisions and provenance

Ranked / Leaderboard is planned, rather than delivered: production improvement 77
is marked resolved, but its closing response explicitly defers availability. Discord
suggestion `1556079380667830374` is tagged Planned and the team says Ranked is hidden
until match reliability improves. `1557810820010745867` adds seasonal leaderboard
requests; cosmetic rewards remain a separate community idea.

Website reports represented in the snapshot: 138 (friends), 135 (feedback on AI use
in development), 133 (blocking clarity), 128 (opponent decklists), 127
(Korean card images), 123 (an explicit low-time popup), and
77 (Ranked). Equivalent requests from the website and Discord are combined.

Requests omitted as already fulfilled include Korean interface translations (107),
bot deck selection including saved decks (122), private-match rollback (99),
inspection/copying of your own post-match deck (119), basic replay/history playback,
post-game board inspection, card inspection that survives opponent actions, text and
keyword card search, configurable private timers, corrected timer behavior during
mulligans/disconnects, unread-chat indication, unlimited formats, and the earlier
deckbuilder layout changes. Done tags take precedence over stale open thread status;
team completion replies and current product code are also checked.

Partially fulfilled requests retain only their pending scope: opponent decklists
beyond viewing your own deck, uploaded profile
images beyond built-in/Discord avatars, exact play-cost and digivolution filters
beyond existing text search, and replay annotations beyond playback. The effect-decision
theme was removed from the roadmap at the project owner’s request. Other requests
remain ideas unless there is evidence of a team commitment.

Raw database and MCP captures stay in ignored `.local/`; they are not committed.

## Privacy and moderation

Migration 033 adds `is_public` with a default of false. Existing reports remain
private and accessible to their author at `/feedback/private`, or through their
old notification links after sign-in. The original private reporting API remains
compatible; it does not publish reports to the forum.

Public projections include only topic text, card IDs, author display names,
images, status history, visible replies and engagement counts. Browser strings,
internal notes, account IDs, opponent decks, match IDs and captured replay records
are not exposed. A triage closing reply remains private until the report is closed
or has been reopened. Official discussion comments are published immediately.
Private or hidden duplicate targets are not linked publicly.

Reporting from a match retains the existing private replay capture for the team.
There is no arbitrary replay-file upload or public download of captured input
records. Forum topic submissions use local storage rather than automatically
creating GitHub issues; private legacy submissions retain the configured mirror.

Administrators can inspect content flags, hide or restore a topic or reply, and
include hidden topics in the hub list. Hidden topics and images attached to hidden
topics/replies return 404 to ordinary readers. Private admin notes remain in triage.

Existing unattached images remain private to their owner and expire after 24 hours.
New image uploads and attachments are disabled until content moderation is ready.

## Community decks

The public hub uses the same Discussions, Roadmap and Community decks navigation
on `/feedback`, `/feedback/roadmap` and `/community`. Deck browsing retains search,
color/sort/period filters, likes, preview, copying and playing with a published deck.
Deck-detail URLs and the private reporting routes remain compatible. Catalog card
art continues to render; it is distinct from disabled user image attachments.

The ImageGen prototype and browser captures are saved in ignored `.local/`.

## Validation

Database authorization, attachment ownership, rollback, idempotency, notification
and privacy regressions run against an isolated PostgreSQL database:

```sh
POSTGRES_TESTS=1 POSTGRES_TEST_URL=postgresql://127.0.0.1:5441/aegis_forum \
  pnpm --filter @aegis/api exec vitest run src/db/postgres.atomicity.feedbackForum.test.ts
```

UI flow and layout regressions use the real product components with controlled
HTTP responses; persistence is covered independently by the PostgreSQL tests:

```sh
pnpm --filter @aegis/web test:browser public-feedback-forum.spec.ts
```

The initial forum copy is localized in English, Brazilian Portuguese and Spanish.
Other supported interface locales use the English forum strings.
