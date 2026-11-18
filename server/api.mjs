import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from './webauthn.mjs';
import { accountRole, isAdminEmail } from './config.mjs';

const now = () => Date.now();
const uid = () => crypto.randomUUID();
const enc = new TextEncoder();
const b64 = value => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 32768) binary += String.fromCharCode(...bytes.subarray(index, index + 32768));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};
const unb64 = value => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
};
const json = (data, status = 200, headers = {}) => {
  const responseHeaders = new Headers(headers);
  responseHeaders.set('Cache-Control', 'no-store');
  responseHeaders.set('X-Content-Type-Options', 'nosniff');
  return Response.json(data, {status, headers:responseHeaders});
};
const fail = (code, status = 400) => { throw Object.assign(new Error(code), {status}); };
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail('invalid_input');
  return value.trim();
};
const language = value => ['en','ru','de','kk'].includes(value) ? value : 'ru';
const hash = async token => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token))));
const namedCookie = (request, name) => request.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length + 1);
const cookieValue = request => namedCookie(request, 'cfs_unlock');
const sessionCookieValue = request => namedCookie(request, 'cfs_session');
const cookie = (token, origin, age = 43200) => `cfs_unlock=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${origin.startsWith('https:') ? '; Secure' : ''}`;
const sessionCookie = (token, origin, age = 2592000) => `cfs_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${origin.startsWith('https:') ? '; Secure' : ''}`;
const normalizeEmail = value => {
  const email = text(value, 254, true).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('invalid_email');
  return email;
};
const passwordValue = value => {
  if (typeof value !== 'string' || value.length < 10 || value.length > 128) fail('weak_password');
  return value;
};
async function derivePassword(password, salt, iterations = 100000) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt, iterations}, key, 256);
  return b64(new Uint8Array(bits));
}
function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i); return diff === 0;
}
function platformUser(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  if (!id) return null;
  const email = request.headers.get('oai-authenticated-user-email') || '';
  let name = request.headers.get('oai-authenticated-user-full-name') || email.split('@')[0];
  if (request.headers.get('oai-authenticated-user-full-name-encoding') === 'percent-encoded-utf-8') { try {name = decodeURIComponent(name);} catch {name = email.split('@')[0];} }
  return {id, email, name};
}
async function requestIdentity(db, request) {
  const platform = platformUser(request);
  if (platform) return {...platform, authMethod:'platform'};
  const token = sessionCookieValue(request);
  if (!token || token.length > 200) return null;
  const row = await db.prepare('SELECT users.id,users.email,users.name FROM auth_sessions JOIN users ON users.id=auth_sessions.user_id WHERE auth_sessions.token=? AND auth_sessions.expires>?').bind(await hash(token),now()).first();
  return row ? {id:row.id,email:row.email,name:row.name,authMethod:'password'} : null;
}
async function body(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) fail('json_required',415);
  const reader = request.body?.getReader(); if (!reader) fail('invalid_input');
  let length=0; const parts=[];
  while(true) { const {done,value}=await reader.read(); if(done)break; length+=value.length; if(length>32768){await reader.cancel();fail('too_large',413);} parts.push(value); }
  try {
    const joined = new Uint8Array(length); let offset = 0;
    for (const part of parts) { joined.set(part, offset); offset += part.length; }
    const value=JSON.parse(new TextDecoder().decode(joined)); if(!value || Array.isArray(value) || typeof value!=='object') fail('invalid_input'); return value;
  } catch {fail('invalid_input');}
}
function expectedOrigin(request) {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return url.origin;
  if (['localhost','127.0.0.1'].includes(url.hostname) && url.protocol === 'http:') return url.origin;
  fail('invalid_origin',403);
}
async function limited(db, userId, path) {
  const limit = path.includes('passkeys') ? 20 : 90;
  const time=now(), id=`${userId}:${path}:${Math.floor(time/60000)}`;
  const row = await db.prepare('INSERT INTO rate_limits (id,hits,expires) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET hits=hits+1 RETURNING hits').bind(id,time+120000).first();
  if(row.hits>limit)fail('rate_limited',429);
  // Expired ephemeral records are cleaned periodically instead of delaying every sign-in.
  if((crypto.getRandomValues(new Uint8Array(1))[0]&31)===0)await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE expires < ?').bind(time),
    db.prepare('DELETE FROM challenges WHERE expires < ?').bind(time),
    db.prepare('DELETE FROM unlocks WHERE expires < ?').bind(time),
    db.prepare('DELETE FROM auth_sessions WHERE expires < ?').bind(time),
  ]);
}
async function unlocked(db, request, user) {
  const token=cookieValue(request); if(!token || token.length>200)return false;
  return !!await db.prepare('SELECT token FROM unlocks WHERE token=? AND user_id=? AND expires>?').bind(await hash(token),user.id,now()).first();
}
async function issueUnlock(db, request, user, method, origin) {
  const token=b64(crypto.getRandomValues(new Uint8Array(32))), old=cookieValue(request);
  const queries=[db.prepare('INSERT INTO unlocks (token,user_id,method,expires) VALUES (?,?,?,?)').bind(await hash(token),user.id,method,now()+43200000)];
  if(old)queries.push(db.prepare('DELETE FROM unlocks WHERE token=? AND user_id=?').bind(await hash(old),user.id));
  await db.batch(queries); return json({ok:true,method},200,{'Set-Cookie':cookie(token,origin)});
}
async function issuePasswordSession(db, request, user, origin, method = 'password') {
  const sessionToken=b64(crypto.getRandomValues(new Uint8Array(32))), unlockToken=b64(crypto.getRandomValues(new Uint8Array(32))), time=now();
  const oldSession=sessionCookieValue(request), oldUnlock=cookieValue(request), queries=[
    db.prepare('INSERT INTO auth_sessions (token,user_id,expires,created) VALUES (?,?,?,?)').bind(await hash(sessionToken),user.id,time+2592000000,time),
    db.prepare('INSERT INTO unlocks (token,user_id,method,expires) VALUES (?,?,?,?)').bind(await hash(unlockToken),user.id,method,time+43200000),
  ];
  if(oldSession)queries.push(db.prepare('DELETE FROM auth_sessions WHERE token=?').bind(await hash(oldSession)));
  if(oldUnlock)queries.push(db.prepare('DELETE FROM unlocks WHERE token=?').bind(await hash(oldUnlock)));
  await db.batch(queries);
  const headers=new Headers();headers.append('Set-Cookie',sessionCookie(sessionToken,origin));headers.append('Set-Cookie',cookie(unlockToken,origin));
  return json({ok:true},200,headers);
}
async function requireProfile(db, identity) { const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(identity.id).first(); if(!user)fail('profile_required',409); return user; }
function staff(user) { if(!['teacher','admin'].includes(user.role))fail('forbidden',403); }
function admin(user) { if(user.role!=='admin')fail('forbidden',403); }
async function getCourse(db, id) {const row=await db.prepare('SELECT * FROM courses WHERE id=?').bind(id).first();if(!row)fail('not_found',404);return row;}
function canReview(user, course) {staff(user);if(user.role!=='admin' && course.teacher_id!==user.id)fail('forbidden',403);}
function validDate(value) {const d=text(value,10,true); if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)fail('invalid_date'); return d;}
const isOpen = course => !!course.active && now() <= Date.parse(course.closes+'T23:59:59+05:00');
async function teacherId(db, value) {if(value===null||value==='')return null; const id=text(value,200,true);const user=await db.prepare("SELECT id FROM users WHERE id=? AND role IN ('teacher','admin')").bind(id).first();if(!user)fail('invalid_teacher');return id;}

export async function handleApi(request, env) {
  try {
    const db=env.DB;if(!db)fail('database_unavailable',503);
    const path=new URL(request.url).pathname.slice(4), method=request.method;
    const origin=expectedOrigin(request);
    if(method!=='GET'&&request.headers.get('Origin')!==origin)fail('invalid_origin',403);
    if(path==='/auth/register'&&method==='POST') {
      const b=await body(request), email=normalizeEmail(b.email), password=passwordValue(b.password), name=text(b.name,80,true), program=text(b.program??'',120);
      await limited(db,`register:${await hash(email)}`,path);
      if(await db.prepare('SELECT user_id FROM auth_accounts WHERE email=?').bind(email).first())fail('email_exists',409);
      const salt=crypto.getRandomValues(new Uint8Array(16)), passwordHash=await derivePassword(password,salt), id=uid(), time=now(), role=accountRole(env,email,b.role);
      await db.batch([
        db.prepare('INSERT INTO users (id,email,name,role,program,language,created) VALUES (?,?,?,?,?,?,?)').bind(id,email,name,role,program,language(b.language),time),
        db.prepare('INSERT INTO auth_accounts (user_id,email,password_hash,salt,iterations,created) VALUES (?,?,?,?,?,?)').bind(id,email,passwordHash,b64(salt),100000,time),
      ]);
      return issuePasswordSession(db,request,{id,email,name},origin);
    }
    if(path==='/auth/login'&&method==='POST') {
      const b=await body(request), email=normalizeEmail(b.email), password=passwordValue(b.password);
      await limited(db,`login:${await hash(email)}`,path);
      const account=await db.prepare('SELECT auth_accounts.*,users.name FROM auth_accounts JOIN users ON users.id=auth_accounts.user_id WHERE auth_accounts.email=?').bind(email).first();
      if(!account||!safeEqual(await derivePassword(password,unb64(account.salt),account.iterations),account.password_hash))fail('invalid_credentials',401);
      return issuePasswordSession(db,request,{id:account.user_id,email,name:account.name},origin);
    }
    if(path==='/auth/passkey/options'&&method==='POST') {
      const b=await body(request), email=normalizeEmail(b.email);
      await limited(db,`passkey-login:${await hash(email)}`,path);
      const keys=(await db.prepare('SELECT users.id AS user_id,passkeys.id,passkeys.transports FROM auth_accounts JOIN users ON users.id=auth_accounts.user_id JOIN passkeys ON passkeys.user_id=users.id WHERE auth_accounts.email=?').bind(email).all()).results;
      if(!keys.length)fail('passkey_unavailable',409);
      const options=await generateAuthenticationOptions({rpID:new URL(origin).hostname,userVerification:'required',allowCredentials:keys.map(key=>({id:key.id,transports:JSON.parse(key.transports)}))});
      const challengeId=uid();
      await db.prepare('INSERT INTO challenges (id,user_id,challenge,kind,expires) VALUES (?,?,?,?,?)').bind(challengeId,keys[0].user_id,options.challenge,'login',now()+300000).run();
      return json({options,challengeId});
    }
    if(path==='/auth/passkey/verify'&&method==='POST') {
      const b=await body(request), challengeId=text(b.challengeId,200,true);
      const challenge=await db.prepare("DELETE FROM challenges WHERE id=? AND kind='login' AND expires>? RETURNING challenge,user_id").bind(challengeId,now()).first();
      if(!challenge)fail('challenge_expired',409);
      await limited(db,challenge.user_id,path);
      const key=await db.prepare('SELECT passkeys.*,users.email AS user_email,users.name AS user_name FROM passkeys JOIN users ON users.id=passkeys.user_id WHERE passkeys.id=? AND passkeys.user_id=?').bind(text(b.response?.id,2000,true),challenge.user_id).first();
      if(!key)fail('invalid_passkey',401);
      let verification;try {verification=await verifyAuthenticationResponse({response:b.response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:new URL(origin).hostname,credential:{id:key.id,publicKey:unb64(key.public_key),counter:key.counter}});}catch{fail('invalid_passkey',401);}
      if(!verification.verified)fail('invalid_passkey',401);
      const updated=await db.prepare('UPDATE passkeys SET counter=? WHERE id=? AND user_id=? AND counter=?').bind(verification.authenticationInfo.newCounter,key.id,challenge.user_id,key.counter).run();
      if(!updated.meta.changes)fail('invalid_passkey',401);
      return issuePasswordSession(db,request,{id:challenge.user_id,email:key.user_email,name:key.user_name},origin,'passkey');
    }
    if(path==='/auth/logout'&&method==='POST') {
      const sessionToken=sessionCookieValue(request), unlockToken=cookieValue(request), queries=[];
      if(sessionToken)queries.push(db.prepare('DELETE FROM auth_sessions WHERE token=?').bind(await hash(sessionToken)));
      if(unlockToken)queries.push(db.prepare('DELETE FROM unlocks WHERE token=?').bind(await hash(unlockToken)));
      if(queries.length)await db.batch(queries);
      const headers=new Headers();headers.append('Set-Cookie',sessionCookie('',origin,0));headers.append('Set-Cookie',cookie('',origin,0));
      return json({ok:true},200,headers);
    }
    const identity=await requestIdentity(db,request);
    if(!identity) { if(path==='/session'&&method==='GET')return json({authenticated:false}); fail('sign_in_required',401); }
    if(method!=='GET') {
      await limited(db, identity.id, path);
    }
    if(path==='/session'&&method==='GET') {
      const user=await db.prepare('SELECT * FROM users WHERE id=?').bind(identity.id).first();
      const count=user?await db.prepare('SELECT COUNT(*) AS n FROM passkeys WHERE user_id=?').bind(user.id).first():{n:0};
      return json({authenticated:true,authMethod:identity.authMethod,identity,user,hasPasskey:count.n>0,unlocked:user?await unlocked(db,request,user):false});
    }
    if(path==='/profile'&&method==='POST') {
      const b=await body(request), name=text(b.name,80,true), program=text(b.program??'',120);
      if(await db.prepare('SELECT id FROM users WHERE id=?').bind(identity.id).first())fail('already_registered',409);
      const role=accountRole(env,identity.email,b.role);
      await db.prepare('INSERT INTO users (id,email,name,role,program,language,created) VALUES (?,?,?,?,?,?,?)').bind(identity.id,identity.email,name,role,program,language(b.language),now()).run();
      return issueUnlock(db,request,identity,'chatgpt',origin);
    }
    const user=await requireProfile(db,identity);
    if(path==='/unlock/platform'&&method==='POST') {if(identity.authMethod!=='platform')fail('forbidden',403);await body(request);return issueUnlock(db,request,user,'chatgpt',origin);}
    if(path==='/auth/unlock'&&method==='POST') {
      const b=await body(request), password=passwordValue(b.password), account=await db.prepare('SELECT password_hash,salt,iterations FROM auth_accounts WHERE user_id=?').bind(user.id).first();
      if(!account||!safeEqual(await derivePassword(password,unb64(account.salt),account.iterations),account.password_hash))fail('invalid_credentials',401);
      return issueUnlock(db,request,user,'password',origin);
    }
    if(path==='/lock'&&method==='POST') {
      await body(request);const token=cookieValue(request);if(token)await db.prepare('DELETE FROM unlocks WHERE token=? AND user_id=?').bind(await hash(token),user.id).run();
      return json({ok:true},200,{'Set-Cookie':cookie('',origin,0)});
    }
    // This flow re-verifies a passkey for an account that already has a session.
    if(path==='/passkeys/authenticate/options'&&method==='POST') {
      await body(request);const keys=(await db.prepare('SELECT id,transports FROM passkeys WHERE user_id=?').bind(user.id).all()).results;
      if(!keys.length)fail('no_passkey',409);
      const options=await generateAuthenticationOptions({rpID:new URL(origin).hostname,userVerification:'required',allowCredentials:keys.map(k=>({id:k.id,transports:JSON.parse(k.transports)}))});
      const challengeId=uid();await db.prepare('INSERT INTO challenges (id,user_id,challenge,kind,expires) VALUES (?,?,?,?,?)').bind(challengeId,user.id,options.challenge,'authenticate',now()+300000).run();
      return json({options,challengeId});
    }
    if(path==='/passkeys/authenticate/verify'&&method==='POST') {
      const b=await body(request), challengeId=text(b.challengeId,100,true);
      const challenge=await db.prepare("DELETE FROM challenges WHERE id=? AND user_id=? AND kind='authenticate' AND expires>? RETURNING challenge").bind(challengeId,user.id,now()).first();
      if(!challenge)fail('challenge_expired',409);
      const key=await db.prepare('SELECT * FROM passkeys WHERE id=? AND user_id=?').bind(text(b.response?.id,2000,true),user.id).first();if(!key)fail('invalid_passkey',401);
      let verification;try {verification=await verifyAuthenticationResponse({response:b.response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:new URL(origin).hostname,credential:{id:key.id,publicKey:unb64(key.public_key),counter:key.counter}});}catch{fail('invalid_passkey',401);}
      if(!verification.verified)fail('invalid_passkey',401);
      const updated=await db.prepare('UPDATE passkeys SET counter=? WHERE id=? AND user_id=? AND counter=?').bind(verification.authenticationInfo.newCounter,key.id,user.id,key.counter).run();if(!updated.meta.changes)fail('invalid_passkey',401);
      return issueUnlock(db,request,user,'passkey',origin);
    }
    if(!await unlocked(db,request,user))fail('locked',423);
    if(path==='/profile'&&method==='PATCH') {
      const b=await body(request);await db.prepare('UPDATE users SET name=?,program=?,language=? WHERE id=?').bind(text(b.name,80,true),text(b.program??'',120),language(b.language),user.id).run();return json({ok:true});
    }
    if(path==='/courses'&&method==='GET') {
      const rows=(await db.prepare(`SELECT c.*, u.name AS teacher, e.id AS enrollment_id, f.id AS feedback_id, f.status AS feedback_status, (f.clarity+f.materials+f.support)/3.0 AS rating FROM courses c LEFT JOIN users u ON u.id=c.teacher_id LEFT JOIN enrollments e ON e.course_id=c.id AND e.user_id=? LEFT JOIN feedback f ON f.course_id=c.id AND f.user_id=? WHERE c.active=1 OR e.id IS NOT NULL ORDER BY c.created DESC`).bind(user.id,user.id).all()).results;
      return json({courses:rows.map(c=>({...c,open:isOpen(c)}))});
    }
    if(path==='/enroll'&&method==='POST') {
      if(user.role!=='student')fail('forbidden',403);
      const b=await body(request), course=await getCourse(db,text(b.courseId,100,true));if(!isOpen(course))fail('course_closed',409);
      await db.prepare('INSERT INTO enrollments (id,user_id,course_id,created) VALUES (?,?,?,?) ON CONFLICT(user_id,course_id) DO NOTHING').bind(uid(),user.id,course.id,now()).run();return json({ok:true});
    }
    if(path==='/feedback'&&method==='GET') {
      const rows=(await db.prepare('SELECT f.*,c.title,c.code,c.closes,c.active FROM feedback f JOIN courses c ON c.id=f.course_id WHERE f.user_id=? ORDER BY f.created DESC').bind(user.id).all()).results;
      return json({feedback:rows.map(({user_id,...f})=>({...f,editable:f.status==='submitted'&&isOpen(f)}))});
    }
    if(path==='/feedback'&&(method==='POST'||method==='PATCH')) {
      if(user.role!=='student')fail('forbidden',403);
      const b=await body(request), course=await getCourse(db,text(b.courseId,100,true));
      if(!isOpen(course))fail('course_closed',409);
      if(!await db.prepare('SELECT id FROM enrollments WHERE course_id=? AND user_id=?').bind(course.id,user.id).first())fail('not_enrolled',403);
      const ratings=['clarity','materials','support'].map(k=>b[k]);if(ratings.some(n=>!Number.isInteger(n)||n<1||n>5)||typeof b.anonymous!=='boolean')fail('invalid_input');
      const comment=text(b.comment??'',2000), time=now();
      if(method==='POST') {
        const result=await db.prepare("INSERT INTO feedback (id,user_id,course_id,clarity,materials,support,comment,anonymous,status,response,created,updated) VALUES (?,?,?,?,?,?,?,?, 'submitted','',?,?) ON CONFLICT(user_id,course_id) DO NOTHING").bind(uid(),user.id,course.id,...ratings,comment,Number(b.anonymous),time,time).run();
        if(!result.meta.changes)fail('already_submitted',409);
      } else {
        const result=await db.prepare("UPDATE feedback SET clarity=?,materials=?,support=?,comment=?,anonymous=?,updated=? WHERE user_id=? AND course_id=? AND status='submitted'").bind(...ratings,comment,Number(b.anonymous),time,user.id,course.id).run();if(!result.meta.changes)fail('cannot_edit',409);
      }
      return json({ok:true});
    }
    if(path==='/notifications'&&method==='GET')return json({notifications:(await db.prepare('SELECT id,kind,course,is_read,created FROM notifications WHERE user_id=? ORDER BY created DESC LIMIT 100').bind(user.id).all()).results});
    if(path==='/notifications/read'&&method==='POST') {await body(request);await db.prepare('UPDATE notifications SET is_read=1 WHERE user_id=?').bind(user.id).run();return json({ok:true});}
    if(path==='/passkeys'&&method==='GET')return json({passkeys:(await db.prepare('SELECT id,label,created FROM passkeys WHERE user_id=? ORDER BY created DESC').bind(user.id).all()).results});
    if(path==='/passkeys/register/options'&&method==='POST') {
      await body(request);const keys=(await db.prepare('SELECT id FROM passkeys WHERE user_id=?').bind(user.id).all()).results;if(keys.length>=10)fail('passkey_limit',409);
      const options=await generateRegistrationOptions({rpName:'Yessenov Course Feedback',rpID:new URL(origin).hostname,userID:enc.encode(user.id),userName:user.email||user.id,userDisplayName:user.name,attestationType:'none',authenticatorSelection:{authenticatorAttachment:'platform',residentKey:'preferred',userVerification:'required'},excludeCredentials:keys.map(k=>({id:k.id}))});
      const challengeId=uid();await db.prepare('INSERT INTO challenges (id,user_id,challenge,kind,expires) VALUES (?,?,?,?,?)').bind(challengeId,user.id,options.challenge,'register',now()+300000).run();return json({options,challengeId});
    }
    if(path==='/passkeys/register/verify'&&method==='POST') {
      const b=await body(request), challengeId=text(b.challengeId,100,true), label=text(b.label??'Passkey',80,true);
      const challenge=await db.prepare("DELETE FROM challenges WHERE id=? AND user_id=? AND kind='register' AND expires>? RETURNING challenge").bind(challengeId,user.id,now()).first();if(!challenge)fail('challenge_expired',409);
      let verified;try{verified=await verifyRegistrationResponse({response:b.response,expectedChallenge:challenge.challenge,expectedOrigin:origin,expectedRPID:new URL(origin).hostname});}catch{fail('invalid_passkey',400);}
      if(!verified.verified)fail('invalid_passkey',400);const key=verified.registrationInfo.credential;
      await db.prepare('INSERT INTO passkeys (id,user_id,public_key,counter,transports,label,created) VALUES (?,?,?,?,?,?,?)').bind(key.id,user.id,b64(key.publicKey),key.counter,JSON.stringify(key.transports||[]),label,now()).run();return json({ok:true});
    }
    if(path==='/passkeys'&&method==='DELETE') {const b=await body(request);await db.prepare('DELETE FROM passkeys WHERE id=? AND user_id=?').bind(text(b.id,2000,true),user.id).run();return json({ok:true});}
    if(path==='/teacher/feedback'&&method==='GET') {
      staff(user);
      const rows=(await db.prepare(`SELECT f.id,f.course_id,f.clarity,f.materials,f.support,f.comment,f.anonymous,f.status,f.response,f.created,c.title,c.code,CASE WHEN f.anonymous=1 THEN NULL ELSE u.name END AS student FROM feedback f JOIN courses c ON c.id=f.course_id JOIN users u ON u.id=f.user_id WHERE (?='admin' OR c.teacher_id=?) ORDER BY f.created DESC LIMIT 1000`).bind(user.role,user.id).all()).results;
      return json({feedback:rows});
    }
    if(path==='/teacher/review'&&method==='POST') {
      staff(user);const b=await body(request), f=await db.prepare('SELECT * FROM feedback WHERE id=?').bind(text(b.id,100,true)).first();if(!f)fail('not_found',404);
      const course=await getCourse(db,f.course_id);canReview(user,course);const response=text(b.response,2000,true);
      await db.batch([db.prepare("UPDATE feedback SET response=?,status='reviewed',updated=? WHERE id=?").bind(response,now(),f.id),db.prepare("INSERT INTO notifications (id,user_id,kind,course,is_read,created) VALUES (?,?,'reviewed',?,0,?)").bind(uid(),f.user_id,course.title,now())]);return json({ok:true});
    }
    if(path.startsWith('/admin/'))admin(user);
    if(path==='/admin/users'&&method==='GET')return json({users:(await db.prepare('SELECT id,name,email,role,program FROM users ORDER BY created DESC LIMIT 500').all()).results});
    if(path==='/admin/role'&&method==='PATCH') {
      const b=await body(request), id=text(b.id,200,true);if(!['student','teacher','admin'].includes(b.role))fail('invalid_input');
      const target=await db.prepare('SELECT * FROM users WHERE id=?').bind(id).first();if(!target)fail('not_found',404);if(isAdminEmail(env,target.email)||id===user.id)fail('owner_role_protected',409);if(b.role==='admin'&&!isAdminEmail(env,target.email))fail('admin_email_not_allowed',403);
      if(b.role==='student'&&await db.prepare('SELECT id FROM courses WHERE teacher_id=? LIMIT 1').bind(id).first())fail('teacher_has_courses',409);
      await db.prepare('UPDATE users SET role=? WHERE id=?').bind(b.role,id).run();return json({ok:true});
    }
    if(path==='/admin/courses'&&method==='GET')return json({courses:(await db.prepare('SELECT c.*,u.name AS teacher FROM courses c LEFT JOIN users u ON u.id=c.teacher_id ORDER BY c.created DESC').all()).results});
    if(path==='/admin/courses'&&(method==='POST'||method==='PATCH')) {
      const b=await body(request), values=[text(b.code,20,true),text(b.title,160,true),text(b.description??'',1000),await teacherId(db,b.teacherId??null),text(b.semester,60,true),validDate(b.closes),b.active===false?0:1];
      if(method==='POST')await db.prepare('INSERT INTO courses (code,title,description,teacher_id,semester,closes,active,id,created) VALUES (?,?,?,?,?,?,?,?,?)').bind(...values,uid(),now()).run();
      else {const id=text(b.id,100,true);await getCourse(db,id);await db.prepare('UPDATE courses SET code=?,title=?,description=?,teacher_id=?,semester=?,closes=?,active=? WHERE id=?').bind(...values,id).run();}
      return json({ok:true});
    }
    fail('not_found',404);
  } catch(error) {
    if(error.status)return json({error:error.message},error.status);
    if(String(error.message).includes('UNIQUE constraint'))return json({error:'duplicate'},409);
    console.error('API request failed:',error.name,error.message?.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig,'[email]'));
    return json({error:'server_error'},500);
  }
}
