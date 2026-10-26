// Reads qa.config.yaml and credentials/.env for playwright.config.ts and
// auth.setup.ts. Copied into the tester's project by the skill's setup step —
// a tester never edits this file.
//
// Validation lives in scripts/preflight.mjs, which runs before anything else.
// This loader stays deliberately thin: it reads, applies defaults, and trusts
// preflight to have rejected a bad config already.

import fs from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export type Role = { name: string; userEnv?: string; passEnv?: string };
export type SuccessCheck = { type: 'url' | 'text' | 'role'; value: string };

export type QaConfig = {
  app: { name: string; baseUrlEnv: string; environment: string };
  mode: 'pom' | 'bdd';
  auth: {
    strategy: 'form' | 'none' | 'manual-session';
    loginPath: string;
    defaultRole: string;
    roles: Role[];
    successCheck: SuccessCheck;
    sessionMaxAgeMinutes: number;
  };
  run: {
    browsers: ('chromium' | 'firefox' | 'webkit')[];
    headless: boolean;
    workers: number;
    retries: number;
    actionTimeoutMs: number;
    navigationTimeoutMs: number;
    viewport: { width: number; height: number };
  };
  agent: { testIdAttribute: string };
  report: {
    outputDir: string;
    screenshots: 'off' | 'only-on-failure' | 'on';
    video: 'off' | 'retain-on-failure' | 'on';
    trace: 'off' | 'retain-on-failure' | 'on';
  };
};

export const PROJECT_ROOT = process.cwd();
export const AUTH_DIR = '.auth';

/**
 * Playwright writes every artifact here. scripts/report.mjs renames it to
 * outcome/<timestamp>/ afterwards and repoints outcome/latest.
 *
 * Why a fixed folder rather than a timestamp: this config is evaluated more
 * than once per run (bddgen loads it too), and a timestamp computed at load
 * time would scatter artifacts across several folders.
 */
export const RUN_DIR = (outputDir: string): string => path.posix.join(outputDir, '.current');

/** Load credentials/.env into process.env. Existing values win, so CI can override. */
export function loadCredentials(file = 'credentials/.env'): void {
  const full = path.resolve(PROJECT_ROOT, file);
  if (!fs.existsSync(full)) return;
  for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
      value = value.slice(1, -1);
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

const DEFAULTS: QaConfig = {
  app: { name: 'Application', baseUrlEnv: 'BASE_URL', environment: 'staging' },
  mode: 'pom',
  auth: {
    strategy: 'form', loginPath: '/login', defaultRole: '', roles: [],
    successCheck: { type: 'url', value: '/' }, sessionMaxAgeMinutes: 60,
  },
  run: {
    browsers: ['chromium'], headless: true, workers: 4, retries: 1,
    actionTimeoutMs: 10_000, navigationTimeoutMs: 30_000,
    viewport: { width: 1440, height: 900 },
  },
  agent: { testIdAttribute: 'data-testid' },
  report: {
    outputDir: 'outcome', screenshots: 'only-on-failure',
    video: 'retain-on-failure', trace: 'retain-on-failure',
  },
};

function merge<T>(base: T, override: unknown): T {
  if (override === null || override === undefined) return base;
  if (typeof base !== 'object' || Array.isArray(base) || base === null) return override as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(override as Record<string, unknown>)) {
    out[k] = k in (base as Record<string, unknown>)
      ? merge((base as Record<string, unknown>)[k], v)
      : v;
  }
  return out as T;
}

export function loadQaConfig(file?: string): QaConfig {
  const candidates = file ? [file] : ['qa.config.yaml', 'qa.config.yml', 'qa.config.json'];
  const found = candidates.map((c) => path.resolve(PROJECT_ROOT, c)).find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      'No qa.config.yaml found. Copy templates/qa.config.yaml into the project root, ' +
      'then run: node scripts/preflight.mjs',
    );
  }
  const text = fs.readFileSync(found, 'utf8');
  const raw = found.endsWith('.json') ? JSON.parse(text) : parseYaml(text);
  const config = merge(DEFAULTS, raw);

  if (!config.auth.defaultRole && config.auth.roles.length > 0) {
    config.auth.defaultRole = config.auth.roles[0].name;
  }
  return config;
}

export function baseUrl(config: QaConfig): string {
  const url = process.env[config.app.baseUrlEnv];
  if (!url) {
    throw new Error(
      `${config.app.baseUrlEnv} is not set. Add it to credentials/.env, ` +
      'then run: node scripts/preflight.mjs',
    );
  }
  return url;
}

export function storageStateFor(role: string): string {
  return path.posix.join(AUTH_DIR, `${role}.json`);
}

/** Roles that actually need their own test project. */
export function activeRoles(config: QaConfig): Role[] {
  if (config.auth.strategy === 'none') return [{ name: 'anonymous' }];
  return config.auth.roles.length > 0 ? config.auth.roles : [{ name: 'default' }];
}
