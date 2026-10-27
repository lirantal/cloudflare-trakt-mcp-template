import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface DeploymentSettings {
  accountId: string;
  workerName: string;
  publicOrigin: string;
  allowedGithubUserId: string;
  githubClientId: string;
  traktClientId: string;
  traktLegacySecret?: boolean;
  timezone: string;
  deleteMode: string;
  accessMode: string;
  authEpoch: string;
}

// Use one settings source across cf, preflight, smoke, and CI. Local identity
// values are deliberately excluded from Git and the Docker build context.
export function loadSettings({ directory = dirname(fileURLToPath(import.meta.url)), file = process.env.TRAKT_DEPLOYMENT_FILE }: { directory?: string; file?: string } = {}): DeploymentSettings {
  const target = file ? resolve(directory, file) : join(directory, existsSync(join(directory, 'deployment.local.json')) ? 'deployment.local.json' : 'deployment.json');
  let settings: unknown;
  try { settings = JSON.parse(readFileSync(target, 'utf8')); }
  catch { throw new Error(`Cannot load valid JSON settings from ${basename(target)}`); }
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) throw new Error('Deployment settings must be a JSON object');
  return settings as DeploymentSettings;
}

export default loadSettings();

