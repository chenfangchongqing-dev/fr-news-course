import {Miniflare,Log,LogLevel} from 'miniflare';
import {build} from 'esbuild';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
await build({entryPoints:['tests/api-entry.ts'],bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers'],outfile:'.sites-runtime/api-test.mjs'});
const mf=new Miniflare({modules:true,scriptPath:'.sites-runtime/api-test.mjs',compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'test-db'},r2Buckets:['BUCKET'],bindings:{OWNER_EMAIL:'test-owner@example.test'},log:new Log(LogLevel.ERROR)});
const db=await mf.getD1Database('DB');
for(const file of (await fs.readdir('drizzle')).filter(x=>x.endsWith('.sql')).sort()){const sql=await fs.readFile('drizzle/'+file,'utf8');for(const s of sql.split('--> statement-breakpoint'))if(s.trim())await db.prepare(s.trim()).run();}
let passed=0;const checks=[];
const users={owner:['owner-test','test-owner@example.test'],student:['student-test','student@example.test'],other:['other-test','other@example.test'],stranger:['stranger-test','stranger@example.test']};
async function call(path,body=null,user='owner',method=body?'POST':'GET',status=200){const headers={};if(user){headers['oai-authenticated-user-id']=users[user][0];headers['oai-authenticated-user-email']=users[user][1]}if(body)headers['Content-Type']='application/json';const r=await mf.dispatchFetch('https://test.local/api/'+path,{method,headers,body:body?JSON.stringify(body):undefined});const j=await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(j).slice(0,300));passed++;return j}
try{
await call('bootstrap',null,null,'GET',401);await call('bootstrap',null,'stranger','GET',403);checks.push('匿名与未授权身份被拒绝');
const imported=await call('corpus-import',{});assert.equal(imported.expected,177);const init=await call('bootstrap');assert.ok(init.corpus.length>0);
await call('members',{name:'测试译员',email:'student@example.test',role:'translator'});await call('members',{name:'另一小组',email:'other@example.test',role:'translator'});
await call('bootstrap',null,'student');await call('bootstrap',null,'other');
const p=await call('projects',{title:'API验收项目',permission:'虚构测试材料',demo:true});
const ts=[];for(let i=0;i<3;i++)ts.push(await call('tasks',{project:p.id,title:'文件 '+i,source:'虚构中文原文',group:'测试组'}));
await call('records/'+ts[0].id,null,'student','GET',404);
await call('records/'+ts[0].id,{action:'assign',assignee:'student-test',group:'测试组'},'owner','PATCH');
await call('records/'+ts[0].id,null,'student');await call('records/'+ts[0].id,null,'other','GET',404);
await call('projects',{title:'越权项目',permission:'x'},'student','POST',403);checks.push('项目隔离与角色写入权限通过');
await call('records/'+ts[0].id,{action:'version',label:'初稿',text:'Une université organise une rencontre.'},'student','PATCH');
await call('records/'+ts[0].id,{action:'version',label:'最终稿',text:'Une université organise une rencontre internationale.',reason:'Préciser le contexte.'},'student','PATCH');
await call('records/'+ts[0].id,{action:'deliver'},'owner','PATCH',400);
await call('records/'+ts[0].id,{action:'review',text:'审校',checklist:{}},'student','PATCH',403);
const checklist=Object.fromEntries(['facts','terms','language','style','review1','review2','review3','proof1','proof2','proof3'].map(x=>[x,true]));
await call('records/'+ts[0].id,{action:'review',text:'核验模拟材料与语言表达',checklist},'owner','PATCH');
await call('records/'+ts[0].id,{action:'deliver'},'owner','PATCH');await call('records/'+ts[0].id,{action:'version',label:'初稿',text:'覆盖尝试'},'student','PATCH',400);
const archive=await call('records/'+ts[0].id,{action:'archive',permission:'仅课程使用',authorized:true},'owner','PATCH');
const archiveSearch=await call('corpus/search?q='+encodeURIComponent('虚构中文原文'));assert.ok(archiveSearch.rows.some(x=>x.id===archive.id));
const detail=await call('records/'+ts[0].id);assert.equal(detail.record.versions.length,2);assert.ok(detail.history.length>=5);checks.push('版本留存、交付约束、归档与历史通过');
await call('assistant',{task:ts[0].id,mode:'新闻分析',message:'如何核对来源？'},'student','POST',503);
await call('notes',{task:ts[0].id,analysis:'先核对新闻事实',reflection:'补充目标读者背景'},'student');
const a=await call('annotations',{task:ts[0].id,excerpt:'虚构中文原文',text:'框架分析',sourceUrl:'https://example.org'},'student');
await call('records/'+a.id,{excerpt:'虚构中文原文',text:'修订分析'},'student','PATCH');
await call('records/'+a.id,{},'student','DELETE');checks.push('无模型假回复，分析标注可修改删除');
const fd=new FormData();fd.append('task',ts[0].id);fd.append('file',new File(['fichier de test'],'test.txt',{type:'text/plain'}));
const fr=new Request('https://test.local/api/files',{method:'POST',body:fd});const up=await mf.dispatchFetch(fr.url,{method:'POST',headers:{'Content-Type':fr.headers.get('Content-Type'),'oai-authenticated-user-id':'student-test','oai-authenticated-user-email':'student@example.test'},body:await fr.arrayBuffer()});const f=await up.json();assert.equal(up.status,200,JSON.stringify(f));
const down=await mf.dispatchFetch('https://test.local/api/files/'+f.id,{headers:{'oai-authenticated-user-id':'student-test','oai-authenticated-user-email':'student@example.test'}});assert.equal(await down.text(),'fichier de test');await call('files/'+f.id,null,'other','GET',404);checks.push('文件上传下载与跨组读取隔离通过');
const paper=init.papers[0];await call('papers',{paper,tags:['新闻翻译']});await call('papers',{paper,tags:['新闻翻译']});
const after=await call('bootstrap');assert.equal(after.records.filter(r=>r.kind==='paper').length,1);checks.push('文献收藏去重与数据库回读通过');
const cross=await mf.dispatchFetch('https://test.local/api/projects',{method:'POST',headers:{Origin:'https://evil.test','Content-Type':'application/json'},body:'{}'});assert.equal(cross.status,403);checks.push('跨站写入拒绝通过');
const report={time:new Date().toISOString(),apiAssertions:passed,checks,status:'passed',limits:['本地测试使用测试身份头；正式学生多账号登录仍待上线前验收','外部检索与定时流程在部署后另行测试']};await fs.writeFile('TEST-RESULTS.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await mf.dispose()}
