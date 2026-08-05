/**
 * content.js — コンテンツ管理（pipeline + schedule）
 * Google Apps Script API 経由でスプレッドシートを読み書き
 */

let _pipeline = [];
let _schedule = [];
let _filter = 'all';

const GAS = CONFIG.gasUrl;

// === API通信 ===
async function gasGet(sheet) {
  const res = await fetch(`${GAS}?action=${sheet}&t=${Date.now()}`);
  return res.json();
}
async function gasPost(data) {
  const res = await fetch(GAS, { method: 'POST', body: JSON.stringify(data) });
  return res.json();
}

// === データ読み込み ===
async function loadContentData() {
  try {
    const [pipeline, schedule] = await Promise.all([gasGet('pipeline'), gasGet('schedule')]);
    _pipeline = pipeline;
    _schedule = schedule;
    return true;
  } catch (e) {
    console.warn('Content data load failed:', e);
    return false;
  }
}

// === レンダリング ===
function renderContent() {
  renderCalendar();
  renderPipeline();
}

// 今週のカレンダー
function renderCalendar() {
  const days = getWeekdays();
  const el = document.getElementById('calendarStrip');
  el.innerHTML = days.map(d => {
    // schedule シート + pipeline の投稿予定日 両方から探す
    const sRow = _schedule.find(r => r['日付'] === d.dateStr);
    const pRow = _pipeline.find(r => r['投稿予定日'] === d.dateStr);
    const title = sRow?.['企画タイトル'] || pRow?.['企画タイトル'] || '';
    const has = !!title;
    const today = d.dateStr === new Date().toISOString().split('T')[0] ? ' today' : '';
    return `
      <div class="calendar-day ${has ? 'has-post' : ''}${today}">
        <p class="calendar-day__label">${d.label}</p>
        <p class="calendar-day__title">${has ? esc(title) : '--'}</p>
      </div>
    `;
  }).join('');
}

// 企画一覧（フィルタ対応）
function renderPipeline() {
  const el = document.getElementById('pipelineList');
  const filtered = filterPipeline(_filter);

  if (filtered.length === 0) {
    const msgs = { all: '企画がありません', '完成': '完成した動画はありません', progress: '進行中の企画はありません', '投稿済み': '投稿済みの動画はありません', 'ボツ': 'ボツにした企画はありません' };
    el.innerHTML = `<p class="empty">${msgs[_filter] || 'ありません'}</p>`;
    return;
  }

  const statusClasses = {
    '企画': 'idea', '撮影待ち': 'progress', '撮影済み': 'progress', '編集中': 'progress',
    '完成': 'done', '投稿済み': 'posted', 'ボツ': 'dead'
  };

  el.innerHTML = filtered.map(r => `
    <div class="cm-card" onclick="openEdit('${r['企画ID'] || ''}')">
      <span class="cm-card__status ${statusClasses[r['ステータス']] || 'idea'}">${r['ステータス'] || '企画'}</span>
      <div class="cm-card__info">
        <p class="cm-card__title">${esc(r['企画タイトル'])}</p>
        <p class="cm-card__meta">${r['カテゴリ'] || ''}${r['担当'] ? ' · ' + r['担当'] : ''}</p>
      </div>
      ${r['投稿予定日'] ? `<span class="cm-card__date">📅 ${r['投稿予定日']}</span>` : ''}
    </div>
  `).join('');
}

function filterPipeline(filter) {
  if (filter === 'all') return _pipeline.filter(r => r['企画タイトル']);
  if (filter === 'progress') return _pipeline.filter(r => !['完成','投稿済み','ボツ'].includes(r['ステータス']) && r['企画タイトル']);
  return _pipeline.filter(r => r['ステータス'] === filter);
}

// 曜日生成
function getWeekdays() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const labels = ['月','火','水','木','金','土','日'];
  return Array.from({length:7}, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return {
      dateStr: d.toISOString().split('T')[0],
      label: `${d.getMonth()+1}/${d.getDate()}(${labels[i]})`
    };
  });
}

// === 新規追加 ===
function showAddForm() {
  document.getElementById('showAddForm').classList.add('hidden');
  document.getElementById('addForm').classList.remove('hidden');
}
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
    const row = [id, title,
      document.getElementById('addCategory').value,
      document.getElementById('addStatus').value,
      '', now, '',
      document.getElementById('addScheduleDate').value, ''
    ];
    await gasPost({ action: 'add', sheet: 'pipeline', row });
    btn.textContent = '保存'; btn.disabled = false;
    hideAddForm();
    await refreshContent();
  });

  // フィルタタブ
  document.querySelector('.filter-bar')?.addEventListener('click', (e) => {
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
  const idx = _pipeline.indexOf(row);
  document.getElementById('editRowIndex').value = idx + 2;
  document.getElementById('editTitle').value = row['企画タイトル'] || '';
  document.getElementById('editCategory').value = row['カテゴリ'] || '施術';
  document.getElementById('editStatus').value = row['ステータス'] || '企画';
  document.getElementById('editScheduleDate').value = row['投稿予定日'] || '';
  document.getElementById('editModal').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('closeEdit')?.addEventListener('click', () =>
    document.getElementById('editModal').classList.add('hidden'));
  document.getElementById('editModal')?.addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
  });

  document.getElementById('saveEdit')?.addEventListener('click', async () => {
    const btn = document.getElementById('saveEdit');
    btn.textContent = '保存中...'; btn.disabled = true;
    const ri = parseInt(document.getElementById('editRowIndex').value);
    const orig = _pipeline[ri - 2];
    const row = [orig['企画ID']||'',
      document.getElementById('editTitle').value,
      document.getElementById('editCategory').value,
      document.getElementById('editStatus').value,
      orig['担当']||'', orig['企画日']||'', orig['完成予定日']||'',
      document.getElementById('editScheduleDate').value,
      orig['優先度']||'', orig['備考']||''
    ];
    await gasPost({ action: 'update', sheet: 'pipeline', rowIndex: ri, row });
    btn.textContent = '保存'; btn.disabled = false;
    document.getElementById('editModal').classList.add('hidden');
    await refreshContent();
  });
});

async function refreshContent() {
  const ok = await loadContentData();
  if (ok) renderContent();
}

function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
