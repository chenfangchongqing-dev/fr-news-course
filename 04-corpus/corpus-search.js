function labelType(type) {
  const labels = {
    term: "术语",
    expression: "表达",
    segment: "句段",
    case: "案例"
  };
  return labels[type] || type;
}

function renderResults(items) {
  const container = document.getElementById("results");
  if (!items.length) {
    container.innerHTML = "<p>没有找到匹配结果。</p>";
    return;
  }
  container.innerHTML = items.map(item => `
    <section class="result">
      <h3>${item.zh}</h3>
      <p><strong>法语：</strong>${item.fr}</p>
      <p class="meta">类型：${labelType(item.type)} · 主题：${item.theme} · 来源：${item.source}</p>
      <p>${item.note}</p>
    </section>
  `).join("");
}

function searchCorpus() {
  const keyword = document.getElementById("searchInput").value.trim().toLowerCase();
  const type = document.getElementById("typeFilter").value;
  const results = corpusData.filter(item => {
    const matchesType = type === "all" || item.type === type;
    const haystack = `${item.zh} ${item.fr} ${item.theme} ${item.note} ${item.source}`.toLowerCase();
    const matchesKeyword = !keyword || haystack.includes(keyword);
    return matchesType && matchesKeyword;
  });
  renderResults(results);
}

document.getElementById("searchButton").addEventListener("click", searchCorpus);
document.getElementById("searchInput").addEventListener("keydown", event => {
  if (event.key === "Enter") searchCorpus();
});
renderResults(corpusData);
