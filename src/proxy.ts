import type { Env, Props } from './env';
import { isOwner } from './policy';
export async function proxyMcp(request: Request, env: Env, props: Props): Promise<Response> {
  if (!isOwner(props, env)) return new Response('Forbidden', { status: 403 });
  const u = new URL(request.url);
  if (u.pathname !== '/mcp' || u.search) return new Response('Not found', { status: 404 });
  if (!['GET', 'POST', 'DELETE'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, POST, DELETE'}});
  const origin = request.headers.get('origin');
  if (origin && origin !== env.PUBLIC_ORIGIN && origin !== 'https://chatgpt.com') return new Response('Forbidden origin', {status:403});
  // Build an allowlist: credentials, cookies and spoofed forwarding headers never reach Go.
  const headers = new Headers();
  for (const name of ['content-type', 'accept', 'mcp-session-id', 'mcp-protocol-version', 'mcp-method', 'mcp-name', 'last-event-id']) {
    const v = request.headers.get(name); if (v) headers.set(name, v);
  }
  // Standard schema-annotated MCP parameter headers are protocol metadata,
  // just like Mcp-Method/Mcp-Name. Do not forward arbitrary mcp-* headers.
  for (const [name, value] of request.headers) {
    if (/^mcp-param-[a-z0-9-]+$/.test(name)) headers.set(name, value);
  }
  // The SDK protects loopback hosts against DNS rebinding. The internal target is fixed.
  const upstream = new Request('http://localhost:8080/mcp', {
    method: request.method, headers,
    body: request.body, redirect: 'manual', signal: request.signal,
  });
  try {
    const response = await env.MCP_CONTAINER.getByName('owner').fetch(upstream);
    const output = new Headers(response.headers);
    output.set('Cache-Control', 'no-store');
    // Do not follow or relay an unexpected backend redirect.
    if (response.status >= 300 && response.status < 400) return new Response('Unexpected backend redirect', {status:502});
    return new Response(response.body, {status:response.status, headers:output});
  } catch {
    // Never retry a tool call here: an interrupted write may already have completed.
    return new Response('MCP container unavailable; reconnect if its session expired', {status:503,headers:{'Retry-After':'5'}});
  }
}

