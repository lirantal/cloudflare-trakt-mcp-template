import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const image=process.argv[2] || 'trakt-mcp:test';
function docker(args){const r=spawnSync('docker',args,{encoding:'utf8'});if(r.status!==0)throw Error(r.stderr||'Docker failed');return r.stdout.trim();}
for(const mode of ['read-only','track']){
 const name='trakt-smoke-'+randomUUID();
 try{
  docker(['run','--detach','--rm','--name',name,'--publish','127.0.0.1::8080','--env','TRAKT_CLIENT_ID=dummy-no-real-access','--env',`TRAKT_ACCESS_MODE=${mode}`,image]);
  const port=docker(['port',name,'8080/tcp']).split(':').at(-1), endpoint=`http://127.0.0.1:${port}/mcp`;
  const headers={'content-type':'application/json',accept:'application/json, text/event-stream'};
  const post=(method,params={},modern=false)=>fetch(endpoint,{method:'POST',headers:{...headers,...(modern?{'mcp-protocol-version':'2026-07-28','mcp-method':method,...(params.name?{'mcp-name':params.name}:{})}:{})},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params:modern?{...params,_meta:{'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{},'io.modelcontextprotocol/clientInfo':{name:'smoke',version:'1'}}}:params}),signal:AbortSignal.timeout(10000)});
  const parse=async r=>{assert.equal(r.status,200,await r.clone().text());assert.equal(r.headers.get('mcp-session-id'),null);return r.json();};
  let response;
  for(let i=0;i<40;i++){try{response=await post('initialize',{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'smoke',version:'1'}});break;}catch{await new Promise(r=>setTimeout(r,200));}}
  assert.ok(response,'Container failed to start');
  assert.ok((await parse(response)).result.serverInfo);
  const legacy=(await parse(await post('tools/list'))).result.tools;
  const discovery=await parse(await post('server/discover',{},true));
  assert.ok(discovery.result.supportedVersions.includes('2026-07-28'));
  const tools=(await parse(await post('tools/list',{},true))).result.tools;
  assert.deepEqual(tools.map(t=>t.name).sort(),legacy.map(t=>t.name).sort());
  const writes=['add_to_history','add_user_watchlist','add_user_ratings'];
  for(const tool of tools){
   assert.ok(!/^(remove_|delete_|hide_|unhide_)/.test(tool.name),`Forbidden tool ${tool.name}`);
   assert.equal(tool.annotations.readOnlyHint,!writes.includes(tool.name)&&!['start_device_auth','check_auth_status','clear_auth'].includes(tool.name));
  }
  for(const tool of writes)assert.equal(tools.some(t=>t.name===tool),mode==='track');
  for(const required of ['fetch_history','fetch_show_progress','fetch_show_recommendations','start_device_auth'])assert.ok(tools.some(t=>t.name===required));
  const denied=await parse(await post('tools/call',{name:'remove_from_history',arguments:{}},true));
  assert.ok(denied.error || denied.result?.isError,'Deletion tool must fail even when called directly');
  console.log(`${mode}: ${tools.length} tools; modern discovery, legacy initialization, annotations and deletion denial passed. No Trakt API calls.`);
 }finally{spawnSync('docker',['rm','--force',name],{stdio:'ignore'});}
}
