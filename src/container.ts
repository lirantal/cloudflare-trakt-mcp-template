import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export class TraktContainer extends DurableObject<Env> {
  private ready?: Promise<void>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
        // New Worker versions must not keep serving an older image indefinitely.
        if (container.running && (await container.inspect())?.image !== image) {
          await container.destroy();
        }
        if (!container.running) {
          container.start({
            image, instance: 'lite', enableInternet: true,
            env: {
              TRAKT_CLIENT_ID: this.env.TRAKT_CLIENT_ID,
              INTERVALS_ICU_ATHLETE_ID: this.env.INTERVALS_ICU_ATHLETE_ID,
              ICUVISOR_TIMEZONE: this.env.ICUVISOR_TIMEZONE,
              TRAKT_DELETE_MODE: 'none',
              ICUVISOR_TOOLSET: this.env.ICUVISOR_TOOLSET,
              ICUVISOR_COACH_MODE: 'off',
            },
          });
        }
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
    await this.ensureReady();
    return this.ctx.container!.getTcpPort(8080).fetch(request);
  }
}

