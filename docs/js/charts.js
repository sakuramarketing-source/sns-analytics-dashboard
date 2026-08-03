/**
 * charts.js
 * Chart.js グラフ管理
 */

let trendChartInstance = null;

/**
 * トレンド折れ線グラフを描画
 * Phase 1: account_daily 風の日次集計データを使用
 */
function renderTrendChart({ platform = 'all', since, until, metric = 'video_views' } = {}) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  // 既存グラフ破棄
  if (trendChartInstance) {
    trendChartInstance.destroy();
    trendChartInstance = null;
  }

  const platforms = platform === 'all' ? CONFIG.platforms : [platform];
  const allDates = new Set();
  const platformData = {};

  for (const p of platforms) {
    const rows = getAccountData({ platform: p, since, until });
    if (rows.length === 0) continue;

    platformData[p] = {};
    for (const row of rows) {
      const val = metric === 'engagement_rate' ? row.avg_engagement_rate : (row[metric] || row.reach || 0);
      platformData[p][row.date] = val;
      allDates.add(row.date);
    }
  }

  const labels = Array.from(allDates).sort().map(d => d.slice(5)); // MM-DD
  const datasets = [];

  for (const p of platforms) {
    if (!platformData[p]) continue;
    const values = Array.from(allDates).sort().map(d => platformData[p][d] ?? null);
    datasets.push({
      label: CONFIG.platformLabels[p],
      data: values,
      borderColor: CONFIG.colors[p],
      backgroundColor: CONFIG.colors[p] + '20',
      borderWidth: 2,
      tension: 0.3,
      fill: true,
      pointRadius: 3,
      pointHoverRadius: 5,
      spanGaps: true,
    });
  }

  if (datasets.length === 0) {
    // Chart.js が空だとエラーになるのでDOMで表示
    const container = ctx.parentElement;
    container.innerHTML = '<p class="empty" style="padding:48px">まだデータがありません</p>';
    return;
  }

  trendChartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top', labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed.y;
              if (val === null || val === undefined) return ' --';
              return ` ${ctx.dataset.label}: ${Number(val).toLocaleString()}`;
            },
          }
        }
      },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 10 } } },
        x: { ticks: { font: { size: 10 } } },
      },
    },
  });
}
