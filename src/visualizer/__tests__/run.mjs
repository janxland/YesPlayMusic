/**
 * 零依赖测试运行器。
 *   pnpm exec node src/visualizer/__tests__/run.mjs
 * 或:
 *   node src/visualizer/__tests__/run.mjs
 */
import { pathToFileURL } from 'node:url';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const dir = path.dirname(
  new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
);
const files = readdirSync(dir)
  .filter(f => f.endsWith('.test.js'))
  .sort();

let passed = 0;
let failed = 0;
const failures = [];

for (const f of files) {
  const url = pathToFileURL(path.join(dir, f)).href;
  try {
    const mod = await import(url);
    const run = mod.default;
    if (typeof run !== 'function')
      throw new Error('no default export function');
    await run();
    console.log(`  ✓  ${f}`);
    passed++;
  } catch (err) {
    console.log(`  ✗  ${f}`);
    console.log(
      '     ' + (err.stack || err.message).split('\n').join('\n     ')
    );
    failed++;
    failures.push(f);
  }
}

console.log(`\n${passed} passed, ${failed} failed (${files.length} total)`);
if (failed > 0) {
  console.log('Failed: ' + failures.join(', '));
  process.exit(1);
}
