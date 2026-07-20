// Empty browser stub for Node's `fs`. @ciphera-net/tessera ships an isomorphic WASM
// loader whose Node target does `require('fs').readFileSync(...)`. That branch is
// gated behind isNode() and is NEVER reached in the browser (the web target loads
// the .wasm via fetch), but the bundler still traverses it and would fail on the
// missing `fs` builtin. This stub is aliased in for the browser build only
// (next.config: turbopack.resolveAlias + webpack resolve.fallback) so the import
// resolves; readFileSync is never actually called client-side.
module.exports = {}
