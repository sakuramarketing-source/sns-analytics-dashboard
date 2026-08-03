/**
 * fetch-tiktok.js
 * TikTok Display API v2 から投稿パフォーマンスを取得し Google Sheets に書き込む
 *
 * 前提:
 *   - TikTok Developer アカウント + Display API アプリ承認済み
 *   - OAuth 2.0 でアクセストークン + リフレッシュトークン取得済み
 *   - 環境変数: TIKTOK_ACCESS_TOKEN, TIKTOK_REFRESH_TOKEN,
 *              TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET
 *
 * 制約:
 *   - TikTok Display API は保存数・平均視聴時間・完走率を提供しない
 *   - これらの指標は TikTok Studio アプリで手動確認が必要
 */

import {
  appendAccountDaily,
  upsertPost,
  appendPostDaily,
  hoursSincePost,
  calcEngagementRate,
  todayJST,
} from './update-sheet.js';

const ACCESS_TOKEN = process.env.TIKTOK_ACCESS_TOKEN;
const REFRESH_TOKEN = process.env.TIKTOK_REFRESH_TOKEN;
const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY;
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET;

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

// -------------------------------------------------------
// トークンリフレッシュ（アクセストークンは短期で切れるため）
// -------------------------------------------------------
async function refreshAccessToken() {
  if (!REFRESH_TOKEN || !CLIENT_KEY || !CLIENT_SECRET) {
    console.warn('  ⚠️ No refresh token / client credentials. Skipping refresh.');
    return ACCESS_TOKEN;
  }

  console.log('  🔄 Refreshing TikTok access token...');
  const res = await fetch(`${TIKTOK_API_BASE}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
  });

  const json = await res.json();
  if (json.error) {
    throw new Error(`TikTok token refresh failed: ${json.error_description || json.error}`);
  }

  console.log('  ✅ Token refreshed');
  // 注意: 新しいリフレッシュトークンを環境変数にセット（GitHub Actions内のみ）
  // 本来は gh secret set で永続化すべきだが、スクリプト内では再設定のみ
  return json.access_token;
}

async function tiktokGet(path, token) {
  const res = await fetch(`${TIKTOK_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`TikTok API error: ${json.error.message} (code: ${json.error.code})`);
  }
  return json.data;
}

async function tiktokPost(path, body, token) {
  const res = await fetch(`${TIKTOK_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (json.error) {
    throw new Error(`TikTok API error: ${json.error.message} (code: ${json.error.code})`);
  }
  return json.data;
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
async function main() {
  console.log('🚀 TikTok fetch started at', new Date().toISOString());

  const token = await refreshAccessToken();
  if (!token) {
    console.error('❌ No TikTok access token available');
    process.exit(1);
  }

  try {
    // 1. アカウント情報取得
    console.log('\n📊 Fetching TikTok account info...');
    const userInfo = await tiktokGet('/user/info/?fields=follower_count,following_count,likes_count,video_count', token);
    console.log(`  followers: ${userInfo.follower_count}, videos: ${userInfo.video_count}`);

    // 2. 動画一覧取得（最大20件）
    console.log('🎬 Fetching TikTok video list...');
    let allVideos = [];
    let cursor = null;
    let hasMore = true;
    let page = 0;

    while (hasMore && page < 5) { // 最大5ページ（100件）
      const body = { max_count: 20 };
      if (cursor) body.cursor = cursor;

      const data = await tiktokPost('/video/list/?fields=id,create_time,title,video_description,share_url,cover_image_url,like_count,comment_count,share_count,view_count', body, token);

      allVideos = allVideos.concat(data.videos || []);
      cursor = data.cursor;
      hasMore = data.has_more;
      page++;
    }

    console.log(`  Found ${allVideos.length} videos`);

    // 3. 集計
    let totalLikes = 0;
    let totalComments = 0;
    let totalShares = 0;
    let totalViews = 0;
    let totalEngagement = 0;
    let postsWithViews = 0;
    let publishedToday = 0;

    for (const v of allVideos) {
      const createTime = new Date(v.create_time * 1000); // Unix秒 → Date
      const createTimeJST = new Date(createTime.getTime() + 9 * 60 * 60 * 1000);
      const postDateStr = createTime.toISOString().replace('T', ' ').substring(0, 16);

      // 当日投稿カウント
      if (createTimeJST.toISOString().split('T')[0] === todayJST()) {
        publishedToday++;
      }

      const likes = v.like_count ?? 0;
      const comments = v.comment_count ?? 0;
      const shares = v.share_count ?? 0;
      const views = v.view_count ?? 0;
      // 注意: TikTok Display API は reach を提供しないため、view_count で代用
      const er = views > 0
        ? Math.round((((likes + comments + shares) / views) * 10000)) / 100
        : 0;

      // posts シートに upsert
      await upsertPost({
        post_id: v.id,
        platform: 'tiktok',
        post_date: postDateStr,
        caption: v.title || v.video_description || '',
        permalink: v.share_url ?? '',
        thumbnail_url: v.cover_image_url ?? '',
        likes, comments, shares,
        saves: '', // TikTok API 非対応
        reach: views, // view_count を reach 代わりに
        video_views: views,
        avg_watch_time_ms: '', // TikTok API 非対応
        engagement_rate: er,
      });

      // post_daily シートにスナップショット
      const hours = hoursSincePost(createTime);
      await appendPostDaily({
        date: todayJST(),
        post_id: v.id,
        platform: 'tiktok',
        hours_since_post: hours,
        likes, comments, shares,
        saves: '', // TikTok API 非対応
        video_views: views,
      });

      totalLikes += likes;
      totalComments += comments;
      totalShares += shares;
      totalViews += views;
      if (views > 0) {
        totalEngagement += (likes + comments + shares) / views;
        postsWithViews++;
      }
    }

    // 4. account_daily に書き込み
    const avgER = postsWithViews > 0
      ? Math.round((totalEngagement / postsWithViews) * 10000) / 100
      : 0;

    await appendAccountDaily({
      date: todayJST(),
      platform: 'tiktok',
      followers: userInfo.follower_count ?? '',
      new_followers: '', // 差分計算は別途必要
      profile_visits: '', // Display API 非対応
      reach: totalViews,  // view_count を reach 代わりに
      impressions: '',    // Display API 非対応
      likes: totalLikes,
      comments: totalComments,
      shares: totalShares,
      saves: '',          // Display API 非対応
      posts_published: publishedToday,
      avg_engagement_rate: avgER,
    });

    console.log('\n✅ TikTok fetch complete');
    console.log(`   posts today: ${publishedToday}`);
    console.log(`   total views: ${totalViews}`);
    console.log(`   total likes: ${totalLikes}`);
    console.log(`   avg ER: ${avgER}%`);
    console.log('   ⚠️  saves, watch_time, completion_rate are NOT available via TikTok API');
  } catch (err) {
    console.error('❌ TikTok fetch failed:', err.message);
    process.exit(1);
  }
}

main();
