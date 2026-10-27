# Troubleshooting the integration

This guide records failures encountered during setup and live acceptance, the
working fixes, and the checks that distinguish layers. Read it with the
[deployment guide](DEPLOYMENT.md) and [agent runbook](../AGENTS.md#end-to-end-setup-and-resume-runbook).
Preserve the existing origin, OAuth state and grants while diagnosing.

## Tools are visible but calls fail

A catalog proves discovery, not personal-data access. Diagnose in this order:

| Probe/result | What it establishes | Next action |
| --- | --- | --- |
| Discovery or tools/list fails | Transport, OAuth or startup may be failing | Check current protocol, MCP headers, configured origin, owner grant and container readiness |
| fetch_trending_shows with limit 1 succeeds | Connector execution and public Trakt API access work | Check personal authorization separately |
| check_auth_status fails with token-storage error | Failure is before the Trakt device-token exchange | Check the token bridge; do not add a nonexistent Trakt secret |
| check_auth_status returns no active flow | The bridge read works, but no current Trakt login is established | Start device auth and guide browser approval |
| Device authorization succeeds | A Trakt grant was obtained and saved durably | Execute a small personal history/progress query |
| Personal query returns the expected data | That read path works end to end | Record evidence without retaining viewing data; continue remaining acceptance checks |

Use the connected MCP app for these probes when possible. A managed shell's
network restrictions are independent of the connector's and production
container's networking. Never retry a tracking write merely to diagnose it.

### Token-storage HTTP 403 and the application user agent

Observed: ChatGPT returned generic app execution errors for history and
check_auth_status, while public trending tools succeeded. The SDK hid the
unexpected Python exception as `Error executing tool check_auth_status`.

The storage adapter initially used urllib's default user agent. A sanitized
expected error exposed `Durable token storage returned HTTP 403`. Adding
`User-Agent: trakt-cloudflare-mcp/token-store` resolved the rejection in the
same deployment. Afterward, authentication status, device authorization and a
personal history request all succeeded. No Trakt client secret or relaxed OAuth
checks were needed. The precise edge rule was not independently identified;
do not generalize this observation to every HTTP 403.

Preserve the explicit header in container/token_store.py. Adapter tests check
it, exercise the registered auth-status tool, and verify that errors never expose
arbitrary response text. Current errors expose only HTTP status/known edge
classification or network/TLS category. Invalid bridge credentials produce 404;
setup/origin checks can produce 503/421. A different result needs diagnosis.

Keep TLS verification, no-redirect behavior, bounded reads and durable-before-
success writes. Never log the bridge key, OAuth pair, request headers, full URLs
or response bodies. Do not add a public diagnostic endpoint or fall back to disk.

## Trakt says no client secret is issued

This is expected for current Development apps. The dashboard may describe PKCE;
the pinned upstream's secretless device flow was verified with such an app.

- Store its Client ID in private traktClientId.
- Leave traktLegacySecret absent or false; no Trakt Secret binding is declared.
- Keep GITHUB_CLIENT_SECRET: it belongs to the separate GitHub owner-login app.
- For an older Trakt app that actually issued a secret, set traktLegacySecret
  true and securely supply TRAKT_CLIENT_SECRET.

An unconditional bindings.secret() declaration caused cf to reject deployment
for missing TRAKT_CLIENT_SECRET even though the current app needed none. The
conditional binding fixes provisioning, not an API login rejection. Do not enter
dummy credentials or replace an app simply because it has no secret.

## Interrupted first deployment and duplicate OAuth KV

Observed: cf provisioned OAuth KV, then stopped on a missing declared secret.
After rebuilding, retrying auto-provisioning failed with error 10014: a namespace
with the account ID and title already exists.

Inspect the selected account's newly created namespace using supported metadata;
verify its origin and purpose, then set private oauthKvId to that existing ID.
Rebuild with private settings, dry-run to confirm the expected binding, and
resume deployment. Keep IDs out of the public template. Do not delete the
namespace, reuse another gateway's namespace, or infer that a Worker upload
means the entire application rolled out. Saved dashboard secrets are preserved
by deploying without a secrets file.

## Managed shell cannot reach the proxy or Worker

These were separate cases:

1. Initial commands reported connection/EPERM failures at the configured proxy.
   Using the execution tool's network permission allowed normal proxy access;
   no environment restart was needed. Check the selected tool's permissions
   before asking the user to repair networking.
2. Requests to the new workers.dev origin received an explicit destination-policy
   HTTP 403 from the managed proxy. That did not diagnose the production app.
   Use supported allowlist configuration or run npm run smoke from an authorized
   user environment. Do not change proxy routes or disable TLS to evade it.

Use current environment readiness/policy metadata and its runtime skill. Node CLI
requests may need NODE_USE_ENV_PROXY=1. Production container calls and connected
MCP tools are separate execution paths; validate them separately.

## Cloudflare device approval does not complete CLI login

The first device-login attempt expired despite a reported browser approval.
Generate a fresh current code, have the user complete every authorization screen,
then wait for the CLI to report success and verify cf auth whoami. Device codes
expire; do not reuse an old code or assume credentials exist because the browser
looked successful. Do not deploy to a temporary account as a workaround.

## Docker builds, registry login and runtime permissions

| Failure | Working fix and verification |
| --- | --- |
| Installed Node is older than the pinned cf engine | Use .node-version before installing/running the CLI |
| Cannot write home .docker/buildx | Set BUILDX_CONFIG to an ignored writable directory |
| Registry login needs writable Docker config | Copy the existing config privately to work/, preserve its settings/credentials, and use command-scoped DOCKER_CONFIG; do not print it |
| Download step cannot verify the managed proxy CA | Mount the system CA as optional BuildKit proxy_ca and set the tool-specific trust variable only in that step |
| patch: not found in slim build image | Retain the build-stage patch installation; verify patch application with fuzz disabled |
| Nonroot Python cannot read /app/main.py | Retain COPY --chmod=644 for the runtime Python files; checkout/workspace files may have mode 0600 |
| Smoke reports no published port | Inspect the dummy container's exit state; startup failure may precede port inspection. In this case it was the file-permission failure above |
| Build cannot remove an old image referenced by a debug container | Remove only that task's stopped disposable container, then retry; do not prune unrelated containers/images |

Run the real nonroot image and both test:container and test:adapter. Metadata-only
or root-only tests did not establish that the runtime could execute auth tools.
Keep build credentials and session CA material out of image layers.

## Discovery succeeds with the wrong protocol, or calls return HTTP 400

Upstream dependency constraints selected MCP 1.x, which did not advertise current
2026-07-28 discovery. Keep the reviewed SDK 2 migration patch, pinned compatible
Pydantic/runtime dependencies, and stateless JSON HTTP runner. SDK 2 transport
arguments belong on run(), not the old settings fields.

Use test:container as the request reference: modern calls carry the _meta protocol
envelope and matching Mcp-Method; named calls also carry matching Mcp-Name.
The proxy must retain the standard MCP protocol/name/parameter headers. A test
initially omitted Mcp-Name and failed with a header/body mismatch; fix the caller
or proxy rather than disabling protocol validation. Check both modern discovery
and legacy initialization, then execute an actual tool. Refresh ChatGPT tools
after catalog changes.

## Browser consent Continue or Cancel fails

Preserve both reference-gateway fixes. Referrer-Policy no-referrer caused browser
form submissions to send Origin null and fail the exact-origin check; the consent
page needs same-origin. Chromium also applies CSP form-action to redirects:
Continue redirects to GitHub and Cancel to the validated ChatGPT callback, so
both destinations must remain allowed alongside self. Keep consent-cookie
binding, frame-ancestors none and base-uri none. Do not remove origin/CSRF checks
to make the buttons work. Run the required Chromium approval and cancellation
tests; HTTP-only tests missed these failures in the reference integration.

## Trakt device-flow states and recovery

GitHub owner login does not authorize Trakt. After tools appear, start_device_auth
must display a fresh activation code. Wait for user approval before polling with
check_auth_status and respect the indicated interval. An unfinished flow is
ephemeral: after expiry or idle sleep, start a new one. A saved Trakt grant is
durable and should not require reapproval merely because the container sleeps.

For invalid_client, verify the Trakt Client ID and any applicable legacy-secret
configuration; do not confuse it with the GitHub Client ID. If a refresh pair is
rejected after a process/network failure, reauthorize: the refresh token may have
rotated before its durable write. Do not retry spent tokens, erase unrelated
OAuth state, or record a simulated restart as proof of live refresh recovery.
