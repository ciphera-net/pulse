#!/usr/bin/env node
/**
 * Generate SHA-384 Subresource Integrity hashes for Pulse tracking scripts.
 * Runs as a prebuild step. Output is committed alongside the scripts so
 * customer embed snippets can reference the current integrity hash.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
// * script.frustration.js stays retired (14-08-2026): it recorded a CSS selector,
// * a click count and viewport x/y — the only thing Pulse ever collected below
// * page level, and the reason that decision was taken on principle.
// *
// * script.interactions.js is BACK (11-09-2026), and deliberately: the 14-08
// * decision retired the old one because it had a verified ZERO READ SURFACE and
// * had never produced a single event in five months. The read surface now exists
// * — the visit trail groups events under their page, filters by type and
// * describes them in words (round 6). Same file name, different contents, and it
// * carries no selectors and no coordinates. Supersession recorded in
// * docs/plans/14-08-2026-behavioral-tracking-removal.md.
const SCRIPTS = ['script.js', 'script.interactions.js'];

const out = {};
for (const name of SCRIPTS) {
    const filePath = path.join(PUBLIC_DIR, name);
    if (!fs.existsSync(filePath)) {
        console.warn(`[generate-sri] skipping ${name} — not found at ${filePath}`);
        continue;
    }
    const content = fs.readFileSync(filePath);
    const hash = crypto.createHash('sha384').update(content).digest('base64');
    out[name] = `sha384-${hash}`;
    console.log(`[generate-sri] ${name}: sha384-${hash}`);
}

const manifestPath = path.join(PUBLIC_DIR, 'script-sri.json');
fs.writeFileSync(manifestPath, JSON.stringify(out, null, 2) + '\n');
console.log(`[generate-sri] wrote ${manifestPath}`);
