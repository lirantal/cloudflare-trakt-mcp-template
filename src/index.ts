import OAuthProvider, { OAuthError } from '@cloudflare/workers-oauth-provider';
import type { Env, Props } from './env';
import { login } from './login';
import { configured, isChatGptRedirect, isOwner, SCOPE } from './policy';
import { proxyMcp } from './proxy';
export { TraktContainer } from './container';

export function createProvider(env: Env) {
  return new OAuthProvider<Env>({
    apiRoute:'/mcp',
    apiHandler:{fetch:(request, bindings, ctx) => proxyMcp(request, bindings, ctx.props as Props)},
    defaultHandler:{fetch:login},
    authorizeEndpoint:'/authorize', tokenEndpoint:'/token', clientRegistrationEndpoint:'/register',
    resourceMetadata:{resource:`${env.PUBLIC_ORIGIN}/mcp`, authorization_servers:[env.PUBLIC_ORIGIN],resource_name:'Private Trakt'},
    scopesSupported:[SCOPE], requiredScopes:[SCOPE],
    accessTokenTTL:3600, refreshTokenTTL:30*24*3600,
    clientRegistrationTTL:90*24*3600,
    // DCR works with ChatGPT without fetching arbitrary client-controlled metadata URLs.
    clientIdMetadataDocumentEnabled:false,
    allowTokenExchangeGrant:false,
    clientRegistrationCallback:({clientMetadata}) => {
      const redirects = clientMetadata.redirect_uris;
      if (!Array.isArray(redirects) || !redirects.length || !redirects.every(u => typeof u === 'string' && isChatGptRedirect(u))) {
        return {description:'Only ChatGPT redirect URIs are allowed'};
      }
    },
    tokenExchangeCallback:({props,env:bindings,resource,requestedScope}) => {
      if (!isOwner(props,bindings) || resource !== `${bindings.PUBLIC_ORIGIN}/mcp` || !requestedScope.includes(SCOPE)) {
        throw new OAuthError('invalid_grant', {description:'Owner authorization is no longer valid'});
      }
    },
  });
}
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (!configured(env)) return new Response('Server setup incomplete', {status:503});
    if (new URL(request.url).origin !== env.PUBLIC_ORIGIN) return new Response('Unknown origin', {status:421});
    const response = await createProvider(env).fetch(request, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('Cache-Control','no-store');
    // Preserve the consent page's same-origin policy for its browser POST.
    if (!headers.has('Referrer-Policy')) headers.set('Referrer-Policy','no-referrer');
    headers.set('X-Content-Type-Options','nosniff');
    return new Response(response.body,{status:response.status,headers});
  },
} satisfies ExportedHandler<Env>;

