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
const SCRIPTS = ['script.js', 'script.frustration.js'];

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
