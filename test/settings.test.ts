import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSettings } from '../deployment.config';
const directories: string[]=[];
afterEach(async()=>{await Promise.all(directories.splice(0).map(directory=>rm(directory,{recursive:true,force:true})));});
async function fixture(){await mkdir('work',{recursive:true});const directory=await mkdtemp('work/settings-test-');directories.push(directory);await writeFile(join(directory,'deployment.json'),JSON.stringify({accountId:'public-template'}));return directory;}
describe('deployment settings selection',()=>{
  it('uses the public template only when private settings are absent',async()=>{const directory=await fixture();expect(loadSettings({directory}).accountId).toBe('public-template');await writeFile(join(directory,'deployment.local.json'),JSON.stringify({accountId:'private-account'}));expect(loadSettings({directory}).accountId).toBe('private-account');});
  it('respects an explicit settings file without silently falling back',async()=>{const directory=await fixture();await writeFile(join(directory,'custom.json'),JSON.stringify({accountId:'explicit-account'}));expect(loadSettings({directory,file:'custom.json'}).accountId).toBe('explicit-account');expect(()=>loadSettings({directory,file:'missing.json'})).toThrow('Cannot load valid JSON');});
  it('does not expose malformed configuration contents in errors',async()=>{const directory=await fixture();await writeFile(join(directory,'deployment.local.json'),'private-value-not-valid-json');try{loadSettings({directory});throw Error('expected failure');}catch(error){expect((error as Error).message).toBe('Cannot load valid JSON settings from deployment.local.json');}});
  it('rejects scalar and array configuration files',async()=>{const directory=await fixture();for(const value of [null,[],42]){await writeFile(join(directory,'deployment.local.json'),JSON.stringify(value));expect(()=>loadSettings({directory})).toThrow('must be a JSON object');}});
});

