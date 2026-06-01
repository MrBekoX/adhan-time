#!/usr/bin/env node
// lint-staged eslint runner. lint-staged appends the staged *.{ts,tsx} paths as
// argv; we drop the ones eslint ignores (.eslintrc.cjs ignorePatterns includes
// `supabase/functions/`, the Deno edge code) before invoking eslint. Without
// this, eslint 8 prints "File ignored because of a matching ignore pattern" for
// those explicit paths, which trips `--max-warnings=0` and fails every commit
// that touches an edge function. eslint 8 has no --no-warn-ignored flag.
//
// eslint is invoked via `node <eslint.js>` (not the .cmd shim) so it works
// identically on Windows and POSIX.

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

// Path-segment match so it works for both relative (supabase/functions/...) and
// absolute (.../adhan-time/supabase/functions/...) paths lint-staged may pass.
const ESLINT_IGNORED = [/(^|\/)supabase\/functions\//];

const files = process.argv.slice(2).filter((f) => {
  const p = f.replace(/\\/g, '/');
  return !ESLINT_IGNORED.some((re) => re.test(p));
});

if (files.length === 0) process.exit(0);

// eslint's package "exports" does not expose ./bin/eslint.js, so resolve the
// package dir via its package.json and join the bin path. Run it through `node`
// (not the .cmd shim) for identical behavior on Windows and POSIX. The real CLI
// keeps the correct --fix + --max-warnings semantics (only REMAINING problems
// after autofix count).
const require = createRequire(import.meta.url);
const eslintBin = path.join(path.dirname(require.resolve('eslint/package.json')), 'bin', 'eslint.js');

try {
  execFileSync(process.execPath, [eslintBin, '--fix', '--max-warnings=0', ...files], {
    stdio: 'inherit',
  });
} catch {
  process.exit(1);
}
