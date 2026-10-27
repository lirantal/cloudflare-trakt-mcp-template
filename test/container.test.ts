import { describe, expect, it, vi } from 'vitest';
vi.mock('cloudflare:workers', () => ({
  DurableObject: class {
    constructor(protected ctx: unknown, protected env: unknown) {}
  },
}));
import { TraktContainer } from '../src/container';

function fixture(running = false, image = 'sha256:pinned') {
  const requests: string[] = [];
  const container = {
    running, images: { server: 'sha256:pinned' },
    start: vi.fn(() => { container.running = true; }),
    inspect: vi.fn(async () => ({ image })),
    destroy: vi.fn(async () => { container.running = false; }),
    setInactivityTimeout: vi.fn(async () => {}),
    getTcpPort: vi.fn(() => ({ fetch: vi.fn(async (input: Request | string) => {
      const url = typeof input === 'string' ? input : input.url;
      requests.push(url);
      return new Response(url.endsWith('/mcp') ? 'streamed MCP' : 'Not found', { status: url.endsWith('/mcp') ? 200 : 404 });
    }) })),
  };
  const values=new Map();
  const pending:Promise<unknown>[]=[];
  const ctx = { container, storage:{get:vi.fn(async(k:string)=>values.get(k)),put:vi.fn(async(k:string,v:unknown)=>{values.set(k,v);})}, blockConcurrencyWhile: vi.fn((fn: () => unknown) => {const p=Promise.resolve(fn());pending.push(p);return p;}) };
  const worker = new TraktContainer(ctx as never, {
    TRAKT_CLIENT_ID: 'dummy', PUBLIC_ORIGIN:'https://owner.example',TRAKT_ACCESS_MODE:'track',
  } as never);
  return { worker, container, ctx, requests,initialized:()=>Promise.all(pending) };
}
describe('native container lifecycle', () => {
  it('starts one pinned lite instance for concurrent requests with read-only runtime settings', async () => {
    const { worker, container, requests,initialized } = fixture();
    await initialized();
    const results = await Promise.all([worker.fetch(new Request('http://localhost:8080/mcp')), worker.fetch(new Request('http://localhost:8080/mcp'))]);
    expect(container.start).toHaveBeenCalledTimes(1);
    expect(container.start).toHaveBeenCalledWith(expect.objectContaining({image:'sha256:pinned',instance:'lite',enableInternet:true,env:expect.objectContaining({TRAKT_ACCESS_MODE:'track',TRAKT_TOKEN_STORE_KEY:expect.any(String)})}));
    expect(container.setInactivityTimeout).toHaveBeenCalledWith(600000);
    expect(requests.filter(url => url.endsWith('/mcp'))).toHaveLength(2);
    expect(await results[0].text()).toBe('streamed MCP');
  });
  it('restores inactivity timeout on eviction and replaces an old image', async () => {
    const { worker, container, ctx,initialized } = fixture(true, 'sha256:old');
    await initialized();
    expect(ctx.blockConcurrencyWhile).toHaveBeenCalledTimes(2);
    await worker.fetch(new Request('http://localhost:8080/mcp'));
    expect(container.destroy).toHaveBeenCalledTimes(1);
    expect(container.start).toHaveBeenCalledTimes(1);
  });
  it('does not replay a failed MCP request', async () => {
    const { worker, container,initialized } = fixture();
    await initialized();
    const forward = vi.fn(async (input: Request | string) => {
      if (typeof input !== 'string') throw new Error('interrupted request');
      return new Response(null, {status:404});
    });
    container.getTcpPort.mockReturnValue({fetch:forward} as never);
    await expect(worker.fetch(new Request('http://localhost:8080/mcp', {method:'POST',body:'tool call'}))).rejects.toThrow('interrupted request');
    expect(forward).toHaveBeenCalledTimes(2); // readiness GET, then exactly one MCP POST
  });
});

