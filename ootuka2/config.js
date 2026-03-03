// townhall/config.js
// ★ここを町内会ごとに変える（いまは北滝の例）
window.APP_CONFIG = {
  SUPABASE_URL: "https://htrsbjadomyonuelzups.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_KQvUS5eLkDyB4dJQlhzoxw_lgNq_66F",

  // 町内会（固定運用）
  ORG_ID: "38a79eb3-f4c3-4365-b5f3-87aa062fa9d0",
  ORG_SLUG: "ootuka2",
  ORG_NAME: "大塚二区町内会",

  // 表示・動作スイッチ（必要になったら使う）
  MODE: "town" ,// "town" | "center"

   // ★追加
  ADMIN_PASS: "5678",  
  AUTH_TTL_HOURS: 8,
  AUTH_STORAGE_KEY: "hb_admin_auth_v1",

};