import { bindings, defineConfig, defineContainer, exports } from 'cf/config';
import settings from './deployment.config.ts';

const container = defineContainer({
  name: `${settings.workerName}-server`,
  schedulingPolicy: 'durable-object',
  images: { server: { dockerfile: './Dockerfile' } },
});

export default defineConfig({
  accountId: settings.accountId,
  worker: {
    name: settings.workerName,
    entrypoint: './src/index.ts',
    compatibilityDate: '2026-10-26',
    compatibilityFlags: ['nodejs_compat'],
    workersDev: true,
    previewUrls: false,
    observability: { enabled: false },
    exports: { TraktContainer: exports.durableObject({ storage: 'sqlite', container }) },
    env: {
      OAUTH_KV: bindings.kv(settings.oauthKvId ? {id:settings.oauthKvId} : {}),
      // cf beta emits script_name even for same-Worker bindings; its new
      // container validator rejects that. Use native upload metadata until fixed.
      MCP_CONTAINER: { type: 'unsafe:durable_object_namespace', class_name: 'TraktContainer' },
      PUBLIC_ORIGIN: bindings.text(settings.publicOrigin),
      ALLOWED_GITHUB_USER_ID: bindings.text(settings.allowedGithubUserId),
      GITHUB_CLIENT_ID: bindings.text(settings.githubClientId),
      TRAKT_DELETE_MODE: bindings.text(settings.deleteMode),
      AUTH_EPOCH: bindings.text(settings.authEpoch),
      GITHUB_CLIENT_SECRET: bindings.secret(),
      TRAKT_CLIENT_ID: bindings.text(settings.traktClientId),
      ...(settings.traktLegacySecret ? {TRAKT_CLIENT_SECRET: bindings.secret()} : {}),
      TRAKT_ACCESS_MODE: bindings.text(settings.accessMode),
    },
  },
  containers: [container],
});

