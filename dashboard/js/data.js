/**
 * data.js
 * Google Sheets の公開 CSV を取得・パースし、集計データを返す
 */

// グローバルなデータキャッシュ
let _rawData = null;

/**
 * 全CSVを取得してパース
 */
async function loadAllData() {
  try {
    const [accountRaw, postsRaw, postDailyRaw] = await Promise.all([
      fetch(CONFIG.accountDailyCsv).then(r => r.text()),
      fetch(CONFIG.postsCsv).then(r => r.text()),
      fetch(CONFIG.postDailyCsv).then(r => r.text()).catch(() => ''), // オプション
    ]);

    const accounts = Papa.parse(accountRaw, { header: true, skipEmptyLines: true }).data;
    const posts = Papa.parse(postsRaw, { header: true, skipEmptyLines: true }).data;
    const postDaily = postDailyRaw
      ? Papa.parse(postDailyRaw, { header: true, skipEmptyLines: true }).data
      : [];

    _rawData = { accounts, posts, postDaily };
    return _rawData;
  } catch (err) {
    console.error('Data load failed:', err);
    throw err;
  }
}

/**
 * 指定期間・プラットフォームで account_daily データをフィルタ
 */
function getAccountData({ platform = 'all', since = null, until = null } = {}) {
  if (!_rawData) return [];
  let rows = _rawData.accounts;

  if (platform !== 'all') {
    rows = rows.filter(r => r.platform === platform);
  }
  if (since) {
    rows = rows.filter(r => r.date >= since);
  }
  if (until) {
    rows = rows.filter(r => r.date <= until);
  }
  return rows;
}

/**
 * 指定期間・プラットフォームで投稿データをフィルタ
 */
function getPostData({ platform = 'all', since = null, until = null } = {}) {
  if (!_rawData) return [];
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
 * KPI集計（指定期間の合計・平均）
 */
function getKPIs({ platform = 'all', since = null, until = null } = {}) {
  const rows = getAccountData({ platform, since, until });
  if (rows.length === 0) return null;

  const sum = (key) => rows.reduce((acc, r) => acc + (parseInt(r[key]) || 0), 0);
  const avg = (key) => {
    const vals = rows.map(r => parseFloat(r[key]) || 0).filter(v => v > 0);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  };

  return {
    views: sum('reach'),          // account_daily の reach = 合計表示回数
    likes: sum('likes'),
    comments: sum('comments'),
    shares: sum('shares'),
    saves: sum('saves'),
    followers: rows.length > 0 ? parseInt(rows[rows.length - 1].followers) || 0 : 0,
    er: avg('avg_engagement_rate'),
    postsPublished: sum('posts_published'),
  };
}

/**
 * 前週比を計算
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
 * TOP投稿を取得（ER%順）
 */
function getTopPosts({ platform = 'all', since = null, until = null, limit = 5 } = {}) {
  let rows = getPostData({ platform, since, until });
  return rows
    .filter(r => r.engagement_rate && parseFloat(r.engagement_rate) > 0)
    .sort((a, b) => (parseFloat(b.engagement_rate) || 0) - (parseFloat(a.engagement_rate) || 0))
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
  const day = d.getDay(); // 0=日
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((day + 6) % 7) + offset * 7); // 月曜
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4); // 金曜
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
