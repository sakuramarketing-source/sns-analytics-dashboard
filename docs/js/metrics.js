/**
 * metrics.js — 全企画の数値をTikTok/Instagram別に直接編集
 * キー: 企画ID + プラットフォーム
 */

let _mData = [], _mPipeline = [];

async function loadMetrics() {
  try {
    const [mRaw, pRaw] = await Promise.all([
      fetch(CONFIG.metricsCsv).then(r => r.text()).catch(() => ''),
      fetch(CONFIG.pipelineCsv).then(r => r.text()).catch(() => ''),
    ]);
    _mPipeline = pRaw ? Papa.parse(pRaw, { header: true, skipEmptyLines: true }).data : [];
    _mData = mRaw ? Papa.parse(mRaw, { header: true, skipEmptyLines: true }).data : [];
    return true;
  } catch (e) { console.warn(e); return false; }
}

function getMetric(planId, platform) {
  return _mData.find(r => r['企画ID'] === planId && (r['プラットフォーム'] || 'TikTok') === platform);
}
function getNum(m, key) { return m ? (parseInt(m[key]) || 0) : 0; }

function renderMetricsView() {
  // 全企画を表示（投稿済みに限らない）
  const plans = _mPipeline.filter(r => r['企画タイトル']);
  if (!plans.length) {
    document.getElementById('metricsList').innerHTML = '<p class="empty">企画がありません。コンテンツ管理で企画を追加してください。</p>';
    return;
  }

  document.getElementById('metricsList').innerHTML = plans.map(plan => {
    const id = plan['企画ID'];
    const name = plan['企画タイトル'];
    const date = plan['投稿予定日'] || '';
    const cat = plan['カテゴリ'] || '';
    const status = plan['ステータス'] || '';

    // TikTok / Instagram それぞれの数値
    const platforms = ['TikTok', 'Instagram'];
    return `
    <div class="metrics-card" style="background:var(--color-surface);border-radius:var(--radius);padding:12px 14px;margin-bottom:8px;box-shadow:var(--shadow)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div>
          <p style="font-weight:700;font-size:0.85rem">${esc(name)}</p>
          <p style="font-size:0.7rem;color:var(--color-text-secondary)">
            ${date.slice(5)} · ${cat} · <span style="color:var(--color-accent)">${status}</span>
          </p>
        </div>
      </div>
      ${platforms.map(pf => {
        const m = getMetric(id, pf);
        const hasData = !!(m && getNum(m, '再生数') > 0);
        const v=getNum(m,'再生数'), l=getNum(m,'いいね'), c=getNum(m,'コメント'),
              sh=getNum(m,'シェア'), sa=getNum(m,'保存'), co=parseFloat(m?.['完走率'])||0;
        const er = hasData ? Math.round(((l+c+sh+sa)/(v||1))*10000)/100 : 0;
        return `
        <div style="border-top:1px solid var(--color-border);padding-top:8px;margin-top:6px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
            <span style="font-weight:600;font-size:0.8rem">${pf === 'TikTok' ? '🎵' : '📷'} ${pf}</span>
            ${hasData
              ? `<span style="font-size:0.72rem;color:var(--color-accent)">👁 ${fmt(v)} · ❤️ ${fmt(l)} · ER ${er}%</span>`
              : '<span style="font-size:0.7rem;color:#92400e">未入力</span>'}
          </div>
          <div class="metrics-inputs-${id}-${pf}" style="display:${hasData ? 'none' : 'block'}">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px">
              <div><span style="font-size:0.6rem;color:var(--color-text-secondary)">再生数</span><input class="input" data-id="${id}" data-pf="${pf}" data-field="v" value="${v||''}" type="number" placeholder="0" style="padding:5px 6px;font-size:0.78rem;margin-bottom:1px" inputmode="numeric"></div>
              <div><span style="font-size:0.6rem;color:var(--color-text-secondary)">いいね</span><input class="input" data-id="${id}" data-pf="${pf}" data-field="l" value="${l||''}" type="number" placeholder="0" style="padding:5px 6px;font-size:0.78rem;margin-bottom:1px" inputmode="numeric"></div>
              <div><span style="font-size:0.6rem;color:var(--color-text-secondary)">コメント</span><input class="input" data-id="${id}" data-pf="${pf}" data-field="c" value="${c||''}" type="number" placeholder="0" style="padding:5px 6px;font-size:0.78rem;margin-bottom:1px" inputmode="numeric"></div>
              <div><span style="font-size:0.6rem;color:var(--color-text-secondary)">シェア</span><input class="input" data-id="${id}" data-pf="${pf}" data-field="sh" value="${sh||''}" type="number" placeholder="0" style="padding:5px 6px;font-size:0.78rem;margin-bottom:1px" inputmode="numeric"></div>
              <div><span style="font-size:0.6rem;color:var(--color-text-secondary)">保存</span><input class="input" data-id="${id}" data-pf="${pf}" data-field="sa" value="${sa||''}" type="number" placeholder="0" style="padding:5px 6px;font-size:0.78rem;margin-bottom:1px" inputmode="numeric"></div>
              <div><span style="font-size:0.6rem;color:var(--color-text-secondary)">完走率(%)</span><input class="input" data-id="${id}" data-pf="${pf}" data-field="co" value="${co||''}" type="text" placeholder="72" style="padding:5px 6px;font-size:0.78rem;margin-bottom:1px"></div>
            </div>
            <button class="btn" style="width:100%;margin-top:4px;font-size:0.8rem;padding:6px"
              onclick="saveMetricsCard(event,'${id}','${pf}','${date}')">${hasData?'更新':'保存'}（${pf}）</button>
          </div>
          ${hasData ? `<button class="btn btn--ghost" style="width:100%;font-size:0.7rem;margin-top:2px;padding:4px" onclick="toggleSection(event,'metrics-inputs-${id}-${pf}')">✏️ ${pf}を編集</button>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
}

function toggleSection(e, className) {
  const card = e.target.closest('.metrics-card');
  const inputs = card.querySelector(`.${className}`);
  if (inputs.style.display === 'none') {
    inputs.style.display = 'block';
    e.target.textContent = e.target.textContent.replace('編集', '閉じる');
  } else {
    inputs.style.display = 'none';
    e.target.textContent = e.target.textContent.replace('閉じる', '編集');
  }
}

async function saveMetricsCard(e, id, pf, date) {
  const card = e.target.closest('.metrics-card');
  const sel = `[data-id="${id}"][data-pf="${pf}"]`;
  const getVal = field => card.querySelector(`${sel}[data-field="${field}"]`).value;
  const btn = e.target;
  btn.textContent = '保存中...'; btn.disabled = true;

  const mRow = [
    id, date || new Date().toISOString().split('T')[0], pf,
    getVal('v')||'0', getVal('l')||'0', getVal('c')||'0',
    getVal('sh')||'0', getVal('sa')||'0', getVal('co')||'',
  ];

  // 企画ID + プラットフォーム で既存行を検索
  const existIdx = _mData.findIndex(r => r['企画ID'] === id && (r['プラットフォーム']||'TikTok') === pf);
  const payload = existIdx >= 0
    ? { action:'update', sheet:'metrics', rowIndex: existIdx + 2, row: mRow }
    : { action:'add', sheet:'metrics', row: mRow };
  await fetch(CONFIG.gasUrl, { method:'POST', body: JSON.stringify(payload) });

  btn.textContent = '保存済✅';
  setTimeout(() => { btn.textContent = `保存（${pf}）`; btn.disabled = false; }, 1500);
  alert('タブを切り替えると反映されます');
}

function fmt(n) { return window.formatNum ? window.formatNum(n) : String(n); }
window.esc = window.esc || function(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; };
