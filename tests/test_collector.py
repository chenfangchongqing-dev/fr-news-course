import importlib.util
import sys
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
from tempfile import TemporaryDirectory
import json
spec = importlib.util.spec_from_file_location('collector', Path(__file__).resolve().parents[1]/'tools/collect_xinhua_parallel_candidates.py')
c = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = c
spec.loader.exec_module(c)

class CollectorTests(unittest.TestCase):
    def candidate(self, published, url='https://french.news.cn/20261001/034781a3b26a465a9c6ac4ecc3af3994/c.html'):
        return c.build_candidate(c.SOURCES[0], 'Un titre de presse', '', url, published, '')

    def test_date_range(self):
        items=[self.candidate(d) for d in ['2026-09-12','2026-10-11','2022-04-18','','2026-02-30','2026-10-12']]
        recent,counts=c.select_recent(items,date(2026,10,11))
        self.assertEqual(len(recent),2)
        self.assertEqual(counts,dict(historical=1,unknown_date=2,future_date=1,invalid_url=0))

    def test_article_url_and_date(self):
        self.assertEqual(c.date_from_url('https://french.news.cn/2022-04/18/c_1310563300.htm'),'2022-04-18')
        self.assertEqual(c.date_from_url(self.candidate('').url_fr),'2026-10-01')
        self.assertFalse(c.is_article_url('https://french.news.cn/europe/index.htm'))
        self.assertFalse(c.is_article_url('https://evil.example/20261001/034781a3b26a465a9c6ac4ecc3af3994/c.html'))

    def test_no_false_ue_in_french_words(self):
        self.assertNotIn('欧盟',c.zh_keywords('La Russie attaque un pont','', 'Europe'))
        self.assertIn('欧盟',c.zh_keywords("L'UE annonce un accord",'', 'Europe'))

    def test_merge_and_empty_feed_preserve_history(self):
        previous=[dict(url_fr='http://french.news.cn/2022-04/18/c_1310563300.htm',published_fr='2022-04-18',title_fr='Original',confirmed_url_zh='https://example.org/proof')]
        self.assertEqual(c.merge_records(previous,[]),previous)
        fresh=[{**previous[0],'title_fr':'New feed text','confirmed_url_zh':''}]
        self.assertEqual(c.merge_records(previous,fresh),previous)
        with TemporaryDirectory() as tmp:
            root=Path(tmp); (root/'data/rss').mkdir(parents=True)
            path=root/'data/rss/xinhua_fr_zh_candidates.json'; path.write_text(json.dumps(previous))
            with patch.object(c,'ROOT',root),patch.object(c,'SOURCES',[c.SOURCES[0]]),patch.object(c,'collect_rss',return_value=[]):
                c.main()
            self.assertEqual(json.loads(path.read_text()),previous)
            self.assertEqual(json.loads((root/'data/rss/collection_status.json').read_text())['eligible_count'],0)

    def test_old_feed_excluded(self):
        entries=[self.candidate('2022-04-18')]*100
        recent,counts=c.select_recent(entries,date(2026,10,11))
        self.assertEqual(recent,[])
        self.assertEqual(counts['historical'],100)

if __name__=='__main__': unittest.main()
