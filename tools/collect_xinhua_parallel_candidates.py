#!/usr/bin/env python3
"""
Collect selected Xinhua French sources and prepare Chinese matching candidates
for the course platform "La traduction de presse chinois-français".

This script collects metadata only:
- French title
- French URL
- publication date
- source
- category
- summary, when available

It does not scrape full article text.

Sources:
- RSS feeds when available.
- Europe index page as metadata fallback, because Europe is a subcategory page
  rather than a top-level RSS item on the Xinhua French RSS index.

Optional:
- If SERPAPI_KEY is configured in GitHub Secrets, the script searches for up
  to three possible Chinese matching articles.
- Without SERPAPI_KEY, it generates Chinese search queries and clickable search URLs.
"""

from __future__ import annotations

import csv
import json
import os
import re
import urllib.parse
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin

import feedparser
import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]

SOURCES = [
    {
        "mode": "rss",
        "source": "Xinhua French",
        "category": "Chine",
        "theme": "Actualité chinoise",
        "url": "https://french.news.cn/rss/chine.xml",
    },
    {
        "mode": "rss",
        "source": "Xinhua French",
        "category": "Monde",
        "theme": "Monde",
        "url": "https://french.news.cn/rss/monde.xml",
    },
    {
        "mode": "rss",
        "source": "Xinhua French",
        "category": "Afrique",
        "theme": "Afrique",
        "url": "https://french.news.cn/rss/afrique.xml",
    },
    {
        "mode": "html_index",
        "source": "Xinhua French",
        "category": "Europe",
        "theme": "Europe",
        "url": "https://french.news.cn/europe/index.htm",
    },
    {
        "mode": "rss",
        "source": "Xinhua French",
        "category": "Culture",
        "theme": "Culture",
        "url": "https://french.news.cn/rss/culture.xml",
    },
    {
        "mode": "rss",
        "source": "Xinhua French",
        "category": "Science",
        "theme": "Technologie et sciences",
        "url": "https://french.news.cn/rss/science.xml",
    },
    {
        "mode": "rss",
        "source": "Xinhua French",
        "category": "Economie",
        "theme": "Économie",
        "url": "https://french.news.cn/rss/economie.xml",
    },
    {
        "mode": "rss",
        "source": "Xinhua French",
        "category": "Environnement/Tourisme",
        "theme": "Écologie et tourisme",
        "url": "https://french.news.cn/rss/environnement.xml",
    },
]


KEYWORD_MAP = {
    "chine": "中国",
    "chinois": "中国",
    "chinoise": "中国",
    "beijing": "北京",
    "pékin": "北京",
    "shanghai": "上海",
    "xinjiang": "新疆",
    "tibet": "西藏",
    "hong kong": "香港",
    "taiwan": "台湾",
    "monde": "国际",
    "afrique": "非洲",
    "africain": "非洲",
    "africaine": "非洲",
    "europe": "欧洲",
    "européen": "欧洲",
    "européenne": "欧洲",
    "france": "法国",
    "allemagne": "德国",
    "italie": "意大利",
    "espagne": "西班牙",
    "royaume-uni": "英国",
    "russie": "俄罗斯",
    "ukraine": "乌克兰",
    "union européenne": "欧盟",
    "ue": "欧盟",
    "onu": "联合国",
    "coopération": "合作",
    "échanges": "交流",
    "développement": "发展",
    "économie": "经济",
    "commerce": "贸易",
    "culture": "文化",
    "patrimoine": "遗产",
    "éducation": "教育",
    "université": "大学",
    "science": "科技",
    "technologie": "科技",
    "satellite": "卫星",
    "mission": "任务",
    "espace": "航天",
    "spatiale": "航天",
    "écologie": "生态",
    "environnement": "环境",
    "tourisme": "旅游",
    "lance": "发射 OR 启动",
    "publie": "发布",
    "inaugure": "启用 OR 开幕",
    "oppose": "反对",
    "opposition": "反对",
    "visite": "访问",
    "président": "总统 OR 主席",
    "ministre": "部长",
}


@dataclass
class NewsCandidate:
    id: str
    source: str
    language: str
    category: str
    theme: str
    title_fr: str
    summary_fr: str
    url_fr: str
    published_fr: str
    zh_search_query: str
    zh_search_url: str
    zh_match_status: str
    zh_candidate_title_1: str = ""
    zh_candidate_url_1: str = ""
    zh_candidate_title_2: str = ""
    zh_candidate_url_2: str = ""
    zh_candidate_title_3: str = ""
    zh_candidate_url_3: str = ""
    confirmed_title_zh: str = ""
    confirmed_url_zh: str = ""
    match_note: str = ""
    collected_at: str = ""
    suggested_use: str = ""


def slugify(text: str, max_len: int = 64) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text, flags=re.UNICODE)
    text = re.sub(r"\s+", "-", text).strip("-")
    return text[:max_len] or "item"


def clean_html(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_date(entry) -> str:
    parsed = getattr(entry, "published_parsed", None) or getattr(entry, "updated_parsed", None)
    if parsed:
        return datetime(*parsed[:6], tzinfo=timezone.utc).date().isoformat()

    raw = getattr(entry, "published", "") or getattr(entry, "updated", "")
    raw = raw.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", raw):
        return raw
    return raw


def infer_suggested_use(title: str, summary: str) -> str:
    text = f"{title} {summary}".lower()
    if any(k in text for k in ["lance", "inaugure", "ouvre", "publie"]):
        return "titre / chapeau / terminologie"
    if any(k in text for k in ["selon", "déclare", "indique", "a déclaré"]):
        return "citation / source / discours rapporté"
    if any(k in text for k in ["coopération", "échanges", "partenariat"]):
        return "coopération internationale / expressions récurrentes"
    return "titre / termes / segment"


def generate_zh_search_query(title: str, summary: str, published: str, category: str) -> str:
    text = f"{category} {title} {summary}".lower()
    terms: list[str] = ["新华社"]

    for fr_key, zh_value in KEYWORD_MAP.items():
        if fr_key in text and zh_value not in terms:
            terms.append(zh_value)

    proper_tokens = re.findall(r"\b[A-Z][A-Za-zÀ-ÖØ-öø-ÿ'-]{2,}\b", f"{title} {summary}")
    for tok in proper_tokens[:6]:
        if tok not in terms:
            terms.append(tok)

    numbers = re.findall(r"\b\d+(?:[.,]\d+)?\b", f"{title} {summary}")
    for num in numbers[:4]:
        if num not in terms:
            terms.append(num)

    if published:
        terms.append(published)

    query = " ".join(terms[:14])
    return f"site:news.cn OR site:xinhuanet.com {query}"


def make_search_url(query: str) -> str:
    return "https://www.google.com/search?q=" + urllib.parse.quote(query)


def serpapi_search(query: str, api_key: str) -> list[dict]:
    if not api_key:
        return []

    params = {
        "engine": "google",
        "q": query,
        "api_key": api_key,
        "num": "5",
        "hl": "zh-cn",
    }
    try:
        r = requests.get("https://serpapi.com/search.json", params=params, timeout=20)
        r.raise_for_status()
        data = r.json()
    except Exception as exc:
        print(f"[WARN] SerpAPI request failed: {exc}")
        return []

    results = []
    for item in data.get("organic_results", [])[:3]:
        title = item.get("title", "")
        link = item.get("link", "")
        if link and ("news.cn" in link or "xinhuanet.com" in link):
            results.append({"title": title, "url": link})

    return results


def build_candidate(source_cfg: dict, title: str, summary: str, url: str, published: str, serpapi_key: str) -> NewsCandidate:
    query = generate_zh_search_query(title, summary, published, source_cfg["category"])
    search_url = make_search_url(query)
    top = serpapi_search(query, serpapi_key)

    values = {
        "zh_candidate_title_1": "",
        "zh_candidate_url_1": "",
        "zh_candidate_title_2": "",
        "zh_candidate_url_2": "",
        "zh_candidate_title_3": "",
        "zh_candidate_url_3": "",
    }
    for idx, res in enumerate(top[:3], start=1):
        values[f"zh_candidate_title_{idx}"] = res.get("title", "")
        values[f"zh_candidate_url_{idx}"] = res.get("url", "")

    status = "candidats automatiques à vérifier" if top else "requête prête, à vérifier manuellement"
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")

    return NewsCandidate(
        id=f"xinhua-parallel-{published}-{slugify(title, 48)}",
        source=source_cfg["source"],
        language="fr",
        category=source_cfg["category"],
        theme=source_cfg["theme"],
        title_fr=title,
        summary_fr=summary,
        url_fr=url,
        published_fr=published,
        zh_search_query=query,
        zh_search_url=search_url,
        zh_match_status=status,
        collected_at=now,
        suggested_use=infer_suggested_use(title, summary),
        **values,
    )


def collect_rss(source_cfg: dict, serpapi_key: str = "") -> list[NewsCandidate]:
    parsed = feedparser.parse(source_cfg["url"])
    items: list[NewsCandidate] = []

    for entry in parsed.entries:
        title = clean_html(getattr(entry, "title", ""))
        summary = clean_html(getattr(entry, "summary", ""))
        url = getattr(entry, "link", "").strip()
        published = normalize_date(entry)

        if not title or not url:
            continue

        items.append(build_candidate(source_cfg, title, summary, url, published, serpapi_key))

    return items


def collect_html_index(source_cfg: dict, serpapi_key: str = "") -> list[NewsCandidate]:
    items: list[NewsCandidate] = []
    try:
        r = requests.get(source_cfg["url"], timeout=20, headers={"User-Agent": "Mozilla/5.0"})
        r.raise_for_status()
        r.encoding = r.apparent_encoding or "utf-8"
    except Exception as exc:
        print(f"[WARN] Failed to open HTML index {source_cfg['url']}: {exc}")
        return []

    soup = BeautifulSoup(r.text, "html.parser")
    text_all = soup.get_text(" ", strip=True)
    default_date = ""
    m_default = re.search(r"\b(\d{4}-\d{2}-\d{2})\b", text_all)
    if m_default:
        default_date = m_default.group(1)

    seen_urls = set()
    for a in soup.find_all("a"):
        title = clean_html(a.get_text(" ", strip=True))
        href = a.get("href", "").strip()

        if not title or not href:
            continue
        if len(title) < 12:
            continue
        if href.startswith("#") or "javascript:" in href.lower():
            continue

        url = urljoin(source_cfg["url"], href)
        if url in seen_urls:
            continue
        seen_urls.add(url)

        parent_text = clean_html(a.parent.get_text(" ", strip=True) if a.parent else "")
        date_match = re.search(r"\b(20\d{2}-\d{2}-\d{2})\b", parent_text)
        published = date_match.group(1) if date_match else default_date

        items.append(build_candidate(source_cfg, title, "", url, published, serpapi_key))

        # Keep a reasonable number from the page.
        if len(items) >= 50:
            break

    return items


def deduplicate(items: Iterable[NewsCandidate]) -> list[NewsCandidate]:
    seen: set[str] = set()
    out: list[NewsCandidate] = []
    for item in items:
        key = item.url_fr
        if key in seen:
            continue
        seen.add(key)
        out.append(item)
    return out


def write_json(items: list[NewsCandidate]) -> None:
    out = ROOT / "data" / "rss" / "xinhua_fr_zh_candidates.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(
        json.dumps([asdict(x) for x in items], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_csv(items: list[NewsCandidate]) -> None:
    out = ROOT / "data" / "candidates" / "xinhua_fr_zh_candidates.csv"
    out.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = list(asdict(items[0]).keys()) if items else [
        "id", "source", "language", "category", "theme", "title_fr", "url_fr",
        "published_fr", "zh_search_query", "zh_search_url", "zh_match_status"
    ]

    with out.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for item in items:
            writer.writerow(asdict(item))


def write_js(items: list[NewsCandidate]) -> None:
    out = ROOT / "data" / "candidates" / "xinhua_fr_zh_candidates.js"
    out.parent.mkdir(parents=True, exist_ok=True)
    content = (
        "/* Auto-generated by tools/collect_xinhua_parallel_candidates.py. */\n"
        "window.XINHUA_FR_ZH_CANDIDATES = "
        + json.dumps([asdict(x) for x in items], ensure_ascii=False, indent=2)
        + ";\n"
    )
    out.write_text(content, encoding="utf-8")


def main() -> None:
    serpapi_key = os.getenv("SERPAPI_KEY", "").strip()

    if serpapi_key:
        print("[INFO] SERPAPI_KEY found. Automatic Chinese candidate search is enabled.")
    else:
        print("[INFO] No SERPAPI_KEY found. The script will generate Chinese search URLs only.")

    all_items: list[NewsCandidate] = []
    for source in SOURCES:
        try:
            if source["mode"] == "rss":
                all_items.extend(collect_rss(source, serpapi_key=serpapi_key))
            elif source["mode"] == "html_index":
                all_items.extend(collect_html_index(source, serpapi_key=serpapi_key))
            else:
                print(f"[WARN] Unknown mode: {source['mode']}")
        except Exception as exc:
            print(f"[WARN] Failed to collect {source['url']}: {exc}")

    items = deduplicate(all_items)
    items.sort(key=lambda x: x.published_fr, reverse=True)
    items = items[:160]

    write_json(items)
    write_csv(items)
    write_js(items)

    print(f"[OK] Prepared {len(items)} French-Chinese matching candidate items.")


if __name__ == "__main__":
    main()
