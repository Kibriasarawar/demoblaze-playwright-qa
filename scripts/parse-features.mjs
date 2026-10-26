#!/usr/bin/env node
// Phase 1. Read every .feature file into structured JSON, expand Scenario
// Outlines, and flag steps that are too vague to automate.
//
// Flagging is mechanical on purpose: the rules below catch the wording that
// makes an agent guess. A flagged scenario is NOT generated — it goes to
// needs-human.md, per hard rule 12.
//
//   node scripts/parse-features.mjs [--project <dir>] [--json] [--out <file>]

import fs from 'node:fs';
import path from 'node:path';
import { Report, parseArgs, bold, dim, yellow, red, green, cyan } from './lib/out.mjs';
import { resolveRoot } from './lib/config.mjs';

const STEP_KEYWORDS = ['Given', 'When', 'Then', 'And', 'But', '*'];

// ---------------------------------------------------------------- the parser

function parseFeatureFile(text, file) {
  const lines = text.split(/\r?\n/);
  const feature = { file, name: null, description: [], tags: [], line: null, background: null, children: [] };

  let pendingTags = [];
  let current = null;        // the scenario/outline being filled
  let target = null;         // where steps go: background or current
  let lastStep = null;
  let inDocstring = false;
  let docstringFence = null;
  let docstringIndent = 0;
  let examplesFor = null;    // outline awaiting Examples rows
  let exampleTable = null;

  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();

    // docstring body passes through verbatim
    if (inDocstring) {
      if (trimmed === docstringFence) {
        inDocstring = false;
        docstringFence = null;
        continue;
      }
      if (lastStep) lastStep.docstring.push(raw.slice(Math.min(docstringIndent, raw.length - raw.trimStart().length + docstringIndent)));
      continue;
    }

    if (trimmed === '' || trimmed.startsWith('#')) continue;

    if (trimmed === '"""' || trimmed === '```') {
      inDocstring = true;
      docstringFence = trimmed;
      docstringIndent = raw.length - raw.trimStart().length;
      if (lastStep) lastStep.docstring = [];
      continue;
    }

    if (trimmed.startsWith('@')) {
      pendingTags.push(...trimmed.split(/\s+/).filter((t) => t.startsWith('@')).map((t) => t.slice(1)));
      continue;
    }

    // table row — belongs to an Examples block or to the last step
    if (trimmed.startsWith('|')) {
      const cells = trimmed.split('|').slice(1, -1).map((c) => c.trim());
      if (exampleTable) {
        if (!exampleTable.header) exampleTable.header = cells;
        else exampleTable.rows.push({ cells, line: lineNo });
      } else if (lastStep) {
        lastStep.table.push(cells);
      } else {
        errors.push({ line: lineNo, message: 'table row does not belong to a step or an Examples block' });
      }
      continue;
    }

    const kw = trimmed.match(/^(Feature|Background|Rule|Scenario Outline|Scenario Template|Scenarios|Examples|Scenario|Example)\s*:\s*(.*)$/);
    if (kw) {
      const [, keyword, name] = kw;
      exampleTable = null;
      lastStep = null;

      if (keyword === 'Feature') {
        feature.name = name.trim();
        feature.line = lineNo;
        feature.tags = pendingTags;
        pendingTags = [];
        target = null;
      } else if (keyword === 'Rule') {
        // Grouping only; its tags flow to the scenarios inside it.
        pendingTags = [];
      } else if (keyword === 'Background') {
        feature.background = { name: name.trim(), line: lineNo, steps: [] };
        target = feature.background;
        pendingTags = [];
      } else if (keyword === 'Examples' || keyword === 'Scenarios') {
        if (!examplesFor) {
          errors.push({ line: lineNo, message: 'Examples block without a Scenario Outline above it' });
        } else {
          exampleTable = { header: null, rows: [], line: lineNo };
          examplesFor.examples.push(exampleTable);
        }
      } else {
        const isOutline = keyword === 'Scenario Outline' || keyword === 'Scenario Template';
        current = {
          name: name.trim(), line: lineNo, tags: [...feature.tags, ...pendingTags],
          ownTags: pendingTags, outline: isOutline, steps: [], examples: [],
        };
        pendingTags = [];
        feature.children.push(current);
        target = current;
        examplesFor = isOutline ? current : null;
      }
      continue;
    }

    const stepMatch = trimmed.match(new RegExp(`^(${STEP_KEYWORDS.map((k) => k.replace('*', '\\*')).join('|')})\\s+(.*)$`));
    if (stepMatch) {
      if (!target) {
        errors.push({ line: lineNo, message: `step "${trimmed}" is not inside a Scenario or Background` });
        continue;
      }
      const [, keyword, stepText] = stepMatch;
      const prior = target.steps.filter((s) => s.keyword !== 'And' && s.keyword !== 'But' && s.keyword !== '*');
      const type = ['And', 'But', '*'].includes(keyword)
        ? (prior.length ? prior[prior.length - 1].keyword : 'Given')
        : keyword;
      lastStep = { keyword, type, text: stepText.trim(), line: lineNo, table: [], docstring: null };
      target.steps.push(lastStep);
      continue;
    }

    // anything else is free description text
    if (feature.name && !current) feature.description.push(trimmed);
  }

  return { feature, errors };
}

// ------------------------------------------------------- outline expansion

function substitute(text, header, cells) {
  let out = text;
  header.forEach((h, idx) => {
    out = out.split(`<${h}>`).join(cells[idx] ?? '');
  });
  return out;
}

function expandScenario(scenario, feature) {
  const base = {
    feature: feature.name,
    file: feature.file,
    tags: scenario.tags,
    role: roleFromTags(scenario.tags),
    skip: scenario.tags.includes('skip') || scenario.tags.includes('wip'),
  };
  const backgroundSteps = (feature.background?.steps ?? []).map((s) => ({ ...s, fromBackground: true }));

  if (!scenario.outline) {
    return [{
      ...base, name: scenario.name, line: scenario.line, outline: false,
      steps: [...backgroundSteps, ...scenario.steps],
    }];
  }

  const out = [];
  for (const table of scenario.examples) {
    if (!table.header) continue;
    for (const row of table.rows) {
      const values = Object.fromEntries(table.header.map((h, i) => [h, row.cells[i] ?? '']));
      out.push({
        ...base,
        name: `${substitute(scenario.name, table.header, row.cells)} [${table.header.map((h) => `${h}=${values[h]}`).join(', ')}]`,
        line: row.line,
        outline: true,
        exampleValues: values,
        steps: [
          ...backgroundSteps,
          ...scenario.steps.map((s) => ({
            ...s,
            text: substitute(s.text, table.header, row.cells),
            table: s.table.map((r) => r.map((c) => substitute(c, table.header, row.cells))),
          })),
        ],
      });
    }
  }
  if (out.length === 0) {
    out.push({ ...base, name: scenario.name, line: scenario.line, outline: true, steps: [...backgroundSteps, ...scenario.steps], examplesMissing: true });
  }
  return out;
}

function roleFromTags(tags) {
  const tag = tags.find((t) => t.toLowerCase().startsWith('role:'));
  return tag ? tag.slice(5) : null;
}

// ------------------------------------------------------------- quality rules

const VAGUE_WORDING = /\b(works?|working|properly|correctly|as expected|appropriate(ly)?|looks? (good|right|fine)|should be fine|valid data|some(thing| data)?|various|whatever|etc\.?|and so on|normally|successfully done|do the needful)\b/i;
const PURE_ACTION = /^(i\s+)?(click|press|tap|fill|enter|type|input|select|choose|navigate|go|open|visit|upload|scroll|hover|drag|submit|login|log in|sign in)\b/i;
const ASSERTION_WORDS = /\b(see|sees|seen|shown|show|shows|display(ed|s)?|visible|appear(s|ed)?|contain(s|ing)?|equals?|match(es)?|redirect(ed|s)?|land(s|ed)?|receive(s|d)?|is|are|has|have|should|must|error|message|success|enabled|disabled|selected|checked|present|exists?|empty|count|total|title|url|remains?|stays?|cannot|can not|unable|able|logged (in|out))\b/i;
const GENERIC_TARGET = /\b(click|press|tap|select|choose|check|uncheck)\s+(on\s+)?(the\s+)?(button|link|field|option|element|icon|checkbox|it|that|this)\s*$/i;
const BARE_ACTION = /^(i\s+)?(click|press|tap|submit|continue|proceed|wait)\s*$/i;
const HARD_WAIT = /\bwait(s|ing)?\s+(for\s+)?\d+\s*(ms|milliseconds?|s|secs?|seconds?|minutes?)\b/i;
const AMBIGUOUS_QTY = /\b(a few|several|many|multiple|some number of|a couple)\b/i;
// A negative login test legitimately writes a bad password in Gherkin, so
// flagging every quoted password would block valid work. Only call it out when
// the value actually looks like a real secret.
const DUMMY_VALUES = new Set([
  'password', 'passw0rd', 'wrongpass', 'badpass', 'badpassword', 'wrongpassword',
  'invalid', 'incorrect', 'testpass', 'test1234', 'changeme', 'placeholder',
  '12345678', '123456789', 'abcdefgh', 'dummy', 'example', 'notreal', 'fake',
]);

function looksLikeRealSecret(value) {
  if (!value) return false;
  if (/^<[^<>]+>$/.test(value)) return false;              // Examples placeholder
  if (/^\$?\{?[A-Z][A-Z0-9_]{2,}\}?$/.test(value)) return false;  // env variable reference
  const v = value.trim();
  if (v.length < 8) return false;
  if (DUMMY_VALUES.has(v.toLowerCase())) return false;
  if (/^(wrong|bad|invalid|incorrect|test|fake|dummy|no)[-_]?/i.test(v)) return false;
  const hasLetter = /[a-z]/i.test(v);
  const hasDigitOrSymbol = /[\d!@#$%^&*()\-_=+[\]{};:,.?\/\\|]/.test(v);
  return hasLetter && hasDigitOrSymbol;
}

function credentialInStep(text) {
  const re = /\b(password|passwd|pwd|api[-_ ]?key|secret|token)\b[^"'\n]{0,20}["']([^"']*)["']/gi;
  let m;
  while ((m = re.exec(text))) {
    if (looksLikeRealSecret(m[2])) return m[1].toLowerCase();
  }
  return null;
}
const HARDCODED_URL = /https?:\/\/[^\s"'<>]+/i;
const PLACEHOLDER_LEFT = /<([^<>]+)>/;

const STEP_RULES = [
  { id: 'empty-step', severity: 'blocker', test: (s) => (s.text.trim() === '' ? 'the step has no text' : null) },
  { id: 'too-short', severity: 'blocker', test: (s) => (s.text.trim().split(/\s+/).length < 3 ? `"${s.text}" is too short to act on — say what, where and what should happen` : null) },
  { id: 'bare-action', severity: 'blocker', test: (s) => (BARE_ACTION.test(s.text.trim()) ? `"${s.text}" does not say what to act on — name the button, link or field` : null) },
  { id: 'generic-target', severity: 'blocker', test: (s) => (GENERIC_TARGET.test(s.text.trim()) ? `"${s.text}" names no specific element — use its visible label, e.g. 'click the "Sign in" button'` : null) },
  { id: 'vague-wording', severity: 'blocker', test: (s) => { const m = s.text.match(VAGUE_WORDING); return m ? `"${m[0]}" is not checkable — state the exact text, value or page you expect` : null; } },
  { id: 'credential-in-step', severity: 'warning', test: (s) => { const kind = credentialInStep(s.text); return kind ? `this step appears to contain a real ${kind} — use a @role: tag or an Examples placeholder instead of writing it in Gherkin (hard rule 6)` : null; } },
  { id: 'unresolved-placeholder', severity: 'blocker', test: (s, sc) => { const m = s.text.match(PLACEHOLDER_LEFT); return m && !sc.outline ? `<${m[1]}> is a placeholder but this is not a Scenario Outline` : (m && sc.outline && !(sc.exampleValues && m[1] in sc.exampleValues) ? `<${m[1]}> has no column in the Examples table` : null); } },
  { id: 'unresolved-pronoun', severity: 'warning', test: (s) => (/^(it|they|there|that|this)\b/i.test(s.text.trim()) ? `"${s.text}" starts with a pronoun — name the thing explicitly` : null) },
  { id: 'hard-wait', severity: 'warning', test: (s) => (HARD_WAIT.test(s.text) ? 'remove the fixed wait — the generated test waits for the condition instead (hard rule 3)' : null) },
  { id: 'ambiguous-quantity', severity: 'warning', test: (s) => { const m = s.text.match(AMBIGUOUS_QTY); return m ? `"${m[0]}" is not a number — say how many` : null; } },
  { id: 'hardcoded-url', severity: 'warning', test: (s) => (HARDCODED_URL.test(s.text) ? 'remove the full URL — the base URL comes from .env (hard rule 9)' : null) },
  { id: 'action-in-then', severity: 'warning', test: (s) => (s.type === 'Then' && PURE_ACTION.test(s.text.trim()) ? `"Then ${s.text}" is an action, not a check — a Then step should state what you expect to see` : null) },
];

const SCENARIO_RULES = [
  { id: 'no-steps', severity: 'blocker', test: (sc) => (sc.steps.length === 0 ? 'the scenario has no steps' : null) },
  { id: 'examples-missing', severity: 'blocker', test: (sc) => (sc.examplesMissing ? 'Scenario Outline has no Examples table, so there is nothing to run' : null) },
  { id: 'no-assertion', severity: 'blocker', test: (sc) => {
      const thens = sc.steps.filter((s) => s.type === 'Then');
      if (thens.length === 0) return 'no Then step — every scenario needs at least one check (hard rule 4)';
      const real = thens.filter((s) => ASSERTION_WORDS.test(s.text) && !PURE_ACTION.test(s.text.trim()));
      return real.length === 0 ? 'no Then step states a checkable outcome (hard rule 4)' : null;
    } },
  { id: 'no-given', severity: 'warning', test: (sc) => (sc.steps.some((s) => s.type === 'Given') ? null : 'no Given step — state the starting point so the test is repeatable') },
  { id: 'very-long', severity: 'warning', test: (sc) => (sc.steps.length > 20 ? `${sc.steps.length} steps — consider splitting this into smaller scenarios` : null) },
];

function reviewScenario(sc) {
  const issues = [];
  for (const rule of SCENARIO_RULES) {
    const message = rule.test(sc);
    if (message) issues.push({ rule: rule.id, severity: rule.severity, message });
  }
  for (const step of sc.steps) {
    for (const rule of STEP_RULES) {
      const message = rule.test(step, sc);
      if (message) {
        issues.push({ rule: rule.id, severity: rule.severity, message, step: `${step.keyword} ${step.text}`, line: step.line });
      }
    }
  }
  return issues;
}

// -------------------------------------------------------------------- driver

function listFeatureFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFeatureFiles(p));
    else if (entry.name.endsWith('.feature')) out.push(p);
  }
  return out;
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function main() {
  const { flags } = parseArgs();
  const root = resolveRoot(flags);
  const featuresDir = path.join(root, 'features');
  const files = listFeatureFiles(featuresDir);

  const result = {
    generatedAt: new Date().toISOString(),
    root,
    featuresDir: path.relative(root, featuresDir) || 'features',
    files: [],
    scenarios: [],
    parseErrors: [],
    stats: {},
  };

  const nameCounts = new Map();

  for (const file of files) {
    const rel = path.relative(root, file);
    const module = path.relative(featuresDir, file).split(path.sep)[0].replace(/\.feature$/, '');
    let parsed;
    try {
      parsed = parseFeatureFile(fs.readFileSync(file, 'utf8'), rel);
    } catch (e) {
      result.parseErrors.push({ file: rel, message: e.message });
      continue;
    }
    for (const err of parsed.errors) result.parseErrors.push({ file: rel, ...err });

    const { feature } = parsed;
    if (!feature.name) {
      result.parseErrors.push({ file: rel, line: 1, message: 'no "Feature:" line found' });
    }
    result.files.push({
      path: rel, module, feature: feature.name, tags: feature.tags,
      scenarioCount: feature.children.length,
      hasBackground: Boolean(feature.background),
    });

    for (const child of feature.children) {
      for (const sc of expandScenario(child, feature)) {
        const issues = reviewScenario(sc);
        const blockers = issues.filter((i) => i.severity === 'blocker');
        const key = `${module}/${slug(sc.name)}`;
        const n = (nameCounts.get(key) ?? 0) + 1;
        nameCounts.set(key, n);

        result.scenarios.push({
          id: n > 1 ? `${key}-${n}` : key,
          module,
          file: rel,
          feature: sc.feature,
          name: sc.name,
          line: sc.line,
          tags: sc.tags,
          role: sc.role,
          outline: sc.outline,
          exampleValues: sc.exampleValues ?? null,
          steps: sc.steps.map((s) => ({
            keyword: s.keyword, type: s.type, text: s.text, line: s.line,
            table: s.table.length ? s.table : null,
            docstring: s.docstring ? s.docstring.join('\n') : null,
            fromBackground: Boolean(s.fromBackground),
          })),
          issues,
          status: sc.skip ? 'skipped-by-tag' : blockers.length > 0 ? 'needs-human' : 'ready',
        });
      }
    }
  }

  for (const [key, count] of nameCounts) {
    if (count > 1) {
      result.parseErrors.push({ file: key.split('/')[0], message: `${count} scenarios share the name "${key}" — give each one a distinct name` });
    }
  }

  const ready = result.scenarios.filter((s) => s.status === 'ready');
  const needsHuman = result.scenarios.filter((s) => s.status === 'needs-human');
  const skipped = result.scenarios.filter((s) => s.status === 'skipped-by-tag');
  result.stats = {
    files: result.files.length,
    modules: new Set(result.files.map((f) => f.module)).size,
    scenarios: result.scenarios.length,
    ready: ready.length,
    needsHuman: needsHuman.length,
    skipped: skipped.length,
    steps: result.scenarios.reduce((n, s) => n + s.steps.length, 0),
    warnings: result.scenarios.reduce((n, s) => n + s.issues.filter((i) => i.severity === 'warning').length, 0),
    parseErrors: result.parseErrors.length,
  };

  if (flags.out) {
    const dest = path.resolve(root, String(flags.out));
    if (!dest.startsWith(root)) throw new Error('refusing to write outside the project folder (hard rule 11)');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(result, null, 2));
  }

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.stats.parseErrors > 0 ? 1 : 0;
    return;
  }

  // human-readable
  const s = result.stats;
  console.log(`\n${bold('Gherkin review')}  ${dim(featuresDir)}`);
  console.log(`\n${s.files} file(s), ${s.modules} module(s), ${s.scenarios} scenario(s), ${s.steps} step(s)`);
  console.log(`${green(`${s.ready} ready`)}   ${s.needsHuman ? red(`${s.needsHuman} need a human`) : dim('0 need a human')}   ${s.skipped ? yellow(`${s.skipped} skipped by tag`) : dim('0 skipped')}   ${s.warnings ? yellow(`${s.warnings} warning(s)`) : dim('0 warnings')}`);

  if (result.parseErrors.length) {
    console.log(`\n${red('Could not parse')}`);
    for (const e of result.parseErrors) console.log(`  ${e.file}${e.line ? `:${e.line}` : ''}  ${e.message}`);
  }

  for (const sc of result.scenarios) {
    if (sc.issues.length === 0) continue;
    const mark = sc.status === 'needs-human' ? red('BLOCKED') : yellow('warn');
    console.log(`\n${mark}  ${cyan(sc.file)}:${sc.line}  ${bold(sc.name)}`);
    for (const i of sc.issues) {
      const tag = i.severity === 'blocker' ? red(i.rule) : yellow(i.rule);
      console.log(`   ${tag}  ${i.message}`);
      if (i.step) console.log(`        ${dim(`line ${i.line}: ${i.step}`)}`);
    }
  }

  if (s.ready > 0) {
    console.log(`\n${bold('Ready to generate')}`);
    for (const sc of result.scenarios.filter((x) => x.status === 'ready')) {
      console.log(`  ${green('ok')}  ${sc.id}${sc.role ? dim(`  [role: ${sc.role}]`) : ''}`);
    }
  }
  console.log('');
  process.exitCode = result.stats.parseErrors > 0 ? 1 : 0;
}

try {
  main();
} catch (e) {
  console.error(`\n${e.message}\n`);
  process.exitCode = 1;
}
