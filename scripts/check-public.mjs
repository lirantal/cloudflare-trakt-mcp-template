import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const settings=JSON.parse(readFileSync(new URL('../deployment.json',import.meta.url),'utf8'));
const keys=['accountId','workerName','publicOrigin','allowedGithubUserId','githubClientId','traktClientId','timezone','deleteMode','accessMode','authEpoch'];
const errors=[];
if(Object.keys(settings).some(key=>!keys.includes(key)))errors.push('Public template contains an unexpected field');
for(const key of ['accountId','publicOrigin','allowedGithubUserId','githubClientId','traktClientId'])if(!String(settings[key]).includes('REPLACE'))errors.push(`Keep ${key} as a public placeholder; use deployment.local.json`);
if(settings.timezone!=='UTC'||settings.workerName!=='trakt-mcp')errors.push('Keep public example timezone/name generic');
const result=spawnSync('git',['ls-files','-z'],{encoding:'utf8'});
if(result.status!==0)throw Error('Cannot inspect tracked files');
for(const file of result.stdout.split('\0').filter(Boolean)){
  const name=file.split('/').at(-1);
  if((/^\.env(?:\.|$)/.test(name)||/^\.dev\.vars(?:\.|$)/.test(name))&&!name.endsWith('.example')||
    ['deployment.local.json','.envrc','.npmrc','.netrc'].includes(name)||/^(?:work|node_modules|\.cloudflare|\.wrangler|\.aws|\.docker|\.config)\//.test(file)||/\.(?:pem|key|p12|pfx)$/.test(name))errors.push(`Private/generated file is tracked: ${file}`);
}
if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Public placeholders and tracked-file hygiene pass.');

