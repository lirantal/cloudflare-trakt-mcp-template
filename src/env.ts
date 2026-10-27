import type { OAuthHelpers } from '@cloudflare/workers-oauth-provider';
import type { TraktContainer } from './container';
export interface Env {
  OAUTH_KV: KVNamespace;
  OAUTH_PROVIDER: OAuthHelpers;
  MCP_CONTAINER: DurableObjectNamespace<TraktContainer>;
  PUBLIC_ORIGIN: string;
  ALLOWED_GITHUB_USER_ID: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  TRAKT_CLIENT_ID: string;
  TRAKT_DELETE_MODE: string;
  TRAKT_ACCESS_MODE: string;
  TRAKT_CLIENT_SECRET?: string;
  AUTH_EPOCH: string;
}
export interface Props { githubUserId: string; authEpoch: string; scope: string[] }

