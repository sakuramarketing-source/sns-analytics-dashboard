/**
 * data.js
 * Google Sheets の公開 CSV を取得・パースし、集計データを返す
 *
 * Phase 1: Marketing Data Extractor の自動生成シートから直接読み取り
 * Phase 2: GitHub Actions が書き込む構造化シート（account_daily / posts）に対応
 */

let _rawData = null;

/**
 * 全データを取得
 * Phase 1 では Marketing Data Extractor の1シートのみ
 */
async function loadAllData() {
  try {
    // Marketing Data Extractor の生データを取得
    const rawText = await fetch(CONFIG.tiktokRawCsv).then(r => r.text());
    const rawRows = Papa.parse(rawText, { header: true, skipEmptyLines: true }).data;

    // Marketing Data Extractor の列名 → 内部フォーマットに変換
    const posts = rawRows.map(row => ({
      post_id: row['Video ID'] || '',
      platform: 'tiktok',
      post_date: formatDate(row['Posted Date']),
      caption: row['Caption'] || '',
      permalink: row['Video URL'] || '',
      thumbnail_url: row['Thumbnail URL'] || '',
      likes: parseInt(row['Likes']) || 0,
      comments: parseInt(row['Comments']) || 0,
      shares: parseInt(row['Shares']) || 0,
      saves: parseInt(row['Saves']) || 0,
      reach: parseInt(row['Views']) || 0,
      video_views: parseInt(row['Views']) || 0,
      avg_watch_time_ms: parseInt(row['Duration (sec)']) ? parseInt(row['Duration (sec)']) * 1000 : '',
      engagement_rate: calcER(
        parseInt(row['Likes']) || 0,
        parseInt(row['Comments']) || 0,
        parseInt(row['Shares']) || 0,
        parseInt(row['Saves']) || 0,
        parseInt(row['Views']) || 0
      ),
    })).filter(p => p.post_id);

    // プロフィール情報（全行に同じ値 → 最終行から取得）
    const lastRow = rawRows[rawRows.length - 1] || {};
    const followers = parseInt(lastRow['Followers']) || 0;

    _rawData = {
      posts,
      followers,
    };

    return _rawData;
  } catch (err) {
    console.error('Data load failed:', err);
    throw err;
  }
}

function calcER(likes, comments, shares, saves, views) {
  const total = likes + comments + shares + saves;
  if (!views || views === 0) return 0;
  return Math.round((total / views) * 10000) / 100;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  // "2024-04-14 6:30:00" → "2024-04-14"
  return dateStr.split(' ')[0] || dateStr;
}

/**
 * 指定期間・プラットフォームで投稿データをフィルタ
 */
function getPostData({ platform = 'all', since = null, until = null } = {}) {
  if (!_rawData || !_rawData.posts) return [];
  let rows = _rawData.posts;

  if (platform !== 'all') {
    rows = rows.filter(r => r.platform === platform);
  }
  if (since) {
    rows = rows.filter(r => r.post_date >= since);
  }
  if (until) {
    rows = rows.filter(r => r.post_date <= until);
  }
  return rows;
}

/**
 * 指定期間・プラットフォームで account_daily 風データを生成
 * (Phase 1 では posts から日次集計を疑似的に生成)
 */
function getAccountData({ platform = 'all', since = null, until = null } = {}) {
  const posts = getPostData({ platform, since, until });
  if (posts.length === 0) return [];

  // 日付でグループ化
  const byDate = {};
  for (const p of posts) {
    const d = p.post_date;
    if (!d) continue;
    if (!byDate[d]) {
      byDate[d] = { date: d, platform: platform === 'all' ? 'tiktok' : platform, likes: 0, comments: 0, shares: 0, saves: 0, reach: 0, views: 0, er_sum: 0, count: 0 };
    }
    byDate[d].likes += p.likes;
    byDate[d].comments += p.comments;
    byDate[d].shares += p.shares;
    byDate[d].saves += p.saves;
    byDate[d].reach += p.reach;
    byDate[d].views += p.video_views;
    byDate[d].er_sum += p.engagement_rate;
    byDate[d].count++;
  }

  return Object.values(byDate)
    .map(d => ({
      ...d,
      avg_engagement_rate: d.count > 0 ? Math.round((d.er_sum / d.count) * 100) / 100 : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * KPI集計
 */
function getKPIs({ platform = 'all', since = null, until = null } = {}) {
  const posts = getPostData({ platform, since, until });
  if (posts.length === 0) return null;

  const sum = (key) => posts.reduce((acc, p) => acc + (p[key] || 0), 0);
  const views = sum('video_views');

  // フォロワー数は Marketing Data Extractor から直接取れないので
  // 投稿データの最終行の Followers カラムは取れない（profileレベルの情報が別カラム）
  // → ダッシュボードでは表示せず、後日 account_daily シートから取得

  return {
    views,
    likes: sum('likes'),
    comments: sum('comments'),
    shares: sum('shares'),
    saves: sum('saves'),
    followers: _rawData.followers || 0,
    er: views > 0 ? Math.round(((sum('likes') + sum('comments') + sum('shares') + sum('saves')) / views) * 10000) / 100 : 0,
    postsPublished: posts.length,
  };
}

/**
 * 前週比
 */
function getWowDelta(kpis, previousKpis) {
  if (!kpis || !previousKpis) return null;

  const calc = (curr, prev) => {
    if (!prev || prev === 0) return null;
    return Math.round(((curr - prev) / prev) * 100);
  };

  return {
    views: calc(kpis.views, previousKpis.views),
    likes: calc(kpis.likes, previousKpis.likes),
    followers: calc(kpis.followers, previousKpis.followers),
    er: kpis.er && previousKpis.er ? Math.round((kpis.er - previousKpis.er) * 10) / 10 : null,
    saves: calc(kpis.saves, previousKpis.saves),
    shares: calc(kpis.shares, previousKpis.shares),
  };
}

/**
 * TOP投稿（ER%順）
 */
function getTopPosts({ platform = 'all', since = null, until = null, limit = 5 } = {}) {
  let rows = getPostData({ platform, since, until });
  return rows
    .filter(r => r.engagement_rate > 0)
    .sort((a, b) => b.engagement_rate - a.engagement_rate)
    .slice(0, limit);
}

/**
 * 日付ヘルパー
 */
function todayStr() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

function getWeekRange(offset = 0) {
  const d = new Date();
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7) + offset * 7);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  return {
    since: monday.toISOString().split('T')[0],
    until: friday.toISOString().split('T')[0],
    label: `${monday.getMonth() + 1}/${monday.getDate()}〜${friday.getMonth() + 1}/${friday.getDate()}`,
  };
}

function getMonthRange(offset = 0) {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    since: first.toISOString().split('T')[0],
    until: last.toISOString().split('T')[0],
    label: `${first.getMonth() + 1}月`,
  };
}
