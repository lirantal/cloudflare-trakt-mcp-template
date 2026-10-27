# Working on this gateway

Read README.md and docs/ARCHITECTURE.md, DEPLOYMENT.md, OPERATIONS.md,
TROUBLESHOOTING.md, UPSTREAM.md and VALIDATION.md before changing the deployment. Inspect Git status and preserve
user work. Use main when the user requests it; commit coherent changes often.

- Use Node from .node-version, npm ci, pinned official cf and cloudflare.config.ts.
- Keep personal settings in ignored deployment.local.json or TRAKT_DEPLOYMENT_FILE.
  Keep credentials in Secret bindings or mode-0600 ignored local files. Never
  print credentials, auth files, tokens, viewing data, request URLs/headers/bodies.
- Keep numeric owner checks, S256 PKCE, exact audience, epoch validation, consent
  cookies and ChatGPT callback restrictions. No Cloudflare Access gate in front.
- Only the explicit reviewed tool catalog may be exposed. deleteMode stays none.
  Track mode permits the three additions; read-only is also supported. Do not
  add deletion, check-in, scrobble or new upstream tools without user direction.
- Trakt tokens must persist before success; never rely on ephemeral disk. Bridge
  credentials are distinct from gateway OAuth and never sent to ChatGPT.
- Preserve current MCP metadata headers and stateless JSON transport. Verify
  current server/discover and legacy initialize using the real image.
- Run check:public, check, required-browser npm test, build, prebuilt dry-run and
  test:container and test:adapter for relevant changes. Use dummy keys and no real viewing data.
- Read managed runtime/network/Docker skill guidance; retain proxy and TLS trust.
  Use command network permissions; never bypass a destination-policy denial.
- Verify Cloudflare account name/ID and existing resources before provisioning.
  User authorization to deploy applies; do not ask again for routine steps.
  A plan purchase/upgrade must be done by the user. Preserve existing services.
- Existing Worker secrets are preserved when deployed without a secrets file.
  Inspect names/types only. Never overwrite a running gateway with a placeholder.
- Guide the owner through GitHub OAuth App creation, secure secret entry, and
  personal Trakt Development app/device approval. No secrets in chat.
- Separate local checks, rollout, public smoke, real ChatGPT data use, refresh/
  restart persistence, and real non-owner denial. Never claim stub tests as live
  acceptance. Record remaining manual steps accurately.
- Main/PR CI is non-deploying. Do not add automatic production deployment unless
  requested. New upstream versions require patch review and catalog validation.

## End-to-end setup and resume runbook

Carry out the authorized implementation, checks and deployment; do not stop at a
plan or at successful tool discovery. Guide the user through the browser-only
steps while continuing independent work. Existing session authorization applies:
do not repeatedly ask permission to perform already authorized deployment steps.

### 1. Inspect and select the correct path

Read the linked docs and inspect Git status, settings-file existence, supported
CLI authentication and existing account resources. Do not print private settings
or auth files. For an existing instance, preserve its origin, OAuth KV, owner DO,
Trakt grant and saved Worker Secrets. Resume at the first incomplete step.
For a new user, use their repository/account/verified numeric GitHub identity;
never copy the original instance's private IDs or credentials. The committed
deployment.json remains generic. Follow the user's branch instructions.

### 2. Prepare and verify without credentials

Use the pinned Node and npm dependencies, Linux amd64 Docker and Chrome/Chromium.
Read the managed runtime skill when applicable. A shell permission error reaching
the proxy may need the execution tool's network permission; it does not by itself
mean the user must restart the environment. Preserve proxy and TLS trust.

Run npm ci, check:public, check, REQUIRE_BROWSER_TESTS=true npm test, an image
build, test:container, test:adapter, the production build and prebuilt dry run.
Public settings suffice: set TRAKT_DEPLOYMENT_FILE=deployment.json for a public
build when local private settings already exist. Never deploy that placeholder
build as the real application. Production must pass preflight and be rebuilt
with the selected private settings. Use the [managed environment steps](docs/DEPLOYMENT.md#managed-environment)
for writable caches and optional BuildKit CA mounts.

### 3. Verify Cloudflare and establish a stable origin

Use ready existing authentication; otherwise start cf auth login --no-browser
and guide approval of its current device code. Verify cf auth whoami reports
authenticated and the correct account after approval. If polling expires, obtain
a fresh code; a browser approval report alone is not evidence of CLI readiness.
Discover commands with anonymous cf cli search queries, then inspect the chosen
command's help/schema; do not put personal identifiers in search queries.

Inspect account metadata, existing Workers/subdomains, Workers Paid entitlement
and Containers availability. Choose an unused Worker name and derive its exact
HTTPS origin. Explain the KV/DO/Container usage charges within the authorized
scope; never purchase or upgrade a plan for the user. Do not alter another gateway.

### 4. Configure the two applications correctly

Create ignored mode-0600 deployment.local.json only if it does not exist. Fill
verified account/origin/owner settings, accessMode chosen by the user, deleteMode
none and authEpoch 1 for a new instance. Follow the deployment settings table.

Guide creation of a GitHub **OAuth App** with homepage PUBLIC_ORIGIN, callback
PUBLIC_ORIGIN/callback and device flow off. A separate app preserves another
gateway's callback. Obtain its non-secret Client ID, and guide secure storage of
GITHUB_CLIENT_SECRET. ChatGPT's dynamic client credentials are a separate layer.

Guide creation of a personal Trakt **Development** app at developer.trakt.tv,
with required redirect http://localhost and blank allowed origins. The upstream
uses device authorization; it receives no callback. The dashboard may say the
app uses PKCE and issues no secret: this worked in live acceptance. Keep
traktLegacySecret absent/false and omit the TRAKT_CLIENT_SECRET binding. Only
older apps issued a secret need that flag and Secret. Never invent a dummy secret
or weaken the owner checks to fix authentication.

### 5. Enter secrets before full provisioning

Use a secure local mode-0600 .dev.vars or existing Worker dashboard Secret entry;
never ask for secret values in chat. If dashboard-only entry is needed and the
name is unused, follow the deployment guide's zero-binding 503 bootstrap recipe.
Never overwrite a running gateway with it. Verify only secret names/types using
cf workers secrets list --worker YOUR_WORKER_NAME. Confirm the required GitHub
secret exists and that no unnecessary Trakt secret is required before proceeding.

### 6. Build, dry-run, deploy and inspect the whole rollout

Run production preflight and checks, rebuild with final private settings, and
review the prebuilt dry run. Deploy with the chosen secret-entry mechanism; omit
the secrets file to preserve dashboard secrets. Wait for the complete command,
including image preparation and Worker/Container rollout. Verify the deployed
version's owner/mode, SQLite export, image digest, secret binding types and
Container application via supported metadata APIs. Zero active instances before
the first call is normal for on-demand startup.

If an attempt creates OAuth KV but fails before attachment, do not provision a
duplicate or erase state. Inspect the newly created namespace in the selected
account, put its ID in private oauthKvId, rebuild, dry-run, then resume. See the
[recovery guide](docs/TROUBLESHOOTING.md#interrupted-first-deployment-and-duplicate-oauth-kv).

### 7. Complete both authentication layers and a real query

Run public smoke if the execution environment allows the origin. An explicit
proxy destination denial needs supported policy configuration or a user-side
run; do not bypass it or report success. This is distinct from production errors.

Guide ChatGPT custom-app creation with PUBLIC_ORIGIN/mcp, OAuth, and blank
predefined client ID/secret when optional. Approve consent/GitHub owner login,
then Refresh tools and Try in chat. Verify a visible tool execution, not just a
catalog or plausible prose. Public trending tools can work before Trakt login.

Invoke start_device_auth through the connected app, give the current activation
link/code to the user, and wait for their completion before check_auth_status.
Respect the returned expiry and poll interval. An expired/idle-lost unfinished
flow needs a new code. Once authorization succeeds, fetch a small personal
history/progress result and have the user verify it. Do not save viewing data in
logs, fixtures or documentation. No Trakt client secret was needed in live setup.

If public tools work but personal/auth-status tools fail, isolate the token bridge
first. Keep its explicit application User-Agent; default urllib received HTTP
403. Use sanitized errors and the troubleshooting decision tree. Do not reset
working ChatGPT OAuth or request nonexistent Trakt secrets as the first response.

### 8. Record evidence and hand off accurately

Record local/CI checks, rollout, public smoke, real discovery, Trakt device grant,
personal query, live restart/refresh persistence and real non-owner denial as
separate results. Complete the [acceptance checklist](docs/OPERATIONS.md#acceptance-checks).
If a user-only check is unavailable, mark it outstanding. A simulated storage
restart is not a live restart/refresh check; a stub owner denial is not a real
second-identity check. Do not perform a live tracking write without a concrete
user request, or describe read-only registration as a read-only OAuth credential.

Update validation/troubleshooting docs without private identifiers, commit the
reviewed changes, run check:public, and report the actual connection URL plus
remaining manual steps. Do not redeploy for documentation-only changes.
