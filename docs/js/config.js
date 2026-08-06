const CONFIG = {
  // === Google Sheets 公開 CSV ===
  tiktokRawCsv: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzNQ52k1KB6FlDOr6_R810k7dZ-qq0sSFJ7ZJnV7D5T8bLeS2kACLPDZxWvmzSRlpf0gcDNXS2PRUC/pub?gid=1703875842&single=true&output=csv',
  pipelineCsv: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzNQ52k1KB6FlDOr6_R810k7dZ-qq0sSFJ7ZJnV7D5T8bLeS2kACLPDZxWvmzSRlpf0gcDNXS2PRUC/pub?gid=2083065629&single=true&output=csv',
  scheduleCsv: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzNQ52k1KB6FlDOr6_R810k7dZ-qq0sSFJ7ZJnV7D5T8bLeS2kACLPDZxWvmzSRlpf0gcDNXS2PRUC/pub?gid=1283878614&single=true&output=csv',
  metricsCsv: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRzNQ52k1KB6FlDOr6_R810k7dZ-qq0sSFJ7ZJnV7D5T8bLeS2kACLPDZxWvmzSRlpf0gcDNXS2PRUC/pub?gid=1982369072&single=true&output=csv',

  // === GAS（書き込み専用） ===
  gasUrl: 'https://script.google.com/macros/s/AKfycbwd87g2ekzvB6OE3UlGCWfU56hYW4oKB7194Hh7I9Htar8yGZInaPNWde35PIsEGtfGMA/exec',

  platforms: ['instagram', 'tiktok'],
  platformLabels: { instagram: 'Instagram', tiktok: 'TikTok', all: '両方' },
  colors: { instagram: '#E4405F', tiktok: '#000000', accent: '#00A6B4', up: '#22c55e', down: '#ef4444' },
};
