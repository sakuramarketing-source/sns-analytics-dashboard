/**
 * content.js — コンテンツ管理
 * 読み取り: 公開CSV（PapaParse・キャッシュなし）
 * 書き込み: Google Apps Script
 */

let _pipeline = [];
let _schedule = [];
let _filter = 'all';

// === 読み取り（CSV） ===
async function loadContentData() {
  try {
    const [pRaw, sRaw] = await Promise.all([
      fetch(CONFIG.pipelineCsv).then(r => r.text()),
      fetch(CONFIG.scheduleCsv).then(r => r.text()),
    ]);
    _pipeline = Papa.parse(pRaw, { header: true, skipEmptyLines: true }).data;
    _schedule = Papa.parse(sRaw, { header: true, skipEmptyLines: true }).data;
    return true;
  } catch (e) {
    console.warn('CSV load failed:', e);
    return false;
  }
}

// === 書き込み（GAS） ===
async function gasPost(data) {
  await fetch(CONFIG.gasUrl, { method: 'POST', body: JSON.stringify(data) });
}

// === レンダリング ===
function renderContent() {
  renderCalendar();
  renderPipeline();
}

function renderCalendar() {
  const days = getWeekdays();
  const el = document.getElementById('calendarStrip');
  el.innerHTML = days.map(d => {
    const sRow = _schedule.find(r => r['日付'] === d.dateStr);
    const pRow = _pipeline.find(r => r['投稿予定日'] === d.dateStr);
    const title = sRow?.['企画タイトル'] || pRow?.['企画タイトル'] || '';
    const today = d.dateStr === new Date().toISOString().split('T')[0] ? ' today' : '';
    return `<div class="calendar-day ${title ? 'has-post' : ''}${today}">
      <p class="calendar-day__label">${d.label}</p>
      <p class="calendar-day__title">${title ? esc(title) : '--'}</p>
    </div>`;
  }).join('');
}

function renderPipeline() {
  const filtered = filterPipeline(_filter);
  const el = document.getElementById('pipelineList');
  const msgs = { all:'企画がありません', 完成:'在庫なし', progress:'進行中なし', 投稿済み:'投稿済みなし', ボツ:'ボツなし' };
  if (!filtered.length) { el.innerHTML = `<p class="empty">${msgs[_filter] || 'ありません'}</p>`; return; }

  const cls = { '企画':'idea', '撮影待ち':'progress', '撮影済み':'progress', '編集中':'progress', '完成':'done', '投稿済み':'posted', 'ボツ':'dead' };

  el.innerHTML = filtered.map(r => `
    <div class="cm-card" style="align-items:flex-start" onclick="openEdit('${r['企画ID']||''}')">
      <span class="cm-card__status ${cls[r['ステータス']]||'idea'}">${r['ステータス']||'企画'}</span>
      <div class="cm-card__info">
        <p class="cm-card__title">${esc(r['企画タイトル'])}</p>
        <p class="cm-card__meta">${r['カテゴリ']||''}${r['担当']?' · '+r['担当']:''}</p>
      </div>
      ${r['投稿予定日']?`<span class="cm-card__date">📅 ${r['投稿予定日']}</span>`:''}
    </div>
  `).join('');
}

function filterPipeline(f) {
  if (f === 'all') return _pipeline.filter(r => r['企画タイトル']);
  if (f === 'progress') return _pipeline.filter(r => !['完成','投稿済み','ボツ'].includes(r['ステータス']) && r['企画タイトル']);
  return _pipeline.filter(r => r['ステータス'] === f);
}

function getWeekdays() {
  const now = new Date(), day = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - ((day + 6) % 7));
  const labels = ['月','火','水','木','金','土','日'];
  return Array.from({length:7}, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return { dateStr: d.toISOString().split('T')[0], label: `${d.getMonth()+1}/${d.getDate()}(${labels[i]})` };
  });
}

// === 新規追加 ===
function showAddForm() { document.getElementById('showAddForm').classList.add('hidden'); document.getElementById('addForm').classList.remove('hidden'); }
function hideAddForm() {
  document.getElementById('showAddForm').classList.remove('hidden');
  document.getElementById('addForm').classList.add('hidden');
  document.getElementById('addTitle').value = '';
  document.getElementById('addScheduleDate').value = '';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('showAddForm')?.addEventListener('click', showAddForm);
  document.getElementById('cancelAdd')?.addEventListener('click', hideAddForm);

  document.getElementById('saveAdd')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveAdd');
    const title = document.getElementById('addTitle').value.trim();
    if (!title) return alert('タイトルを入力してください');
    btn.textContent = '保存中...'; btn.disabled = true;
    const now = new Date().toISOString().split('T')[0];
    const id = 'C' + now.replace(/-/g, '') + '-' + String(_pipeline.length + 1).padStart(2, '0');
    await gasPost({ action: 'add', sheet: 'pipeline', row: [
      id, title,
      document.getElementById('addCategory').value,
      document.getElementById('addStatus').value,
      '', now, '', document.getElementById('addScheduleDate').value, ''
    ]});
    btn.textContent = '保存済✅'; setTimeout(() => { btn.textContent = '保存'; btn.disabled = false; }, 1500);
    hideAddForm();
    alert('保存しました！CSVの反映に最大5分かかります。「📊 分析」→「📋 コンテンツ管理」とタブを切り替えると再読み込みされます。');
  });

  // フィルタ
  document.querySelector('.filter-bar')?.addEventListener('click', e => {
    if (!e.target.classList.contains('filter-tab')) return;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    _filter = e.target.dataset.filter;
    renderPipeline();
  });
});

// === 編集モーダル ===
function openEdit(planId) {
  const row = _pipeline.find(r => r['企画ID'] === planId);
  if (!row) return;
  document.getElementById('editRowIndex').value = _pipeline.indexOf(row) + 2;
  document.getElementById('editTitle').value = row['企画タイトル'] || '';
  document.getElementById('editCategory').value = row['カテゴリ'] || '施術';
  document.getElementById('editStatus').value = row['ステータス'] || '企画';
  document.getElementById('editScheduleDate').value = row['投稿予定日'] || '';
  document.getElementById('editModal').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('closeEdit')?.addEventListener('click', () => document.getElementById('editModal').classList.add('hidden'));
  document.getElementById('editModal')?.addEventListener('click', function(e) { if (e.target === this) this.classList.add('hidden'); });

  document.getElementById('saveEdit')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveEdit');
    const ri = parseInt(document.getElementById('editRowIndex').value);
    const orig = _pipeline[ri - 2];
    btn.textContent = '保存中...'; btn.disabled = true;
    await gasPost({ action: 'update', sheet: 'pipeline', rowIndex: ri, row: [
      orig['企画ID']||'', document.getElementById('editTitle').value,
      document.getElementById('editCategory').value, document.getElementById('editStatus').value,
      orig['担当']||'', orig['企画日']||'', orig['完成予定日']||'',
      document.getElementById('editScheduleDate').value,
      orig['優先度']||'', orig['備考']||''
    ]});
    btn.textContent = '保存済✅';
    setTimeout(() => { btn.textContent = '保存'; btn.disabled = false; document.getElementById('editModal').classList.add('hidden'); }, 1000);
    alert('保存しました！タブを切り替えると反映されます。');
  });
});

async function refreshContent() {
  const ok = await loadContentData();
  if (ok) renderContent();
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
