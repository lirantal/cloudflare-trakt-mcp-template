import settings from '../deployment.config.ts';
const errors=[];
if(!/^[a-f0-9]{32}$/.test(settings.accountId))errors.push('accountId must be a Cloudflare account ID');
if(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_ACCOUNT_ID!==settings.accountId)errors.push('CLOUDFLARE_ACCOUNT_ID differs from the configured account; remove it or correct it');
if(!/^[a-z0-9][a-z0-9-]{0,62}$/.test(settings.workerName))errors.push('invalid workerName');
try{const u=new URL(settings.publicOrigin);if(u.protocol!=='https:' || u.origin!==settings.publicOrigin || /REPLACE/i.test(u.host))throw Error();}catch{errors.push('publicOrigin must be the exact public HTTPS origin, with no trailing slash');}
if(!/^\d+$/.test(settings.allowedGithubUserId))errors.push('set allowedGithubUserId to your numeric GitHub user ID');
if(!settings.githubClientId || settings.githubClientId==='REPLACE')errors.push('set githubClientId to the GitHub OAuth App client ID');
if(!['read-only','track'].includes(settings.accessMode))errors.push('accessMode must be read-only or track');
if(settings.deleteMode!=='none')errors.push('deleteMode must be none: deletion is disabled');
try{new Intl.DateTimeFormat('en',{timeZone:settings.timezone}).format();}catch{errors.push('timezone must be an IANA timezone');}
if(!settings.authEpoch)errors.push('authEpoch must be non-empty');
if(!settings.traktClientId || settings.traktClientId==='REPLACE')errors.push('Set traktClientId to your Trakt development app Client ID');
if(errors.length){console.error('Deployment configuration needs attention:\n'+errors.map(s=>'- '+s).join('\n'));process.exitCode=1;}
else console.log('Configuration valid; verify the selected account, owner identity, and plan before first deployment.');
