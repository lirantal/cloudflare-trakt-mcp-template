import type { Env } from './env';

export const TOKEN_PATH = '/internal/trakt-token';
export async function tokenStore(request: Request, storage: DurableObjectStorage, key: string): Promise<Response> {
  const supplied = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${key}`;
  // Compare fixed-size digests without an early exit on the first differing byte.
  const hash = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a,b] = await Promise.all([hash(supplied),hash(expected)]);
  let different = 0;
  const av=new Uint8Array(a), bv=new Uint8Array(b);
  for(let i=0;i<av.length;i++) different |= av[i]! ^ bv[i]!;
  if(different) return new Response('Not found',{status:404});
  const headers={'cache-control':'no-store','content-type':'application/json'};
  if(request.method==='GET') return Response.json(await storage.get('trakt-token') ?? null,{headers});
  if(request.method==='DELETE') {
    await storage.delete('trakt-token');
    return Response.json({ok:true},{headers});
  }
  if(request.method!=='PUT') return new Response('Method not allowed',{status:405});
  // Bounded streaming read, even when Content-Length is missing or forged.
  const reader=request.body?.getReader();
  if(!reader) return new Response('Invalid token',{status:400});
  let text='', bytes=0;
  const decoder=new TextDecoder();
  for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>16384){await reader.cancel();return new Response('Too large',{status:413});}text+=decoder.decode(value,{stream:true});}
  text+=decoder.decode();
  try {
    const v=JSON.parse(text);
    if(!v || typeof v.access_token!=='string' || !v.access_token || typeof v.refresh_token!=='string' || !v.refresh_token ||
       !Number.isSafeInteger(v.created_at) || v.created_at<0 || !Number.isSafeInteger(v.expires_in) || v.expires_in<=0 ||
       (v.scope!==undefined && typeof v.scope!=='string') || (v.token_type!==undefined && v.token_type!=='bearer')) throw Error();
    await storage.put('trakt-token',{access_token:v.access_token,refresh_token:v.refresh_token,created_at:v.created_at,expires_in:v.expires_in,scope:v.scope??'public',token_type:'bearer'});
    return Response.json({ok:true},{headers});
  } catch {return new Response('Invalid token',{status:400});}
}

export function routeTokenStore(request: Request, env: Env): Promise<Response> {
  return env.MCP_CONTAINER.getByName('owner').fetch(request);
}
