import {env} from 'cloudflare:workers';
import manifest from '../data/corpus-import/authority-v1.json';
const db=()=>env.DB!;
const now=()=>new Date().toISOString();
const fail=(message:string,status=400):never=>{throw Object.assign(new Error(message),{status})};
export const normalize=(v:string)=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[’‘ʼ]/g,"'").toLowerCase().replace(/\s+/g,' ').trim();
const safeUrl=(s:string)=>{try{const u=new URL(s);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}};
const parse=(row:any)=>row?{...JSON.parse(row.data),id:row.id,verification:row.verification,updated:row.updated,origin:row.origin,originalHash:row.original_hash}:null;
const searchable=(r:any)=>normalize([r.zh,r.fr,r.title,r.theme,r.domain,r.source].join(' '));
export function entryStatement(original:any,projection:any,origin:string,hash:string,t:string){
 const r={...original,...projection};
 const source=(manifest.sources as any[]).find(s=>s.id===r.sourceId);
 r.datePrecision=/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')?'day':/^\d{4}-\d{2}$/.test(r.date||'')?'month':'unknown';
 r.checkedAt=source?.checkedAt||'';r.verificationOrigin=r.checkedAt?'本轮原文核对':'原库记录（本轮未复查）';
 return db().prepare('INSERT OR IGNORE INTO corpus_entries(id,source_id,type,verification,published,theme,publisher,search_text,data,original,original_hash,origin,created,updated) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(r.id,r.sourceId,r.type||'case',r.verification||'pending',r.date||'',normalize([r.theme,r.domain].join(' ')),normalize(r.source||''),searchable(r),JSON.stringify(r),JSON.stringify(original),hash,origin,t,t);
}
// Fixed, public-source manifest only. Protected by the owner-private Sites gateway.
// This service import cannot accept caller-supplied entries or edit existing records.
export async function importCorpus(){
 const done:any=await db().prepare('SELECT * FROM corpus_imports WHERE id=?').bind(manifest.batchId).first();
 if(done)return {...JSON.parse(done.data),alreadyImported:true};
 const t=now();
 const sourceStmts=manifest.sources.map(s=>db().prepare('INSERT OR IGNORE INTO corpus_sources(id,data,created) VALUES (?,?,?)').bind(s.id,JSON.stringify(s),t));
 const entries=manifest.entries.map(e=>entryStatement(e.original,e.projection,e.origin,e.sha256,t));
 const checks=manifest.entries.filter(e=>(manifest.sources as any[]).find(s=>s.id===(e.projection as any).sourceId)?.checkedAt).map(e=>{
 const r:any={...e.original,...e.projection};return db().prepare('INSERT OR IGNORE INTO corpus_checks(id,entry_id,actor,status,evidence,created) VALUES (?,?,?,?,?,?)').bind(manifest.batchId+':'+r.id,r.id,'首批导入 · 原始来源逐项核对',r.verification,JSON.stringify({note:r.verificationNote,sourceId:r.sourceId,locator:r.locator,url:r.url,scope:r.verification==='partial'?'仅法文来源及元数据；双语关系未确认':'具体术语或句段',originalHash:e.sha256}),t);
 });
 // D1 batch is atomic: the completed marker is committed with all rows.
 const info={batchId:manifest.batchId,legacy:manifest.legacyCount,added:manifest.addedCount,expected:manifest.entries.length,legacySha256:manifest.legacySha256,importedAt:t};
 await db().batch([...sourceStmts,...entries,...checks,db().prepare('INSERT OR IGNORE INTO corpus_imports(id,data,created) VALUES (?,?,?)').bind(manifest.batchId,JSON.stringify(info),t)]);
 return {...info,alreadyImported:false};
}
export async function corpusStats(){
 const total:any=await db().prepare('SELECT COUNT(*) AS count FROM corpus_entries').first();
 const grouped=(await db().prepare('SELECT verification,COUNT(*) AS count FROM corpus_entries GROUP BY verification').all()).results;
 const batches=(await db().prepare('SELECT data FROM corpus_imports ORDER BY created DESC').all()).results.map((r:any)=>JSON.parse(r.data));
 return {total:total.count,grouped,batches,engine:'Cloudflare D1',scope:'已入库课程资源；非全网实时搜索'};
}
export async function searchCorpus(params:URLSearchParams){
 const query=normalize(params.get('q')||'');if(query.length>240)fail('检索词限240字符');
 const conditions:string[]=[],values:any[]=[];
 const contains=(column:string,value:string)=>{if(value){conditions.push(`${column} LIKE ? ESCAPE '\\'`);values.push('%'+normalize(value).replace(/[\\%_]/g,'\\$&')+'%')}};
 for(const token of query.split(/\s+/).filter(Boolean).slice(0,12))contains('search_text',token);
 const type=params.get('type')||'all',status=params.get('status')||'';
 if(!['all','term','parallel','news','policy','case'].includes(type))fail('资源类型无效');
 if(type==='policy'){conditions.push("(type='policy' OR source_id='gov-report-2025')")}else if(type!=='all'){conditions.push('type=?');values.push(type)}
 if(status){if(!['pending','partial','verified'].includes(status))fail('核验状态无效');conditions.push('verification=?');values.push(status)}
 contains('theme',params.get('theme')||'');contains('publisher',params.get('publisher')||'');
 const from=params.get('from')||'',to=params.get('to')||'';
 for(const v of [from,to])if(v&&!/^\d{4}-\d{2}-\d{2}$/.test(v))fail('日期格式无效');
 if(from&&to&&from>to)fail('开始日期不能晚于结束日期');
 if(from||to)conditions.push('length(published)=10'); // Month-only legacy dates are never invented.
 if(from){conditions.push('published>=?');values.push(from)}if(to){conditions.push('published<=?');values.push(to)}
 const page=Number(params.get('page')||'1');if(!Number.isInteger(page)||page<1||page>10000)fail('页码无效');
 const size=20,where=conditions.length?' WHERE '+conditions.join(' AND '):'';
 const count:any=await db().prepare('SELECT COUNT(*) AS count FROM corpus_entries'+where).bind(...values).first();
 const rows=(await db().prepare('SELECT * FROM corpus_entries'+where+" ORDER BY CASE verification WHEN 'verified' THEN 0 WHEN 'partial' THEN 1 ELSE 2 END, CASE WHEN source_id='gov-report-2025' THEN 1 ELSE 0 END, published DESC,id LIMIT ? OFFSET ?").bind(...values,size,(page-1)*size).all()).results.map(parse);
 return {query:params.get('q')||'',rows,total:count.count,page,pageSize:size,pages:Math.ceil(count.count/size),searchedAt:now(),engine:'Cloudflare D1',catalog:await corpusStats()};
}
export async function corpusDetail(id:string){
 const row:any=await db().prepare('SELECT * FROM corpus_entries WHERE id=?').bind(id).first();if(!row)fail('语料不存在',404);
 const source:any=await db().prepare('SELECT data FROM corpus_sources WHERE id=?').bind(row.source_id).first();
 const checks=(await db().prepare('SELECT * FROM corpus_checks WHERE entry_id=? ORDER BY created DESC,id').bind(id).all()).results.map((r:any)=>({...r,evidence:JSON.parse(r.evidence)}));
 return {entry:parse(row),original:JSON.parse(row.original),source:source?JSON.parse(source.data):null,checks};
}
export async function verifyCorpus(id:string,body:any,actor:string){
 const detail=await corpusDetail(id),r=detail.entry;
 if(!['pending','partial','verified'].includes(body.status))fail('核验状态无效');
 if(typeof body.note!=='string'||body.note.trim().length<8||body.note.length>2000)fail('请填写至少8字的具体核验依据（最多2000字）');
 const url=safeUrl(body.url||'');if(!url)fail('请提供可追溯的来源链接');
 if(!body.locator||body.locator.length>300)fail('请填写原文位置（最多300字）');
 if(body.status==='verified'&&(!body.confirmPair||r.demo||r.zhLabel||!['术语对应','句段平行','官方同源句段平行','同源双语','同题报道'].includes(r.relation)))fail('本记录尚不具备双语核验条件；请保留部分核验，并另行整理实际对应原文');
 if(body.updated!==r.updated)fail('记录已变更，请重新打开后核验',409);
 const t=new Date(Math.max(Date.now(),Date.parse(r.updated)+1)).toISOString();
 const next={...r,verification:body.status,verificationNote:body.note.trim(),checkedAt:t,verificationOrigin:'教师逐项核验',locator:body.locator,verificationUrl:url};
 const evidence=JSON.stringify({note:body.note.trim(),url,locator:body.locator,confirmPair:!!body.confirmPair,previousStatus:r.verification});
 const result=await db().batch([
 db().prepare('UPDATE corpus_entries SET verification=?,data=?,updated=? WHERE id=? AND updated=?').bind(body.status,JSON.stringify(next),t,id,body.updated),
 db().prepare('INSERT INTO corpus_checks(id,entry_id,actor,status,evidence,created) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM corpus_entries WHERE id=? AND updated=?)').bind(crypto.randomUUID(),id,actor,body.status,evidence,t,id,t)
 ]);if(!result[0].meta.changes)fail('记录已被更新，本次核验未覆盖',409);return corpusDetail(id);
}
export async function indexArchivedCorpus(record:any){
 const t=now(),sourceId='project-'+record.project;
 const original=JSON.stringify(record),bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(original));
 const hash=Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
 await db().batch([db().prepare('INSERT OR IGNORE INTO corpus_sources(id,data,created) VALUES (?,?,?)').bind(sourceId,JSON.stringify({id:sourceId,title:record.source,publisher:record.source,url:record.url||'',rights:record.permission,access:'教学项目归档',checkedAt:'',type:'课程成果'}),t),entryStatement(record,{sourceId,locator:'教师批准归档的最终稿'},'project-archive',hash,t)]);
}
