// Reads credentials/.env and reports on it WITHOUT ever emitting a value.
//
// The contract this file upholds: values are held in memory only long enough to
// answer "is it set, and does it look plausible". Nothing returned by the public
// functions here contains a secret, so a script's stdout is always safe to show
// to the model or paste into a report.

import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

export function parseEnvFile(text) {
  const vars = new Map();
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (t === '' || t.startsWith('#')) continue;
    const m = t.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*([\s\S]*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
        (value.startsWith("'") && value.endsWith("'") && value.length > 1)) {
      value = value.slice(1, -1);
    }
    vars.set(m[1], value);
  }
  return vars;
}

export function loadEnv(file) {
  if (!fs.existsSync(file)) return { exists: false, vars: new Map() };
  return { exists: true, vars: parseEnvFile(fs.readFileSync(file, 'utf8')) };
}

// Describe a variable without revealing it.
export function describeKey(vars, key) {
  if (!vars.has(key)) return { key, status: 'missing' };
  const value = vars.get(key);
  if (value === '') return { key, status: 'empty' };
  if (/^(changeme|xxx+|todo|your[-_ ]?password|placeholder|<.*>)$/i.test(value)) {
    return { key, status: 'placeholder', length: value.length };
  }
  return { key, status: 'set', length: value.length };
}

const NON_PROD_MARKERS = [
  'localhost', '127.0.0.1', '0.0.0.0', 'staging', 'stage', 'qa', 'test', 'tst',
  'dev', 'develop', 'uat', 'sandbox', 'demo', 'preprod', 'pre-prod', 'local',
  'preview', 'int', 'integration', 'nonprod', 'non-prod',
];
const PROD_MARKERS = ['prod', 'production', 'live', 'www'];

function hostTokens(hostname) {
  return hostname.toLowerCase().split(/[.\-_]/).filter(Boolean);
}

// Conservative on purpose: a host is only cleared when it proves it is non-prod.
export function classifyUrl(rawUrl) {
  if (!rawUrl) return { verdict: 'missing', reason: 'no URL provided' };

  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return { verdict: 'invalid', reason: `not a valid URL: ${rawUrl}` };
  }
  if (!/^https?:$/.test(url.protocol)) {
    return { verdict: 'invalid', reason: `unsupported protocol ${url.protocol}` };
  }
  if (url.username || url.password) {
    return { verdict: 'credentials-in-url', reason: 'URL embeds a username/password — move them to .env' };
  }

  const tokens = hostTokens(url.hostname);
  const nonProd = NON_PROD_MARKERS.filter((m) => tokens.includes(m) || url.hostname.includes(m));
  const prod = PROD_MARKERS.filter((m) => tokens.includes(m));

  if (nonProd.length > 0) {
    return { verdict: 'non-production', reason: `host contains "${nonProd[0]}"`, host: url.hostname };
  }
  if (prod.length > 0) {
    return { verdict: 'production', reason: `host contains "${prod[0]}"`, host: url.hostname };
  }
  return {
    verdict: 'unknown',
    reason: `"${url.hostname}" has no staging/qa/dev marker, so it may be production`,
    host: url.hostname,
  };
}

function git(root, args) {
  try {
    return { ok: true, out: execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() };
  } catch {
    return { ok: false, out: '' };
  }
}

// Are the paths that hold secrets actually protected from being committed?
export function checkGitSafety(root, paths) {
  const inside = git(root, ['rev-parse', '--is-inside-work-tree']);
  if (!inside.ok || inside.out !== 'true') return { isRepo: false, results: [] };

  const results = paths.map((p) => {
    const ignored = git(root, ['check-ignore', '-q', p]).ok;
    const tracked = git(root, ['ls-files', '--error-unmatch', p]).ok;
    return { path: p, ignored, tracked };
  });
  return { isRepo: true, results };
}

// Look for a credential that has been pasted somewhere it will get committed.
const SECRET_PATTERNS = [
  { id: 'password-assignment', re: /\b(password|passwd|pwd|secret|api[-_ ]?key|token)\b\s*[:=]\s*["']?[^\s"'<>{}$]{4,}/i },
  { id: 'url-with-credentials', re: /https?:\/\/[^\s/@]+:[^\s/@]+@/i },
  { id: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._-]{16,}/ },
  { id: 'private-key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

export function scanTextForSecrets(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.trim().startsWith('#') || line.trim().startsWith('//')) return;
    for (const p of SECRET_PATTERNS) {
      if (p.re.test(line)) {
        // Record WHERE, never WHAT.
        hits.push({ rule: p.id, line: i + 1 });
        break;
      }
    }
  });
  return hits;
}
