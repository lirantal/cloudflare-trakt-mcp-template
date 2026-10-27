# Working on this gateway

Read README.md and docs/ARCHITECTURE.md, DEPLOYMENT.md, OPERATIONS.md, UPSTREAM.md
and VALIDATION.md before changing the deployment. Inspect Git status and preserve
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
  test:container for relevant changes. Use dummy keys and no real viewing data.
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
