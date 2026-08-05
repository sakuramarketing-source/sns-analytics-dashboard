/**
 * app.js
 * メインアプリケーション制御
 */

// === 状態 ===
let state = {
  platform: 'all',
  period: 'all',        // デフォルトは全期間（データが少ないうちはこれが最適）
  weekOffset: 0,
  monthOffset: 0,
  metric: 'video_views',
};

// === DOM要素 ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// === 初期化 ===
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupNavTabs();
  try {
    await loadAllData();
    refresh();
  } catch (err) {
    $('#loading').classList.add('hidden');
    $('#error').classList.remove('hidden');
  }
});

// === ナビタブ切替（分析 ↔ コンテンツ管理） ===
function setupNavTabs() {
  $$('.nav-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      $$('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const view = tab.dataset.view;
      if (view === 'analytics') {
        $('#viewAnalytics').classList.remove('hidden');
        $('#viewContent').classList.add('hidden');
      } else {
        $('#viewAnalytics').classList.add('hidden');
        $('#viewContent').classList.remove('hidden');
        // コンテンツ管理のデータを毎回読み込み
        const ok = await loadContentData();
        if (ok) renderContent();
        else {
          document.getElementById('pipelineList').innerHTML = '<p class="empty">データを読み込めませんでした。pipeline / schedule シートを確認してください。</p>';
          document.getElementById('calendarStrip').innerHTML = '';
        }
      }
    });
  });
}

// === イベントリスナー ===
function setupEventListeners() {
  // プラットフォームタブ
  $('#platformTabs').addEventListener('click', (e) => {
    if (!e.target.classList.contains('tab')) return;
    $$('#platformTabs .tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    state.platform = e.target.dataset.platform;
    refresh();
  });

  // 期間タブ
  $$('.period__tabs .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.period__tabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.period = tab.dataset.period;
      state.weekOffset = 0;
      state.monthOffset = 0;
      refresh();
    });
  });

  // 前週/次週
  $('#prevWeek').addEventListener('click', () => {
    if (state.period === 'week') state.weekOffset--;
    else state.monthOffset--;
    refresh();
  });
  $('#nextWeek').addEventListener('click', () => {
    if (state.period === 'week') state.weekOffset++;
    else state.monthOffset++;
    refresh();
  });

  // グラフ指標切替
  $$('.chart__toggle .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.chart__toggle .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.metric = tab.dataset.metric;
      updateChart();
    });
  });
}

// === メイン更新 ===
function refresh() {
  if (!_rawData) return;

  const range = getCurrentRange();
  $('#periodRange').textContent = range.label;
  $('#loading').classList.add('hidden');

  updateKPIs(range);
  updateChart(range);
  updateTopPosts(range);
  updateComparison(range);
}

function getCurrentRange() {
  if (state.period === 'week') {
    return getWeekRange(state.weekOffset);
  } else if (state.period === 'month') {
    return getMonthRange(state.monthOffset);
  } else {
    // 全期間
    return { since: '2020-01-01', until: todayStr(), label: '全期間' };
  }
}

// === KPIカード ===
function updateKPIs(range) {
  const kpis = getKPIs({ platform: state.platform, ...range });

  // 前週比
  let prevRange;
  if (state.period === 'week') {
    prevRange = getWeekRange(state.weekOffset - 1);
  } else if (state.period === 'month') {
    prevRange = getMonthRange(state.monthOffset - 1);
  } else {
    prevRange = null;
  }
  const prevKpis = prevRange ? getKPIs({ platform: state.platform, ...prevRange }) : null;
  const delta = getWowDelta(kpis, prevKpis);

  const setKPI = (id, value, deltaVal, isPercent = false) => {
    $(`#${id}`).textContent = value ? value.toLocaleString() + (isPercent ? '%' : '') : '--';
    const deltaEl = $(`#${id}Delta`);
    if (deltaVal !== null && deltaVal !== undefined) {
      const isUp = deltaVal > 0;
      deltaEl.textContent = `${isUp ? '↑' : '↓'} ${Math.abs(deltaVal)}%`;
      deltaEl.className = `kpi-card__delta ${isUp ? 'up' : 'down'}`;
    } else {
      deltaEl.textContent = '';
      deltaEl.className = 'kpi-card__delta';
    }
  };

  if (kpis) {
    setKPI('kpiViews', kpis.views, delta?.views);
    setKPI('kpiLikes', kpis.likes, delta?.likes);
    setKPI('kpiFollowers', kpis.followers, delta?.followers);
    setKPI('kpiER', kpis.er, delta?.er, true);
    setKPI('kpiSaves', kpis.saves, delta?.saves);
    setKPI('kpiShares', kpis.shares, delta?.shares);
  }
}

// === グラフ ===
function updateChart(range) {
  renderTrendChart({
    platform: state.platform,
    since: range.since,
    until: range.until,
    metric: state.metric,
  });
}

// === TOP投稿 ===
function updateTopPosts(range) {
  const posts = getTopPosts({ platform: state.platform, ...range, limit: 5 });
  const container = $('#topPosts');

  if (posts.length === 0) {
    container.innerHTML = '<p class="empty">まだデータがありません</p>';
    return;
  }

  const medals = ['🥇', '🥈', '🥉', '4', '5'];
  container.innerHTML = posts.map((p, i) => `
    <div class="top-post">
      <span class="top-post__rank">${medals[i]}</span>
      <img class="top-post__thumb" src="${p.thumbnail_url || ''}" alt=""
           onerror="this.style.display='none'" loading="lazy">
      <div class="top-post__info">
        <p class="top-post__caption">${escapeHtml(p.caption || '(no caption)')}</p>
        <p class="top-post__meta">
          👁 ${formatNum(p.video_views)} · ❤️ ${formatNum(p.likes)} · 💬 ${formatNum(p.comments)}
        </p>
      </div>
      <span class="top-post__er">${p.engagement_rate || 0}%</span>
    </div>
  `).join('');
}

// === 前週比較 ===
function updateComparison(range) {
  const kpis = getKPIs({ platform: state.platform, ...range });

  let prevRange;
  if (state.period === 'week') {
    prevRange = getWeekRange(state.weekOffset - 1);
  } else if (state.period === 'month') {
    prevRange = getMonthRange(state.monthOffset - 1);
  } else {
    prevRange = null;
  }
  const prevKpis = prevRange ? getKPIs({ platform: state.platform, ...prevRange }) : null;
  const delta = getWowDelta(kpis, prevKpis);

  const container = $('#comparisonGrid');
  if (!kpis || !delta) {
    container.innerHTML = '<p class="empty">比較データがありません</p>';
    return;
  }

  const items = [
    { label: '再生回数', curr: kpis.views, delta: delta.views },
    { label: 'いいね', curr: kpis.likes, delta: delta.likes },
    { label: 'フォロワー', curr: kpis.followers, delta: delta.followers },
    { label: 'ER%', curr: kpis.er + '%', delta: delta.er },
  ];

  container.innerHTML = items.map(item => {
    const deltaStr = item.delta !== null
      ? `<span style="color:${item.delta >= 0 ? 'var(--color-up)' : 'var(--color-down)'}">${item.delta >= 0 ? '↑' : '↓'}${Math.abs(item.delta)}%</span>`
      : '--';
    return `
      <div class="comparison__item">
        <p class="comparison__label">${item.label}</p>
        <p class="comparison__delta">${deltaStr}</p>
      </div>
    `;
  }).join('');
}

// === 最終更新 ===
function updateLastUpdated() {
  // Phase 1: posts から最新日付を表示
  const posts = _rawData?.posts;
  if (posts && posts.length > 0) {
    // 最新の投稿日時を取得
    const sorted = [...posts].filter(p => p.post_date).sort((a, b) => b.post_date.localeCompare(a.post_date));
    if (sorted.length > 0) {
      $('#lastUpdated').textContent = sorted[0].post_date;
      return;
    }
  }
  $('#lastUpdated').textContent = new Date().toLocaleDateString('ja-JP');
}

// === ユーティリティ ===
function formatNum(n) {
  if (!n) return '0';
  const num = parseInt(n);
  if (num >= 10000) return (num / 10000).toFixed(1) + '万';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toLocaleString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
