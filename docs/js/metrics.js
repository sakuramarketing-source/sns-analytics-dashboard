/**
 * metrics.js — 投稿実績ビュー
 */

let _metricsData = [], _metricsNames = {}, _metricsChart = null;
let _mSince = '', _mUntil = '';

let _pipelineCache = [];

async function loadMetrics() {
  try {
    const [mRaw, pRaw] = await Promise.all([
      fetch(CONFIG.metricsCsv).then(r => r.text()),
      fetch(CONFIG.pipelineCsv).then(r => r.text()).catch(() => ''),
    ]);
    if (pRaw) {
      _pipelineCache = Papa.parse(pRaw, { header: true, skipEmptyLines: true }).data;
      _pipelineCache.forEach(r => { if (r['企画ID']) _metricsNames[r['企画ID']] = r['企画タイトル'] || r['企画ID']; });
    }
    _metricsData = Papa.parse(mRaw, { header: true, skipEmptyLines: true }).data
      .filter(r => r['企画ID'])
      .map(r => ({
        ...r,
        date: r['日付'] || '',
        views: parseInt(r['再生数']) || 0,
        likes: parseInt(r['いいね']) || 0,
        comments: parseInt(r['コメント']) || 0,
        shares: parseInt(r['シェア']) || 0,
        saves: parseInt(r['保存']) || 0,
        completion: parseFloat(r['完走率']) || 0,
        er: calcER(parseInt(r['再生数'])||0, parseInt(r['いいね'])||0, parseInt(r['コメント'])||0, parseInt(r['シェア'])||0, parseInt(r['保存'])||0),
        name: _metricsNames[r['企画ID']] || r['企画ID'] || '--',
      }));
    return true;
  } catch (e) { console.warn(e); return false; }
}

function calcER(v, l, c, sh, sa) { if (!v) return 0; return Math.round(((l+c+sh+sa)/v)*10000)/100; }

function filteredMetrics() {
  let data = _metricsData;
  if (_mSince) data = data.filter(r => r.date >= _mSince);
  if (_mUntil) data = data.filter(r => r.date <= _mUntil);
  return data;
}

function renderMetricsView() {
  // 数値入力の企画選択肢を更新
  populatePlanSelect();

  const data = filteredMetrics();
  if (!data.length) {
    document.getElementById('metricsList').innerHTML = '<p class="empty">表示できるデータがありません</p>';
    ['mViews','mER','mComp','mCount'].forEach(id => document.getElementById(id).textContent = '--');
    if (_metricsChart) { _metricsChart.destroy(); _metricsChart = null; }
    return;
  }

  // KPI
  const totalViews = data.reduce((s, r) => s + r.views, 0);
  const avgER = data.reduce((s, r) => s + r.er, 0) / data.length;
  const avgComp = data.reduce((s, r) => s + r.completion, 0) / data.length;
  document.getElementById('mViews').textContent = fmt(totalViews);
  document.getElementById('mER').textContent = avgER.toFixed(2) + '%';
  document.getElementById('mComp').textContent = data.some(r => r.completion > 0) ? avgComp.toFixed(1) + '%' : '--';
  document.getElementById('mCount').textContent = data.length + '件';

  renderMetricsChart(data);

  // 一覧
  const sorted = [...data].sort((a, b) => b.views - a.views);
  document.getElementById('metricsList').innerHTML = sorted.map((r, i) => `
    <div class="top-post">
      <span class="top-post__rank">${i + 1}</span>
      <div class="top-post__info">
        <p class="top-post__caption">${esc(r.name)}</p>
        <p class="top-post__meta">
          ${r.date.slice(5)} · ${r['プラットフォーム']||''} · 👁 ${fmt(r.views)} · ❤️ ${fmt(r.likes)}
          · 💬 ${fmt(r.comments)} · 🔗 ${fmt(r.shares)} · ⭐ ${fmt(r.saves)}
          ${r.completion ? ' · 🎯'+r.completion+'%' : ''}
        </p>
      </div>
      <span class="top-post__er">ER ${r.er||0}%</span>
    </div>`).join('');
}

function renderMetricsChart(data) {
  const ctx = document.getElementById('metricsChart');
  if (!ctx) return;
  if (_metricsChart) _metricsChart.destroy();

  const sorted = [...data].sort((a, b) => b.views - a.views).slice(0, 10);
  _metricsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: sorted.map(r => r.name.substring(0, 8)),
      datasets: [{
        label: '再生数', data: sorted.map(r => r.views),
        backgroundColor: CONFIG.colors.accent + '60', borderColor: CONFIG.colors.accent,
        borderWidth: 1, borderRadius: 4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { font:{size:10}, callback: v => fmt(v) } },
        y: { ticks: { font:{size:10} } },
      },
    },
  });
}

function applyMetricsFilter() {
  _mSince = document.getElementById('mSince').value;
  _mUntil = document.getElementById('mUntil').value;
  renderMetricsView();
}
function resetMetricsFilter() {
  document.getElementById('mSince').value = '';
  document.getElementById('mUntil').value = '';
  _mSince = ''; _mUntil = '';
  renderMetricsView();
}

function populatePlanSelect() {
  const sel = document.getElementById('mSelectPlan');
  if (!sel) return;
  const currentVal = sel.value;
  const posted = _pipelineCache.filter(r => r['ステータス'] === '投稿済み' && r['企画タイトル']);
  sel.innerHTML = '<option value="">企画を選択...</option>' +
    posted.map(r => `<option value="${r['企画ID']}">${esc(r['企画タイトル'])}</option>`).join('');
  if (currentVal) sel.value = currentVal;

  // 企画選択時に既存の数値を反映
  sel.onchange = () => {
    const id = sel.value;
    const m = _metricsData.find(r => r['企画ID'] === id);
    document.getElementById('mInputViews').value = m?.views || '';
    document.getElementById('mInputLikes').value = m?.likes || '';
    document.getElementById('mInputComments').value = m?.comments || '';
    document.getElementById('mInputShares').value = m?.shares || '';
    document.getElementById('mInputSaves').value = m?.saves || '';
    document.getElementById('mInputCompletion').value = m?.completion || '';
  };
}

// 保存ボタン
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('saveMetricsBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('mSelectPlan').value;
    if (!id) return alert('企画を選択してください');
    const btn = document.getElementById('saveMetricsBtn');
    btn.textContent = '保存中...'; btn.disabled = true;

    const mRow = [
      id,
      document.getElementById('mSelectPlan').selectedOptions[0]?.parentElement?.label || new Date().toISOString().split('T')[0],
      document.getElementById('mSelectPlatform').value,
      document.getElementById('mInputViews').value || '0',
      document.getElementById('mInputLikes').value || '0',
      document.getElementById('mInputComments').value || '0',
      document.getElementById('mInputShares').value || '0',
      document.getElementById('mInputSaves').value || '0',
      document.getElementById('mInputCompletion').value || '',
    ];

    // 日付は投稿予定日から取得
    const plan = _pipelineCache.find(r => r['企画ID'] === id);
    if (plan?.['投稿予定日']) mRow[1] = plan['投稿予定日'];

    const existIdx = _metricsData.findIndex(r => r['企画ID'] === id);
    if (existIdx >= 0) {
      await fetch(CONFIG.gasUrl, { method: 'POST', body: JSON.stringify({ action: 'update', sheet: 'metrics', rowIndex: existIdx + 2, row: mRow }) });
    } else {
      await fetch(CONFIG.gasUrl, { method: 'POST', body: JSON.stringify({ action: 'add', sheet: 'metrics', row: mRow }) });
    }

    btn.textContent = '保存済✅';
    setTimeout(() => { btn.textContent = '保存する'; btn.disabled = false; }, 1500);
    alert('保存しました！タブを切り替えると反映されます。');
  });
});

function fetchGAS(data) { return fetch(CONFIG.gasUrl, { method: 'POST', body: JSON.stringify(data) }); }

function fmt(n) { return window.formatNum ? window.formatNum(n) : String(n); }
window.esc = window.esc || function(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
