/**
 * update-sheet.js
 * Google Sheets 書き込み共通モジュール
 * サービスアカウント認証でスプレッドシートにデータを追記する
 */

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// 認証済みクライアントを取得（シングルトン）
let _doc = null;

async function getDoc() {
  if (_doc) return _doc;

  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON env var is not set');

  const creds = JSON.parse(raw);
  const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!sheetId) throw new Error('GOOGLE_SHEET_ID env var is not set');

  const doc = new GoogleSpreadsheet(sheetId, auth);
  await doc.loadInfo();
  _doc = doc;
  console.log(`✅ Connected to spreadsheet: ${doc.title}`);
  return doc;
}

/**
 * account_daily シートに1行追記
 * @param {Object} row - ヘッダーに一致するキーを持つオブジェクト
 */
export async function appendAccountDaily(row) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['account_daily'];
  if (!sheet) throw new Error('Sheet "account_daily" not found');

  await sheet.addRow({
    date: row.date,
    platform: row.platform,
    followers: row.followers ?? '',
    new_followers: row.new_followers ?? '',
    profile_visits: row.profile_visits ?? '',
    reach: row.reach ?? '',
    impressions: row.impressions ?? '',
    likes: row.likes ?? '',
    comments: row.comments ?? '',
    shares: row.shares ?? '',
    saves: row.saves ?? '',
    posts_published: row.posts_published ?? '',
    avg_engagement_rate: row.avg_engagement_rate ?? '',
    fetched_at: new Date().toISOString(),
  });
  console.log(`  → account_daily: ${row.platform} / ${row.date} added`);
}

/**
 * posts シートに upsert（post_id + platform で既存行を探して上書き、なければ追記）
 * @param {Object} post - ヘッダーに一致するキーを持つオブジェクト
 */
export async function upsertPost(post) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['posts'];
  if (!sheet) throw new Error('Sheet "posts" not found');

  const rows = await sheet.getRows();
  const existingRow = rows.find(
    (r) => r.get('post_id') === post.post_id && r.get('platform') === post.platform
  );

  if (existingRow) {
    // 上書き（累積値なので常に最新でOK）
    existingRow.set('likes', post.likes ?? '');
    existingRow.set('comments', post.comments ?? '');
    existingRow.set('shares', post.shares ?? '');
    existingRow.set('saves', post.saves ?? '');
    existingRow.set('reach', post.reach ?? '');
    existingRow.set('video_views', post.video_views ?? '');
    existingRow.set('avg_watch_time_ms', post.avg_watch_time_ms ?? '');
    existingRow.set('engagement_rate', post.engagement_rate ?? '');
    existingRow.set('last_updated', new Date().toISOString());
    await existingRow.save();
    console.log(`  → posts: ${post.post_id} updated`);
  } else {
    // 新規追加
    await sheet.addRow({
      post_id: post.post_id,
      platform: post.platform,
      post_date: post.post_date,
      caption: (post.caption ?? '').substring(0, 120),
      permalink: post.permalink ?? '',
      thumbnail_url: post.thumbnail_url ?? '',
      likes: post.likes ?? '',
      comments: post.comments ?? '',
      shares: post.shares ?? '',
      saves: post.saves ?? '',
      reach: post.reach ?? '',
      video_views: post.video_views ?? '',
      avg_watch_time_ms: post.avg_watch_time_ms ?? '',
      engagement_rate: post.engagement_rate ?? '',
      last_updated: new Date().toISOString(),
    });
    console.log(`  → posts: ${post.post_id} added`);
  }
}

/**
 * post_daily シートに1行追記（時系列スナップショット）
 * @param {Object} snapshot - ヘッダーに一致するキーを持つオブジェクト
 */
export async function appendPostDaily(snapshot) {
  const doc = await getDoc();
  const sheet = doc.sheetsByTitle['post_daily'];
  if (!sheet) {
    console.warn('  ⚠️ Sheet "post_daily" not found. Skipping daily snapshot.');
    return;
  }

  await sheet.addRow({
    date: snapshot.date,
    post_id: snapshot.post_id,
    platform: snapshot.platform,
    hours_since_post: snapshot.hours_since_post ?? '',
    likes: snapshot.likes ?? '',
    comments: snapshot.comments ?? '',
    shares: snapshot.shares ?? '',
    saves: snapshot.saves ?? '',
    video_views: snapshot.video_views ?? '',
    fetched_at: new Date().toISOString(),
  });
  console.log(`  → post_daily: ${snapshot.post_id} (${snapshot.hours_since_post}h) added`);
}

/**
 * 投稿からの経過時間（時間単位）を計算
 * @param {string|Date} postDate
 * @returns {number}
 */
export function hoursSincePost(postDate) {
  const post = new Date(postDate);
  const now = new Date();
  return Math.round((now - post) / (1000 * 60 * 60));
}

/**
 * ER%（エンゲージメント率）を計算
 * @param {number} likes
 * @param {number} comments
 * @param {number} shares
 * @param {number} saves
 * @param {number} reach
 * @returns {number}
 */
export function calcEngagementRate(likes, comments, shares, saves, reach) {
  const total = (likes ?? 0) + (comments ?? 0) + (shares ?? 0) + (saves ?? 0);
  if (!reach || reach === 0) return 0;
  return Math.round((total / reach) * 10000) / 100; // 小数点2桁の%
}

/**
 * 今日の日付を YYYY-MM-DD 形式で取得（JST）
 */
export function todayJST() {
  const d = new Date();
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().split('T')[0];
}
