import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import { TOKEN_PATH, tokenStore } from './token-store';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export class TraktContainer extends DurableObject<Env> {
  private ready?: Promise<void>;
  private bridgeKey!: string;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.bridgeKey = await ctx.storage.get<string>('bridge-key') ?? crypto.randomUUID()+crypto.randomUUID();
      await ctx.storage.put('bridge-key',this.bridgeKey);
    });
    if (ctx.container?.running) {
      void ctx.blockConcurrencyWhile(() => ctx.container!.setInactivityTimeout(IDLE_TIMEOUT_MS));
    }
  }

  private async ensureReady(): Promise<void> {
    const container = this.ctx.container;
    if (!container) throw new Error('Container binding missing');
    // Only this named Durable Object is routed to by the Worker. The new
    // scheduling policy has no application-level max_instances setting.
    if (!this.ready) {
      this.ready = (async () => {
        const image = container.images.server;
        if (!image) throw new Error('Container image missing');
        const fingerprint = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({
          clientId:this.env.TRAKT_CLIENT_ID,secret:this.env.TRAKT_CLIENT_SECRET??'',mode:this.env.TRAKT_ACCESS_MODE,
          origin:this.env.PUBLIC_ORIGIN,key:this.bridgeKey,
        }))))).map(v=>v.toString(16).padStart(2,'0')).join('');
        // New Worker versions must not keep serving an older image indefinitely.
        if (container.running && ((await container.inspect())?.image !== image || await this.ctx.storage.get('runtime-fingerprint') !== fingerprint)) {
          await container.destroy();
        }
        if (!container.running) {
          container.start({
            image, instance: 'lite', enableInternet: true,
            env: {
              TRAKT_CLIENT_ID: this.env.TRAKT_CLIENT_ID,
              ...(this.env.TRAKT_CLIENT_SECRET ? {TRAKT_CLIENT_SECRET:this.env.TRAKT_CLIENT_SECRET}:{}),
              TRAKT_ACCESS_MODE: this.env.TRAKT_ACCESS_MODE,
              TRAKT_TOKEN_STORE_URL: `${this.env.PUBLIC_ORIGIN}${TOKEN_PATH}`,
              TRAKT_TOKEN_STORE_KEY: this.bridgeKey,
            },
          });
        }
        await this.ctx.storage.put('runtime-fingerprint',fingerprint);
        await container.setInactivityTimeout(IDLE_TIMEOUT_MS);
        const deadline = Date.now() + 30_000;
        for (;;) {
          try {
            // An unauthenticated GET to a non-MCP path only checks HTTP readiness.
            // A 404 is sufficient; never retry an actual MCP request.
            const response = await container.getTcpPort(8080).fetch('http://localhost:8080/', {
              signal: AbortSignal.timeout(2000), redirect: 'manual',
            });
            await response.body?.cancel();
            return;
          } catch {
            if (Date.now() >= deadline) throw new Error('Container startup timed out');
            await new Promise(resolve => setTimeout(resolve, 200));
          }
        }
      })();
    }
    const pending = this.ready;
    try { await pending; } finally {
      if (this.ready === pending) this.ready = undefined;
    }
  }

  async fetch(request: Request): Promise<Response> {
    if(new URL(request.url).pathname===TOKEN_PATH) return tokenStore(request,this.ctx.storage,this.bridgeKey);
    await this.ensureReady();
    return this.ctx.container!.getTcpPort(8080).fetch(request);
  }
}

