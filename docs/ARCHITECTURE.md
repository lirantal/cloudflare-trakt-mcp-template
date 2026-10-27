# Architecture

The Worker is the public MCP ingress. `workers-oauth-provider` supplies discovery,
dynamic registration, consent cookies, code exchange, and encrypted OAuth grants
in KV. GitHub tokens are used only to look up the numeric owner identity, then
discarded. Exact owner, audience, scope and `authEpoch` are checked on requests
and token refresh. ChatGPT callbacks are explicitly validated. No Cloudflare
Access gate belongs in front of the OAuth endpoints.

The gateway preserves the reference implementation's browser protections:
same-origin Referrer-Policy for consent POST, exact Origin check, cookie-bound
consent, and CSP form-action destinations for GitHub and ChatGPT redirects.
Browser tests exercise Continue and Cancel.

Authorized MCP requests have bearer tokens, cookies and untrusted forwarding
headers removed. Standard MCP protocol/method/name/parameter headers are kept.
The fixed owner Durable Object forwards to port 8080 of one lite container.
Redirects are rejected; tool calls are never automatically retried. The container
is nonroot, sleeps after ten idle minutes, and restarts when image or relevant
runtime settings change. No public container port is configured.

## Trakt token persistence

The upstream filesystem token store is replaced before importing its clients.
The replacement synchronously loads/saves the current pair through
`/internal/trakt-token` on this Worker. The exact route bypasses ChatGPT OAuth
only for a distinct, random per-owner bridge credential. That credential is
generated and stored in the Durable Object and injected into the container at
runtime. It is never sent to ChatGPT, baked into an image, or committed.

The bridge uses HTTPS without redirects; it permits only bounded token reads,
validated token writes and disconnect. Unauthenticated calls return 404. It has
no general-purpose storage access and cannot call Trakt. Token pairs are stored
in the owner's SQLite Durable Object, protected by Cloudflare's storage controls;
there is no extra application encryption key. Treat the Cloudflare account and
container as trusted credential holders.

Refresh is serialized inside the single container process. The new token pair
must be durably saved before the upstream save operation succeeds. A storage
failure becomes an error; it is not silently treated as memory-only success.
There remains an unavoidable failure window if the process dies after Trakt
rotates a token and before the durable write completes. Recover by reauthorizing.
An unfinished device flow is ephemeral and may need restarting after idle sleep.

No requests, headers, URLs, bodies, account data or token values are logged.
Worker observability and Python application logs are disabled. Resource listing
and prompts remain upstream functionality; they require owner authorization.

The `cf` beta self-binding metadata workaround from the reference is retained:
`unsafe:durable_object_namespace` names the local class. It does not create an
unauthenticated ingress. Use the pinned official `cf` and `cloudflare.config.ts`.
