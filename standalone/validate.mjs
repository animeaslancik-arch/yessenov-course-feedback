import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const workerPath = resolve(root, 'dist/server/index.js');
const manifestPath = resolve(root, 'dist/.openai/hosting.json');
const sourceManifestPath = resolve(root, '.openai/hosting.json');
const migrationPath = resolve(root, 'dist/.openai/drizzle/0000_course_feedback.sql');
const authMigrationPath = resolve(root, 'dist/.openai/drizzle/0001_email_auth.sql');
const courseMigrationPath = resolve(root, 'dist/.openai/drizzle/0002_seed_courses.sql');
const adminMigrationPath = resolve(root, 'dist/.openai/drizzle/0003_admin_allowlist.sql');
const [source, manifestText, sourceManifestText, migration, authMigration, courseMigration, adminMigration] = await Promise.all([
  readFile(workerPath, 'utf8'),
  readFile(manifestPath, 'utf8'),
  readFile(sourceManifestPath, 'utf8'),
  readFile(migrationPath, 'utf8'),
  readFile(authMigrationPath, 'utf8'),
  readFile(courseMigrationPath, 'utf8'),
  readFile(adminMigrationPath, 'utf8'),
]);
const manifest = JSON.parse(manifestText);
const sourceManifest = JSON.parse(sourceManifestText);
assert.match(manifest.project_id, /^appgprj_[a-z0-9]+$/);
assert.equal(manifest.project_id, sourceManifest.project_id);
assert.equal(manifest.d1, 'DB');
assert.equal('static' in manifest, false);
assert.match(source, /export default\s*\{/);
assert.match(source, /authenticatorAttachment/);
assert.match(source, /handleApi\(request, env\)/);
assert.match(source, /\/auth\/login/);
assert.match(source, /\/auth\/passkey\/options/);
assert.match(migration, /CREATE TABLE `feedback`/);
assert.match(authMigration, /CREATE TABLE `auth_accounts`/);
assert.match(authMigration, /CREATE TABLE `auth_sessions`/);
assert.match(courseMigration, /'ENG101','Английский язык'/);
assert.match(courseMigration, /'teacher-dina-zagirovna'/);
assert.match(adminMigration, /ADMIN_EMAILS/);
assert.doesNotMatch(adminMigration, /@/);
assert.match(source, /ADMIN_EMAILS/);
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const worker = await import(moduleUrl);
assert.equal(typeof worker.default?.fetch, 'function');
const page = await worker.default.fetch(new Request('http://localhost/'), {});
assert.equal(page.status, 200);
const pageText = await page.text();
assert.match(pageText, /Course Feedback System/i);
assert.match(pageText, /\/app\.v2\.css/);
assert.match(pageText, /class="screen landing-screen is-active"/);
assert.match(pageText, /id="authDialog"/);
assert.match(pageText, /data-lt="heroLine1"/);
assert.match(pageText, /class="notification-glyph"/);
assert.match(pageText, /portal\.js\?v=11/);
const css = await worker.default.fetch(new Request('http://localhost/app.v2.css'), {});
assert.equal(css.headers.get('content-type'), 'text/css; charset=utf-8');
assert.equal(css.headers.get('cache-control'), 'no-cache, must-revalidate');
const cssText = await css.text();
assert.match(cssText, /\.landing-screen/);
assert.match(cssText, /\.product-stage/);
assert.match(cssText, /\.auth-dialog/);
assert.match(cssText, /\.settings-layout/);
assert.match(cssText, /\.notification-glyph/);
assert.match(cssText, /@media \(max-width: 580px\)/);
const missing = await worker.default.fetch(new Request('http://localhost/unknown'), {});
assert.equal(missing.status, 404);
console.log('Artifact, manifest, migration, and asset routes are valid.');
