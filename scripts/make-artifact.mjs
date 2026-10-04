// Turns dist-artifact/index.html (a full document) into the page body that
// claude.ai wraps in its own <html><head> skeleton when publishing.
import { readFileSync, writeFileSync } from 'node:fs';

const html = readFileSync('dist-artifact/index.html', 'utf8');
// The bundled JS contains tag-like strings, so anchor on the real document
// tags: the body is the final <body>…</body>, the head is everything before it.
const bodyStart = html.lastIndexOf('<body>');
const head = html.slice(html.indexOf('<head>') + 6, html.lastIndexOf('</head>', bodyStart));
const body = html.slice(bodyStart + 6, html.lastIndexOf('</body>'));
const pick = (re) => [...head.matchAll(re)].map((m) => m[0]);

const title = pick(/<title>[\s\S]*?<\/title>/g);
const fonts = pick(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g);
const styles = pick(/<style[\s\S]*?<\/style>/g);
const scripts = pick(/<script[\s\S]*?<\/script>/g);

// Bundled libraries contain a literal U+FFFD (inside JS strings); write it as
// the equivalent escape so the file has no replacement characters.
const out = [...title, ...fonts, ...styles, body.trim(), ...scripts].join('\n').replaceAll('\uFFFD', '\\uFFFD');
writeFileSync('dist-artifact/smart-schedule.html', out);
console.log(`dist-artifact/smart-schedule.html: ${(out.length / 1024).toFixed(0)} KB`);
