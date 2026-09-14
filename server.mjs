import {createServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.dirname(fileURLToPath(import.meta.url));
const data=process.env.DATA_DIR||path.join(root,'data');mkdirSync(data,{recursive:true});
const sql=new DatabaseSync(path.join(data,'rooms.sqlite'));
sql.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS mafia_rooms(code TEXT PRIMARY KEY,owner TEXT NOT NULL,state TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS rooms_owner_updated ON mafia_rooms(owner,updated);');
globalThis.mafiaDatabase={prepare(query){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}};
const {POST,OPTIONS}=await import('./game-server.mjs');
const html=readFileSync(path.join(root,'Naatile-Mafia.html'));
const server=createServer(async(req,res)=>{
 try{
  const route=new URL(req.url,'http://localhost').pathname;
  if(route==='/api/game'){
   if(!['POST','OPTIONS'].includes(req.method)){res.writeHead(405);res.end();return;}
   let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;if(size>100000){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
   const headers={'Content-Type':'application/json','cf-connecting-ip':req.socket.remoteAddress||'unknown'};
   const r=req.method==='OPTIONS'?OPTIONS():await POST(new Request('http://localhost/api/game',{method:'POST',headers,body:Buffer.concat(chunks)}));
   res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;
  }
  if(['GET','HEAD'].includes(req.method)&&['/','/Naatile-Mafia.html'].includes(route)){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:html);return;}
  res.writeHead(404);res.end('Not found');
 }catch{if(!res.headersSent)res.writeHead(500);res.end('Unable to serve this request.');}
});
server.requestTimeout=15000;
server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log('Naatile Mafia listening on port '+(process.env.PORT||8080)));
const cleanup=setInterval(()=>sql.prepare('DELETE FROM mafia_rooms WHERE updated<?').run(Date.now()-86400000),3600000);cleanup.unref();
