/**
 * metrics.js — 投稿実績ビュー
 * metrics CSV から数値を読み取り、KPI + グラフ + 一覧を表示
 */

let _metricsData = [];
let _metricsChart = null;

async function loadMetrics() {
  try {
    const raw = await fetch(CONFIG.metricsCsv).then(r => r.text());
    _metricsData = Papa.parse(raw, { header: true, skipEmptyLines: true }).data
      .filter(r => r['企画ID'])
      .map(r => ({
        ...r,
        views: parseInt(r['再生数']) || 0,
        likes: parseInt(r['いいね']) || 0,
        comments: parseInt(r['コメント']) || 0,
        shares: parseInt(r['シェア']) || 0,
        saves: parseInt(r['保存']) || 0,
        completion: parseFloat(r['完走率']) || 0,
        er: calcMetricER(parseInt(r['再生数'])||0, parseInt(r['いいね'])||0, parseInt(r['コメント'])||0, parseInt(r['シェア'])||0, parseInt(r['保存'])||0),
      }));
    return true;
  } catch (e) { return false; }
}

function calcMetricER(views, likes, comments, shares, saves) {
  if (!views) return 0;
  return Math.round(((likes + comments + shares + saves) / views) * 10000) / 100;
}

function renderMetricsView() {
  if (!_metricsData.length) {
    document.getElementById('metricsList').innerHTML = '<p class="empty">まだデータがありません。企画を「投稿済み」にして数値を入力してください。</p>';
    return;
  }

  // KPI
  const totalViews = _metricsData.reduce((s, r) => s + r.views, 0);
  const avgER = _metricsData.reduce((s, r) => s + r.er, 0) / _metricsData.length;
  const avgComp = _metricsData.reduce((s, r) => s + r.completion, 0) / _metricsData.length;
  document.getElementById('mViews').textContent = fmt(totalViews);
  document.getElementById('mER').textContent = avgER.toFixed(2) + '%';
  document.getElementById('mComp').textContent = _metricsData.some(r => r.completion > 0) ? avgComp.toFixed(1) + '%' : '--';
  document.getElementById('mCount').textContent = _metricsData.length + '件';

  // グラフ（投稿別 棒グラフ）
  renderMetricsChart();

  // 一覧
  const sorted = [..._metricsData].sort((a, b) => b.views - a.views);
  document.getElementById('metricsList').innerHTML = sorted.map((r, i) => {
    const title = (window._pipeline ? window._pipeline.find(p => p['企画ID'] === r['企画ID']) : null);
    const name = title ? title['企画タイトル'] : (r['企画ID'] || '--');
    return `
    <div class="top-post">
      <span class="top-post__rank">${i + 1}</span>
      <div class="top-post__info">
        <p class="top-post__caption">${esc(name)}</p>
        <p class="top-post__meta">
          👁 ${fmt(r.views)} · ❤️ ${fmt(r.likes)} · 💬 ${fmt(r.comments)}
          · 🔗 ${fmt(r.shares)} · ⭐ ${fmt(r.saves)}
          ${r.completion ? ' · 🎯 ' + r.completion + '%' : ''}
        </p>
      </div>
      <span class="top-post__er">ER ${r.er || 0}%</span>
    </div>`;
  }).join('');
}

function renderMetricsChart() {
  const ctx = document.getElementById('metricsChart');
  if (!ctx) return;
  if (_metricsChart) _metricsChart.destroy();

  const sorted = [..._metricsData].sort((a, b) => b.views - a.views).slice(0, 10);
  const labels = sorted.map(r => {
    const p = window._pipeline ? window._pipeline.find(x => x['企画ID'] === r['企画ID']) : null;
    return (p?.['企画タイトル'] || r['企画ID'] || '--').substring(0, 8);
  });

  _metricsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '再生数',
        data: sorted.map(r => r.views),
        backgroundColor: CONFIG.colors.accent + '60',
        borderColor: CONFIG.colors.accent,
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { font: { size: 10 }, callback: v => fmt(v) } },
        y: { ticks: { font: { size: 10 } } },
      },
    },
  });
}

function fmt(n) { return window.formatNum ? window.formatNum(n) : String(n); }
window.esc = window.esc || function(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
