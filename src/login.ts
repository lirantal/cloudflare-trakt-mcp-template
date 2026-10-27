import { AuthorizationError, authorizationErrorRedirect } from '@cloudflare/workers-oauth-provider';
import type { Env, Props } from './env';
import { escapeHtml, validateAuthorization, SCOPE } from './policy';

export async function login(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/authorize' && request.method === 'GET') {
      const auth = await env.OAUTH_PROVIDER.parseAuthRequest(request);
      validateAuthorization(auth, env.PUBLIC_ORIGIN);
      const description = await env.OAUTH_PROVIDER.describeConsent(auth);
      const consent = await env.OAUTH_PROVIDER.beginConsent(auth);
      consent.headers.set('content-type', 'text/html; charset=utf-8');
      // Chromium applies form-action to redirects too: approval goes to GitHub,
      // cancellation goes to the validated ChatGPT callback.
      consent.headers.set('content-security-policy', "default-src 'none'; form-action 'self' https://github.com https://chatgpt.com; frame-ancestors 'none'; base-uri 'none'");
      // no-referrer makes browser form POSTs send Origin: null. Keep the
      // same-origin Origin check usable without leaking auth URLs to GitHub.
      consent.headers.set('referrer-policy', 'same-origin');
      const e = escapeHtml;
      const access = env.TRAKT_ACCESS_MODE === 'track'
        ? 'View history and recommendations; mark watched, add to watchlist, and save ratings. Deletion is disabled.'
        : 'View history, progress, watchlists, ratings, and recommendations. Viewing-data changes are disabled.';
      return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Connect Trakt</title>
        <h1>Connect your Trakt viewing data</h1><p>This server is restricted to its owner's GitHub identity.</p>
        <p>Client name (self-reported): <strong>${e(description.clientName)}</strong></p>
        <p>Callback host: <strong>${e(description.redirectHost)}</strong></p>
        <p>Callback: ${e(description.redirectUri)}</p><p>Permission: ${SCOPE}. ${access}</p>
        <form method="post" action="/authorize"><input type="hidden" name="handle" value="${e(consent.handle)}">
        <button name="decision" value="approve">Continue with GitHub</button>
        <button name="decision" value="deny">Cancel</button></form></html>`, {headers:consent.headers});
    }
    if (url.pathname === '/authorize' && request.method === 'POST') {
      if (request.headers.get('origin') !== env.PUBLIC_ORIGIN) return new Response('Forbidden origin', {status:403});
      const form = await request.formData();
      const handle = String(form.get('handle') ?? '');
      if (form.get('decision') !== 'approve') {
        const denied = await env.OAUTH_PROVIDER.denyConsent(request, handle);
        return new Response(null, {status:302, headers:denied.headers});
      }
      const approved = await env.OAUTH_PROVIDER.approveConsent(request, handle, {scope:[SCOPE]});
      validateAuthorization(approved.request, env.PUBLIC_ORIGIN);
      const verifier = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
      const challenge = btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/, '');
      const upstream = await env.OAUTH_PROVIDER.beginUpstream(approved.request, {data:{verifier},headers:approved.headers});
      const github = new URL('https://github.com/login/oauth/authorize');
      github.search = new URLSearchParams({client_id:env.GITHUB_CLIENT_ID, redirect_uri:`${env.PUBLIC_ORIGIN}/callback`,
        scope:'read:user', state:upstream.state, code_challenge:challenge, code_challenge_method:'S256'}).toString();
      upstream.headers.set('location', github.href);
      return new Response(null, {status:302,headers:upstream.headers});
    }
    if (url.pathname === '/callback' && request.method === 'GET') {
      const saved = await env.OAUTH_PROVIDER.finishUpstream<{verifier:string}>(request);
      const deny = () => {
        saved.headers.set('location', authorizationErrorRedirect(saved.request, 'access_denied'));
        return new Response(null, {status:302,headers:saved.headers});
      };
      const code = url.searchParams.get('code');
      if (url.searchParams.has('error') || !code) return deny();
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method:'POST', redirect:'manual', signal:AbortSignal.timeout(15000),
        headers:{accept:'application/json','content-type':'application/x-www-form-urlencoded'},
        body:new URLSearchParams({client_id:env.GITHUB_CLIENT_ID, client_secret:env.GITHUB_CLIENT_SECRET,
          redirect_uri:`${env.PUBLIC_ORIGIN}/callback`, code, code_verifier:saved.data.verifier}),
      });
      if (!tokenResponse.ok) return new Response('GitHub sign-in unavailable', {status:502,headers:saved.headers});
      const token = await tokenResponse.json() as {access_token?:string};
      if (!token.access_token) return deny();
      const userResponse = await fetch('https://api.github.com/user', {
        headers:{accept:'application/vnd.github+json', authorization:`Bearer ${token.access_token}`, 'user-agent':'trakt-cloudflare-mcp'},
        redirect:'manual',signal:AbortSignal.timeout(15000),
      });
      if (!userResponse.ok) return new Response('GitHub identity unavailable', {status:502,headers:saved.headers});
      const user = await userResponse.json() as {id?:number};
      if (!Number.isSafeInteger(user.id) || String(user.id) !== env.ALLOWED_GITHUB_USER_ID) return deny();
      validateAuthorization(saved.request, env.PUBLIC_ORIGIN);
      // GitHub's token is used only for identity lookup, never stored or forwarded.
      const props: Props = {githubUserId:String(user.id), authEpoch:env.AUTH_EPOCH, scope:[SCOPE]};
      const done = await env.OAUTH_PROVIDER.completeAuthorization({request:saved.request, userId:String(user.id),
        metadata:{label:'Owner / ChatGPT'},scope:[SCOPE],props});
      saved.headers.set('location', done.redirectTo);
      return new Response(null,{status:302,headers:saved.headers});
    }
    if (url.pathname === '/' && request.method === 'GET') return new Response('Private Trakt MCP. Endpoint: /mcp');
    return new Response('Not found', {status:404});
  } catch (error) {
    if (error instanceof AuthorizationError) {
      // Only the library can decide whether a callback has been validated for redirect.
      if (error.redirectUri) return Response.redirect(authorizationErrorRedirect({redirectUri:error.redirectUri, state:error.state, issuer:error.issuer}, error.code), 302);
      return new Response('Invalid or expired authorization request', {status:400});
    }
    // Keep request URLs, codes, states, tokens and data out of logs and error bodies.
    return new Response('Authorization could not be completed; start again', {status:400});
  }
}

