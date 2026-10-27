import {it,expect} from 'vitest';
import {tokenStore} from '../src/token-store';
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
