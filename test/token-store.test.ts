import {it,expect} from 'vitest';
import {tokenStore} from '../src/token-store';
import {build} from 'esbuild';
import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
it('authenticates the bridge and durably saves, restores and clears a bounded token pair',async()=>{
  const values=new Map();
  const storage={get:async(k:string)=>values.get(k),put:async(k:string,v:unknown)=>{values.set(k,v);},delete:async(k:string)=>values.delete(k)} as unknown as DurableObjectStorage;
  const key='dummy-private-key';
  const call=(method:string,body?:string,auth=`Bearer ${key}`)=>tokenStore(new Request('https://owner.example/internal/trakt-token',{method,headers:{authorization:auth},body}),storage,key);
  expect((await call('GET',undefined,'Bearer wrong')).status).toBe(404);
  const pair={access_token:'dummy-access',refresh_token:'dummy-refresh',created_at:123,expires_in:3600};
  expect((await call('PUT',JSON.stringify(pair))).status).toBe(200);
  expect(await (await call('GET')).json()).toMatchObject(pair);
  expect((await call('PUT','x'.repeat(16385))).status).toBe(413);
  expect((await call('PUT',JSON.stringify({...pair,expires_in:-1}))).status).toBe(400);
  expect(await (await call('GET')).json()).toMatchObject(pair);
  expect((await call('DELETE')).status).toBe(200);
  expect(await (await call('GET')).json()).toBeNull();
});
it('restores the token pair from real SQLite Durable Object storage after runtime recreation',async()=>{
  await mkdir('work',{recursive:true});
  const directory=resolve(await mkdtemp('work/token-persistence-'));
  const script=(await build({entryPoints:['test/token-fixture.ts'],bundle:true,write:false,format:'esm',platform:'neutral',target:'es2023',external:['cloudflare:*']})).outputFiles[0].text;
  const create=()=>new Miniflare({...convertV4MiniflareOptions({modules:true,script,compatibilityDate:'2026-10-26',durableObjects:{STORE:{className:'Store',useSQLite:true}},resourcePersistencePath:directory}),unsafeDevRegistryPath:directory+'/registry'});
  let mf=create();
  const call=(method:string,body?:string)=>mf.dispatchFetch('https://owner.example/internal/trakt-token',{method,headers:{authorization:'Bearer dummy-key'},body});
  const pair={access_token:'dummy-restored',refresh_token:'dummy-rotated',created_at:123,expires_in:3600};
  try{
    expect((await call('PUT',JSON.stringify(pair))).status).toBe(200);
    await mf.dispose();mf=create();
    expect(await (await call('GET')).json()).toMatchObject(pair);
    expect((await call('DELETE')).status).toBe(200);
    await mf.dispose();mf=create();
    expect(await (await call('GET')).json()).toBeNull();
  }finally{await mf.dispose();await rm(directory,{recursive:true,force:true});}
},30000);
