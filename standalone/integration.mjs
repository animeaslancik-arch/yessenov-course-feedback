import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = new DatabaseSync(':memory:');
for (const migration of ['0000_course_feedback.sql','0001_email_auth.sql','0002_seed_courses.sql','0003_admin_allowlist.sql']) {
  db.exec((await readFile(resolve(root, 'drizzle', migration), 'utf8')).replaceAll('--> statement-breakpoint', ''));
}

class Prepared {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  async run() { const result = db.prepare(this.sql).run(...this.args); return { meta: { changes: Number(result.changes) } }; }
}

const d1 = {
  prepare(sql) { return new Prepared(sql); },
  async batch(statements) { return Promise.all(statements.map(statement => statement.run())); },
};
const testEnv = { DB: d1, ADMIN_EMAILS: 'owner@example.test,admin@example.test' };
const worker = (await import(pathToFileURL(resolve(root, 'dist/server/index.js')))).default;
const identities = {
  owner: { id: 'owner-1', email: 'owner@example.test', name: 'Owner Admin' },
  student: { id: 'student-1', email: 'student@yessenov.edu.kz', name: 'Aruzhan Student' },
};

function request(path, { method = 'GET', identity, cookie, data } = {}) {
  const headers = new Headers();
  if (identity) {
    headers.set('oai-authenticated-user-id', identity.id);
    headers.set('oai-authenticated-user-email', identity.email);
    headers.set('oai-authenticated-user-full-name', identity.name);
  }
  if (cookie) headers.set('Cookie', cookie);
  if (method !== 'GET') headers.set('Origin', 'http://localhost');
  if (data !== undefined) headers.set('Content-Type', 'application/json');
  return new Request(`http://localhost/api${path}`, { method, headers, body: data === undefined ? undefined : JSON.stringify(data) });
}

async function call(path, options = {}) {
  const response = await worker.fetch(request(path, options), testEnv);
  const result = await response.json();
  return { response, result };
}

let out = await call('/session');
assert.deepEqual(out.result, { authenticated: false });

out = await call('/auth/register', { method: 'POST', data: { name: 'Dana Student', email: 'dana@example.com', password: 'correct-horse-battery-staple', program: 'ICT-101', language: 'de' } });
assert.equal(out.response.status, 200);
assert.equal(db.prepare('SELECT iterations FROM auth_accounts WHERE email=?').get('dana@example.com').iterations, 100000);
const passwordCookies = (out.response.headers.getSetCookie?.() ?? [out.response.headers.get('set-cookie')]).filter(Boolean).map(value => value.split(';')[0]).join('; ');
assert.match(passwordCookies, /cfs_session=/);
assert.match(passwordCookies, /cfs_unlock=/);
out = await call('/session', { cookie: passwordCookies });
assert.equal(out.result.authenticated, true);
assert.equal(out.result.authMethod, 'password');
assert.equal(out.result.user.language, 'de');
assert.equal(out.result.unlocked, true);
const danaId = db.prepare('SELECT user_id FROM auth_accounts WHERE email=?').get('dana@example.com').user_id;
db.prepare('INSERT INTO passkeys (id,user_id,public_key,counter,transports,label,created) VALUES (?,?,?,?,?,?,?)').run('test-passkey',danaId,'AA',0,'["internal"]','Test Face ID',Date.now());
out = await call('/auth/passkey/options', { method: 'POST', data: { email: 'dana@example.com' } });
assert.equal(out.response.status, 200);
assert.equal(out.result.options.rpId, 'localhost');
assert.equal(out.result.options.userVerification, 'required');
assert.equal(out.result.options.allowCredentials[0].id, 'test-passkey');
assert.equal(db.prepare('SELECT kind FROM challenges WHERE id=?').get(out.result.challengeId).kind, 'login');
out = await call('/profile', { method: 'PATCH', cookie: passwordCookies, data: { name: 'Dana Student', program: 'ICT-101', language: 'kk' } });
assert.equal(out.response.status, 200);
out = await call('/session', { cookie: passwordCookies });
assert.equal(out.result.user.language, 'kk');
out = await call('/lock', { method: 'POST', cookie: passwordCookies, data: {} });
assert.equal(out.response.status, 200);
const lockedCookies = passwordCookies.split('; ').filter(value => !value.startsWith('cfs_unlock=')).join('; ');
out = await call('/session', { cookie: lockedCookies });
assert.equal(out.result.unlocked, false);
out = await call('/auth/unlock', { method: 'POST', cookie: lockedCookies, data: { password: 'correct-horse-battery-staple' } });
assert.equal(out.response.status, 200);
out = await call('/auth/logout', { method: 'POST', cookie: passwordCookies, data: {} });
assert.equal(out.response.status, 200);
out = await call('/session', { cookie: passwordCookies });
assert.deepEqual(out.result, { authenticated: false });

out = await call('/auth/register', { method: 'POST', data: { name: 'Teacher Test', email: 'teacher@example.com', password: 'correct-horse-battery-staple', program: 'Yessenov', language: 'ru', role: 'teacher' } });
assert.equal(out.response.status, 200);
const teacherCookies = (out.response.headers.getSetCookie?.() ?? [out.response.headers.get('set-cookie')]).filter(Boolean).map(value => value.split(';')[0]).join('; ');
out = await call('/session', { cookie: teacherCookies });
assert.equal(out.result.user.role, 'teacher');

out = await call('/auth/register', { method: 'POST', data: { name: 'Admin Test', email: 'admin@example.test', password: 'correct-horse-battery-staple', program: 'Yessenov', language: 'ru', role: 'student' } });
assert.equal(out.response.status, 200);
const animeCookies = (out.response.headers.getSetCookie?.() ?? [out.response.headers.get('set-cookie')]).filter(Boolean).map(value => value.split(';')[0]).join('; ');
out = await call('/session', { cookie: animeCookies });
assert.equal(out.result.user.role, 'admin');

const productionSession = await worker.fetch(new Request('https://feedback.example.edu/api/session', {
  headers: {
    'oai-authenticated-user-id': identities.owner.id,
    'oai-authenticated-user-email': identities.owner.email,
    'oai-authenticated-user-full-name': identities.owner.name,
  },
}), testEnv);
assert.equal(productionSession.status, 200);

out = await call('/profile', { method: 'POST', identity: identities.owner, data: { name: identities.owner.name, program: 'ICT', language: 'en' } });
assert.equal(out.response.status, 200);
const ownerCookie = out.response.headers.get('set-cookie').split(';')[0];
out = await call('/session', { identity: identities.owner, cookie: ownerCookie });
assert.equal(out.result.user.role, 'admin');
assert.equal(out.result.unlocked, true);

out = await call('/admin/courses', { method: 'POST', identity: identities.owner, cookie: ownerCookie, data: { code: 'TEST101', title: 'Digital Systems', description: 'Core course', teacherId: identities.owner.id, semester: 'Fall 2026', closes: '2027-01-31', active: true } });
assert.equal(out.response.status, 200);
out = await call('/admin/courses', { identity: identities.owner, cookie: ownerCookie });
assert.equal(out.result.courses.length, 9);
assert.equal(out.result.courses.find(course => course.code === 'ENG101').teacher, 'Дина Загировна');
const courseId = out.result.courses.find(course => course.code === 'TEST101').id;

out = await call('/enroll', { method: 'POST', cookie: teacherCookies, data: { courseId } });
assert.equal(out.response.status, 403);
out = await call('/feedback', { method: 'POST', cookie: teacherCookies, data: { courseId, clarity: 5, materials: 5, support: 5, comment: 'Teacher cannot submit student feedback', anonymous: false } });
assert.equal(out.response.status, 403);

out = await call('/profile', { method: 'POST', identity: identities.student, data: { name: identities.student.name, program: 'CS-301', language: 'ru' } });
assert.equal(out.response.status, 200);
const studentCookie = out.response.headers.get('set-cookie').split(';')[0];
out = await call('/courses', { identity: identities.student });
assert.equal(out.response.status, 423);
out = await call('/enroll', { method: 'POST', identity: identities.student, cookie: studentCookie, data: { courseId } });
assert.equal(out.response.status, 200);
out = await call('/feedback', { method: 'POST', identity: identities.student, cookie: studentCookie, data: { courseId, clarity: 5, materials: 4, support: 5, comment: 'Very useful course', anonymous: true } });
assert.equal(out.response.status, 200);

out = await call('/teacher/feedback', { identity: identities.owner, cookie: ownerCookie });
assert.equal(out.result.feedback.length, 1);
assert.equal(out.result.feedback[0].student, null);
const feedbackId = out.result.feedback[0].id;
out = await call('/teacher/review', { method: 'POST', identity: identities.owner, cookie: ownerCookie, data: { id: feedbackId, response: 'Thank you for the feedback.' } });
assert.equal(out.response.status, 200);
out = await call('/notifications', { identity: identities.student, cookie: studentCookie });
assert.equal(out.result.notifications[0].kind, 'reviewed');

out = await call('/passkeys/register/options', { method: 'POST', identity: identities.student, cookie: studentCookie, data: {} });
assert.equal(out.response.status, 200);
assert.equal(out.result.options.authenticatorSelection.userVerification, 'required');
assert.equal(out.result.options.authenticatorSelection.authenticatorAttachment, 'platform');
assert.equal(out.result.options.authenticatorSelection.residentKey, 'preferred');
assert.equal(out.result.options.rp.id, 'localhost');

console.log('Email accounts, sessions, roles, course feedback, notifications, locking, and passkey options passed.');
