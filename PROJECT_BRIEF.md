# Yessenov Course Feedback — quick context

1) Project root: `Yessenov-Course-Feedback-VSCode`.
2) Product: student, teacher and administrator portal for course feedback at Yessenov University.
3) Stack: Cloudflare Worker + D1, vanilla HTML/CSS/JavaScript, Node.js 22+, Python analytics utility.
4) Public deployment: `https://yu.yessenov-course-feedback.workers.dev/`.
5) Build: `npm run build`.
6) Fast validation: `npm run validate`.
7) Full automated check: `npm test`.
8) Local preview: `npm run preview`.
9) Deploy only after validation: `npx wrangler deploy`.
10) Main UI: `app/portal.html`, `public/portal.js`, `public/styles.css`, `public/portal.css`.
11) API and access control: `server/api.mjs`; passkeys: `server/webauthn.mjs`.
12) Database schema and seed data: `drizzle/`.
13) Never print, commit or request secrets, tokens, passwords or `.env` files.
14) For a new, unrelated task, start a new Codex chat and first ask it to read this file.
15) Give the exact file path, desired result and check to run in the same request.
16) Use `/clear` only after a completed task when the current chat is no longer needed.
