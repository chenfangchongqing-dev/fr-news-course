#!/usr/bin/env python3
from __future__ import annotations
import csv, json, os, re, urllib.parse
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin
import feedparser, requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]

SOURCES = [
    {"mode": "rss", "source": "Xinhua French", "category": "Chine", "theme": "Actualité chinoise", "url": "https://french.news.cn/rss/chine.xml"},
    {"mode": "rss", "source": "Xinhua French", "category": "Monde", "theme": "Monde", "url": "https://french.news.cn/rss/monde.xml"},
    {"mode": "rss", "source": "Xinhua French", "category": "Afrique", "theme": "Afrique", "url": "https://french.news.cn/rss/afrique.xml"},
    {"mode": "html_index", "source": "Xinhua French", "category": "Europe", "theme": "Europe", "url": "https://french.news.cn/europe/index.htm"},
    {"mode": "rss", "source": "Xinhua French", "category": "Culture", "theme": "Culture", "url": "https://french.news.cn/rss/culture.xml"},
    {"mode": "rss", "source": "Xinhua French", "category": "Science", "theme": "Technologie et sciences", "url": "https://french.news.cn/rss/science.xml"},
    {"mode": "rss", "source": "Xinhua French", "category": "Economie", "theme": "Économie", "url": "https://french.news.cn/rss/economie.xml"},
    {"mode": "rss", "source": "Xinhua French", "category": "Environnement/Tourisme", "theme": "Écologie et tourisme", "url": "https://french.news.cn/rss/environnement.xml"},
]

KEYWORD_MAP = {
    "chine": "中国", "chinois": "中国", "chinoise": "中国", "beijing": "北京", "pékin": "北京",
    "monde": "国际", "afrique": "非洲", "europe": "欧洲", "européen": "欧洲", "européenne": "欧洲",
    "france": "法国", "allemagne": "德国", "italie": "意大利", "espagne": "西班牙",
    "royaume-uni": "英国", "britannique": "英国", "londres": "伦敦",
    "union européenne": "欧盟", "ue": "欧盟", "onu": "联合国",
    "russie": "俄罗斯", "ukraine": "乌克兰", "coopération": "合作", "échanges": "交流",
    "développement": "发展", "économie": "经济", "commerce": "贸易", "culture": "文化",
    "science": "科技", "technologie": "科技", "satellite": "卫星", "espace": "航天",
    "spatiale": "航天", "écologie": "生态", "environnement": "环境", "tourisme": "旅游",
    "visite": "访问", "président": "总统 主席", "ministre": "部长", "premier ministre": "首相",
}
NAME_MAP = {
    "Starmer": "斯塔默", "Keir Starmer": "斯塔默", "Macron": "马克龙", "Trump": "特朗普",
    "Biden": "拜登", "Poutine": "普京", "Putin": "普京", "Zelensky": "泽连斯基",
    "Zelenskyy": "泽连斯基", "Scholz": "朔尔茨", "Merz": "默茨", "Meloni": "梅洛尼",
    "Von der Leyen": "冯德莱恩", "Guterres": "古特雷斯",
}

@dataclass
class NewsCandidate:
    id: str; source: str; language: str; category: str; theme: str
    title_fr: str; summary_fr: str; url_fr: str; published_fr: str
    zh_keywords: str
    zh_search_query_broad: str; zh_search_url_google_broad: str
    zh_search_url_google_news_cn: str; zh_search_url_baidu: str
    zh_search_query_strict: str; zh_search_url_google_strict: str
    zh_match_status: str
    zh_candidate_title_1: str = ""; zh_candidate_url_1: str = ""
    zh_candidate_title_2: str = ""; zh_candidate_url_2: str = ""
    zh_candidate_title_3: str = ""; zh_candidate_url_3: str = ""
    confirmed_title_zh: str = ""; confirmed_url_zh: str = ""; match_note: str = ""
    collected_at: str = ""; suggested_use: str = ""

def clean_html(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()

def slugify(s: str, n=48) -> str:
    s = re.sub(r"[^\w\s-]", "", (s or "").lower(), flags=re.UNICODE)
    return re.sub(r"\s+", "-", s).strip("-")[:n] or "item"

def normalize_date(entry) -> str:
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if parsed: return datetime(*parsed[:6], tzinfo=timezone.utc).date().isoformat()
    raw = (getattr(entry, "published", "") or getattr(entry, "updated", "") or "").strip()
    return raw

def add_parts(out, value):
    for p in str(value).split():
        if p and p not in out: out.append(p)

def zh_keywords(title, summary, category):
    text = f"{category} {title} {summary}"
    lower = text.lower()
    out = ["新华社"]
    for k,v in KEYWORD_MAP.items():
        if k in lower: add_parts(out, v)
    for k,v in NAME_MAP.items():
        if k.lower() in lower: add_parts(out, v)
    for tok in re.findall(r"\b[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'-]{2,}\b", text)[:5]:
        if tok not in out: out.append(tok)
    return out[:10]

def google_url(q): return "https://www.google.com/search?q=" + urllib.parse.quote(q)
def baidu_url(q): return "https://www.baidu.com/s?wd=" + urllib.parse.quote(q)

def suggested_use(title, summary):
    t = f"{title} {summary}".lower()
    if any(x in t for x in ["selon", "déclare", "indique"]): return "citation / source / discours rapporté"
    if any(x in t for x in ["coopération", "échanges", "partenariat"]): return "coopération internationale / expressions récurrentes"
    return "titre / termes / segment"

def serpapi_search(query, key):
    if not key: return []
    try:
        r = requests.get("https://serpapi.com/search.json", params={"engine":"google","q":query,"api_key":key,"num":"5","hl":"zh-cn"}, timeout=20)
        r.raise_for_status()
        data = r.json()
    except Exception as e:
        print("[WARN] SerpAPI failed:", e); return []
    out = []
    for item in data.get("organic_results", [])[:3]:
        link = item.get("link", "")
        if "news.cn" in link or "xinhuanet.com" in link:
            out.append({"title": item.get("title",""), "url": link})
    return out

def build_candidate(src, title, summary, url, published, key):
    kws = zh_keywords(title, summary, src["category"])
    kw = " ".join(kws)
    broad = kw
    news_cn = "site:news.cn " + " ".join(kws[1:])
    strict = f"(site:news.cn OR site:xinhuanet.com) {kw} {published}".strip()
    top = serpapi_search(broad, key)
    vals = {f"zh_candidate_title_{i}": "" for i in range(1,4)}
    vals.update({f"zh_candidate_url_{i}": "" for i in range(1,4)})
    for i,res in enumerate(top[:3], 1):
        vals[f"zh_candidate_title_{i}"] = res.get("title","")
        vals[f"zh_candidate_url_{i}"] = res.get("url","")
    return NewsCandidate(
        id=f"xinhua-parallel-{published}-{slugify(title)}",
        source=src["source"], language="fr", category=src["category"], theme=src["theme"],
        title_fr=title, summary_fr=summary, url_fr=url, published_fr=published,
        zh_keywords=kw, zh_search_query_broad=broad, zh_search_url_google_broad=google_url(broad),
        zh_search_url_google_news_cn=google_url(news_cn), zh_search_url_baidu=baidu_url(broad),
        zh_search_query_strict=strict, zh_search_url_google_strict=google_url(strict),
        zh_match_status="candidats automatiques à vérifier" if top else "recherches prêtes, à vérifier manuellement",
        collected_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        suggested_use=suggested_use(title, summary), **vals)

def collect_rss(src, key):
    parsed = feedparser.parse(src["url"])
    out = []
    for e in parsed.entries:
        title, summary, url = clean_html(getattr(e,"title","")), clean_html(getattr(e,"summary","")), getattr(e,"link","").strip()
        if title and url: out.append(build_candidate(src, title, summary, url, normalize_date(e), key))
    return out

def collect_html_index(src, key):
    out = []
    try:
        r = requests.get(src["url"], timeout=20, headers={"User-Agent":"Mozilla/5.0"})
        r.raise_for_status(); r.encoding = r.apparent_encoding or "utf-8"
    except Exception as e:
        print("[WARN] HTML index failed:", e); return out
    soup = BeautifulSoup(r.text, "html.parser")
    seen = set()
    for a in soup.find_all("a"):
        title, href = clean_html(a.get_text(" ", strip=True)), (a.get("href") or "").strip()
        if not title or len(title) < 12 or not href or href.startswith("#") or "javascript:" in href.lower(): continue
        url = urljoin(src["url"], href)
        if url in seen: continue
        seen.add(url)
        parent = clean_html(a.parent.get_text(" ", strip=True) if a.parent else "")
        m = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", parent)
        out.append(build_candidate(src, title, "", url, m.group(1) if m else "", key))
        if len(out) >= 50: break
    return out

def dedup(items):
    seen, out = set(), []
    for x in items:
        if x.url_fr in seen: continue
        seen.add(x.url_fr); out.append(x)
    return out

def main():
    key = os.getenv("SERPAPI_KEY","").strip()
    items = []
    for src in SOURCES:
        items += collect_rss(src, key) if src["mode"] == "rss" else collect_html_index(src, key)
    items = dedup(items)
    items.sort(key=lambda x: x.published_fr, reverse=True)
    items = items[:160]
    (ROOT/"data/rss").mkdir(parents=True, exist_ok=True)
    (ROOT/"data/candidates").mkdir(parents=True, exist_ok=True)
    (ROOT/"data/rss/xinhua_fr_zh_candidates.json").write_text(json.dumps([asdict(x) for x in items], ensure_ascii=False, indent=2), encoding="utf-8")
    with (ROOT/"data/candidates/xinhua_fr_zh_candidates.csv").open("w", encoding="utf-8-sig", newline="") as f:
        fields = list(asdict(items[0]).keys()) if items else list(NewsCandidate.__dataclass_fields__.keys())
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader()
        for item in items: w.writerow(asdict(item))
    (ROOT/"data/candidates/xinhua_fr_zh_candidates.js").write_text(
        "window.XINHUA_FR_ZH_CANDIDATES = " + json.dumps([asdict(x) for x in items], ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8")
    print(f"[OK] Prepared {len(items)} candidate items.")

if __name__ == "__main__":
    main()
