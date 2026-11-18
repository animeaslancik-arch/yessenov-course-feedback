import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const fromRoot = (...parts) => resolve(root, ...parts);

const [configSource, webauthnSource, apiSource, html, baseCss, portalCss, portalJs, favicon, photo, manifest] = await Promise.all([
  readFile(fromRoot('server/config.mjs'), 'utf8'),
  readFile(fromRoot('server/webauthn.mjs'), 'utf8'),
  readFile(fromRoot('server/api.mjs'), 'utf8'),
  readFile(fromRoot('app/portal.html'), 'utf8'),
  readFile(fromRoot('public/styles.css'), 'utf8'),
  readFile(fromRoot('public/portal.css'), 'utf8'),
  readFile(fromRoot('public/portal.js'), 'utf8'),
  readFile(fromRoot('public/favicon.svg'), 'utf8'),
  readFile(fromRoot('public/assets/yessenov.jpg')),
  readFile(fromRoot('.openai/hosting.json'), 'utf8'),
]);

const config = configSource.replace(/^export\s+/gm, '');
const webauthn = webauthnSource.replace(/^export\s+/gm, '');
const api = apiSource.replace(/^import\s+.*?;\r?\n/gm, '').replace(/^export\s+/gm, '');

const worker = `${config}

const webauthn = (() => {
${webauthn}
return { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse };
})();
const { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } = webauthn;

${api}

const PORTAL_HTML = ${JSON.stringify(html)};
const APP_CSS = ${JSON.stringify(`${baseCss}\n${portalCss}`)};
const PORTAL_JS = ${JSON.stringify(portalJs)};
const FAVICON = ${JSON.stringify(favicon)};
const PHOTO_BASE64 = ${JSON.stringify(photo.toString('base64'))};
let photoBytes;

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), publickey-credentials-get=(self), publickey-credentials-create=(self)',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
};

function pageResponse() {
  return new Response(PORTAL_HTML, { headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

function assetResponse(body, type, cache = 'public, max-age=3600') {
  return new Response(body, { headers: { ...SECURITY_HEADERS, 'Content-Type': type, 'Cache-Control': cache } });
}

function decodePhoto() {
  if (photoBytes) return photoBytes;
  const binary = atob(PHOTO_BASE64);
  photoBytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return photoBytes;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return handleApi(request, env);
    if (url.pathname === '/' || url.pathname === '/index.html') return pageResponse();
    if (url.pathname === '/app.v2.css') return assetResponse(APP_CSS, 'text/css; charset=utf-8', 'no-cache, must-revalidate');
    if (url.pathname === '/portal.js') return assetResponse(PORTAL_JS, 'text/javascript; charset=utf-8', 'no-cache, must-revalidate');
    if (url.pathname === '/favicon.svg') return assetResponse(FAVICON, 'image/svg+xml; charset=utf-8', 'public, max-age=86400');
    if (url.pathname === '/assets/yessenov.jpg') return assetResponse(decodePhoto(), 'image/jpeg', 'public, max-age=86400');
    return new Response('Not found', { status: 404, headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
`;

const dist = fromRoot('dist');
await rm(dist, { recursive: true, force: true });
await mkdir(fromRoot('dist/server'), { recursive: true });
await mkdir(fromRoot('dist/.openai'), { recursive: true });
await writeFile(fromRoot('dist/server/index.js'), worker);
await writeFile(fromRoot('dist/.openai/hosting.json'), manifest);
await cp(fromRoot('drizzle'), fromRoot('dist/.openai/drizzle'), { recursive: true });
console.log(`Built ${fromRoot('dist/server/index.js')} (${Buffer.byteLength(worker)} bytes)`);
