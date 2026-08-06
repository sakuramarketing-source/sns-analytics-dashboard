/**
 * metrics.js — 全投稿企画の数値を一覧から直接編集
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
    _mData = mRaw ? Papa.parse(mRaw, { header: true, skipEmptyLines: true }).data : [];
    return true;
  } catch (e) { console.warn(e); return false; }
}

function getNum(r, key) { return parseInt(r[key]) || 0; }
function calcM(v,l,c,sh,sa){ if(!v)return 0; return Math.round(((l+c+sh+sa)/v)*10000)/100; }

function renderMetricsView() {
  const posted = _mPipeline.filter(r => r['ステータス'] === '投稿済み' && r['企画タイトル']);
  if (!posted.length) {
    document.getElementById('metricsList').innerHTML = '<p class="empty">投稿済みの企画がありません。コンテンツ管理でステータスを「投稿済み」にしてください。</p>';
    return;
  }

  document.getElementById('metricsList').innerHTML = posted.map(plan => {
    const id = plan['企画ID'];
    const m = _mData.find(r => r['企画ID'] === id);
    const hasData = !!(m && (getNum(m,'再生数') > 0));
    const v = hasData ? getNum(m,'再生数') : 0;
    const l = hasData ? getNum(m,'いいね') : 0;
    const c = hasData ? getNum(m,'コメント') : 0;
    const sh = hasData ? getNum(m,'シェア') : 0;
    const sa = hasData ? getNum(m,'保存') : 0;
    const co = hasData ? (parseFloat(m['完走率'])||0) : 0;
    const er = hasData ? calcM(v,l,c,sh,sa) : 0;
    const pf = hasData ? (m['プラットフォーム']||'TikTok') : 'TikTok';
    const date = plan['投稿予定日'] || '';

    return `
    <div class="metrics-card" style="background:var(--color-surface);border-radius:var(--radius);padding:12px 14px;margin-bottom:8px;box-shadow:var(--shadow)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:${hasData?'8px':'4px'}">
        <div>
          <p style="font-weight:700;font-size:0.85rem">${esc(plan['企画タイトル'])}</p>
          <p style="font-size:0.7rem;color:var(--color-text-secondary)">${date.slice(5)} · ${plan['カテゴリ']||''}${hasData?` · 👁 ${fmt(v)} · ER ${er}%`:''}</p>
        </div>
        ${hasData ? `<span style="font-size:0.7rem;background:#dcfce7;color:#166534;padding:2px 8px;border-radius:10px">入力済</span>` : `<span style="font-size:0.7rem;background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:10px">未入力</span>`}
      </div>
      <div class="metrics-inputs" style="display:${hasData?'none':'block'}">
        <select class="input" data-id="${id}" data-field="pf" style="font-size:0.75rem;padding:6px 8px;margin-bottom:4px">
          <option ${pf==='TikTok'?'selected':''}>TikTok</option>
          <option ${pf==='Instagram'?'selected':''}>Instagram</option>
        </select>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
          <div><span style="font-size:0.65rem;color:var(--color-text-secondary)">再生数</span><input class="input" data-id="${id}" data-field="v" value="${v||''}" type="number" placeholder="0" style="padding:6px 8px;font-size:0.8rem;margin-bottom:2px" inputmode="numeric"></div>
          <div><span style="font-size:0.65rem;color:var(--color-text-secondary)">いいね</span><input class="input" data-id="${id}" data-field="l" value="${l||''}" type="number" placeholder="0" style="padding:6px 8px;font-size:0.8rem;margin-bottom:2px" inputmode="numeric"></div>
          <div><span style="font-size:0.65rem;color:var(--color-text-secondary)">コメント</span><input class="input" data-id="${id}" data-field="c" value="${c||''}" type="number" placeholder="0" style="padding:6px 8px;font-size:0.8rem;margin-bottom:2px" inputmode="numeric"></div>
          <div><span style="font-size:0.65rem;color:var(--color-text-secondary)">シェア</span><input class="input" data-id="${id}" data-field="sh" value="${sh||''}" type="number" placeholder="0" style="padding:6px 8px;font-size:0.8rem;margin-bottom:2px" inputmode="numeric"></div>
          <div><span style="font-size:0.65rem;color:var(--color-text-secondary)">保存</span><input class="input" data-id="${id}" data-field="sa" value="${sa||''}" type="number" placeholder="0" style="padding:6px 8px;font-size:0.8rem;margin-bottom:2px" inputmode="numeric"></div>
          <div><span style="font-size:0.65rem;color:var(--color-text-secondary)">完走率(%)</span><input class="input" data-id="${id}" data-field="co" value="${co||''}" type="text" placeholder="例:72" style="padding:6px 8px;font-size:0.8rem;margin-bottom:2px"></div>
        </div>
        <button class="btn btn--full" style="margin-top:4px;font-size:0.85rem"
          onclick="saveMetricsCard(event,'${id}','${date}')">${hasData?'更新する':'保存する'}</button>
      </div>
      ${hasData ? `<button class="btn btn--ghost" style="width:100%;font-size:0.75rem;margin-top:4px" onclick="toggleMetricsCard(event)">✏️ 編集</button>` : ''}
    </div>`;
  }).join('');
}

// 編集ボタンで入力欄を表示/非表示
function toggleMetricsCard(e) {
  const card = e.target.closest('.metrics-card');
  const inputs = card.querySelector('.metrics-inputs');
  if (inputs.style.display === 'none') {
    inputs.style.display = 'block';
    e.target.textContent = '閉じる';
  } else {
    inputs.style.display = 'none';
    e.target.textContent = '✏️ 編集';
  }
}

// 保存
async function saveMetricsCard(e, id, date) {
  const card = e.target.closest('.metrics-card');
  const getVal = field => card.querySelector(`[data-field="${field}"]`).value;
  const btn = e.target;
  btn.textContent = '保存中...'; btn.disabled = true;

  const mRow = [
    id, date || new Date().toISOString().split('T')[0],
    getVal('pf'), getVal('v')||'0', getVal('l')||'0',
    getVal('c')||'0', getVal('sh')||'0', getVal('sa')||'0', getVal('co')||'',
  ];

  const existIdx = _mData.findIndex(r => r['企画ID'] === id);
  const payload = existIdx >= 0
    ? { action:'update', sheet:'metrics', rowIndex: existIdx+2, row: mRow }
    : { action:'add', sheet:'metrics', row: mRow };
  await fetch(CONFIG.gasUrl, { method:'POST', body: JSON.stringify(payload) });

  btn.textContent = '保存済✅';
  setTimeout(() => { btn.textContent = '更新する'; btn.disabled = false; }, 1500);
  alert('タブを切り替えると反映されます');
}

function fmt(n) { return window.formatNum ? window.formatNum(n) : String(n); }
window.esc = window.esc || function(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
