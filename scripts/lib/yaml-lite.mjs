// Minimal YAML reader, covering the subset qa.config.yaml uses: nested maps,
// block and inline sequences, inline maps, quoted and bare scalars, comments.
//
// Why this exists: preflight must be able to diagnose a project whose
// node_modules are missing. config.mjs prefers the real `yaml` package when it
// resolves and only falls back to this, so an installed project always gets a
// spec-complete parse.

export class YamlLiteError extends Error {
  constructor(message, line) {
    super(line ? `${message} (line ${line})` : message);
    this.name = 'YamlLiteError';
    this.line = line;
  }
}

function stripComment(s) {
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) {
      return s.slice(0, i);
    }
  }
  return s;
}

// Split a flow collection body on commas that sit at depth zero.
function splitFlow(body, line) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0) throw new YamlLiteError('unbalanced brackets', line);
  parts.push(body.slice(start));
  return parts.map((p) => p.trim()).filter((p, i, a) => !(p === '' && a.length === 1));
}

function unquote(s) {
  const q = s[0];
  const body = s.slice(1, -1);
  if (q === "'") return body.replace(/''/g, "'");
  return body.replace(/\\(["\\/nrt])/g, (_, ch) => ({ n: '\n', r: '\r', t: '\t' })[ch] ?? ch);
}

function parseScalar(raw, line) {
  const s = raw.trim();
  if (s === '' || s === '~' || s === 'null' || s === 'Null' || s === 'NULL') return null;

  if (s.startsWith('[')) {
    if (!s.endsWith(']')) throw new YamlLiteError('unterminated inline list', line);
    return splitFlow(s.slice(1, -1), line).map((v) => parseScalar(v, line));
  }
  if (s.startsWith('{')) {
    if (!s.endsWith('}')) throw new YamlLiteError('unterminated inline map', line);
    const obj = {};
    for (const entry of splitFlow(s.slice(1, -1), line)) {
      const m = entry.match(/^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:]+?)\s*:\s*([\s\S]*)$/);
      if (!m) throw new YamlLiteError(`expected "key: value" inside { } but found: ${entry}`, line);
      obj[parseScalar(m[1], line)] = parseScalar(m[2], line);
    }
    return obj;
  }
  if ((s.startsWith('"') && s.endsWith('"') && s.length > 1) ||
      (s.startsWith("'") && s.endsWith("'") && s.length > 1)) {
    return unquote(s);
  }
  if (s === 'true' || s === 'True' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === 'False' || s === 'no' || s === 'off') return false;
  if (/^-?\d+$/.test(s)) return Number.parseInt(s, 10);
  if (/^-?(\d+\.\d*|\.\d+)$/.test(s)) return Number.parseFloat(s);
  return s;
}

const KEY_VALUE = /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[^:]+?)\s*:(?:\s+([\s\S]*))?$/;

function isMapStart(s) {
  if (s.startsWith('[') || s.startsWith('{')) return false;
  return KEY_VALUE.test(s);
}

function readLines(text) {
  const out = [];
  const raw = text.split(/\r?\n/);
  for (let i = 0; i < raw.length; i++) {
    const l = raw[i];
    if (/^\s*$/.test(l) || /^\s*#/.test(l)) continue;
    if (/^\s*(---|\.\.\.)\s*$/.test(l)) continue;
    const lead = l.match(/^\s*/)[0];
    if (lead.includes('\t')) {
      throw new YamlLiteError('tab used for indentation — use spaces', i + 1);
    }
    const content = stripComment(l.slice(lead.length)).trimEnd();
    if (content === '') continue;
    out.push({ indent: lead.length, content, line: i + 1 });
  }
  return out;
}

function isSeqItem(content) {
  return content === '-' || content.startsWith('- ');
}

function parseNode(lines, start, indent) {
  if (start >= lines.length || lines[start].indent < indent) return [null, start];
  return isSeqItem(lines[start].content)
    ? parseSeq(lines, start, indent)
    : parseMap(lines, start, indent);
}

function parseSeq(lines, start, indent) {
  const arr = [];
  let i = start;
  while (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i].content)) {
    const { content, line } = lines[i];
    const rest = content === '-' ? '' : content.slice(2).trim();

    if (rest === '') {
      i += 1;
      if (i < lines.length && lines[i].indent > indent) {
        const [value, next] = parseNode(lines, i, lines[i].indent);
        arr.push(value);
        i = next;
      } else {
        arr.push(null);
      }
    } else if (isMapStart(rest)) {
      // "- key: value" — the item is a map whose first key sits on the dash line.
      const childIndent =
        i + 1 < lines.length && lines[i + 1].indent > indent ? lines[i + 1].indent : indent + 2;
      const block = [{ indent: childIndent, content: rest, line }];
      let j = i + 1;
      while (j < lines.length && lines[j].indent > indent) {
        block.push(lines[j]);
        j += 1;
      }
      const [value] = parseMap(block, 0, childIndent);
      arr.push(value);
      i = j;
    } else {
      arr.push(parseScalar(rest, line));
      i += 1;
    }
  }
  return [arr, i];
}

function parseMap(lines, start, indent) {
  const obj = {};
  let i = start;
  while (i < lines.length && lines[i].indent === indent) {
    const { content, line } = lines[i];
    if (isSeqItem(content)) throw new YamlLiteError('unexpected list item inside a mapping', line);

    const m = content.match(KEY_VALUE);
    if (!m) throw new YamlLiteError(`expected "key: value" but found: ${content}`, line);

    const key = String(parseScalar(m[1], line));
    const inline = (m[2] ?? '').trim();
    i += 1;

    if (inline !== '') {
      obj[key] = parseScalar(inline, line);
      continue;
    }
    if (i < lines.length && lines[i].indent > indent) {
      const [value, next] = parseNode(lines, i, lines[i].indent);
      obj[key] = value;
      i = next;
    } else if (i < lines.length && lines[i].indent === indent && isSeqItem(lines[i].content)) {
      // A list may sit at the same indentation as its key.
      const [value, next] = parseSeq(lines, i, indent);
      obj[key] = value;
      i = next;
    } else {
      obj[key] = null;
    }
  }
  if (i < lines.length && lines[i].indent > indent) {
    throw new YamlLiteError('unexpected indentation', lines[i].line);
  }
  return [obj, i];
}

export function parseYamlLite(text) {
  const lines = readLines(text);
  if (lines.length === 0) return {};
  const [value, next] = parseNode(lines, 0, lines[0].indent);
  if (next < lines.length) {
    throw new YamlLiteError('could not parse the rest of the file', lines[next].line);
  }
  return value;
}
