# Upstream selection — 27 October 2026

Compared the source trees, README, dependency declarations, authentication code,
transport, tests, licensing, and GitHub repository metadata. Neither is official,
and activity or popularity alone does not establish trust.

| Criterion | wwiens/trakt_mcpserver | kud/mcp-trakt |
| --- | --- | --- |
| Inspected commit | `cd491444be86dbc219d77dc652f75432d7f3af57` | `00ddae9a280e0d130ddb7c8782b398d37b294e9a` |
| Metadata activity | Last pushed 26 October 2026 | Last pushed 5 July 2026 |
| Community snapshot | 49 stars, 14 forks | 5 stars, 1 fork |
| License | MIT, explicit file | No license declared or license file in inspected tree |
| Implementation | Python; domain modules, FastMCP, Docker support | TypeScript; one main file, stdio entry point |
| Viewing features | History, watched shows/movies, episode progress, recommendations, ratings, watchlist | Broad catalog including calendars, collections and scrobbling |
| Auth | Device flow, shared token store, serialized refresh, refresh-chain regression tests | Setup script, local token files and refresh logic |
| Tests | Broad client/model/server coverage, CodeQL and CI | Smaller tool/request-header tests and CI |
| Cloudflare adaptation | Container HTTP runner, durable token store, SDK upgrade | HTTP transport, durable token storage, plus unresolved reuse license |

**Selected wwiens.** It meets the core viewing/tracking needs, has clearer reuse
terms, and has recent work on the single-use refresh token problem. Its README
states that most code is AI generated; the integration is reviewed and tested
as third-party code, without treating its self-description as an assurance.

The upstream Python dependency constraints select MCP 1.x, which does not advertise
the modern `2026-07-28` discovery protocol. The checked-in patch migrates imports
to `MCPServer`, pins SDK 2.3.0 and Pydantic 2.14.1, and the runner supplies transport
options through the SDK 2 API. This is a modified integration, not an unmodified
upstream release. The full Python runtime dependency set is pinned.

The adapter exposes an explicit tool allowlist; newly added upstream tools stay
unavailable until reviewed. Removing tools is enforcement; MCP annotations only
describe the catalog. Upgrade acceptance requires actual HTTP discovery, legacy
initialization, catalog checks, denied direct deletion calls, and OAuth tests.
