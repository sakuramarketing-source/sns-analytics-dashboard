/**
 * config.js
 * 設定ファイル — Google Sheets の公開 CSV URL をここで管理
 *
 * 設定手順:
 *   1. Google Sheets で「ファイル → 共有 → ウェブに公開」
 *   2. 各シートを CSV 形式で公開
 *   3. 発行された URL を以下に貼り付け
 */

const CONFIG = {
  // === 公開 CSV URL（Google Sheets の「ウェブに公開」から取得） ===
  // TODO: 実際のURLに差し替える
  accountDailyCsv: 'https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISHED_ID/pub?gid=0&single=true&output=csv',
  postsCsv:        'https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISHED_ID/pub?gid=0&single=true&output=csv',
  postDailyCsv:    'https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISHED_ID/pub?gid=0&single=true&output=csv',

  // === プラットフォーム設定 ===
  platforms: ['instagram', 'tiktok'],
  platformLabels: {
    instagram: 'Instagram',
    tiktok: 'TikTok',
    all: '両方'
  },

  // === 色 ===
  colors: {
    instagram: '#E4405F',
    tiktok: '#000000',
    accent: '#00A6B4',
    up: '#22c55e',
    down: '#ef4444',
  },
};
