import {Miniflare,Log,LogLevel} from 'miniflare';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
await build({entryPoints:['tests/api-entry.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],outfile:'.sites-runtime/corpus-test.mjs'});
const mf=new Miniflare({modules:true,scriptPath:'.sites-runtime/corpus-test.mjs',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'corpus-test'},r2Buckets:['BUCKET'],bindings:{OWNER_EMAIL:'test-owner@example.test'},log:new Log(LogLevel.ERROR)});
const db=await mf.getD1Database('DB');
for(const file of (await fs.readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort()){for(const s of (await fs.readFile('drizzle/'+file,'utf8')).split('--> statement-breakpoint'))if(s.trim())await db.prepare(s.trim()).run()}
const checks=[];let calls=0;
const owner={'oai-authenticated-user-id':'owner-test','oai-authenticated-user-email':'test-owner@example.test'};
async function call(path,body,headers={},status=200,method=body?'POST':'GET'){
 const r=await mf.dispatchFetch('https://test.local/api/'+path,{method,headers:{...headers,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});const j=await r.json();assert.equal(r.status,status,JSON.stringify(j));calls++;return j;
}
const search=p=>call('corpus/search?'+new URLSearchParams(p));
try{
 // Existing data must survive schema extension and import byte-for-byte.
 const payload=JSON.stringify({title:'现有教师项目',members:[]});
 await db.prepare('INSERT INTO records VALUES (?,?,?,?,?,?,?)').bind('preserve-project','project','owner-test',null,payload,'2026-11-20','2026-11-20').run();
 const before=await db.prepare('SELECT * FROM records').all();
 const a=await call('corpus-import',{});assert.equal(a.legacy,165);assert.equal(a.added,12);
 const b=await call('corpus-import',{});assert.equal(b.alreadyImported,true);
 assert.deepEqual((await db.prepare('SELECT * FROM records').all()).results,before.results);
 assert.equal((await call('corpus/stats')).total,177);checks.push('幂等导入177条；已有项目完全保留，无重复导入');
 const original=JSON.parse(await fs.readFile('data/corpus.json','utf8'));
 for(const r of original){const stored=await db.prepare('SELECT original FROM corpus_entries WHERE id=?').bind(r.id).first();assert.deepEqual(JSON.parse(stored.original),r)}
 checks.push('全部165条原库字段逐条深比较一致');
 let r=await search({q:'新质生产力'});assert.ok(r.rows.some(x=>x.id==='parallel-2025-report'));assert.ok(r.rows.some(x=>x.id==='term-2024-tac'));
 r=await search({q:'forces productives de nouvelle qualite',status:'verified'});assert.equal(r.total,3);
 r=await search({q:'ÉCONOMIE NUMÉRIQUE',type:'parallel'});assert.ok(r.rows.some(x=>x.id==='authority-report-2025-digital'));
 r=await search({q:'économie numérique',publisher:'淄博',from:'2025-03-05',to:'2025-03-05',status:'verified',type:'policy'});assert.equal(r.total,1);
 r=await search({q:'l’agriculture'});assert.ok(r.rows.some(x=>x.id==='authority-tac40-10'));
 checks.push('中文、法文、大小写、去重音、弯引号与组合筛选通过');
 r=await search({q:'this-string-does-not-exist'});assert.equal(r.total,0);
 r=await search({q:"' OR 1=1 --"});assert.equal(r.total,0);
 r=await search({q:'%'});assert.equal(r.total,0);
 r=await search({q:'_'});assert.equal(r.total,0);
 await call('corpus/search?page=NaN',undefined,{},400);await call('corpus/search?from=2026-11-30&to=2026-11-01',undefined,{},400);
 const first=await search({q:'',page:'1'}),second=await search({q:'',page:'2'});assert.equal(first.rows.length,20);assert.equal(second.rows.length,20);assert.ok(!first.rows.some(x=>second.rows.some(y=>y.id===x.id)));
 checks.push('无结果、分页、SQL注入与通配符转义、非法参数通过');
 const detail=await call('corpus/parallel-2025-report');assert.equal(detail.source.id,'gov-report-2025');assert.equal(detail.entry.locator,'第4页 第三部分（二）标题');assert.equal(detail.checks.length,1);
 const news=await call('corpus/news-2026-xinhua');assert.equal(news.entry.relation,'主题相关');assert.equal(news.entry.verification,'partial');assert.ok(news.entry.zhLabel);
 checks.push('来源、页码、批次、核验历史与新闻关系边界正确');
 const body={status:'verified',note:'已逐句对照官方文献的中法表达及位置。',locator:'第4页 第三部分（二）标题',url:detail.entry.url,updated:detail.entry.updated,confirmPair:true};
 await call('corpus/parallel-2025-report',body,{},401,'PATCH');
 await call('bootstrap',undefined,owner);
 await call('members',{name:'测试学生',email:'student@example.test',role:'translator'},owner);
 const student={'oai-authenticated-user-id':'student-test','oai-authenticated-user-email':'student@example.test'};
 await call('bootstrap',undefined,student);
 await call('corpus/parallel-2025-report',body,student,403,'PATCH');
 const reviewed=await call('corpus/parallel-2025-report',body,owner,200,'PATCH');assert.equal(reviewed.checks.length,2);assert.deepEqual(reviewed.original,detail.original);
 await call('corpus/parallel-2025-report',body,owner,409,'PATCH');
 await call('corpus/news-2026-xinhua',{...body,updated:news.entry.updated},owner,400,'PATCH');
 await call('corpus-import',{});const after=await call('corpus/parallel-2025-report');assert.equal(after.checks.length,2);assert.equal(after.entry.verificationNote,body.note);
 checks.push('核验写入权限、并发冲突、禁止无依据升级、重导不覆盖教师核验通过');
 await call('corpus-import',{}, {Origin:'https://evil.example'},403);
 const report={time:new Date().toISOString(),status:'passed',apiCalls:calls,legacyRowsCompared:165,checks,scope:'隔离Miniflare D1数据库；原库+12条权威语料；无线上用户数据写入'};
 await fs.writeFile('CORPUS-TEST-RESULTS.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{await mf.dispose()}
