/**
 * content.js — コンテンツ管理
 * 読み取り: 公開CSV ／ 書き込み: GAS
 */

let _pipeline = [], _schedule = [], _filter = 'all';
let _calYear, _calMonth;

// === 読み取り ===
async function loadContentData() {
  try {
    const [pRaw, sRaw] = await Promise.all([
      fetch(CONFIG.pipelineCsv).then(r => r.text()),
      fetch(CONFIG.scheduleCsv).then(r => r.text()),
    ]);
    _pipeline = Papa.parse(pRaw, { header: true, skipEmptyLines: true }).data;
    _schedule = Papa.parse(sRaw, { header: true, skipEmptyLines: true }).data;
    return true;
  } catch (e) { console.warn(e); return false; }
}
async function gasPost(d) { await fetch(CONFIG.gasUrl, { method: 'POST', body: JSON.stringify(d) }); }

// === カレンダー ===
function initCalendar() {
  const now = new Date();
  _calYear = now.getFullYear();
  _calMonth = now.getMonth() + 1;
}

function renderCalendar() {
  document.getElementById('calTitle').textContent = `${_calYear}年${_calMonth}月`;
  const grid = document.getElementById('calendarGrid');

  // 曜日ヘッダー
  const dows = ['日','月','火','水','木','金','土'];
  let html = dows.map((d, i) => `<div class="calendar-grid__dow ${i===0?'sun':''}${i===6?'sat':''}">${d}</div>`).join('');

  // 月初の曜日を計算
  const first = new Date(_calYear, _calMonth - 1, 1);
  const startDow = first.getDay(); // 0=日
  const daysInMonth = new Date(_calYear, _calMonth, 0).getDate();
  const today = new Date().toISOString().split('T')[0];

  // 空セル
  for (let i = 0; i < startDow; i++) html += '<div class="calendar-cell empty"></div>';

  // 日付セル
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${_calYear}-${String(_calMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const sRow = _schedule.find(r => r['日付'] === ds);
    const pRow = _pipeline.find(r => r['投稿予定日'] === ds);
    const hasPost = !!(sRow || pRow);
    const isToday = ds === today;

    html += `<div class="calendar-cell${hasPost ? ' has-post' : ''}${isToday ? ' today' : ''}"
      data-date="${ds}" onclick="onCalendarClick('${ds}')">
      <span class="calendar-cell__date">${d}</span>
    </div>`;
  }

  grid.innerHTML = html;
}

function onCalendarClick(dateStr) {
  const existing = _pipeline.find(r => r['投稿予定日'] === dateStr) || _schedule.find(r => r['日付'] === dateStr);
  if (existing) {
    // 既存の企画を編集
    openEdit(existing['企画ID'] || '');
    return;
  }
  // 完成在庫から選んで割当
  const stock = _pipeline.filter(r => r['ステータス'] === '完成' && !r['投稿予定日']);
  if (!stock.length) {
    alert('「完成」ステータスの企画がありません。先に企画を追加して「完成」にしてください。');
    return;
  }
  showDatePopup(dateStr, stock);
}

// 日付割当ポップアップ
function showDatePopup(dateStr, stock) {
  removePopup();
  const overlay = document.createElement('div'); overlay.className = 'overlay'; overlay.onclick = removePopup;
  const popup = document.createElement('div'); popup.className = 'date-popup';
  popup.innerHTML = `<h3>📅 ${dateStr} に投稿する企画</h3>
    <select id="popupSelect" class="input">${stock.map(r => `<option value="${r['企画ID']}">${esc(r['企画タイトル'])}</option>`).join('')}</select>
    <div style="display:flex;gap:8px">
      <button class="btn" id="popupSave" style="flex:1">この日付で確定</button>
      <button class="btn btn--ghost" onclick="removePopup()">キャンセル</button>
    </div>`;
  document.body.append(overlay, popup);

  document.getElementById('popupSave').onclick = async () => {
    const planId = document.getElementById('popupSelect').value;
    const row = _pipeline.find(r => r['企画ID'] === planId);
    if (!row) return;
    const idx = _pipeline.indexOf(row) + 2;
    const newRow = [row['企画ID']||'', row['企画タイトル']||'', row['カテゴリ']||'', row['ステータス']||'',
      row['担当']||'', row['企画日']||'', row['完成予定日']||'', dateStr, row['優先度']||'', row['備考']||''];
    await gasPost({ action: 'update', sheet: 'pipeline', rowIndex: idx, row: newRow });
    removePopup();
    alert('カレンダーに反映されます（最大5分）');
  };
}

function removePopup() {
  document.querySelectorAll('.overlay,.date-popup').forEach(el => el.remove());
}

// === 企画一覧 ===
function renderPipeline() {
  const filtered = filterPipeline(_filter);
  const el = document.getElementById('pipelineList');
  const msgs = { all:'企画がありません', 完成:'在庫なし', progress:'進行中なし', 投稿済み:'投稿済みなし', ボツ:'ボツなし' };
  if (!filtered.length) { el.innerHTML = `<p class="empty">${msgs[_filter]||'ありません'}</p>`; return; }

  const cls = { '企画':'idea', '撮影待ち':'progress', '撮影済み':'progress', '編集中':'progress', '完成':'done', '投稿済み':'posted', 'ボツ':'dead' };

  el.innerHTML = filtered.map(r => `
    <div class="cm-card" style="align-items:flex-start" onclick="openEdit('${r['企画ID']||''}')">
      <span class="cm-card__status ${cls[r['ステータス']]||'idea'}">${r['ステータス']||'企画'}</span>
      <div class="cm-card__info">
        <p class="cm-card__title">${esc(r['企画タイトル'])}</p>
        <p class="cm-card__meta">${r['カテゴリ']||''}${r['担当']?' · '+r['担当']:''}</p>
      </div>
      ${r['投稿予定日'] ? `<span class="cm-card__date">📅 ${r['投稿予定日'].slice(5)}</span>` : ''}
    </div>
  `).join('');
}

function filterPipeline(f) {
  if (f === 'all') return _pipeline.filter(r => r['企画タイトル']);
  if (f === 'progress') return _pipeline.filter(r => !['完成','投稿済み','ボツ'].includes(r['ステータス']) && r['企画タイトル']);
  return _pipeline.filter(r => r['ステータス'] === f);
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
  initCalendar();
  document.getElementById('calPrev')?.addEventListener('click', () => { changeMonth(-1); });
  document.getElementById('calNext')?.addEventListener('click', () => { changeMonth(1); });

  document.getElementById('showAddForm')?.addEventListener('click', showAddForm);
  document.getElementById('cancelAdd')?.addEventListener('click', hideAddForm);

  document.getElementById('saveAdd')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveAdd'), title = document.getElementById('addTitle').value.trim();
    if (!title) return alert('タイトルを入力してください');
    btn.textContent = '保存中...'; btn.disabled = true;
    const now = new Date().toISOString().split('T')[0];
    const id = 'C' + now.replace(/-/g, '') + '-' + String(_pipeline.length + 1).padStart(2, '0');
    await gasPost({ action: 'add', sheet: 'pipeline', row: [id, title,
      document.getElementById('addCategory').value, document.getElementById('addStatus').value,
      '', now, '', document.getElementById('addScheduleDate').value, '']});
    btn.textContent = '保存済✅'; setTimeout(() => { btn.textContent = '保存'; btn.disabled = false; }, 1500);
    hideAddForm();
    alert('保存しました！タブを切り替えると反映されます。');
  });

  document.querySelector('.filter-bar')?.addEventListener('click', e => {
    if (!e.target.classList.contains('filter-tab')) return;
    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
    e.target.classList.add('active');
    _filter = e.target.dataset.filter;
    renderPipeline();
  });
});

function changeMonth(delta) {
  _calMonth += delta;
  if (_calMonth < 1) { _calMonth = 12; _calYear--; }
  if (_calMonth > 12) { _calMonth = 1; _calYear++; }
  renderCalendar();
}

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
    const btn = document.getElementById('saveEdit'), ri = parseInt(document.getElementById('editRowIndex').value), orig = _pipeline[ri - 2];
    btn.textContent = '保存中...'; btn.disabled = true;
    await gasPost({ action: 'update', sheet: 'pipeline', rowIndex: ri, row: [
      orig['企画ID']||'', document.getElementById('editTitle').value,
      document.getElementById('editCategory').value, document.getElementById('editStatus').value,
      orig['担当']||'', orig['企画日']||'', orig['完成予定日']||'',
      document.getElementById('editScheduleDate').value,
      orig['優先度']||'', orig['備考']||'']});
    btn.textContent = '保存済✅';
    setTimeout(() => { btn.textContent = '保存'; btn.disabled = false; document.getElementById('editModal').classList.add('hidden'); }, 1000);
    alert('保存しました！タブを切り替えると反映されます。');
  });
});

function renderContent() { renderCalendar(); renderPipeline(); }
function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
