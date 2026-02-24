// admin.js

// ========= Supabase =========
/*const SUPABASE_URL = "https://htrsbjadomyonuelzups.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KQvUS5eLkDyB4dJQlhzoxw_lgNq_66F";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORG_ID = "4da381c2-cf21-4c5a-8239-2f28b78a6a01";*/


// ===============================
// admin.js（町内会版）
// ===============================

const CFG = window.APP_CONFIG;
if (!CFG) { alert("config.js が読み込まれていません"); throw new Error("Missing APP_CONFIG"); }

// Supabase
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// 町内会 固定
const ORG_ID = CFG.ORG_ID;

//const el = (id) => document.getElementById(id);



// ========= Utils =========
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));

const toHHMM = (t) => String(t ?? "").slice(0,5);

// ========= Load =========
async function refresh(){
  const el = document.getElementById("reqList");
  el.innerHTML = `<div style="color:#666;font-size:13px;">読み込み中...</div>`;

  const { data, error } = await db
    .from("facility_requests")
    .select("id, date, start_time, end_time, title, name, phone, email, status")
    .eq("org_id", ORG_ID)
    .in("status", ["checking"])  // 確認中だけ表示
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error){
    console.error(error);
    el.innerHTML = `<div style="color:#c00;">読み込みエラー：${esc(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0){
    el.innerHTML = `<div style="color:#666;font-size:13px;">確認中の申請はありません。</div>`;
    return;
  }

  el.innerHTML = data.map(renderRow).join("");
}

function renderRow(r){
  const dateStr = (typeof r.date === "string") ? r.date : "";
  const st = toHHMM(r.start_time);
  const et = toHHMM(r.end_time);

  const title = esc(r.title);
  const name = esc(r.name ?? "（氏名なし）");
  const phone = esc(r.phone ?? "");

  return `
    <div class="req-item" data-id="${esc(r.id)}" data-phone="${phone}">
      <div class="req-left">
        <div class="req-date">${esc(dateStr)}</div>
        <div class="req-main">${esc(st)}〜${esc(et)}　${title}</div>
        <div class="req-sub">氏名：${name} ／ 電話：${phone || "（なし）"}</div>
      </div>

      <div class="req-actions">
        <div class="top-row">
          <span class="badge">確認中</span>
          <button class="icon-btn" type="button" title="電話をコピー" onclick="copyPhone('${esc(r.id)}')">
            ${iconCopy()}
          </button>
        </div>

        <div class="bottom-row">
          <button class="icon-btn ok" type="button" title="承認" onclick="approveReq('${esc(r.id)}')">
            ${iconCheck()}
          </button>
          <button class="icon-btn ng" type="button" title="却下" onclick="rejectReq('${esc(r.id)}')">
            ${iconX()}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ========= Actions =========
async function copyPhone(id){
  const row = document.querySelector(`.req-item[data-id="${CSS.escape(id)}"]`);
  const phone = row?.getAttribute("data-phone") ?? "";
  if (!phone){
    alert("電話番号がありません。");
    return;
  }

  try{
    await navigator.clipboard.writeText(phone);
  }catch(e){
    // フォールバック
    const ta = document.createElement("textarea");
    ta.value = phone;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

//2026/02/24に訂正

async function approveReq(id){
  if (!confirm("この申請を承認しますか？")) return;

  const { data, error } = await db
    .from("facility_requests")
    .update({ status: "approved" })
    .eq("org_id", ORG_ID)
    .eq("id", id)
    .select("id"); // ← 保険（更新件数が分かる）

  if (error){
    console.error(error);
    alert("承認に失敗しました。\n\n" + error.message);
    return;
  }

  // 更新0件を検知（org_id/idズレ等）
  if (!data || data.length === 0){
    alert("承認できませんでした（対象が見つかりません）。");
    return;
  }

  await refresh();
}

async function rejectReq(id){
  if (!confirm("この申請を却下しますか？")) return;

  const { data, error } = await db
    .from("facility_requests")
    .update({ status: "rejected" })
    .eq("org_id", ORG_ID)
    .eq("id", id)
    .select("id");

  if (error){
    console.error(error);
    alert("却下に失敗しました。\n\n" + error.message);
    return;
  }

  if (!data || data.length === 0){
    alert("却下できませんでした（対象が見つかりません）。");
    return;
  }

  await refresh();
}

/*async function approveReq(id){
  if (!confirm("この申請を承認しますか？")) return;

  // ① 更新（更新後の行も返す）
  const { data: upd, error: updErr } = await db
    .from("facility_requests")
    .update({ status: "approved" })
    .eq("org_id", ORG_ID)
    .eq("id", id)
    .select("id, status, org_id");   // ★重要：更新結果を返させる（Supabaseはselectがないと返らない）

  console.log("[approve] update result:", upd, updErr);

  if (updErr){
    console.error(updErr);
    alert("承認に失敗しました。\n\n" + updErr.message);
    return;
  }

  // ② DBの現物確認（念のため再読込）
  const { data: chk, error: chkErr } = await db
    .from("facility_requests")
    .select("id, status, org_id")
    .eq("org_id", ORG_ID)
    .eq("id", id)
    .maybeSingle();

  console.log("[approve] after read:", chk, chkErr);

  await refresh();
}*/




/*async function approveReq(id){
  if (!confirm("この申請を承認しますか？")) return;

  const { error } = await db
    .from("facility_requests")
    .update({ status: "approved" })
    .eq("org_id", ORG_ID)
    .eq("id", id);

  if (error){
    console.error(error);
    alert("承認に失敗しました。\n\n" + error.message);
    return;
  }
  await refresh();
}*/

/*async function rejectReq(id){
  if (!confirm("この申請を却下しますか？")) return;

  const { error } = await db
    .from("facility_requests")
    .update({ status: "rejected" })
    .eq("org_id", ORG_ID)
    .eq("id", id);

  if (error){
    console.error(error);
    alert("却下に失敗しました。\n\n" + error.message);
    return;
  }
  await refresh();
}*/

// ========= Icons =========
function iconCopy(){
  return `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2"></rect>
    <rect x="2" y="2" width="13" height="13" rx="2"></rect>
  </svg>`;
}

function iconCheck(){
  return `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5"></path>
  </svg>`;
}

function iconX(){
  return `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"
       stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M18 6 6 18"></path>
    <path d="M6 6 18 18"></path>
  </svg>`;
}

// グローバル公開（onclick用）
window.refresh = refresh;
window.copyPhone = copyPhone;
window.approveReq = approveReq;
window.rejectReq = rejectReq;

// 起動
refresh();
