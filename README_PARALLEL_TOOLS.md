# Xinhua French-Chinese parallel candidate tools v3

This package prepares French-Chinese matching candidates for the course platform.

## Added in v3

The source list now includes:

```text
Chine
Monde
Afrique
Europe
Culture
Science
Economie
Environnement/Tourisme
```

Note: Europe is collected from the Europe index page as metadata because Europe is not shown as a top-level RSS feed on the Xinhua French RSS index.

## What it does

It collects metadata and prepares a table with:

- French title
- French URL
- publication date
- category
- suggested Chinese search query
- clickable Chinese search URL
- optional top Chinese candidates if `SERPAPI_KEY` is configured

## Important

This workflow does not scrape full article text. It is designed for building a teaching-oriented, reviewable candidate table.

## Files to upload

Upload these folders/files to the root of your repository:

```text
.github/
tools/
data/
README_PARALLEL_TOOLS.md
```

## Run the workflow

```text
Actions
→ Collect Xinhua FR and prepare ZH matching
→ Run workflow
```

## Outputs

```text
data/rss/xinhua_fr_zh_candidates.json
data/candidates/xinhua_fr_zh_candidates.csv
data/candidates/xinhua_fr_zh_candidates.js
```

Open the CSV file and confirm Chinese matching articles manually before using the data in the course corpus.
