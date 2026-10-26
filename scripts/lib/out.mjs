// Console output helpers. Every script prints the same shape so the agent can
// read results consistently, and `--json` gives it a machine-readable version.

const COLOR = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (COLOR ? `\u001b[${code}m${s}\u001b[0m` : s);

export const dim = (s) => c('2', s);
export const bold = (s) => c('1', s);
export const red = (s) => c('31', s);
export const green = (s) => c('32', s);
export const yellow = (s) => c('33', s);
export const cyan = (s) => c('36', s);

export class Report {
  constructor(title, subtitle = null) {
    this.title = title;
    this.subtitle = subtitle;
    this.items = [];
    this.section = null;
  }

  heading(name) {
    this.section = name;
    return this;
  }

  add(level, message, detail) {
    this.items.push({ level, section: this.section, message, detail });
    return this;
  }

  pass(message, detail) { return this.add('pass', message, detail); }
  warn(message, detail) { return this.add('warn', message, detail); }
  fail(message, detail) { return this.add('fail', message, detail); }
  info(message, detail) { return this.add('info', message, detail); }

  get failures() { return this.items.filter((i) => i.level === 'fail'); }
  get warnings() { return this.items.filter((i) => i.level === 'warn'); }
  get ok() { return this.failures.length === 0; }

  toJSON() {
    return {
      title: this.title,
      subtitle: this.subtitle,
      ok: this.ok,
      counts: {
        pass: this.items.filter((i) => i.level === 'pass').length,
        warn: this.warnings.length,
        fail: this.failures.length,
      },
      items: this.items,
    };
  }

  print() {
    const mark = { pass: green('  ok  '), warn: yellow(' warn '), fail: red(' FAIL '), info: dim(' ---- ') };
    console.log(`\n${bold(this.title)}`);
    if (this.subtitle) console.log(dim(this.subtitle));
    let current = null;
    for (const item of this.items) {
      if (item.section !== current) {
        current = item.section;
        if (current) console.log(`\n${cyan(current)}`);
      }
      console.log(`${mark[item.level]} ${item.message}`);
      if (item.detail) {
        for (const line of String(item.detail).split('\n')) console.log(`        ${dim(line)}`);
      }
    }
    const { pass, warn, fail } = this.toJSON().counts;
    console.log(`\n${bold('Result')}  ${green(`${pass} ok`)}  ${warn ? yellow(`${warn} warning${warn > 1 ? 's' : ''}`) : dim('0 warnings')}  ${fail ? red(`${fail} blocker${fail > 1 ? 's' : ''}`) : dim('0 blockers')}`);
    if (!this.ok) {
      console.log(red('\nFix the blockers above before continuing. Nothing was generated.'));
    }
    console.log('');
  }

  finish({ json = false } = {}) {
    if (json) console.log(JSON.stringify(this.toJSON(), null, 2));
    else this.print();
    process.exitCode = this.ok ? 0 : 1;
    return this.ok;
  }
}

export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [key, inline] = a.slice(2).split('=');
      if (inline !== undefined) flags[key] = inline;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) flags[key] = argv[++i];
      else flags[key] = true;
    } else positional.push(a);
  }
  return { flags, positional };
}
