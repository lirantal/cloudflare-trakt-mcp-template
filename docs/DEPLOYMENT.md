# Deployment

Use Node 24.22.0, npm ci, Docker Linux amd64, and Chromium/Chrome. Use the pinned
official `cf` CLI and `cloudflare.config.ts`; do not maintain a Wrangler config.

## Account and private settings

```sh
npx cf auth login --no-browser
npx cf auth whoami
cp deployment.json deployment.local.json
chmod 600 deployment.local.json
```

Verify the intended account name/ID and Workers Paid/Containers availability.
Inspect existing Worker names before selecting one. Never change a functioning
deployment's origin or reuse another gateway's KV or Durable Object namespace.
An upgrade/purchase must be performed by the account owner.

| Field | Value |
| --- | --- |
| accountId | Selected Cloudflare account ID |
| workerName | Stable unused name, e.g. `trakt-mcp` |
| publicOrigin | Exact `https://WORKER.SUBDOMAIN.workers.dev`, no trailing slash |
| allowedGithubUserId | Verified numeric GitHub owner ID, stored as a string |
| githubClientId | New GitHub OAuth App's Client ID |
| traktClientId | Personal Trakt Development app's Client ID |
| traktLegacySecret | Optional boolean, default false; enable only for an older app that issued a secret |
| accessMode | `read-only` or `track` |
| deleteMode | Must be `none` |
| authEpoch | Start at `1`; change to invalidate gateway grants |
| timezone | IANA timezone; reserved configuration, does not change Trakt timestamps |

Local settings override the public template. `TRAKT_DEPLOYMENT_FILE` explicitly
selects another file and fails closed if missing/invalid. Never commit filled
settings, CLI authentication, `.dev.vars`, viewing data, or build output.

## GitHub OAuth App

At GitHub Settings → Developer settings → OAuth Apps → New OAuth App:

- Homepage: `PUBLIC_ORIGIN`.
- Authorization callback: `PUBLIC_ORIGIN/callback`.
- Device flow: disabled.

Use a separate app from your existing Intervals gateway so its callback remains
stable. This is the same owner-login architecture; it does not require modifying
the existing server. Save the non-secret Client ID in private settings. The
Client Secret must be a Worker **Secret** named `GITHUB_CLIENT_SECRET`.

## Trakt app

At https://developer.trakt.tv create a **Development** app for personal use.
Trakt may require verification through GitHub. Register `http://localhost` as
the required redirect URI and leave browser allowed origins blank. The device
flow does not receive a callback. Save its Client ID in private settings. New
apps may not issue a secret; if an older app has one, store it as the optional
Worker Secret `TRAKT_CLIENT_SECRET` and set `traktLegacySecret: true` in private
settings. The secret binding is omitted by default; current apps require none.

Trakt authorization is separate from ChatGPT/GitHub gateway authorization.
After connecting ChatGPT, invoke `start_device_auth`, approve the displayed code
at Trakt, then invoke `check_auth_status` when finished. Respect its polling
interval. Do not manually supply access/refresh tokens or paste credentials into
chat. The stored OAuth pair refreshes automatically and survives idle sleep.

## Secure secret entry

Prefer either an ignored mode-0600 `.dev.vars` edited securely, or dashboard
Secret entries on the Worker. `.dev.vars.example` lists the names. Never put
secrets in chat, command arguments, Docker builds, public JSON or Git.

For dashboard-only first setup, inspect account metadata to verify the intended
name is unused. Create an ignored `work/bootstrap` project with the pinned root
cf/Vite dependencies and the root `vite.config.ts`. Configure only the target
account/name, entrypoint, date, workersDev, disabled previews and observability;
do not provision KV, DO or Containers yet. Its handler must return 503
`Setup pending`. Build, dry-run, then deploy that new placeholder. The user can
then add `GITHUB_CLIENT_SECRET` in Workers & Pages → Worker → Settings → Variables
and Secrets, choosing **Secret**. Do not overwrite an existing service with a
placeholder. Verify binding names/types only, never retrieve values.

## Validate and deploy

```sh
npm run preflight
npm run check:public
npm run check
REQUIRE_BROWSER_TESTS=true npm test
docker build --platform linux/amd64 -t trakt-mcp:test .
npm run test:container
npm run test:adapter
npm run build
npx cf deploy --prebuilt --mode production --dry-run
# With secrets already saved in the dashboard, preserve them:
npm run deploy -- --prebuilt --mode production
# Alternatively, supply securely edited local secrets:
# npm run deploy -- --prebuilt --mode production --secrets-file .dev.vars
npm run smoke
```

The first full deployment provisions OAuth KV, a SQLite Durable Object namespace
and a Container application, with ongoing usage charges on Workers Paid. Stay
within the authorized account and review the dry run. Never upgrade billing
automatically. Wait for the complete container rollout, not just Worker upload.

Rebuild after source or private setting changes. Deploying without a secrets file
preserves deployed secrets. The deploy wrapper also supports secret environment
variables through a temporary ignored mode-0600 file; choose one entry mechanism.
The optional Trakt secret is unnecessary for current Development apps.

## ChatGPT

Create a custom app with URL `PUBLIC_ORIGIN/mcp`, authentication **OAuth**, and
blank predefined client credentials when optional (dynamic registration is used).
Approve the gateway consent and sign into the configured GitHub owner account.
Refresh tools, then use a visible tool call to start/complete Trakt device auth.
Verify a small viewing-history/progress query against your Trakt account.
Complete the separate acceptance checks in [operations](OPERATIONS.md).

## Managed environment

Read the cloud-environment runtime skill first. Use the tool's network permission
for networked commands and keep the inherited HTTP(S) proxy and TLS trust. Never
bypass a denied destination. Node CLI calls may need `NODE_USE_ENV_PROXY=1`.
Set XDG config/cache and BUILDX_CONFIG to ignored writable `work/` locations if
home is read-only. For Docker downloads behind the session CA:

```sh
docker build --secret id=proxy_ca,src=/etc/ssl/certs/ca-certificates.crt -t trakt-mcp:test .
```

The CA is only mounted during networked build steps and stays out of the final
image. A fresh uncached cf build also needs the same Docker BuildKit secret;
prebuild the image using this command when cf does not expose secret mounts.
Public smoke requires the actual Worker hostname allowed by the environment's
supported network settings. Trakt authorization also needs `auth.trakt.tv` and
`api.trakt.tv` if run inside this environment; production container traffic uses
Cloudflare's network. CI runs on PRs/main and never automatically deploys.
