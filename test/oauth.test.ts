import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { build } from 'esbuild';
import { Miniflare, convertV4MiniflareOptions, Response as MfResponse } from 'miniflare';
import { createHash, randomBytes } from 'node:crypto';
import { browserConsent, chromium } from './browser';
import { isChatGptRedirect, isOwner, configured } from '../src/policy';

const origin = 'https://owner.example';
const callback = 'https://chatgpt.com/connector_platform_oauth_redirect';
let mf: Miniflare;
let githubId = 12345;
let upstreamVerifier = '';
let upstreamCalls = 0;
const call = (path: string, init?: RequestInit) => mf.dispatchFetch(`${origin}${path}`, {...init,redirect:'manual'} as never);
const cookies = (response: {headers:{getSetCookie():string[]}}) => response.headers.getSetCookie().map(s=>s.split(';')[0]).join('; ');
const form = (body: Record<string,string>, cookie?:string) => ({method:'POST',headers:{'content-type':'application/x-www-form-urlencoded',origin,...(cookie?{cookie}:{})},body:new URLSearchParams(body).toString()});

beforeAll(async()=>{
  const result = await build({entryPoints:['test/fixture.ts'],bundle:true,write:false,format:'esm',platform:'neutral',mainFields:['module','main'],target:'es2023',external:['cloudflare:*']});
  mf = new Miniflare({...convertV4MiniflareOptions({modules:true,script:result.outputFiles[0].text,compatibilityDate:'2026-10-26',compatibilityFlags:['nodejs_compat'],
    kvNamespaces:['OAUTH_KV'],durableObjects:{MCP_CONTAINER:'FakeContainer'},
    bindings:{PUBLIC_ORIGIN:origin,ALLOWED_GITHUB_USER_ID:'12345',GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret',
      TRAKT_CLIENT_ID:'test-key',TRAKT_ACCESS_MODE:'read-only',AUTH_EPOCH:'1',TRAKT_DELETE_MODE:'none'},
    outboundService:async (request)=>{
      upstreamCalls++;
      if (request.url === 'https://github.com/login/oauth/access_token') {
        upstreamVerifier = new URLSearchParams(await request.text()).get('code_verifier') || '';
        return MfResponse.json({access_token:'github-secret-never-forward'});
      }
      if (request.url === 'https://api.github.com/user') return MfResponse.json({id:githubId,login:'owner'});
      return new MfResponse('Unexpected outbound request',{status:500});
    },
  }),unsafeDevRegistryPath:'work/test-registry'});
},30000);
afterAll(async()=>{await mf?.dispose();});

async function begin() {
  const registration = await call('/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({client_name:'ChatGPT',redirect_uris:[callback],token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']})});
  expect(registration.status).toBe(201);
  const client = await registration.json() as {client_id:string};
  const verifier=randomBytes(32).toString('base64url');
  const challenge=createHash('sha256').update(verifier).digest('base64url');
  const params=new URLSearchParams({client_id:client.client_id,redirect_uri:callback,response_type:'code',scope:'mcp:use',resource:`${origin}/mcp`,state:'client-state',code_challenge:challenge,code_challenge_method:'S256'});
  return {client,verifier,params};
}
async function approve() {
  const flow=await begin();
  const consent=await call(`/authorize?${flow.params}`);
  expect(consent.status).toBe(200);
  const html=await consent.text();
  const handle=html.match(/name="handle" value="([^"]+)"/)![1];
  const approved=await call('/authorize',form({handle,decision:'approve'},cookies(consent)));
  expect(approved.status).toBe(302);
  const github=new URL(approved.headers.get('location')!);
  const state=github.searchParams.get('state')!;
  return {...flow,state,github,upstreamCookie:cookies(approved),handle,consentCookie:cookies(consent)};
}
async function authorize() {
  const flow=await approve();
  const done=await call(`/callback?${new URLSearchParams({state:flow.state,code:'github-code'})}`,{headers:{cookie:flow.upstreamCookie}});
  expect(done.status).toBe(302);
  return {...flow,done,redirect:new URL(done.headers.get('location')!)};
}
async function redeem(flow:Awaited<ReturnType<typeof authorize>>,overrides:Record<string,string>={}) {
  return call('/token',form({grant_type:'authorization_code',client_id:flow.client.client_id,redirect_uri:callback,code:flow.redirect.searchParams.get('code')!,code_verifier:flow.verifier,resource:`${origin}/mcp`,...overrides}));
}

describe('OAuth protocol and owner gate',()=>{
  it('challenges unauthenticated MCP without contacting the backend',async()=>{
    const before=upstreamCalls;
    for(const method of ['GET','POST','DELETE']){
      const r=await call('/mcp',{method});expect(r.status).toBe(401);expect(r.headers.get('www-authenticate')).toContain('resource_metadata=');
    }
    expect(upstreamCalls).toBe(before);

  });
  it('publishes resource, issuer identification, DCR and S256 metadata',async()=>{
    const resource=await (await call('/.well-known/oauth-protected-resource/mcp')).json() as any;
    expect(resource.resource).toBe(`${origin}/mcp`);expect(resource.authorization_servers).toEqual([origin]);
    const auth=await (await call('/.well-known/oauth-authorization-server')).json() as any;
    expect(auth.issuer).toBe(origin);expect(auth.code_challenge_methods_supported).toContain('S256');
    expect(auth.authorization_response_iss_parameter_supported).toBe(true);expect(auth.registration_endpoint).toBe(`${origin}/register`);
  });
  it('rejects arbitrary DCR callbacks',async()=>{
    const r=await call('/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({redirect_uris:['https://attacker.example/callback']})});expect(r.status).toBe(400);
  });
  it('rejects weak PKCE and wrong resource',async()=>{
    const {params}=await begin();params.set('code_challenge_method','plain');
    expect([302,400]).toContain((await call(`/authorize?${params}`)).status);
    params.set('code_challenge_method','S256');params.set('resource','https://other.example/mcp');
    const bad=await call(`/authorize?${params}`);expect([302,400]).toContain(bad.status);
    if(bad.status===302)expect(bad.headers.get('location')).toContain('error=');
  });
  it('preserves the browser consent referrer policy and rejects opaque or foreign POST origins', async()=>{
    const flow=await begin();
    const consent=await call(`/authorize?${flow.params}`);
    expect(consent.headers.get('referrer-policy')).toBe('same-origin');
    expect(consent.headers.get('content-security-policy')).toBe("default-src 'none'; form-action 'self' https://github.com https://chatgpt.com; frame-ancestors 'none'; base-uri 'none'");
    const handle=(await consent.text()).match(/name="handle" value="([^"]+)"/)![1];
    const cookie=cookies(consent);
    const before=upstreamCalls;
    for(const invalidOrigin of [null, 'null', 'https://chatgpt.com', 'https://evil.example']) {
      const post=form({handle,decision:'approve'},cookie);
      const headers=new Headers(post.headers);
      if(invalidOrigin===null) headers.delete('origin'); else headers.set('origin',invalidOrigin);
      expect((await call('/authorize',{...post,headers})).status).toBe(403);
    }
    expect(upstreamCalls).toBe(before);
    const approved=await call('/authorize',form({handle,decision:'approve'},cookie));
    expect(approved.status).toBe(302);
    expect(new URL(approved.headers.get('location')!).origin).toBe('https://github.com');
    expect(approved.headers.get('referrer-policy')).toBe('no-referrer');
  });
  it.skipIf(!chromium)('browser follows consent approval redirect to GitHub', async()=>{
    const flow=await begin();
    const result=await browserConsent(call,`/authorize?${flow.params}`,'approve');
    expect(result.destination).toBe('https://github.com');
  },60000);
  it.skipIf(!chromium)('browser follows consent cancellation redirect to ChatGPT', async()=>{
    const flow=await begin();
    const result=await browserConsent(call,`/authorize?${flow.params}`,'deny');
    expect(result.destination).toBe('https://chatgpt.com');
  },60000);
  it('cancels consent before any upstream identity request',async()=>{
    const f=await begin();const consent=await call(`/authorize?${f.params}`);
    const handle=(await consent.text()).match(/name="handle" value="([^"]+)"/)![1];
    const before=upstreamCalls;
    const denied=await call('/authorize',form({handle,decision:'deny'},cookies(consent)));
    expect(denied.status).toBe(302);expect(new URL(denied.headers.get('location')!).searchParams.get('error')).toBe('access_denied');
    expect(upstreamCalls).toBe(before);
  });
  it('binds consent and upstream callback to browser cookies',async()=>{
    const f=await approve();
    expect((await call('/authorize',form({handle:f.handle,decision:'approve'}))).status).toBe(400);
    expect((await call(`/callback?state=${f.state}&code=stolen`)).status).toBe(400);
  });
  it('refuses sign-in by any other GitHub user',async()=>{
    githubId=999;
    try {const f=await authorize();expect(f.redirect.searchParams.get('error')).toBe('access_denied');expect(f.redirect.searchParams.has('code')).toBe(false);}
    finally {githubId=12345;}
  });
  it('completes owner flow, enforces PKCE, forwards MCP, refreshes, revokes',async()=>{
    const f=await authorize();expect(f.redirect.searchParams.get('iss')).toBe(origin);expect(f.redirect.searchParams.get('state')).toBe('client-state');
    expect(createHash('sha256').update(upstreamVerifier).digest('base64url')).toBe(f.github.searchParams.get('code_challenge'));
    const response=await redeem(f);expect(response.status).toBe(200);
    const token=await response.json() as any;expect(token.refresh_token).toBeTruthy();
    const mcp=await call('/mcp',{method:'POST',headers:{authorization:`Bearer ${token.access_token}`,cookie:'secret=cookie','x-forwarded-user':'spoof',origin:'https://chatgpt.com','content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2025-06-18','mcp-session-id':'session'},body:'{"jsonrpc":"2.0","method":"tools/list","id":1}'});
    expect(mcp.status).toBe(200);
    expect((await call('/mcp',{headers:{authorization:`Bearer ${token.access_token}`,origin:'https://evil.example'}})).status).toBe(403);
    const echoed=await mcp.json() as any;
    expect(echoed.url).toBe('http://localhost:8080/mcp');expect(echoed.headers.authorization).toBeUndefined();expect(echoed.headers.cookie).toBeUndefined();expect(echoed.headers['x-forwarded-user']).toBeUndefined();expect(echoed.headers['mcp-session-id']).toBe('session');
    const refreshed=await call('/token',form({grant_type:'refresh_token',client_id:f.client.client_id,refresh_token:token.refresh_token,resource:`${origin}/mcp`}));expect(refreshed.status).toBe(200);
    const next=await refreshed.json() as any;
    const revoked=await call('/token',form({client_id:f.client.client_id,token:next.refresh_token,token_type_hint:'refresh_token'}));expect(revoked.status).toBe(200);
    expect((await call('/token',form({grant_type:'refresh_token',client_id:f.client.client_id,refresh_token:next.refresh_token,resource:`${origin}/mcp`}))).status).toBe(400);
  });
  it('preserves modern MCP discovery and schema-annotated headers while stripping credentials',async()=>{
    const flow=await authorize();const token=await (await redeem(flow)).json() as any;
    for(const method of ['server/discover','tools/call']) {
      const response=await call('/mcp',{method:'POST',headers:{authorization:`Bearer ${token.access_token}`,cookie:'private=cookie',
        'content-type':'application/json',accept:'application/json, text/event-stream','mcp-protocol-version':'2026-07-28',
        'mcp-method':method,...(method==='tools/call'?{'mcp-name':'demo','mcp-param-example':'dummy'}:{}),
        'mcp-untrusted-routing':'discard','x-forwarded-authorization':'discard'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,
          params:{_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28'},...(method==='tools/call'?{name:'demo',arguments:{example:'dummy'}}:{})}})});
      expect(response.status).toBe(200);
      const echoed=await response.json() as any;
      expect(echoed.headers['mcp-method']).toBe(method);
      expect(echoed.headers['mcp-protocol-version']).toBe('2026-07-28');
      if(method==='tools/call') {expect(echoed.headers['mcp-name']).toBe('demo');expect(echoed.headers['mcp-param-example']).toBe('dummy');}
      for(const header of ['authorization','cookie','mcp-untrusted-routing','x-forwarded-authorization'])expect(echoed.headers[header]).toBeUndefined();
    }
  });
  it('rejects code replay and invalidates the compromised grant',async()=>{
    const f=await authorize();expect((await redeem(f)).status).toBe(200);expect((await redeem(f)).status).toBe(400);
  });
  it('rejects an incorrect token verifier and wrong audience',async()=>{
    const f=await authorize();expect((await redeem(f,{code_verifier:'incorrect'})).status).toBe(400);
    const g=await authorize();expect((await redeem(g,{resource:'https://attacker.example/mcp'})).status).toBe(400);
  });
  it('fails closed for forged tokens and untrusted request origins',async()=>{
    expect((await call('/mcp',{headers:{authorization:'Bearer forged'}})).status).toBe(401);
    expect((await mf.dispatchFetch('https://other.example/mcp')).status).toBe(421);
  });
});
it('matches exact ChatGPT callbacks, never lookalike domains',()=>{
  expect(isChatGptRedirect(callback)).toBe(true);
  expect(isChatGptRedirect('https://chatgpt.com/connector/oauth/test-123')).toBe(true);
  for(const u of ['https://chatgpt.com.evil.org/connector_platform_oauth_redirect',callback+'?next=evil','https://chatgpt.com/connector/oauth/a/../evil','http://chatgpt.com/connector/oauth/a'])expect(isChatGptRedirect(u)).toBe(false);
});

it('invalidates grants after owner or authorization version changes and fails closed on missing configuration',()=>{
  const env={PUBLIC_ORIGIN:origin,ALLOWED_GITHUB_USER_ID:'12345',AUTH_EPOCH:'1',GITHUB_CLIENT_ID:'client',GITHUB_CLIENT_SECRET:'secret',TRAKT_CLIENT_ID:'key',TRAKT_ACCESS_MODE:'read-only',TRAKT_DELETE_MODE:'none'} as import('../src/env').Env;
  const props={githubUserId:'12345',authEpoch:'1',scope:['mcp:use']};
  expect(isOwner(props,env)).toBe(true);
  expect(isOwner(props,{...env,AUTH_EPOCH:'2'})).toBe(false);
  expect(isOwner(props,{...env,ALLOWED_GITHUB_USER_ID:'999'})).toBe(false);
  expect(isOwner({...props,scope:[]},env)).toBe(false);
  expect(configured(env)).toBe(true);
  expect(configured({...env,GITHUB_CLIENT_SECRET:''})).toBe(false);
  expect(configured({...env,TRAKT_DELETE_MODE:'safe'})).toBe(false);
});

