import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { waitForChromium } from './browser';

function launcher() {
  const child=Object.assign(new EventEmitter(),{stderr:new PassThrough()});
  return {child:child as unknown as ReturnType<typeof spawn>,stderr:child.stderr};
}

describe('Chromium startup',()=>{
  it('waits for a complete DevTools endpoint across stderr chunks',async()=>{
    const {child,stderr}=launcher();
    const ready=waitForChromium(child,'test-chrome');
    stderr.write('DevTools list');
    stderr.write('ening on ws://127.0.0.1:1234/devtools/brow');
    stderr.write('ser/test\n');
    await expect(ready).resolves.toBe('ws://127.0.0.1:1234/devtools/browser/test');
    expect(child.listenerCount('exit')).toBe(0);
    expect(stderr.listenerCount('data')).toBe(0);
    stderr.end();
  });

  it('reports early exit status and bounded startup stderr',async()=>{
    const {child,stderr}=launcher();
    const ready=waitForChromium(child,'test-chrome');
    stderr.write('x'.repeat(20000)+'\nmissing shared library');
    child.emit('exit',127,null);
    const error=await ready.then(()=>{throw Error('Expected startup failure');},error=>error as Error);
    expect(error.message).toContain('code=127, signal=null');
    expect(error.message).toContain('missing shared library');
    expect(error.message.length).toBeLessThan(17000);
    expect(child.listenerCount('error')).toBe(0);
    stderr.end();
  });

  it('reports spawn errors immediately',async()=>{
    const {child,stderr}=launcher();
    const ready=waitForChromium(child,'missing-chrome');
    child.emit('error',Error('ENOENT'));
    await expect(ready).rejects.toThrow('Chromium failed to launch: ENOENT (missing-chrome)');
    stderr.end();
  });

  it('reports timeout diagnostics and removes startup listeners',async()=>{
    const {child,stderr}=launcher();
    const ready=waitForChromium(child,'test-chrome',10);
    stderr.write('Still starting');
    await expect(ready).rejects.toThrow('Chromium did not start within 10ms (test-chrome)\nStill starting');
    expect(child.listenerCount('exit')).toBe(0);
    expect(stderr.listenerCount('data')).toBe(0);
    stderr.end();
  });
});

