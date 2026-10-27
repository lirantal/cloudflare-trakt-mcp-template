# Operations and acceptance

Back up private deployment settings securely. Credentials stay in Cloudflare
Secrets, not in the repository. Durable Trakt tokens stay in owner DO storage;
do not delete the namespace when redeploying. Keep the Worker origin and owner
object name stable. No production deployment runs automatically on a push.

Rotate `GITHUB_CLIENT_SECRET` through GitHub and Worker Secrets. For a changed
Trakt app, update its Client ID/optional secret and reconnect Trakt. Runtime
fingerprinting replaces a running container when Trakt configuration changes.
Change `authEpoch` and redeploy to invalidate existing ChatGPT authorizations.
This does not erase the Trakt token pair. Use the owner-only `clear_auth` tool to
disconnect Trakt or revoke the app in Trakt settings.

Bridge credentials are generated privately by the DO. If one is compromised,
revoke the Trakt grant, rotate the bridge key through a reviewed DO migration,
restart the container, and authorize Trakt again. Never expose token reads as an
admin convenience. Cloudflare administrators and the container are trusted.

No automatic retries occur on tool calls. If a mark-watched operation times out,
inspect history before repeating it: Trakt may have completed the write. Rating
updates can replace a previous rating; watchlist additions can change stored
notes. Tell the assistant exactly what to change. Deletion is unavailable.

## Acceptance checks

Record these separately, without saving actual viewing history in reports:

1. Local type check, browser OAuth tests, public guard, real-container smoke,
   production build and prebuilt dry run.
2. Full Cloudflare Worker and Container rollout; verify secret binding types,
   owner restriction and selected access mode.
3. Public metadata, unauthenticated MCP challenge and denied token bridge.
4. Real ChatGPT tool discovery after GitHub owner sign-in, Trakt device login,
   and a visible small data query matching the account.
5. Idle/restart persistence: reconnect after container restart and query without
   a second Trakt authorization; exercise real token refresh when eligible.
6. Fresh ChatGPT connection using a different actual GitHub identity must be
   denied. Stub owner-denial tests do not substitute for this real check.
7. In track mode, request one intended watched/watchlist/rating change and verify
   it in Trakt. Do not perform a live write without a concrete user request.

## Troubleshooting

The [detailed troubleshooting guide](TROUBLESHOOTING.md) contains the observed
setup failures, a layer-by-layer diagnostic sequence, and verified recovery
steps. Use it before resetting grants, replacing apps or reprovisioning resources.

- 503 setup incomplete: check private settings and Secret binding names/types;
  never print their values.
- OAuth consent failure: retain same-origin Referrer-Policy, CSP GitHub/ChatGPT
  form destinations, cookie binding and exact origin. Run browser tests.
- ChatGPT discovers no tools: verify current `server/discover` advertises
  `2026-07-28`, required MCP headers survive proxying, and Refresh tools was used.
- Token store unavailable: check Worker reachability from the container and its
  bridge key. Do not fall back to ephemeral disk or log the failed request.
- Authentication-status tools fail while public trending tools work: isolate the
  token bridge before changing the Trakt app. Python's default urllib user agent
  received HTTP 403 on this deployment; the explicit application user agent fixes
  that request. Keep it in place. Errors expose only HTTP status/known edge
  classification or network/TLS category, never response bodies or identifiers.
- Device auth pending: finish the Trakt approval, then wait the indicated poll
  interval. After an idle restart, start a new flow if no token was saved.
- `invalid_client`: confirm the Trakt Development Client ID and optional legacy
  secret. A GitHub OAuth Client ID cannot be used as a Trakt Client ID.
- Refresh rejected after a network/process failure: reauthorize Trakt. A token
  may have rotated before its durable write; do not retry an old token pair.
- Docker buildx/home permission error: use writable BUILDX_CONFIG; preserve
  existing Docker credentials. Mount the system CA through BuildKit if needed.
- Cloudflare device login timeout: request a fresh code and complete all browser
  consent screens. Do not switch to temporary-account deployment.

Roll back by rebuilding a reviewed prior source commit with the same private
settings and deploying to the existing origin/resources. Do not reset stored
OAuth state as a routine rollback. Observe actual rollout completion.
