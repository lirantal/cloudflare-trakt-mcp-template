import type { AuthRequest } from '@cloudflare/workers-oauth-provider';
import type { Env, Props } from './env';
export const SCOPE = 'mcp:use';
export function isChatGptRedirect(value: string): boolean {
  try {
    const u = new URL(value);
    return u.href === value && u.origin === 'https://chatgpt.com' && !u.username && !u.password && !u.search && !u.hash &&
      (u.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[A-Za-z0-9_-]+$/.test(u.pathname));
  } catch { return false; }
}
export function validateAuthorization(auth: AuthRequest, origin: string): void {
  if (!isChatGptRedirect(auth.redirectUri)) throw new Error('Only ChatGPT callbacks are allowed');
  if (auth.codeChallengeMethod !== 'S256' || !auth.codeChallenge || !/^[A-Za-z0-9_-]{43}$/.test(auth.codeChallenge)) {
    throw new Error('S256 PKCE is required');
  }
  if (auth.resource !== `${origin}/mcp`) throw new Error('Invalid resource');
  if (auth.scope.length !== 1 || auth.scope[0] !== SCOPE) throw new Error('Request the mcp:use scope');
}
export function isOwner(props: Partial<Props> | undefined, env: Env): boolean {
  return /^\d+$/.test(env.ALLOWED_GITHUB_USER_ID) && props?.githubUserId === env.ALLOWED_GITHUB_USER_ID &&
    props.authEpoch === env.AUTH_EPOCH && Array.isArray(props.scope) && props.scope.includes(SCOPE);
}
export function configured(env: Env): boolean {
  try {
    const u = new URL(env.PUBLIC_ORIGIN);
    return u.protocol === 'https:' && u.origin === env.PUBLIC_ORIGIN && !u.hostname.includes('REPLACE') &&
      /^\d+$/.test(env.ALLOWED_GITHUB_USER_ID) && env.TRAKT_DELETE_MODE === 'none' && !!env.AUTH_EPOCH &&
      !!env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_ID !== 'REPLACE' && !!env.GITHUB_CLIENT_SECRET &&
      !!env.TRAKT_CLIENT_ID && env.TRAKT_CLIENT_ID !== 'REPLACE' && ['read-only','track'].includes(env.TRAKT_ACCESS_MODE);
  } catch { return false; }
}
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
}

