import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const db = new DatabaseSync(':memory:');
for (const migration of ['0000_course_feedback.sql','0001_email_auth.sql','0002_seed_courses.sql']) {
  db.exec((await readFile(resolve(root, 'drizzle', migration), 'utf8')).replaceAll('--> statement-breakpoint', ''));
}

class Prepared {
  constructor(sql) { this.sql=sql; this.args=[]; }
  bind(...args) { this.args=args; return this; }
  async first() { return db.prepare(this.sql).get(...this.args)??null; }
  async all() { return {results:db.prepare(this.sql).all(...this.args)}; }
  async run() { const result=db.prepare(this.sql).run(...this.args); return {meta:{changes:Number(result.changes)}}; }
}
const d1={prepare:sql=>new Prepared(sql),batch:statements=>Promise.all(statements.map(statement=>statement.run()))};
const worker=(await import(pathToFileURL(resolve(root,'dist/server/index.js')))).default;
const port=Number(process.env.CFS_PREVIEW_PORT||4173);

createServer(async (incoming,outgoing)=>{
  try {
    const chunks=[];
    for await (const chunk of incoming) chunks.push(chunk);
    const body=chunks.length?Buffer.concat(chunks):undefined;
    const request=new Request(`http://${incoming.headers.host||`localhost:${port}`}${incoming.url}`,{
      method:incoming.method,
      headers:incoming.headers,
      body,
      ...(body?{duplex:'half'}:{}),
    });
    const response=await worker.fetch(request,{DB:d1});
    for (const [name,value] of response.headers) if(name!=='set-cookie')outgoing.setHeader(name,value);
    const cookies=response.headers.getSetCookie?.()??[];
    if(cookies.length)outgoing.setHeader('Set-Cookie',cookies);
    outgoing.writeHead(response.status);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500,{'Content-Type':'text/plain; charset=utf-8'});
    outgoing.end('Preview server error');
    console.error(error);
  }
}).listen(port,'127.0.0.1',()=>console.log(`Preview: http://127.0.0.1:${port}`));
