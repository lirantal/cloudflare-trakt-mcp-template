import {spawnSync} from 'node:child_process';
import {mkdir,mkdtemp,copyFile,chmod,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
await mkdir('work',{recursive:true});
const directory=await mkdtemp('work/adapter-tests-');
try{
 await chmod(directory,0o755);
 for(const file of ['token_store.py','test_token_store.py']){
  await copyFile(`container/${file}`,`${directory}/${file}`);
  await chmod(`${directory}/${file}`,0o644);
 }
 const result=spawnSync('docker',['run','--rm','--mount',`type=bind,source=${resolve(directory)},target=/tests,readonly`,
  '--entrypoint','python',process.argv[2]||'trakt-mcp:test','-m','unittest','discover','-s','/tests','-p','test_*.py'],{stdio:'inherit'});
 process.exitCode=result.status??1;
}finally{await rm(directory,{recursive:true,force:true});}
