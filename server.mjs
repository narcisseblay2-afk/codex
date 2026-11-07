import http from 'node:http';
import {answer} from './assistant.mjs';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHmac,timingSafeEqual} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
import {listProjects,findProject,createProject,appendItem,storeFile,readDocument,removeFile} from './storage.mjs';
const host=process.env.HOST||'127.0.0.1';
if(host!=='127.0.0.1'&&host!=='localhost'&&!process.env.APP_PASSWORD)throw Error('APP_PASSWORD est obligatoire pour une écoute publique.');
function signature(value){return createHmac('sha256',process.env.APP_PASSWORD||'local').update(value).digest('hex');}
function validSession(token){const [expires,sig]=String(token||'').split('.');return Number(expires)>Date.now()&&equal(sig,signature(expires));}
function equal(a,b){const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
async function body(req,max=1024*1024){let size=0;const chunks=[];for await(const c of req){size+=c.length;if(size>max)throw Object.assign(Error(`Fichier trop volumineux (maximum ${Math.floor(max/1024/1024)} Mo).`),{status:413});chunks.push(c);}return Buffer.concat(chunks);}
function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
export async function handler(req,res){try{
res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
const url=new URL(req.url,'http://localhost');
if(req.method!=='GET'&&req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return send(res,403,{error:'Origine refusée.'});
if(url.pathname==='/api/login'&&req.method==='POST'){
const b=JSON.parse((await body(req)).toString());if(!equal(b.password,process.env.APP_PASSWORD))return send(res,401,{error:'Mot de passe incorrect.'});
const expires=String(Date.now()+86400000);const token=`${expires}.${signature(expires)}`;res.setHeader('Set-Cookie',`session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400${(process.env.COOKIE_SECURE==='1'||process.env.VERCEL)?'; Secure':''}`);return send(res,200,{ok:true});}
if(url.pathname.startsWith('/api/')){
const token=req.headers.cookie?.match(/(?:^|; )session=([a-f0-9.]+)/)?.[1];
if(process.env.APP_PASSWORD&&!validSession(token))return send(res,401,{error:'Connexion requise.'});
if(url.pathname==='/api/config'&&req.method==='GET')return send(res,200,{maxFileBytes:(process.env.VERCEL?4:25)*1024*1024,aiConnected:Boolean(process.env.OPENAI_API_KEY)});
if(url.pathname==='/api/projects'&&req.method==='GET')return send(res,200,{projects:(await listProjects()).map(p=>({...p,files:p.files.map(({url,...f})=>f)}))});
if(url.pathname==='/api/projects'&&req.method==='POST'){
const b=JSON.parse((await body(req)).toString());if(typeof b.name!=='string'||!b.name.trim()||b.name.length>120)return send(res,400,{error:'Indiquez un nom de projet (120 caractères maximum).'});
const p={id:randomUUID(),name:b.name.trim(),createdAt:new Date().toISOString(),files:[],messages:[]};await createProject(p);return send(res,201,p);}
const m=url.pathname.match(/^\/api\/projects\/([^/]+)\/(files|messages)(?:\/([^/]+))?$/);const p=m&&await findProject(m[1]);
if(!p)return send(res,404,{error:'Élément introuvable.'});
if(m[2]==='messages'&&req.method==='POST'){
const b=JSON.parse((await body(req)).toString());if(typeof b.text!=='string'||!b.text.trim()||b.text.length>10000)return send(res,400,{error:'Message requis (10 000 caractères maximum).'});
const item={id:randomUUID(),text:b.text.trim(),createdAt:new Date().toISOString(),author:'Vous'};await appendItem(p.id,'messages',item);if(process.env.OPENAI_API_KEY){try{const latest=await findProject(p.id);const reply={id:randomUUID(),text:await answer(latest),author:'Assistant',createdAt:new Date().toISOString()};await appendItem(p.id,'messages',reply);}catch(e){return send(res,201,{...item,warning:'Votre message est enregistré, mais la réponse IA a échoué. Vérifiez la configuration et le quota du service.'});}}return send(res,201,item);}
if(m[2]==='files'&&req.method==='POST'){
const name=url.searchParams.get('name');if(!name||name.length>500||name.includes('\0'))return send(res,400,{error:'Nom de fichier invalide.'});
const bytes=await body(req,(process.env.VERCEL?4:25)*1024*1024);const f={id:randomUUID(),name,size:bytes.length,createdAt:new Date().toISOString()};const blobUrl=await storeFile(f,bytes);if(blobUrl)f.url=blobUrl;try{await appendItem(p.id,'files',f);}catch(e){await removeFile(f);throw e;}return send(res,201,f);}
if(m[2]==='files'&&m[3]&&req.method==='GET'){
const f=p.files.find(f=>f.id===m[3]);if(!f)return send(res,404,{error:'Fichier introuvable.'});const bytes=await readDocument(f);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name.split('/').pop()).replace(/'/g,'%27')}`,'Cache-Control':'no-store'});return res.end(bytes);}
return send(res,405,{error:'Méthode non autorisée.'});}
if(req.method!=='GET')return send(res,405,{error:'Méthode non autorisée.'});
const assets={'/':'index.html','/app.js':'app.js','/style.css':'style.css'};const file=assets[url.pathname];if(!file)return send(res,404,{error:'Page introuvable.'});
res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'self'; style-src 'self'; script-src 'self'; frame-ancestors 'none'"});res.end(await readFile(path.join(root,'public',file)));
}catch(e){send(res,e.status||400,{error:e.status?e.message:'La demande a échoué.'});}}
if(!process.env.VERCEL){const server=http.createServer(handler);server.listen(Number(process.env.PORT||3000),host,()=>console.log(`Atelier démarré sur ${host}:${server.address().port}`));}
