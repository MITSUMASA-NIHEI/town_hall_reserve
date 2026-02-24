// townhall/config.js
// ★ここを町内会ごとに変える（いまは北滝の例）
window.APP_CONFIG = {
  SUPABASE_URL: "https://htrsbjadomyonuelzups.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_KQvUS5eLkDyB4dJQlhzoxw_lgNq_66F",

  // 町内会（固定運用）
  ORG_ID: "4da381c2-cf21-4c5a-8239-2f28b78a6a01",
  ORG_SLUG: "kitataki",
  ORG_NAME: "北滝沢町内会",

  // 表示・動作スイッチ（必要になったら使う）
  MODE: "town" ,// "town" | "center"

   // ★追加
  ADMIN_PASS: "1234",  
  AUTH_TTL_HOURS: 8,
  AUTH_STORAGE_KEY: "hb_admin_auth_v1",

};