/**
 * fetch-instagram.js
 * Instagram Graph API から投稿パフォーマンスを取得し Google Sheets に書き込む
 *
 * 前提:
 *   - Instagram Professional アカウント (Business or Creator)
 *   - Facebook Page に紐付け済み
 *   - Meta App で長期アクセストークン発行済み
 *   - 環境変数: INSTAGRAM_ACCESS_TOKEN, INSTAGRAM_IG_USER_ID
 */

import {
  appendAccountDaily,
  upsertPost,
  appendPostDaily,
  hoursSincePost,
  calcEngagementRate,
  todayJST,
} from './update-sheet.js';

const TOKEN = process.env.INSTAGRAM_ACCESS_TOKEN;
const IG_USER_ID = process.env.INSTAGRAM_IG_USER_ID;
const BASE = 'https://graph.facebook.com/v22.0';

if (!TOKEN || !IG_USER_ID) {
  console.warn('⚠️ Instagram credentials not set. Skipping Instagram fetch.');
  console.warn('   Set INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_IG_USER_ID secrets to enable.');
  process.exit(0);
}

async function fetchFromGraphAPI(path) {
  const url = `${BASE}${path}`;
  const res = await fetch(url);
  const json = await res.json();
  if (json.error) {
    throw new Error(`Instagram API error: ${json.error.message} (${json.error.code})`);
  }
  return json;
}

// -------------------------------------------------------
// 1. アカウントインサイト取得
// -------------------------------------------------------
async function fetchAccountInsights() {
  console.log('\n📊 Fetching Instagram account insights...');

  try {
    const json = await fetchFromGraphAPI(
      `/${IG_USER_ID}/insights?metric=reach,impressions,profile_views,website_clicks,follower_count&period=day&since=2 days ago&until=1 days ago`
    );

    const data = {};
    for (const m of json.data) {
      if (m.values && m.values.length > 0) {
        data[m.name] = m.values[0].value;
      }
    }

    // 新規フォロワーは差分で計算したいが、IG APIは当日フォロワー数のみ提供
    const row = {
      date: todayJST(),
      platform: 'instagram',
      followers: data.follower_count ?? '',
      new_followers: '', // 別途差分計算が必要
      profile_visits: data.profile_views ?? '',
      reach: data.reach ?? '',
      impressions: data.impressions ?? '',
      likes: '',    // メディアごとに集計するのでここでは空
      comments: '',
      shares: '',
      saves: '',
      posts_published: 0,
      avg_engagement_rate: '',
    };

    console.log(`  followers: ${row.followers}, reach: ${row.reach}, impressions: ${row.impressions}`);
    return row;
  } catch (err) {
    console.warn(`  ⚠️ Account insights fetch failed: ${err.message}`);
    // 失敗しても続行（メディアデータは取れるかもしれない）
    return {
      date: todayJST(),
      platform: 'instagram',
      followers: '', new_followers: '', profile_visits: '', reach: '', impressions: '',
      likes: '', comments: '', shares: '', saves: '', posts_published: 0, avg_engagement_rate: '',
    };
  }
}

// -------------------------------------------------------
// 2. メディア一覧＋インサイト取得
// -------------------------------------------------------
async function fetchMediaInsights() {
  console.log('📸 Fetching Instagram media insights...');

  // 直近30日分のメディアを取得
  const thirtyDaysAgo = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
  const mediaJson = await fetchFromGraphAPI(
    `/${IG_USER_ID}/media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&since=${thirtyDaysAgo}&limit=100`
  );

  const media = mediaJson.data || [];
  console.log(`  Found ${media.length} media items`);

  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalSaves = 0;
  let totalReach = 0;
  let totalEngagement = 0;
  let postsWithReach = 0;
  let publishedToday = 0;

  for (const m of media) {
    const postDate = new Date(m.timestamp);
    const postDateJST = new Date(postDate.getTime() + 9 * 60 * 60 * 1000);

    // 当日投稿カウント（JSTで今日の日付のもの）
    if (postDateJST.toISOString().split('T')[0] === todayJST()) {
      publishedToday++;
    }

    // 個別メディアのインサイト取得
    let reach = 0, shares = 0, saves = 0, videoViews = 0, avgWatchTime = 0;
    try {
      const insightsJson = await fetchFromGraphAPI(
        `/${m.id}/insights?metric=reach,shares,saved,video_views,ig_reels_avg_watch_time`
      );
      for (const ins of insightsJson.data) {
        if (ins.values && ins.values.length > 0) {
          const val = ins.values[0].value;
          switch (ins.name) {
            case 'reach': reach = val ?? 0; break;
            case 'shares': shares = val ?? 0; break;
            case 'saved': saves = val ?? 0; break;
            case 'video_views': videoViews = val ?? 0; break;
            case 'ig_reels_avg_watch_time': avgWatchTime = val ?? 0; break;
          }
        }
      }
    } catch (err) {
      console.warn(`  ⚠️ Insights fetch failed for ${m.id}: ${err.message}`);
    }

    const likes = m.like_count ?? 0;
    const comments = m.comments_count ?? 0;
    const er = calcEngagementRate(likes, comments, shares, saves, reach);

    // posts シートに upsert（最新累積値）
    await upsertPost({
      post_id: m.id,
      platform: 'instagram',
      post_date: m.timestamp,
      caption: m.caption ?? '',
      permalink: m.permalink ?? '',
      thumbnail_url: m.media_url ?? '',
      likes, comments, shares, saves,
      reach,
      video_views: videoViews,
      avg_watch_time_ms: avgWatchTime ? Math.round(avgWatchTime * 1000) : '',
      engagement_rate: er,
    });

    // post_daily シートにスナップショット追記（時系列追跡）
    const hours = hoursSincePost(m.timestamp);
    await appendPostDaily({
      date: todayJST(),
      post_id: m.id,
      platform: 'instagram',
      hours_since_post: hours,
      likes, comments, shares, saves,
      video_views: videoViews,
    });

    // 集計
    totalLikes += likes;
    totalComments += comments;
    totalShares += shares;
    totalSaves += saves;
    totalReach += reach;
    if (reach > 0) {
      totalEngagement += (likes + comments + shares + saves) / reach;
      postsWithReach++;
    }
  }

  return {
    totalLikes, totalComments, totalShares, totalSaves,
    avgEngagementRate: postsWithReach > 0
      ? Math.round((totalEngagement / postsWithReach) * 10000) / 100
      : 0,
    publishedToday,
  };
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
async function main() {
  console.log('🚀 Instagram fetch started at', new Date().toISOString());

  try {
    // アカウントインサイト + メディアインサイトを並列取得
    const [accountRow, mediaSummary] = await Promise.all([
      fetchAccountInsights(),
      fetchMediaInsights(),
    ]);

    // account_daily を完成させる
    accountRow.likes = mediaSummary.totalLikes;
    accountRow.comments = mediaSummary.totalComments;
    accountRow.shares = mediaSummary.totalShares;
    accountRow.saves = mediaSummary.totalSaves;
    accountRow.posts_published = mediaSummary.publishedToday;
    accountRow.avg_engagement_rate = mediaSummary.avgEngagementRate;

    await appendAccountDaily(accountRow);

    console.log('\n✅ Instagram fetch complete');
    console.log(`   posts today: ${mediaSummary.publishedToday}`);
    console.log(`   total likes: ${mediaSummary.totalLikes}`);
    console.log(`   avg ER: ${mediaSummary.avgEngagementRate}%`);
  } catch (err) {
    console.error('❌ Instagram fetch failed:', err.message);
    process.exit(1);
  }
}

main();
