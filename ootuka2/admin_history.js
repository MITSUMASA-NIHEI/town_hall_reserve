// admin_history.js

// ===============================
// Supabase（あなたの固定設定）
// ===============================
/*const SUPABASE_URL = "https://htrsbjadomyonuelzups.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KQvUS5eLkDyB4dJQlhzoxw_lgNq_66F";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
//const ORG_ID = "4da381c2-cf21-4c5a-8239-2f28b78a6a01";

const el = (id) => document.getElementById(id);*/

// ===============================
// admin_history.js（町内会版）
// ===============================

const CFG = window.APP_CONFIG;
if (!CFG) { alert("config.js が読み込まれていません"); throw new Error("Missing APP_CONFIG"); }

// Supabase
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// 町内会 固定
const ORG_ID = CFG.ORG_ID;

const el = (id) => document.getElementById(id);


function getOrgKey(){
  const p = new URLSearchParams(location.search);
  return (p.get("org") || "").trim(); // slug or uuid
}

async function resolveOrgId(defaultOrgId){
  const key = getOrgKey();
  if (!key) return defaultOrgId;

  // slug or uuid を orgs から引く
  const { data, error } = await db.from("orgs").select("id, slug").order("name");
  if (error || !data) return defaultOrgId;

  const hit = data.find(o => o.slug === key) || data.find(o => o.id === key);
  return hit ? hit.id : defaultOrgId;
}

//let ORG_ID = "4da381c2-cf21-4c5a-8239-2f28b78a6a01"; // 既定（北滝）

// ===============================
// utilities
// ===============================
function setStatus(msg){
  const st = el("status");
  if (st) st.textContent = msg || "";
}

function ymd(d){
  const z = (n)=> String(n).padStart(2,"0");
  return `${d.getFullYear()}-${z(d.getMonth()+1)}-${z(d.getDate())}`;
}

function hhmm(t){
  if (!t) return "";
  return String(t).slice(0,5);
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, (c)=>({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function includesAny(text, q){
  if (!q) return true;
  return String(text || "").toLowerCase().includes(q.toLowerCase());
}

function fmtStamp(ts){
  if (!ts) return "-";
  // "2026-02-20T08:00:00+00:00" -> "2026-02-20 08:00"
  const s = String(ts).replace("T"," ");
  return esc(s.slice(0,16));
}

// ===============================
// init
// ===============================
(function init(){

    el("today").textContent = `今日は ${ymd(new Date())} です。`;

  // 初期期間：直近30日
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);

  el("fromDate").value = ymd(from);
  el("toDate").value = ymd(to);

  // nav
  el("btnBackAll")?.addEventListener("click", ()=> location.href = "admin_all.html");
  el("btnOpenIndex")?.addEventListener("click", ()=> window.open("index.html", "_blank", "noopener,noreferrer"));
  el("btnOpenAnnual")?.addEventListener("click", ()=> window.open("admin_annual.html", "_blank", "noopener,noreferrer"));

  // actions
  el("btnSearch")?.addEventListener("click", ()=> loadHistory());
  el("btnReset")?.addEventListener("click", ()=>{
    el("statusFilter").value = "all";
    el("q").value = "";
    el("fromDate").value = ymd(from);
    el("toDate").value = ymd(to);
    loadHistory();
  });

  // enterキーで検索
  el("q")?.addEventListener("keydown", (e)=>{
    if (e.key === "Enter") loadHistory();
  });

  loadHistory();
})();

// ===============================
// load
// ===============================
async function loadHistory(){
  const host = el("list");
  if (!host) return;

  const fromDate = el("fromDate").value || null;
  const toDate   = el("toDate").value || null;
  const stFilter = el("statusFilter").value || "all";
  const q = (el("q").value || "").trim();

  host.innerHTML = `<div class="item">読み込み中...</div>`;
  setStatus("");

  try{
    let query = db
      .from("facility_requests")
      .select("id,date,start_time,end_time,title,status,phone,name,email,reject_reason,approved_at,approved_by,rejected_at,rejected_by")
      .eq("org_id", ORG_ID)
      .in("status", ["approved","rejected"]);
      //.order("date", { ascending: false })
      //.order("start_time", { ascending: false });

    // 期間（dateで絞る）
    if (fromDate) query = query.gte("date", fromDate);
    if (toDate)   query = query.lte("date", toDate);

    // 状態
    if (stFilter === "approved") query = query.eq("status", "approved");
    if (stFilter === "rejected") query = query.eq("status", "rejected");

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    // キーワード（まずはクライアント側フィルタで十分）
    const filtered = (data || []).filter(r=>{
      if (!q) return true;
      return (
        includesAny(r.title, q) ||
        includesAny(r.name, q)  ||
        includesAny(r.phone, q) ||
        includesAny(r.email, q)
      );
    });

    // 処理日時（approved_at / rejected_at）で降順ソート
    filtered.sort((a, b)=>{
    const ta = a.approved_at || a.rejected_at || "";
    const tb = b.approved_at || b.rejected_at || "";

    // ISO文字列なので文字列比較でOK（降順）
    return tb.localeCompare(ta);
    });


    el("count").textContent = String(filtered.length);

    if (!filtered.length){
      host.innerHTML = `<div class="item">該当する履歴はありません。</div>`;
      return;
    }

    host.innerHTML = filtered.map(r=>{
      const s = hhmm(r.start_time);
      const e = hhmm(r.end_time);

      const isApproved = r.status === "approved";
      const statusLabel = isApproved ? "承認済" : "却下";

      const stamp = isApproved
        ? `承認：${fmtStamp(r.approved_at)}${r.approved_by ? ` / ${esc(r.approved_by)}` : ""}`
        : `却下：${fmtStamp(r.rejected_at)}${r.rejected_by ? ` / ${esc(r.rejected_by)}` : ""}`;

      const reason = (!isApproved && r.reject_reason)
        ? `<div class="note" style="margin-top:6px;">理由：${esc(r.reject_reason)}</div>`
        : "";

      return `
        <div class="item">
          <div class="time">${esc(r.date)} ${esc(s)}〜${esc(e)} <span style="margin-left:8px; font-weight:700;">${statusLabel}</span></div>
          <div class="title">${esc(r.title)}</div>
          <div class="contact">
            電話：${esc(r.phone || "")}
            ${r.name ? ` / 氏名：${esc(r.name)}` : ""}
            ${r.email ? ` / Mail：${esc(r.email)}` : ""}
          </div>
          <div class="note" style="margin-top:6px;">${stamp}</div>
          ${reason}
        </div>
      `;
    }).join("");

  } catch(err){
    console.error(err);
    host.innerHTML = `<div class="item">読み込みエラー</div>`;
    setStatus(`読み込みに失敗しました：${err?.message || err}`);
  }
}