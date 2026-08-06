/**
 * metrics.js — 投稿実績（企画×数値 一覧 + 入力）
 */

let _mData = [], _mPipeline = [], _mNames = {};

async function loadMetrics() {
  try {
    const [mRaw, pRaw] = await Promise.all([
      fetch(CONFIG.metricsCsv).then(r => r.text()).catch(() => ''),
      fetch(CONFIG.pipelineCsv).then(r => r.text()).catch(() => ''),
    ]);
    if (pRaw) {
      _mPipeline = Papa.parse(pRaw, { header: true, skipEmptyLines: true }).data;
      _mPipeline.forEach(r => { if (r['企画ID']) _mNames[r['企画ID']] = r['企画タイトル'] || r['企画ID']; });
    }
    _mData = mRaw ? Papa.parse(mRaw, { header: true, skipEmptyLines: true }).data
      .filter(r => r['企画ID'])
      .map(r => ({
        ...r, name: _mNames[r['企画ID']] || r['企画ID'] || '--',
        views: parseInt(r['再生数'])||0, likes: parseInt(r['いいね'])||0,
        comments: parseInt(r['コメント'])||0, shares: parseInt(r['シェア'])||0,
        saves: parseInt(r['保存'])||0, completion: parseFloat(r['完走率'])||0,
        er: calcM(parseInt(r['再生数'])||0,parseInt(r['いいね'])||0,parseInt(r['コメント'])||0,parseInt(r['シェア'])||0,parseInt(r['保存'])||0),
      })) : [];
    return true;
  } catch (e) { console.warn(e); return false; }
}
function calcM(v,l,c,sh,sa){if(!v)return 0;return Math.round(((l+c+sh+sa)/v)*10000)/100;}

function renderMetricsView() {
  populateSelect();

  // 投稿済み企画 × 数値 をマージ
  const posted = _mPipeline.filter(r => r['ステータス'] === '投稿済み');
  if (!posted.length) { document.getElementById('metricsList').innerHTML='<p class="empty">投稿済みの企画がありません</p>'; return; }

  const list = posted.map(plan => {
    const m = _mData.find(r => r['企画ID'] === plan['企画ID']);
    return { ...plan, metrics: m };
  }).sort((a, b) => {
    // 数値ありを上に、日付順
    if (a.metrics && !b.metrics) return -1;
    if (!a.metrics && b.metrics) return 1;
    return (b.metrics?.views||0) - (a.metrics?.views||0);
  });

  document.getElementById('metricsList').innerHTML = list.map((item, i) => {
    const m = item.metrics;
    const hasData = !!m;
    return `
    <div class="top-post" onclick="${hasData?`fillMetricsForm('${item['企画ID']}')`:`openEditFromMetrics('${item['企画ID']}')`}">
      <span class="top-post__rank">${i+1}</span>
      <div class="top-post__info">
        <p class="top-post__caption">${esc(item['企画タイトル']||'--')}</p>
        <p class="top-post__meta">
          ${item['投稿予定日']?.slice(5)||''} · ${item['カテゴリ']||''}
          ${hasData ? ` · 👁 ${fmt(m.views)} · ❤️ ${fmt(m.likes)} · 💬 ${fmt(m.comments)} · ⭐ ${fmt(m.saves)}` : ' · ⚠️ 数値未入力'}
        </p>
      </div>
      ${hasData ? `<span class="top-post__er">ER ${m.er||0}%</span>` : '<span style="font-size:0.7rem;color:var(--color-down)">未入力</span>'}
    </div>`;
  }).join('');
}

function populateSelect() {
  const sel = document.getElementById('mSelectPlan');
  if (!sel) return;
  const posted = _mPipeline.filter(r => r['ステータス'] === '投稿済み' && r['企画タイトル']);
  sel.innerHTML = '<option value="">企画を選択...</option>' +
    posted.map(r => `<option value="${r['企画ID']}">${esc(r['企画タイトル'])}</option>`).join('');
  sel.onchange = () => { const id=sel.value; if(id) fillMetricsForm(id); };
}

function fillMetricsForm(id) {
  document.getElementById('mSelectPlan').value = id;
  const m = _mData.find(r => r['企画ID'] === id);
  document.getElementById('mInputViews').value = m?.views || '';
  document.getElementById('mInputLikes').value = m?.likes || '';
  document.getElementById('mInputComments').value = m?.comments || '';
  document.getElementById('mInputShares').value = m?.shares || '';
  document.getElementById('mInputSaves').value = m?.saves || '';
  document.getElementById('mInputCompletion').value = m?.completion || '';
  // スクロールして入力欄を見せる
  document.querySelector('details')?.setAttribute('open','');
  document.getElementById('mSelectPlan').scrollIntoView({behavior:'smooth'});
}

function openEditFromMetrics(id) {
  // コンテンツ管理のopenEditを呼ぶ（フォールバック）
  if (window._pipeline) {
    window._pipeline = _mPipeline;
    const row = _mPipeline.find(r => r['企画ID'] === id);
    if (row && typeof openEdit === 'function') {
      // 簡易: コンテンツ管理タブ経由で編集を促す
      alert('「📋 コンテンツ管理」タブで企画を編集してください');
    }
  }
}

// 保存
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('saveMetricsBtn')?.addEventListener('click', async () => {
    const id = document.getElementById('mSelectPlan').value;
    if (!id) return alert('企画を選択してください');
    const btn = document.getElementById('saveMetricsBtn');
    btn.textContent = '保存中...'; btn.disabled = true;

    const plan = _mPipeline.find(r => r['企画ID'] === id);
    const mRow = [
      id, plan?.['投稿予定日'] || new Date().toISOString().split('T')[0],
      document.getElementById('mSelectPlatform').value,
      document.getElementById('mInputViews').value||'0',
      document.getElementById('mInputLikes').value||'0',
      document.getElementById('mInputComments').value||'0',
      document.getElementById('mInputShares').value||'0',
      document.getElementById('mInputSaves').value||'0',
      document.getElementById('mInputCompletion').value||'',
    ];
    const existIdx = _mData.findIndex(r => r['企画ID'] === id);
    const payload = existIdx >= 0
      ? { action:'update', sheet:'metrics', rowIndex: existIdx+2, row: mRow }
      : { action:'add', sheet:'metrics', row: mRow };
    await fetch(CONFIG.gasUrl, { method:'POST', body: JSON.stringify(payload) });

    btn.textContent = '保存済✅';
    setTimeout(() => { btn.textContent = '保存する'; btn.disabled = false; }, 1500);
    alert('タブを切り替えると反映されます');
  });
});

function fmt(n) { return window.formatNum ? window.formatNum(n) : String(n); }
window.esc = window.esc || function(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
