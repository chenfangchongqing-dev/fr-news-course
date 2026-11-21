import json,hashlib,pathlib
p=pathlib.Path(__file__).resolve().parents[1];old=json.loads((p/'data/corpus.json').read_text())
def sha(v):return hashlib.sha256(json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()
sources=[
 dict(id='tac-40-2024',title='中国翻译协会第40届中译法研讨会成果发布',publisher='中国翻译协会',published='2024-06-25',url='https://www.tac-online.org.cn/2024-06/25/content_42913185.html',type='术语发布',access='已读取原始网页',checkedAt='2026-11-21',checkMethod='检索服务读取原始发布页，核对题名、发布日期及双语词条',rights='仅保存必要术语与链接；不镜像全文'),
 dict(id='tac-hotwords-2023',title='中国翻译协会、中国外文局翻译院联合发布2023年度新词热词英文、法文译法参考',publisher='中国翻译协会、中国外文局翻译院',published='2024-01-01',url='https://www.tac-online.org.cn/2024-01/01/content_42914318.html',type='术语发布',access='已读取原始网页',checkedAt='2026-11-21',checkMethod='检索服务读取法文译法栏目；仅据原文确认，未将译法参考表述为唯一标准',rights='仅保存必要术语与链接；不镜像全文'),
 dict(id='gov-report-2025',title='2025年《政府工作报告》要点版（中法对照）',publisher='淄博市人民政府外事办公室',translator='中央党史和文献研究院（PDF署名）',published='2025-03-05',dateNote='PDF内标注的文献日期；网页上传日期未独立确认',url='https://fao.zibo.gov.cn/module/download/downfile.jsp?classid=0&filename=2eef6eb38dd344d5bab6128c6b74d413.pdf',type='政策文献',access='已读取原始PDF',checkedAt='2026-11-21',checkMethod='检索服务解析8页PDF，核对原文与译文位置；首批仅存必要句段',rights='政府工作报告要点；必要教学引用，保留发布链接与译者署名'),
]
for id in ['news-2026-xinhua','news-2026-canton']:
 r=next(x for x in old if x['id']==id);sources.append(dict(id=id,title=r['title'],publisher='新华社法文版',published=r['date'],url=r['url'],type='新闻报道',access='已读取原始网页',checkedAt='2026-11-21',checkMethod='核对法文题名、日期与术语用例；未取得中文对应原文',rights='仅标题、必要短摘录及链接；不存全文'))
new=[]
def add(id,zh,fr,source,locator,theme,typ='term'):
 s=next(x for x in sources if x['id']==source)
 new.append(dict(id=id,type=typ,title=zh,zh=zh,fr=fr,source=s['publisher'],date=s['published'],url=s['url']+('#page='+locator.split(' ')[0][1:-1] if typ=='parallel' else ''),relation='句段平行' if typ=='parallel' else '术语对应',verification='verified',theme=theme,domain='政策与经济' if typ=='parallel' else '时政与科技',sourceId=source,locator=locator,verificationNote='已对照原始发布文献核查双语内容与位置；仅确认本词条或句段。',task='对照原文解释法语表达的选择，面向法语读者编写新闻标题或导语，并保留引用来源。',provenance='首批权威来源选录 · 2026-11-21',permission=s['rights']))
add('authority-tac40-03','国家消防救援局','Administration nationale des Incendies et des Secours','tac-40-2024','一、时政，第3项','机构称谓')
add('authority-tac40-10','大农业观',"vision globale de l'agriculture",'tac-40-2024','一、时政，第10项','农业')
add('authority-tac40-11','大食物观',"vision globale de l'alimentation",'tac-40-2024','一、时政，第11项','粮食')
add('authority-tac40-32','和平共处五项原则','Cinq principes de la coexistence pacifique','tac-40-2024','二、外交，第32项','外交')
add('authority-hotword-03','全球文明倡议','L’Initiative pour la civilisation mondiale','tac-hotwords-2023','法文译法，第3项','跨文化传播')
add('authority-hotword-07','数字中国','La Chine numérique','tac-hotwords-2023','法文译法，第7项','数智赋能')
add('authority-hotword-09','生成式人工智能','L’IA générative','tac-hotwords-2023','法文译法，第9项','数智赋能')
add('authority-hotword-10','大语言模型','Les mégamodèles de langage','tac-hotwords-2023','法文译法，第10项','数智赋能')
add('authority-report-2025-digital','激发数字经济创新活力。','Stimuler l’innovation dans l’économie numérique.','gov-report-2025','第4页 第三部分（二）末句','新质生产力 数字经济','parallel')
add('authority-report-2025-industry','推动传统产业改造提升。','Promouvoir la transformation et la mise à niveau des industries traditionnelles.','gov-report-2025','第4页 第三部分（二）','新质生产力 产业升级','parallel')
add('authority-report-2025-education','加快建设高质量教育体系。','Accélérer la mise en place d’un système éducatif de haute qualité.','gov-report-2025','第5页 第三部分（三）','教育','parallel')
add('authority-report-2025-green','加快发展绿色低碳经济。','Développer plus rapidement une économie verte et sobre en carbone.','gov-report-2025','第7页 第三部分（九）','绿色发展','parallel')
# Original fields remain immutable. A separate reviewed projection supplies improved metadata.
updates={
 'term-2024-tac':dict(sourceId='tac-40-2024',locator='一、时政，第1项',verification='verified',verificationNote='2026-11-21重新读取发布页，已核对中文术语、法文译法和发布日期。发布者说明成果供业界参考。'),
 'term-2024-hotwords':dict(sourceId='tac-hotwords-2023',locator='法文译法，第4项',verification='verified',verificationNote='2026-11-21重新读取法文译法栏目，已核对双语词条；页面发布日期2024-01-01。'),
 'parallel-2025-report':dict(sourceId='gov-report-2025',locator='第4页 第三部分（二）标题',verification='verified',relation='句段平行',verificationNote='2026-11-21对照PDF第4页确认中法句段；显示时省略章节序号（二）与II)，其余措辞保留。',url=sources[2]['url']+'#page=4'),
 'news-2026-xinhua':dict(sourceId='news-2026-xinhua',locator='法文标题',verification='partial',relation='主题相关',zhLabel='检索主题（非中文原文）',verificationNote='已核对法文标题及发布时间；中文栏是原库检索主题，尚无对应中文原文，不构成平行语料。'),
 'news-2026-canton':dict(sourceId='news-2026-canton',locator='正文第2段开头',verification='partial',relation='主题相关',zhLabel='检索主题（非中文原文）',verificationNote='已核对法文用例及发布时间；原库摘录截取冒号前内容，尚无对应中文原文，不构成平行语料。')
}
for r in new:
 if r['type']=='parallel':r['url']=sources[2]['url']+'#page='+r['locator'][1]
for r in old+new:
 r2=updates.get(r['id'],{});sid=r2.get('sourceId',r.get('sourceId'))
 if not sid:
  sid='legacy-'+sha({'url':r.get('url',''),'source':r.get('source','')})[:16]
  if not any(x['id']==sid for x in sources):sources.append(dict(id=sid,title=r.get('source') or '原课程教学示例',publisher=r.get('source',''),url=r.get('url',''),published='',type='原库来源记录',access='未逐条复查',checkedAt='',checkMethod='保留原库出处；域名级链接不能证明具体词条',rights='沿用原库，逐条授权及出处核验待完成'))
 r2['sourceId']=sid
 if r['id'] not in updates:updates[r['id']]=r2
manifest=dict(batchId='corpus-authority-2026-11-21-v1',created='2026-11-21',legacyCount=len(old),addedCount=len(new),legacySha256=sha(old),sources=sources,entries=[{'original':r,'projection':updates[r['id']], 'sha256':sha(r),'origin':'legacy' if r in old else 'authority-batch'} for r in old+new])
(p/'data/corpus-import/authority-v1.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print({'original':len(old),'new':len(new),'total':len(old)+len(new),'sources':len(sources)})
