// Tokenize test/sample.org with the real TextMate engine and check key scopes.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vsctm from 'vscode-textmate';
import onig from 'vscode-oniguruma';

const require = createRequire(import.meta.url);
const root = new URL('..', import.meta.url);
await onig.loadWASM(readFileSync(require.resolve('vscode-oniguruma/release/onig.wasm')).buffer);

const registry = new vsctm.Registry({
  onigLib: Promise.resolve({ createOnigScanner: p => new onig.OnigScanner(p), createOnigString: s => new onig.OnigString(s) }),
  // Other scopes (source.python etc.) get an empty stub; the iPhone app ships the real ones.
  loadGrammar: async scope => scope === 'text.orgmode'
    ? vsctm.parseRawGrammar(readFileSync(new URL('Syntaxes/Org.tmLanguage', root), 'utf8'), 'Org.tmLanguage')
    : { scopeName: scope, patterns: [] },
});
const grammar = await registry.loadGrammar('text.orgmode');

// Each check: [line number (1-based), token text, scope that must be on it]
const checks = [
  [1, 'TITLE', 'keyword.control.pragma.orgmode'],
  [2, '*', 'punctuation.definition.heading.orgmode'],
  [2, 'TODO', 'keyword.other.todo.orgmode'],
  [2, '[#A]', 'constant.other.priority.orgmode'],
  [3, 'bold', 'markup.bold.orgmode'],
  [3, 'italic', 'markup.italic.orgmode'],
  [3, 'under', 'markup.underline.orgmode'],
  [3, 'code', 'markup.raw.inline.orgmode'],
  [4, '-', 'keyword.operator.list.orgmode'],
  [5, '[X]', 'keyword.operator.checkbox.orgmode'],
  [6, 'term', 'meta.list.definition.orgmode'],
  [8, '# a comment', 'comment.line.number-sign.orgmode'],
  [9, '-----', 'meta.separator.orgmode'],
  [10, 'Org', 'meta.link.orgmode'],
  [10, 'http://example.com', 'markup.underline.url.orgmode'],
  [12, 'abc', 'meta.drawer.properties.orgmode'],
  [15, 'print', 'meta.block.source.python.orgmode'],
  [18, 'quoted text', 'markup.quote.orgmode'],
  // Issue #2: a heading that starts with a timestamp is still a heading.
  [20, '*', 'punctuation.definition.heading.orgmode'],
  [20, '<2021-03-17 Wed>', 'markup.heading.orgmode'],
  [21, 'TODO', 'keyword.other.todo.orgmode'],
  [21, '[2021-03-17 Wed]', 'markup.heading.orgmode'],
];

const lines = readFileSync(new URL('test/sample.org', root), 'utf8').split('\n');
const tokens = [];
let state = vsctm.INITIAL;
for (const line of lines) {
  const r = grammar.tokenizeLine(line, state);
  tokens.push(r.tokens.map(t => ({ text: line.slice(t.startIndex, t.endIndex), scopes: t.scopes })));
  state = r.ruleStack;
}

let failed = 0;
for (const [n, text, scope] of checks) {
  const hits = tokens[n - 1].filter(t => t.text.includes(text) || text.includes(t.text) && t.text.trim());
  const ok = hits.some(t => t.scopes.includes(scope));
  if (!ok) {
    failed++;
    console.log(`FAIL line ${n} "${text}" missing ${scope}`);
    for (const t of tokens[n - 1]) console.log(`    ${JSON.stringify(t.text)} ${t.scopes.join(' ')}`);
  }
}
console.log(`${checks.length - failed}/${checks.length} checks passed`);
process.exit(failed ? 1 : 0);
