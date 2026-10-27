# Validation status — 27 October 2026

Local checks completed with dummy credentials and no real Trakt API queries:

- Node 24.22.0, pinned npm dependencies, public-template guard and type checking.
- 30 gateway tests, including Chromium Continue/Cancel consent flows, owner denial,
  PKCE/audience/replay/epoch checks, lifecycle and bounded authenticated token store.
- Real SQLite Durable Object token restoration and disconnect persistence across
  runtime disposal/recreation with only dummy token pairs.
- Production Worker/Container build and prebuilt cf dry run.
- Real nonroot Linux amd64 container: 29 read-only or 32 tracking tools; modern
  `2026-07-28` discovery and legacy initialization; annotations and direct-call
  denial of an unregistered deletion tool.
- Python adapter regression tests for restoring the latest saved token pair,
  disconnect, and refusing memory-only success after durable storage failure.
  Four adapter tests now also cover the required application user agent, sanitized
  edge-error classification, and execution of the registered authentication tool.

Production deployment completed in the selected Cloudflare account after
verifying Workers Paid entitlement and secure GitHub secret entry. The full
Worker, OAuth KV, SQLite Durable Object and Container application were created.
The version API confirms a digest-pinned container image, the SQLite export,
and the GitHub secret binding's `secret_text` type. Private owner/origin/app IDs
remain in ignored deployment settings. Current Trakt apps use no secret binding.

The configured tracking catalog contains 32 tools. The container is started on
demand. Real ChatGPT tool discovery, Trakt device authorization without a client
secret, authentication-status verification and a personal watch-history query
have now succeeded. No viewing history was saved in repository artifacts.

During live acceptance, public Trakt tools worked while personal/authentication
tools failed. The token bridge returned HTTP 403 for Python's default urllib
user agent. An explicit application user agent resolved that rejection; the
device grant and history query then completed. Trakt app credentials and owner
authorization restrictions were unchanged.
GitHub CI passed on the tested implementation, including the history secret scan,
required browser checks, image build, both protocol/catalog checks, and adapter
tests. Main/PR pushes never deploy production.

The managed environment's egress policy explicitly rejects the production
`workers.dev` hostname (proxy HTTP 403). Public smoke therefore remains blocked
from that environment; the restriction was not bypassed.

Outstanding acceptance until recorded otherwise:

- Public smoke from an environment allowed to reach the configured origin.
- Live restart/token-refresh persistence, real non-owner GitHub denial, and an
  explicitly requested tracking write verified in Trakt.

Automated stub tests do not establish live OAuth or viewing-data acceptance.
