/**
 * config.js — 設定ファイル
 */

const CONFIG = {
  // === Google Sheets 公開 CSV（分析用・読み取り専用） ===
  tiktokRawCsv: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzNQ52k1KB6FlDOr6_R810k7dZ-qq0sSFJ7ZJnV7D5T8bLeS2kACLPDZxWvmzSRlpf0gcDNXS2PRUC/pub?gid=1703875842&single=true&output=csv',

  // === Google Apps Script API（コンテンツ管理の読み書き） ===
  gasUrl: 'https://script.google.com/macros/s/AKfycbwd87g2ekzvB6OE3UlGCWfU56hYW4oKB7194Hh7I9Htar8yGZInaPNWde35PIsEGtfGMA/exec',

  // === プラットフォーム設定 ===
  platforms: ['instagram', 'tiktok'],
  platformLabels: { instagram: 'Instagram', tiktok: 'TikTok', all: '両方' },

  // === 色 ===
  colors: {
    instagram: '#E4405F', tiktok: '#000000', accent: '#00A6B4',
    up: '#22c55e', down: '#ef4444',
  },
};
