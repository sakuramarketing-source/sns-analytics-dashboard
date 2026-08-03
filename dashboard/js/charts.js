/**
 * charts.js
 * Chart.js グラフ管理
 */

let trendChartInstance = null;

/**
 * トレンド折れ線グラフを描画
 */
function renderTrendChart({ platform = 'all', since, until, metric = 'video_views' } = {}) {
  const ctx = document.getElementById('trendChart');
  if (!ctx) return;

  // 既存グラフ破棄
  if (trendChartInstance) {
    trendChartInstance.destroy();
    trendChartInstance = null;
  }

  // データ取得
  const datasets = [];
  const platforms = platform === 'all' ? CONFIG.platforms : [platform];
  const metricLabels = {
    video_views: '再生回数',
    likes: 'いいね',
    comments: 'コメント',
    engagement_rate: 'ER%',
  };

  for (const p of platforms) {
    const rows = getAccountData({ platform: p, since, until });
    if (rows.length === 0) continue;

    // アカウント日次データ → 投稿別データに変更
    // account_daily の各日付の合計値を使用
    const posts = getPostData({ platform: p, since, until });
    const dailyTotals = {};

    // 日付でグループ化
    for (const row of rows) {
      const date = row.date;
      if (!dailyTotals[date]) {
        dailyTotals[date] = { likes: 0, comments: 0, shares: 0, saves: 0, views: 0, er: 0, count: 0 };
      }
      dailyTotals[date].likes += parseInt(row.likes) || 0;
      dailyTotals[date].comments += parseInt(row.comments) || 0;
      dailyTotals[date].shares += parseInt(row.shares) || 0;
      dailyTotals[date].saves += parseInt(row.saves) || 0;
      dailyTotals[date].views += parseInt(row.reach) || 0;
      const er = parseFloat(row.avg_engagement_rate) || 0;
      dailyTotals[date].er += er;
      dailyTotals[date].count++;
    }

    const dates = Object.keys(dailyTotals).sort();
    const values = dates.map(d => {
      const t = dailyTotals[d];
      switch (metric) {
        case 'likes': return t.likes;
        case 'comments': return t.comments;
        case 'engagement_rate': return t.count > 0 ? Math.round((t.er / t.count) * 100) / 100 : 0;
        case 'video_views':
        default: return t.views;
      }
    });

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
    });

    // 初回の日付ラベルだけ使う
    if (datasets.length === 1) {
      trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: dates.map(d => d.slice(5)), // MM-DD 形式
          datasets: datasets,
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}`,
              }
            }
          },
          scales: {
            y: { beginAtZero: true, ticks: { font: { size: 10 } } },
            x: { ticks: { font: { size: 10 } } },
          },
        },
      });
    } else {
      // 複数プラットフォームの場合はデータセット追加
      trendChartInstance.data.datasets = datasets;
      trendChartInstance.update();
    }
  }

  // データがない場合
  if (datasets.length === 0) {
    ctx.parentElement.innerHTML = '<p class="empty" style="padding:48px">まだデータがありません</p>';
  }
}
