import csv,json,pathlib,re
p=pathlib.Path('data'); records=[]
for file in ['diplomatie.csv','titres_et_institutions_par_pays.csv']:
 for i,r in enumerate(csv.DictReader((p/'legacy'/file).open())):
  if not r.get('chinois'):continue
  records.append(dict(id=f'{file}-{i}',type='term',title=r['chinois'],zh=r['chinois'],fr=r['francais'],source=r.get('source',''),date=r.get('date',''),url='https://'+r.get('source','').split(';')[0].strip() if r.get('source') else '',relation='术语对应',verification='pending',note=r.get('note',''),task='核对机构称谓与新闻语境，记录选词理由。',theme=r.get('contexte',''),domain=r.get('categorie',''),legacy=r,provenance=file,verificationNote='保留原库数据；原记录只有域名或月份，尚未逐条核验具体出处。'))
for r in json.load((p/'legacy/curated-resources.json').open()):
 r.update(theme='新质生产力',domain='政策与经济',provenance='terminologie-zh-fr/data/curated-resources.json',verificationNote='沿用原库核验记录；原文链接实时可用性尚未复查。')
 records.append(r)
s=(p/'legacy/corpus-data.js').read_text(); rows=json.loads(re.sub(r'(\w+):',r'"\1":',s[s.index('['):s.rindex(']')+1]))
for i,r in enumerate(rows):
 r.update(id=f'course-demo-{i}',title=r['zh'],verification='pending',relation='教学示例',demo=True,url='',date='',task='改写标题与导语，并解释信息取舍。',domain='课程教学',provenance='fr-news-course/04-corpus/corpus-data.js');records.append(r)
for r in json.load((p/'legacy/xinhua_fr_zh_reviews.json').open()):
 records.append(dict(id=r['id'],type='news',title=r['title_fr'],zh=r.get('confirmed_title_zh',''),fr=r['title_fr'],source='新华社',date=r['published_fr'],url=r['url_fr'],urlZh=r.get('confirmed_url_zh',''),relation='同题报道',verification=r['status'],theme=r.get('theme',''),domain='国际新闻',note='；'.join(r.get('verification_notes',[])),task='比较双语标题与报道结构，不预设逐句对应。',provenance='fr-news-course/data/reviewed/xinhua_fr_zh_reviews.json',verificationNote='原库人工核验日期：'+r.get('verified_at',''),legacy=r))
(p/'corpus.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
print('Imported records:',len(records))
