# Security

Report vulnerabilities privately to the repository owner. Do not put OAuth codes,
tokens, credentials, private configuration, request captures or viewing history
in public issues. Use dummy data in reproductions.

Only the configured numeric GitHub owner may obtain usable MCP grants. The
separate internal token bridge requires a random private per-owner credential.
Public metadata and client registration grant no data access. The container and
Cloudflare administrators are trusted with the Trakt OAuth token pair.

The explicit tool allowlist excludes viewing-data deletion. Tracking mode can
create history entries and change watchlists/ratings, so protect Trakt grants
as write-capable credentials. Read-only registration does not make the underlying
OAuth grant read-only. Server-side restrictions, rather than MCP annotations,
enforce which tools exist.

Use `npm run check:public` before committing and CI's history secret scan. Never
commit `.dev.vars`, local deployment settings, CLI configuration or viewing data.
If a credential leaks, revoke/rotate it first; removing a file does not revoke it.
Follow the rotation and acceptance procedures in docs/OPERATIONS.md.
