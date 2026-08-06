/**
 * data.js — 分析タブ用データ読み取り
 * metricsシート + Marketing Data Extractor のTikTokデータ
 */

let _rawData = null;

async function loadAllData() {
  try {
    const [mRaw, tRaw] = await Promise.all([
      fetch(CONFIG.metricsCsv).then(r => r.text()).catch(() => ''),
      fetch(CONFIG.tiktokRawCsv).then(r => r.text()).catch(() => ''),
    ]);

    // metricsシート → 数値データ
    let metricsPosts = [];
    if (mRaw) {
      const mData = Papa.parse(mRaw, { header: true, skipEmptyLines: true }).data;
      metricsPosts = mData.filter(r => r['企画ID']).map(r => ({
        post_id: r['企画ID'] + '_' + (r['プラットフォーム'] || 'TikTok'),
        platform: (r['プラットフォーム'] || 'TikTok').toLowerCase(),
        post_date: r['日付'] || '',
        caption: r['企画ID'] || '',
        permalink: '', thumbnail_url: '',
        likes: parseInt(r['いいね']) || 0,
        comments: parseInt(r['コメント']) || 0,
        shares: parseInt(r['シェア']) || 0,
        saves: parseInt(r['保存']) || 0,
        reach: parseInt(r['再生数']) || 0,
        video_views: parseInt(r['再生数']) || 0,
        avg_watch_time_ms: '',
        engagement_rate: calcER(
          parseInt(r['再生数'])||0, parseInt(r['いいね'])||0,
          parseInt(r['コメント'])||0, parseInt(r['シェア'])||0, parseInt(r['保存'])||0
        ),
      }));
    }

    // Marketing Data Extractor のTikTokデータ（補完）
    let tiktokPosts = [];
    if (tRaw) {
      const tData = Papa.parse(tRaw, { header: true, skipEmptyLines: true }).data;
      tiktokPosts = tData.filter(r => r['Video ID']).map(r => ({
        post_id: r['Video ID'] || '',
        platform: 'tiktok',
        post_date: (r['Posted Date'] || '').split(' ')[0],
        caption: r['Caption'] || '',
        permalink: r['Video URL'] || '',
        thumbnail_url: r['Thumbnail URL'] || '',
        likes: parseInt(r['Likes']) || 0,
        comments: parseInt(r['Comments']) || 0,
        shares: parseInt(r['Shares']) || 0,
        saves: parseInt(r['Saves']) || 0,
        reach: parseInt(r['Views']) || 0,
        video_views: parseInt(r['Views']) || 0,
        avg_watch_time_ms: parseInt(r['Duration (sec)'])?parseInt(r['Duration (sec)'])*1000:'',
        engagement_rate: calcER(
          parseInt(r['Views'])||0, parseInt(r['Likes'])||0,
          parseInt(r['Comments'])||0, parseInt(r['Shares'])||0, parseInt(r['Saves'])||0
        ),
      }));
    }

    _rawData = { posts: [...metricsPosts, ...tiktokPosts] };
    return _rawData;
  } catch (e) { console.warn(e); throw e; }
}

function calcER(v, l, c, sh, sa) { if (!v) return 0; return Math.round(((l+c+sh+sa)/v)*10000)/100; }

function getPostData({ platform = 'all', since = null, until = null } = {}) {
  if (!_rawData?.posts) return [];
  let rows = _rawData.posts;
  if (platform !== 'all') rows = rows.filter(r => r.platform === platform);
  if (since) rows = rows.filter(r => r.post_date >= since);
  if (until) rows = rows.filter(r => r.post_date <= until);
  return rows;
}

function getAccountData({ platform = 'all', since = null, until = null } = {}) {
  const posts = getPostData({ platform, since, until });
  const byDate = {};
  for (const p of posts) {
    const d = p.post_date; if (!d) continue;
    if (!byDate[d]) byDate[d] = { date:d, platform, likes:0,comments:0,shares:0,saves:0,reach:0,views:0,er_sum:0,count:0 };
    byDate[d].likes += p.likes; byDate[d].comments += p.comments;
    byDate[d].shares += p.shares; byDate[d].saves += p.saves;
    byDate[d].reach += p.reach; byDate[d].views += p.video_views;
    byDate[d].er_sum += p.engagement_rate; byDate[d].count++;
  }
  return Object.values(byDate).map(d => ({
    ...d, avg_engagement_rate: d.count>0?Math.round((d.er_sum/d.count)*100)/100:0
  })).sort((a,b) => a.date.localeCompare(b.date));
}

function getKPIs({ platform = 'all', since = null, until = null } = {}) {
  const posts = getPostData({ platform, since, until });
  if (!posts.length) return null;
  const sum = k => posts.reduce((s,p)=>s+(p[k]||0), 0);
  const v = sum('video_views');
  return {
    views: v, likes: sum('likes'), comments: sum('comments'),
    shares: sum('shares'), saves: sum('saves'),
    followers: 0,
    er: v>0?Math.round(((sum('likes')+sum('comments')+sum('shares')+sum('saves'))/v)*10000)/100:0,
    postsPublished: posts.length,
  };
}

function getWowDelta(k, pk) {
  if (!k||!pk) return null;
  const c = (a,b)=>b&&b!==0?Math.round(((a-b)/b)*100):null;
  return {
    views: c(k.views,pk.views), likes: c(k.likes,pk.likes),
    followers: c(k.followers,pk.followers), er: k.er&&pk.er?Math.round((k.er-pk.er)*10)/10:null,
    saves: c(k.saves,pk.saves), shares: c(k.shares,pk.shares),
  };
}

function getTopPosts({ platform = 'all', since = null, until = null, limit = 5 } = {}) {
  return getPostData({platform,since,until}).filter(r=>r.engagement_rate>0).sort((a,b)=>b.engagement_rate-a.engagement_rate).slice(0,limit);
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function daysAgo(n) { const d=new Date(); d.setDate(d.getDate()-n); return d.toISOString().split('T')[0]; }
function getWeekRange(o=0) {
  const d=new Date(), m=new Date(d); m.setDate(d.getDate()-((d.getDay()+6)%7)+o*7);
  const f=new Date(m); f.setDate(m.getDate()+4);
  return { since:m.toISOString().split('T')[0], until:f.toISOString().split('T')[0], label:`${m.getMonth()+1}/${m.getDate()}〜${f.getMonth()+1}/${f.getDate()}` };
}
function getMonthRange(o=0) {
  const d=new Date(); d.setMonth(d.getMonth()+o);
  const l=new Date(d.getFullYear(),d.getMonth()+1,0);
  return { since:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`, until:l.toISOString().split('T')[0], label:`${d.getMonth()+1}月` };
}
