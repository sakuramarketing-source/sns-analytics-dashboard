/**
 * content.js — コンテンツ管理（pipeline + schedule）
 * Google Apps Script API 経由でスプレッドシートを読み書き
 */

let _pipeline = [];
let _schedule = [];

const GAS = CONFIG.gasUrl;

// === API通信 ===
async function gasGet(sheet) {
  const res = await fetch(`${GAS}?action=${sheet}`);
  return res.json();
}

async function gasPost(data) {
  const res = await fetch(GAS, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res.json();
}

// === データ読み込み ===
async function loadContentData() {
  try {
    const [pipeline, schedule] = await Promise.all([
      gasGet('pipeline'),
      gasGet('schedule'),
    ]);
    _pipeline = pipeline;
    _schedule = schedule;
    return true;
  } catch (err) {
    console.warn('Content data load failed:', err);
    return false;
  }
}

// === レンダリング ===
function renderContent() {
  renderStock();
  renderProgress();
  renderSchedule();
}

function renderStock() {
  const stock = _pipeline.filter(r => r['ステータス'] === '完成✅');
  const el = document.getElementById('stockList');
  if (stock.length === 0) {
    el.innerHTML = '<p class="empty">在庫がありません。「+ 新規企画を追加」から登録してください</p>';
    return;
  }
  el.innerHTML = stock.map(r => `
    <div class="cm-card" onclick="openEdit('${r['企画ID'] || ''}')">
      <span class="cm-card__status done">完成</span>
      <div class="cm-card__info">
        <p class="cm-card__title">${esc(r['企画タイトル'])}</p>
        <p class="cm-card__meta">${r['カテゴリ'] || ''} · ${r['担当'] || '未定'}</p>
      </div>
      ${r['投稿予定日'] ? `<span class="cm-card__date">📅 ${r['投稿予定日']}</span>` : ''}
    </div>
  `).join('');
}

function renderProgress() {
  const progress = _pipeline.filter(r => r['ステータス'] !== '完成✅' && r['ステータス'] !== '投稿済み' && r['ステータス'] !== 'ボツ');
  const el = document.getElementById('progressList');
  if (progress.length === 0) {
    el.innerHTML = '<p class="empty">進行中の企画はありません</p>';
    return;
  }
  el.innerHTML = progress.map(r => {
    const statusClass = r['ステータス'] === '企画案' ? 'idea' : 'progress';
    return `
      <div class="cm-card" onclick="openEdit('${r['企画ID'] || ''}')">
        <span class="cm-card__status ${statusClass}">${r['ステータス'] || '企画案'}</span>
        <div class="cm-card__info">
          <p class="cm-card__title">${esc(r['企画タイトル'])}</p>
          <p class="cm-card__meta">${r['カテゴリ'] || ''} · ${r['優先度'] || ''}</p>
        </div>
        ${r['投稿予定日'] ? `<span class="cm-card__date">📅 ${r['投稿予定日']}</span>` : ''}
      </div>
    `;
  }).join('');
}

function renderSchedule() {
  // 今週の月〜金を生成
  const days = getWeekdays();
  const el = document.getElementById('scheduleTable');

  el.innerHTML = days.map(d => {
    const row = _schedule.find(r => r['日付'] === d.dateStr);
    if (row) {
      return `
        <div class="schedule-row">
          <span class="schedule-row__day">${d.label}</span>
          <span style="flex:1">${esc(row['企画タイトル'] || '--')}</span>
          <span class="schedule-row__status ${row['ステータス'] === '確定' ? 'confirmed' : 'pending'}">${row['ステータス'] || '--'}</span>
        </div>
      `;
    }
    return `
      <div class="schedule-row">
        <span class="schedule-row__day">${d.label}</span>
        <span class="schedule-row empty" style="flex:1">未定</span>
      </div>
    `;
  }).join('');
}

function getWeekdays() {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const days = [];
  const labels = ['月', '火', '水', '木', '金'];
  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    days.push({
      dateStr: d.toISOString().split('T')[0],
      label: `${d.getMonth() + 1}/${d.getDate()}(${labels[i]})`,
    });
  }
  return days;
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
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('showAddForm')?.addEventListener('click', showAddForm);
  document.getElementById('cancelAdd')?.addEventListener('click', hideAddForm);
  document.getElementById('saveAdd')?.addEventListener('click', async () => {
    const title = document.getElementById('addTitle').value.trim();
    if (!title) return alert('タイトルを入力してください');
    const now = new Date().toISOString().split('T')[0];
    const id = 'C' + now.replace(/-/g, '') + '-' + String(_pipeline.length + 1).padStart(2, '0');
    const row = [
      id,
      title,
      document.getElementById('addCategory').value,
      document.getElementById('addStatus').value,
      '', // 担当
      now,
      '', // 完成予定日
      '', // 投稿予定日
      document.getElementById('addPriority').value,
      '', // 備考
    ];
    await gasPost({ action: 'add', sheet: 'pipeline', row });
    hideAddForm();
    await refreshContent();
  });
});

// === 編集モーダル ===
function openEdit(planId) {
  const row = _pipeline.find(r => r['企画ID'] === planId);
  if (!row) return;
  const idx = _pipeline.indexOf(row);
  document.getElementById('editRowIndex').value = idx + 2; // 1-indexed + header
  document.getElementById('editTitle').value = row['企画タイトル'] || '';
  document.getElementById('editCategory').value = row['カテゴリ'] || '施術';
  document.getElementById('editStatus').value = row['ステータス'] || '企画案';
  document.getElementById('editScheduleDate').value = row['投稿予定日'] || '';
  document.getElementById('editPriority').value = row['優先度'] || '中';
  document.getElementById('editModal').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('closeEdit')?.addEventListener('click', () => {
    document.getElementById('editModal').classList.add('hidden');
  });
  document.getElementById('saveEdit')?.addEventListener('click', async () => {
    const rowIndex = parseInt(document.getElementById('editRowIndex').value);
    const orig = _pipeline[rowIndex - 2]; // 0-indexed from pipeline
    const id = orig['企画ID'] || '';
    const row = [
      id,
      document.getElementById('editTitle').value,
      document.getElementById('editCategory').value,
      document.getElementById('editStatus').value,
      orig['担当'] || '',
      orig['企画日'] || '',
      orig['完成予定日'] || '',
      document.getElementById('editScheduleDate').value,
      document.getElementById('editPriority').value,
      orig['備考'] || '',
    ];
    await gasPost({ action: 'update', sheet: 'pipeline', rowIndex, row });
    document.getElementById('editModal').classList.add('hidden');
    await refreshContent();
  });
  // モーダル外クリックで閉じる
  document.getElementById('editModal')?.addEventListener('click', function(e) {
    if (e.target === this) this.classList.add('hidden');
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
