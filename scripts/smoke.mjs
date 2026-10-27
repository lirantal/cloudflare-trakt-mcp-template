import assert from 'node:assert/strict';
import settings from '../deployment.config.ts';
const origin=process.argv[2] || settings.publicOrigin;
if(!origin || new URL(origin).origin!==origin || !origin.startsWith('https://'))throw Error('Usage: npm run smoke -- https://YOUR-WORKER.workers.dev');
const request=async(path,options={})=>fetch(origin+path,{...options,redirect:'manual',signal:AbortSignal.timeout(20000)});
const prm=await request('/.well-known/oauth-protected-resource/mcp');assert.equal(prm.status,200);
const resource=await prm.json();assert.equal(resource.resource,origin+'/mcp');assert.deepEqual(resource.authorization_servers,[origin]);
const as=await request('/.well-known/oauth-authorization-server');assert.equal(as.status,200);
const metadata=await as.json();assert.equal(metadata.issuer,origin);assert.ok(metadata.code_challenge_methods_supported.includes('S256'));assert.equal(metadata.authorization_response_iss_parameter_supported,true);
for(const method of ['GET','POST','DELETE']){const r=await request('/mcp',{method});assert.equal(r.status,401);assert.ok(r.headers.get('www-authenticate')?.includes('resource_metadata='));}
const forged=await request('/mcp',{headers:{authorization:'Bearer invalid'}});assert.equal(forged.status,401);
const bridge=await request('/internal/trakt-token');assert.equal(bridge.status,404);
console.log('Public discovery, S256/issuer metadata, and unauthenticated MCP rejection passed. Complete owner and non-owner browser sign-in acceptance checks before use.');

