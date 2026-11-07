import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {neon} from '@neondatabase/serverless';
import {put,get,del} from '@vercel/blob';
const cloud=Boolean(process.env.VERCEL);
const data=process.env.DATA_DIR||path.join(path.dirname(fileURLToPath(import.meta.url)),'.data');
let sql,db,queue=Promise.resolve();
if(cloud){
 for(const key of ['DATABASE_URL','BLOB_READ_WRITE_TOKEN','APP_PASSWORD'])if(!process.env[key])throw Error(`Configuration manquante : ${key}`);
 sql=neon(process.env.DATABASE_URL);
 await sql`CREATE TABLE IF NOT EXISTS atelier_projects (id uuid PRIMARY KEY, project jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`;
}else{
 await mkdir(path.join(data,'files'),{recursive:true});
 try{db=JSON.parse(await readFile(path.join(data,'db.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;db={projects:[]};}
}
function save(){const snapshot=JSON.stringify(db);queue=queue.then(async()=>{await writeFile(path.join(data,'db.tmp'),snapshot);await rename(path.join(data,'db.tmp'),path.join(data,'db.json'));});return queue;}
export async function listProjects(){if(!cloud)return db.projects;return (await sql`SELECT project FROM atelier_projects ORDER BY created_at DESC`).map(r=>r.project);}
export async function findProject(id){if(!/^[a-f0-9-]{36}$/.test(id))return null;if(!cloud)return db.projects.find(p=>p.id===id);return (await sql`SELECT project FROM atelier_projects WHERE id=${id}::uuid`)[0]?.project;}
export async function createProject(p){if(cloud)await sql`INSERT INTO atelier_projects (id,project) VALUES (${p.id}::uuid,${JSON.stringify(p)}::jsonb)`;else{db.projects.unshift(p);await save();}}
export async function appendItem(id,field,item){if(cloud){
 // Each append is a single SQL statement, preserving concurrent updates.
 await sql`UPDATE atelier_projects SET project=jsonb_set(project,ARRAY[${field}],(project->${field}) || ${JSON.stringify([item])}::jsonb) WHERE id=${id}::uuid`;
}else{db.projects.find(p=>p.id===id)[field].push(item);await save();}}
export async function storeFile(f,bytes){if(cloud){const blob=await put(`atelier/${f.id}`,bytes,{access:'private',addRandomSuffix:false,contentType:'application/octet-stream'});return blob.url;}await writeFile(path.join(data,'files',f.id),bytes,{flag:'wx'});return null;}
export async function removeFile(f){if(cloud)await del(f.url);else{const {unlink}=await import('node:fs/promises');await unlink(path.join(data,'files',f.id));}}
export async function readDocument(f){if(!cloud)return readFile(path.join(data,'files',f.id));const result=await get(f.url,{access:'private'});if(!result||result.statusCode!==200)throw Error('Document indisponible');return Buffer.from(await new Response(result.stream).arrayBuffer());}
