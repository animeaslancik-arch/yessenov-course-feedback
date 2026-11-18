// Administrators are configured as the Cloudflare secret ADMIN_EMAILS.
const normalizedEmail = value => String(value || '').trim().toLowerCase();
export const adminEmailSet = env => new Set(String(env?.ADMIN_EMAILS || '').split(',').map(normalizedEmail).filter(Boolean));
export const isAdminEmail = (env, email) => adminEmailSet(env).has(normalizedEmail(email));
export const accountRole = (env, email, requested) => isAdminEmail(env, email) ? 'admin' : requested === 'teacher' ? 'teacher' : 'student';
