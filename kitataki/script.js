// =======================================
// 町内集会所予約システム script.js（利用者側）
// ✅ 条件付き自動承認 + 「! / ！」裏ルール対応 完全版
// ✅ phone必須 / name,email任意（保存は phone を数字だけに正規化）
// =======================================


// ① Supabase情報
/*const SUPABASE_URL = "https://htrsbjadomyonuelzups.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KQvUS5eLkDyB4dJQlhzoxw_lgNq_66F";

// ② Supabaseクライアント作成（これ1回だけ）
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORG_ID = "4da381c2-cf21-4c5a-8239-2f28b78a6a01";*/

// ===============================
// script.js（町内会版）
// ===============================

const CFG = window.APP_CONFIG;
if (!CFG) { alert("config.js が読み込まれていません"); throw new Error("Missing APP_CONFIG"); }

// Supabase
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// 町内会 固定
const ORG_ID = CFG.ORG_ID;

//const el = (id) => document.getElementById(id);


// ---------------------------------------
// 表示用：XSS対策（タイトル等の安全表示）
// ---------------------------------------
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}


// ---------------------------------------
// time型を扱うユーティリティ
// ---------------------------------------
function hhmmss(t) {
  const s = String(t || "");
  if (s.length === 5) return s + ":00";
  return s;
}

function hhmm(t) {
  if (!t) return "";
  return String(t).slice(0, 5);
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  return (eh * 60 + em) - (sh * 60 + sm);
}

function inRange(t, from, to) {
  return t >= from && t <= to;
}

function short10(s) {
  const str = String(s ?? "");
  return str.length > 10 ? str.slice(0, 10) + "…" : str;
}


// ---------------------------------------
// タイトル正規化（裏ルール：! / ！ 対応）
// ---------------------------------------
function normalizeTitle(raw) {
  if (!raw) return { isPriority: false, cleanTitle: "" };

  let t = raw.trim();
  t = t.replace(/^！/, "!");

  const isPriority = t.startsWith("!");
  const cleanTitle = isPriority ? t.slice(1).trim() : t;

  return { isPriority, cleanTitle };
}


// ---------------------------------------
// 今日の日付を静かに表示
// ---------------------------------------
(function showToday() {
  const el = document.getElementById("today");
  if (!el) return;

  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth() + 1;
  const d = today.getDate();

  el.textContent = `今日は ${y}年${m}月${d}日です。`;
})();


// ---------------------------------------
// 簡易カレンダー（この日の予定）
// ---------------------------------------
 async function loadDaySchedule() {
  const dateStr = document.getElementById("viewDate")?.value;
  const listEl  = document.getElementById("scheduleList");
  if (!dateStr || !listEl) return;

  // ① facility_requests（その日）
  const { data: reqs, error } = await db
    .from("facility_requests")
    .select("start_time, end_time, title, status")
    .eq("org_id", ORG_ID)
    .eq("date", dateStr)
    .order("start_time", { ascending: true });

  if (error) {
    console.error(error);
    listEl.innerHTML = `<div class="item">読み込みエラー</div>`;
    return;
  }

  // ② annual_events（その日）
  const annual = await fetchAnnualEventsDay(dateStr);

  // ③ 合体して時間順
  const merged = [...(reqs || []), ...(annual || [])]
    .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

  if (merged.length === 0) {
    listEl.innerHTML = `<div class="item">予定はありません。</div>`;
    return;
  }

  // ④ 描画（確認中は伏せる）
  listEl.innerHTML = merged.map(r => {
    const isApproved = r.status === "approved";
    const label = isApproved ? "承認済" : "確認";
    const cls = isApproved ? "tag approved" : "tag checking";
    const shownTitle = isApproved ? esc(r.title) : "（確認中の予定）";

    const s = String(r.start_time).slice(0, 5);
    const e = String(r.end_time).slice(0, 5);

    return `
      <div class="item">
        <div class="time">${s}〜${e}</div>
        <div class="title">${shownTitle}</div>
        <span class="${cls}">${label}</span>
      </div>
    `;
  }).join("");
}



// ---------------------------------------
// 月カレンダー：表示する年月（初期は今月）
// ---------------------------------------
let calYear, calMonth; // month: 1-12

function pad2(n) { return String(n).padStart(2, "0"); }
function ymd(y, m, d) { return `${y}-${pad2(m)}-${pad2(d)}`; }

async function fetchMonthSummary(y, m) {
  const first = ymd(y, m, 1);
  const lastDate = new Date(y, m, 0).getDate();
  const last = ymd(y, m, lastDate);

  // 1) 通常の申請データ（checking/approved）
  const { data: reqs, error: reqErr } = await db
    .from("facility_requests")
    .select("date, status")
    .eq("org_id", ORG_ID)
    .gte("date", first)
    .lte("date", last)
    .in("status", ["checking", "approved"]);

  if (reqErr) {
    console.error(reqErr);
    return { map: {}, error: reqErr.message };
  }

  // 2) 年間行事（今月分）
  const annual = await fetchAnnualEventsMonth(y, m);

  const map = {};

  // 申請（一般）
  for (const r of (reqs || [])) {
    const key = r.date;
    if (!map[key]) map[key] = { approved: 0, checking: 0, annual: 0 };
    if (r.status === "approved") map[key].approved += 1;
    else map[key].checking += 1;
  }

  // 年間行事（annual として加算）
  for (const a of (annual || [])) {
    const key = a.date; // a.date が "YYYY-MM-DD" 前提（あなたの既存コードに合わせています）
    if (!map[key]) map[key] = { approved: 0, checking: 0, annual: 0 };
    map[key].annual += 1;
  }

  return { map, error: null };
}

async function renderMonthCalendar() {
  const monthEl = document.getElementById("calMonth");
  const calEl = document.getElementById("monthCal");
  if (!monthEl || !calEl) return;

  const y = Number(calYear);
  const m = Number(calMonth);

  monthEl.textContent = `${y}年${m}月`;

  const dows = ["日", "月", "火", "水", "木", "金", "土"];
  calEl.innerHTML = dows.map(d => `<div class="cal-dow">${d}</div>`).join("");

  const summary = await fetchMonthSummary(y, m);
  const map = summary.map || {};

  const firstDow = new Date(y, m - 1, 1).getDay();
  const lastDay = new Date(y, m, 0).getDate();

  for (let i = 0; i < firstDow; i++) {
    calEl.insertAdjacentHTML("beforeend", `<div class="cal-cell is-empty"></div>`);
  }

  const t = new Date();
  const todayKey = ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());

  for (let day = 1; day <= lastDay; day++) {
    const key = ymd(y, m, day);
    const info = map[key];
    const isToday = (key === todayKey);

    const a = (info && info.approved) ? info.approved : 0;
    const c = (info && info.checking) ? info.checking : 0;
    const n = (info && info.annual)   ? info.annual   : 0;

    // 合算：承認 + 確認 + 年間
    const total = a + c + n;

    let markHtml = "";
    if (total > 0) {
      markHtml = `<span class="cal-mark reserved">予約（${total}）</span>`;
    }

    const cls = `cal-cell${isToday ? " is-today" : ""}`;

    calEl.insertAdjacentHTML("beforeend", `
      <div class="${cls}" data-date="${key}">
        <div class="cal-date">${day}</div>
        ${markHtml}
      </div>
    `);
  }

  calEl.querySelectorAll(".cal-cell[data-date]").forEach(cell => {
    cell.addEventListener("click", () => {
      const date = cell.dataset.date;
      const viewDateEl = document.getElementById("viewDate");
      if (viewDateEl) viewDateEl.value = date;
      loadDaySchedule();
      document.getElementById("scheduleList")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}


// ---------------------------------------
// 予約登録（自動承認：条件付き + 裏ルール）
// ---------------------------------------
async function save() {
  const btn = document.getElementById("btnSave");

  // 連打防止：すでに送信中なら何もしない
  if (btn && btn.disabled) return;

  try {
    const date  = document.getElementById("date").value.trim();
    const start = document.getElementById("start").value.trim();
    const end   = document.getElementById("end").value.trim();
    const rawTitle = document.getElementById("title").value;

    const { isPriority, cleanTitle } = normalizeTitle(rawTitle);

    const phoneRaw = document.getElementById("phone")?.value.trim() || "";
    const name  = document.getElementById("name")?.value.trim() || null;
    const email = document.getElementById("email")?.value.trim() || null;

    // 入力チェック（基本）
    if (!date || !start || !end || !cleanTitle) {
      alert("未入力があります。利用日・開始時間・終了時間・利用内容を入れてください。");
      return;
    }

    // 電話必須
    if (!phoneRaw) {
      alert("電話番号を入力してください。");
      return;
    }

    const phonePattern = /^[0-9]+(-[0-9]+)*$/;
    if (!phonePattern.test(phoneRaw)) {
      alert("電話番号は数字とハイフンのみで入力してください。\n例：09012345678 / 090-1234-5678");
      return;
    }

    const phone = phoneRaw.replace(/-/g, "");
    if (!/^[0-9]{10,11}$/.test(phone)) {
      alert("電話番号は10〜11桁の数字で入力してください。\n例：09012345678 / 0242220000");
      return;
    }

    if (isPriority) {
      const ok = confirm("自動承認で登録します。\nよろしいですか？");
      if (!ok) return;
    }

    const startAt = new Date(`${date}T${start}:00`);
    const endAt   = new Date(`${date}T${end}:00`);

    if (isNaN(startAt.getTime()) || isNaN(endAt.getTime())) {
      alert("日付または時間の書き方が違います。例：2026-02-01 と 09:00");
      return;
    }

    if (endAt <= startAt) {
      alert("終了時間は開始時間より後にしてください。");
      return;
    }

    const startT = hhmmss(start);
    const endT   = hhmmss(end);

    // ★ここから「送信中」ロック（DBアクセス前）
    if (btn){
      btn.disabled = true;
      btn.dataset.origText = btn.textContent;
      btn.textContent = "登録中...";
    }

    // 衝突チェック（承認済みだけ）
    const { data: approvedConflicts, error: conflictErr } = await db
      .from("facility_requests")
      .select("id, start_time, end_time, status, title")
      .eq("org_id", ORG_ID)
      .eq("date", date)
      .eq("status", "approved")
      .lt("start_time", endT)
      .gt("end_time", startT);

    if (conflictErr) {
      alert("重複確認に失敗しました。\n\n" + conflictErr.message);
      console.error(conflictErr);
      return;
    }

    const noApprovedConflict = (approvedConflicts?.length || 0) === 0;

    const durationMin = minutesBetween(startT, endT);
    const withinHours = durationMin > 0 && durationMin <= 180;
    const withinDay =
      inRange(startT, "08:00:00", "20:00:00") &&
      inRange(endT, "08:00:00", "20:00:00");

    let decidedStatus = "checking";
    if (isPriority && noApprovedConflict) {
      decidedStatus = "approved";
    } else if (noApprovedConflict && withinHours && withinDay) {
      decidedStatus = "approved";
    }

    const { error } = await db
      .from("facility_requests")
      .insert([{
        org_id: ORG_ID,
        date: date,
        start_time: startT,
        end_time: endT,
        title: cleanTitle,
        phone: phone,
        name: name,
        email: email,
        status: decidedStatus
      }]);

    if (error) {
      alert("保存に失敗しました。\n\n" + error.message);
      console.error(error);
      return;
    }

    alert(decidedStatus === "approved"
      ? "登録できました。（承認されました）"
      : "登録できました。（確認になりました）"
    );

    // 入力欄クリア
    document.getElementById("date").value = "";
    document.getElementById("start").value = "";
    document.getElementById("end").value = "";
    document.getElementById("title").value = "";
    if (document.getElementById("phone")) document.getElementById("phone").value = "";
    if (document.getElementById("name"))  document.getElementById("name").value = "";
    if (document.getElementById("email")) document.getElementById("email").value = "";

    const viewDateEl = document.getElementById("viewDate");
    if (viewDateEl && viewDateEl.value === date) {
      loadDaySchedule();
    }
    renderMonthCalendar();

  } catch (e) {
    alert("保存処理でエラーが発生しました。\n\n" + e.message);
    console.error(e);
  } finally {
    // ★必ず解除（失敗でも戻る）
    const btn = document.getElementById("btnSave");
    if (btn){
      btn.disabled = false;
      btn.textContent = btn.dataset.origText || "利用を登録する";
      delete btn.dataset.origText;
    }
  }
}


function initViewDate() {
  const el = document.getElementById("viewDate");
  if (!el) return;

  const t = new Date();
  const y = t.getFullYear();
  const m = String(t.getMonth() + 1).padStart(2, "0");
  const d = String(t.getDate()).padStart(2, "0");

  el.value = `${y}-${m}-${d}`;

  // ★ 追加：日付変更時に自動表示
  el.addEventListener("change", loadDaySchedule);

  // ★ 初期表示も自動実行
  loadDaySchedule();
}


function initMonthCalendar() {
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
}

// ★ DOMが揃ってから必ず順番に初期化する
document.addEventListener("DOMContentLoaded", async () => {
  initViewDate();
  initMonthCalendar();

  // 先に月→カレンダー表示
  await renderMonthCalendar();

  // 次に「この日の予定」
  await loadDaySchedule();

  // 月移動ボタン（IDがある場合のみ）
  document.getElementById("btnPrev")?.addEventListener("click", () => moveMonth(-1));
  document.getElementById("btnNext")?.addEventListener("click", () => moveMonth(+1));
});




// ---------------------------------------
// annual_events：月/日取得
// ---------------------------------------
async function fetchAnnualEventsMonth(y, m) {
  const first = `${y}-${pad2(m)}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const last = `${y}-${pad2(m)}-${pad2(lastDay)}`;

  const { data, error } = await db
    .from("annual_events")
    .select("event_date, status")
    .eq("org_id",ORG_ID)
    .eq("active", true)
    .gte("event_date", first)
    .lte("event_date", last);

  if (error) {
    console.error(error);
    return [];
  }

  return (data || []).map(e => ({
    date: e.event_date,
    status: e.status || "approved"
  }));
}

async function fetchAnnualEventsDay(dateStr) {
  const { data, error } = await db
    .from("annual_events")
    .select("event_date, start_time, end_time, title")
    .eq("org_id",ORG_ID)
    .eq("active", true)
    .eq("event_date", dateStr);

  if (error) {
    console.error(error);
    return [];
  }

  return (data || []).map(e => ({
    date: e.event_date,
    start_time: e.start_time,
    end_time: e.end_time,
    title: e.title,
    status: "approved",
    _src: "annual"
  }));
}

function moveMonth(delta){
  calMonth += delta;
  if (calMonth <= 0) { calMonth = 12; calYear -= 1; }
  if (calMonth >= 13) { calMonth = 1; calYear += 1; }
  renderMonthCalendar();
}





//orgを登録

/*async function resolveOrgId() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("org") || "kitataki"; // デフォルト北滝沢
  const { data, error } = await db.from("orgs").select("id,slug,name").eq("slug", slug).single();
  if (error) { alert("団体設定（org）が不正です: " + error.message); throw error; }
  document.title = `${data.name} - ${document.title}`;
  return data.id;
}

let ORG_ID = null;*/

/*(async function initApp(){
  ORG_ID = await resolveOrgId(); // ★最初に団体確定

  // viewDate を今日に
  const view = document.getElementById("viewDate");
  if (view) {
    const t = new Date();
    view.value = `${t.getFullYear()}-${pad2(t.getMonth()+1)}-${pad2(t.getDate())}`;
    await loadDaySchedule();
  }

  // 月カレンダー初期化
  const now = new Date();
  calYear = now.getFullYear();
  calMonth = now.getMonth() + 1;
  await renderMonthCalendar();
})();*/

/*function requireOrgId(){
  if (!ORG_ID) throw new Error("ORG_ID が未設定です（resolveOrgId が先に必要）");
}*/

// inline onclick から呼べるようにグローバル公開
window.moveMonth = moveMonth;
window.loadDaySchedule = loadDaySchedule;