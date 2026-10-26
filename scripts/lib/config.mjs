// Loads qa.config.yaml, fills in defaults, and validates it.
//
// Validation is strict about anything that would silently produce a broken or
// unsafe suite, and it reports unknown keys, because a tester who mistypes
// "headles: false" deserves to be told rather than to get a surprise.

import fs from 'node:fs';
import path from 'node:path';
import { parseYamlLite } from './yaml-lite.mjs';

export const CONFIG_NAMES = ['qa.config.yaml', 'qa.config.yml', 'qa.config.json'];

export function resolveRoot(flags = {}) {
  const candidate = flags.project || process.env.QA_PROJECT_ROOT || process.cwd();
  return path.resolve(candidate);
}

export function findConfigFile(root) {
  for (const name of CONFIG_NAMES) {
    const p = path.join(root, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function loadConfigFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  if (file.endsWith('.json')) return { data: JSON.parse(text), parser: 'json' };

  let yamlPkg = null;
  try {
    yamlPkg = await import('yaml');
  } catch {
    // Not installed — fall back so a fresh project can still be diagnosed.
  }
  if (yamlPkg) return { data: yamlPkg.parse(text), parser: 'yaml' };
  return { data: parseYamlLite(text), parser: 'yaml-lite' };
}

const DEFAULTS = {
  app: { name: 'Application', baseUrlEnv: 'BASE_URL', environment: 'staging' },
  mode: 'pom',
  language: 'typescript',
  auth: { strategy: 'form', loginPath: '/login', defaultRole: null, roles: [], successCheck: null, sessionMaxAgeMinutes: 60 },
  run: { browsers: ['chromium'], headless: true, workers: 4, retries: 1, actionTimeoutMs: 10000, navigationTimeoutMs: 30000, viewport: { width: 1440, height: 900 } },
  agent: { maxAutoFixAttempts: 3, testIdAttribute: 'data-testid', locatorStrategy: ['role', 'label', 'placeholder', 'testId', 'text'], onVagueStep: 'flag', allowDestructiveActions: false, explorationBudget: 40 },
  report: { outputDir: 'outcome', keepLastRuns: 10, screenshots: 'only-on-failure', video: 'retain-on-failure', trace: 'retain-on-failure' },
};

const ENUMS = {
  mode: ['pom', 'bdd'],
  language: ['typescript'],
  'auth.strategy': ['form', 'none', 'manual-session'],
  'auth.successCheck.type': ['url', 'text', 'role'],
  'report.screenshots': ['off', 'only-on-failure', 'on'],
  'report.video': ['off', 'retain-on-failure', 'on'],
  'report.trace': ['off', 'retain-on-failure', 'on'],
  'agent.onVagueStep': ['flag', 'ask'],
};

const BROWSERS = ['chromium', 'firefox', 'webkit'];
const LOCATOR_KINDS = ['role', 'label', 'placeholder', 'testId', 'text', 'altText', 'title'];
const NON_PROD_ENVIRONMENTS = ['staging', 'stage', 'qa', 'dev', 'development', 'test', 'uat', 'sandbox', 'local'];

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function deepDefaults(value, defaults) {
  if (!isPlainObject(defaults)) return value === undefined || value === null ? defaults : value;
  const base = isPlainObject(value) ? value : {};
  const out = {};
  for (const key of new Set([...Object.keys(defaults), ...Object.keys(base)])) {
    out[key] = key in defaults ? deepDefaults(base[key], defaults[key]) : base[key];
  }
  return out;
}

function knownKeyPaths(defaults, prefix = '') {
  const paths = new Set();
  for (const [k, v] of Object.entries(defaults)) {
    const p = prefix ? `${prefix}.${k}` : k;
    paths.add(p);
    if (isPlainObject(v)) for (const sub of knownKeyPaths(v, p)) paths.add(sub);
  }
  return paths;
}

function actualKeyPaths(value, prefix = '') {
  const paths = [];
  if (!isPlainObject(value)) return paths;
  for (const [k, v] of Object.entries(value)) {
    const p = prefix ? `${prefix}.${k}` : k;
    paths.push(p);
    // Role entries and successCheck contents are validated by hand, not by shape.
    if (isPlainObject(v) && !/^auth\.(roles|successCheck)/.test(p)) paths.push(...actualKeyPaths(v, p));
  }
  return paths;
}

export function validateConfig(raw) {
  const errors = [];
  const warnings = [];
  const config = deepDefaults(raw ?? {}, DEFAULTS);

  const err = (m) => errors.push(m);
  const warn = (m) => warnings.push(m);

  const checkEnum = (keyPath, value) => {
    const allowed = ENUMS[keyPath];
    if (allowed && !allowed.includes(value)) {
      err(`${keyPath}: "${value}" is not valid. Use one of: ${allowed.join(', ')}`);
      return false;
    }
    return true;
  };
  const checkInt = (keyPath, value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    if (!Number.isInteger(value) || value < min || value > max) {
      err(`${keyPath}: expected a whole number between ${min} and ${max}, got ${JSON.stringify(value)}`);
    }
  };
  const checkBool = (keyPath, value) => {
    if (typeof value !== 'boolean') err(`${keyPath}: expected true or false, got ${JSON.stringify(value)}`);
  };

  // --- unknown / mistyped keys ---
  const known = knownKeyPaths(DEFAULTS);
  for (const p of actualKeyPaths(config)) {
    if (!known.has(p)) warn(`unknown setting "${p}" — check the spelling against the template`);
  }

  // --- app ---
  if (typeof config.app.baseUrlEnv !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(config.app.baseUrlEnv)) {
    err('app.baseUrlEnv: must be a variable NAME such as BASE_URL, not a URL');
  }
  if (/^https?:\/\//i.test(String(config.app.baseUrlEnv))) {
    err('app.baseUrlEnv: this is a URL. Put the URL in credentials/.env and name the variable here');
  }
  const environment = String(config.app.environment ?? '').toLowerCase();
  if (['production', 'prod', 'live'].includes(environment)) {
    err('app.environment: refusing to run against production. Use a staging, qa or dev environment');
  } else if (!NON_PROD_ENVIRONMENTS.includes(environment)) {
    warn(`app.environment: "${config.app.environment}" is not a recognised test environment name`);
  }

  // --- mode / language ---
  checkEnum('mode', config.mode);
  checkEnum('language', config.language);

  // --- auth ---
  const auth = config.auth;
  checkEnum('auth.strategy', auth.strategy);
  checkInt('auth.sessionMaxAgeMinutes', auth.sessionMaxAgeMinutes, { min: 1, max: 1440 });

  if (auth.strategy === 'form') {
    if (typeof auth.loginPath !== 'string' || !auth.loginPath.startsWith('/')) {
      err('auth.loginPath: must be a path starting with "/" such as /login');
    }
    if (/^https?:\/\//i.test(String(auth.loginPath))) {
      err('auth.loginPath: use a path, not a full URL — the base URL comes from .env');
    }
    if (!auth.successCheck || !isPlainObject(auth.successCheck)) {
      err('auth.successCheck: required for strategy "form" — how do we know login worked?');
    } else {
      checkEnum('auth.successCheck.type', auth.successCheck.type);
      if (!auth.successCheck.value) err('auth.successCheck.value: required');
    }
  }

  const roles = Array.isArray(auth.roles) ? auth.roles : [];
  if (auth.strategy !== 'none' && roles.length === 0) {
    err('auth.roles: at least one role is required unless auth.strategy is "none"');
  }
  const seen = new Set();
  roles.forEach((role, i) => {
    const at = `auth.roles[${i}]`;
    if (!isPlainObject(role)) {
      err(`${at}: expected "name", "userEnv" and "passEnv"`);
      return;
    }
    if (!role.name) err(`${at}.name: required`);
    else if (seen.has(role.name)) err(`${at}.name: duplicate role "${role.name}"`);
    else seen.add(role.name);

    if (auth.strategy === 'form') {
      for (const field of ['userEnv', 'passEnv']) {
        const v = role[field];
        if (!v) err(`${at}.${field}: required for strategy "form"`);
        else if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(v))) {
          err(`${at}.${field}: must be a variable NAME from .env, got ${JSON.stringify(v)}`);
        } else if (/@|\s/.test(String(v))) {
          err(`${at}.${field}: this looks like a real credential. Put it in credentials/.env and name the variable here`);
        }
      }
    }
  });
  if (!auth.defaultRole && roles.length > 0) {
    config.auth.defaultRole = roles[0].name;
    if (roles.length > 1) warn(`auth.defaultRole: not set, using "${roles[0].name}"`);
  } else if (auth.defaultRole && !seen.has(auth.defaultRole)) {
    err(`auth.defaultRole: "${auth.defaultRole}" is not one of the roles (${[...seen].join(', ') || 'none'})`);
  }

  // --- run ---
  const run = config.run;
  const browsers = Array.isArray(run.browsers) ? run.browsers : [run.browsers];
  if (browsers.length === 0) err('run.browsers: pick at least one of chromium, firefox, webkit');
  for (const b of browsers) {
    if (!BROWSERS.includes(b)) err(`run.browsers: "${b}" is not valid. Use: ${BROWSERS.join(', ')}`);
  }
  config.run.browsers = browsers;
  checkBool('run.headless', run.headless);
  checkInt('run.workers', run.workers, { min: 1, max: 64 });
  checkInt('run.retries', run.retries, { min: 0, max: 5 });
  checkInt('run.actionTimeoutMs', run.actionTimeoutMs, { min: 1000, max: 120000 });
  checkInt('run.navigationTimeoutMs', run.navigationTimeoutMs, { min: 1000, max: 300000 });
  checkInt('run.viewport.width', run.viewport?.width, { min: 320, max: 3840 });
  checkInt('run.viewport.height', run.viewport?.height, { min: 240, max: 2160 });

  // --- agent ---
  const agent = config.agent;
  checkInt('agent.maxAutoFixAttempts', agent.maxAutoFixAttempts, { min: 0, max: 10 });
  if (Number.isInteger(agent.maxAutoFixAttempts) && agent.maxAutoFixAttempts > 3) {
    warn(`agent.maxAutoFixAttempts: ${agent.maxAutoFixAttempts} is above the recommended 3 — more attempts usually means a real bug, not a flaky locator`);
  }
  if (!agent.testIdAttribute || typeof agent.testIdAttribute !== 'string') {
    err('agent.testIdAttribute: expected an attribute name such as data-testid');
  }
  const strategy = Array.isArray(agent.locatorStrategy) ? agent.locatorStrategy : [];
  if (strategy.length === 0) err('agent.locatorStrategy: must list at least one locator kind');
  for (const s of strategy) {
    if (!LOCATOR_KINDS.includes(s)) err(`agent.locatorStrategy: "${s}" is not valid. Use: ${LOCATOR_KINDS.join(', ')}`);
  }
  if (strategy[0] && strategy[0] !== 'role') {
    warn(`agent.locatorStrategy: starts with "${strategy[0]}" — "role" first gives the most stable locators`);
  }
  checkEnum('agent.onVagueStep', agent.onVagueStep);
  checkBool('agent.allowDestructiveActions', agent.allowDestructiveActions);
  if (agent.allowDestructiveActions === true) {
    warn('agent.allowDestructiveActions: true — tests may delete records, submit payments or send email. Only do this on a throwaway environment');
  }
  checkInt('agent.explorationBudget', agent.explorationBudget, { min: 1, max: 500 });

  // --- report ---
  checkEnum('report.screenshots', config.report.screenshots);
  checkEnum('report.video', config.report.video);
  checkEnum('report.trace', config.report.trace);
  checkInt('report.keepLastRuns', config.report.keepLastRuns, { min: 1, max: 200 });
  if (typeof config.report.outputDir !== 'string' || path.isAbsolute(config.report.outputDir) || config.report.outputDir.includes('..')) {
    err('report.outputDir: must be a relative folder inside the project, such as "outcome"');
  }

  return { config, errors, warnings };
}

// Variable names this config requires in credentials/.env.
export function requiredEnvKeys(config) {
  const keys = [config.app.baseUrlEnv];
  if (config.auth.strategy === 'form') {
    for (const role of config.auth.roles ?? []) {
      if (role?.userEnv) keys.push(role.userEnv);
      if (role?.passEnv) keys.push(role.passEnv);
    }
  }
  return [...new Set(keys.filter(Boolean))];
}
