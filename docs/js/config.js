/**
 * config.js
 * 設定ファイル — Google Sheets の公開 CSV URL をここで管理
 */

const CONFIG = {
  // === 公開 CSV URL（Google Sheets の「ウェブに公開」→ CSV から取得） ===
  // Phase 1: Marketing Data Extractor の自動生成シートをそのまま使う
  tiktokRawCsv: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzNQ52k1KB6FlDOr6_R810k7dZ-qq0sSFJ7ZJnV7D5T8bLeS2kACLPDZxWvmzSRlpf0gcDNXS2PRUC/pub?gid=1703875842&single=true&output=csv',

  // Phase 2以降: GitHub Actions が書き込む構造化シート（準備中）
  // accountDailyCsv: 'https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISHED_ID/pub?gid=0&single=true&output=csv',
  // postsCsv:        'https://docs.google.com/spreadsheets/d/e/YOUR_PUBLISHED_ID/pub?gid=0&single=true&output=csv',

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
