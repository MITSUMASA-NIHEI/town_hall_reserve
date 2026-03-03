// ===== Supabase =====
/*const SUPABASE_URL = "https://htrsbjadomyonuelzups.supabase.co";
//const SUPABASE_ANON_KEY = "sb_publishable_KQvUS5eLkDyB4dJQlhzoxw_lgNq_66F";

const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh0cnNiamFkb215b251ZWx6dXBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk3MjE0OTMsImV4cCI6MjA4NTI5NzQ5M30.UighLXGWMxgSQChhDNalPymHUiiG8uEnTEv4SIOsLv8";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORG_ID = "4da381c2-cf21-4c5a-8239-2f28b78a6a01";

const el = (id) => document.getElementById(id);*/

// ===============================
// admin_annual.js（町内会版）
// ===============================

const CFG = window.APP_CONFIG;
if (!CFG) { alert("config.js が読み込まれていません"); throw new Error("Missing APP_CONFIG"); }

// Supabase
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// 町内会 固定
const ORG_ID = CFG.ORG_ID;

const el = (id) => document.getElementById(id);


// ===== 今日の日付 =====
(function showToday() {
  const e = el("today");
  if (!e) return;
  const t = new Date();
  e.textContent = `今日は ${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日です。`;
})();

// ===== UI =====
const aeType = el("aeType");
const boxMonthlyDay = el("boxMonthlyDay");
const boxMonthlyNth = el("boxMonthlyNth");
const boxWeekly = el("boxWeekly");

if (aeType) {
  aeType.addEventListener("change", () => {
    const v = aeType.value;
    if (boxMonthlyDay) boxMonthlyDay.style.display = v === "monthly_day" ? "" : "none";
    if (boxMonthlyNth) boxMonthlyNth.style.display = v === "monthly_nth_weekday" ? "" : "none";
    if (boxWeekly) boxWeekly.style.display = v === "weekly" ? "" : "none";
  });
}


// ===== 生成結果（プレビュー保持） =====
let previewRows = [];   // {event_date, start_time, end_time, title, status, active, month, day, batch_id}
let currentBatchId = null;

// ===== helpers =====
const pad2 = (n) => String(n).padStart(2, "0");

function hhmmss(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  if (s.length === 5) return s + ":00";
  return s;
}

function ymd(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

function lastDayOfMonth(y, m) {
  return new Date(y, m, 0).getDate(); // m は 1-12
}

function isValidDate(y, m, d) {
  const dt = new Date(`${ymd(y, m, d)}T00:00:00`);
  return !Number.isNaN(dt.getTime()) && (dt.getMonth() + 1) === m && dt.getDate() === d;
}

function nthWeekdayOfMonth(y, m, nth, weekday) {
  const first = new Date(`${ymd(y, m, 1)}T00:00:00`);
  const firstW = first.getDay();
  const offset = (weekday - firstW + 7) % 7;
  const day = 1 + offset + (nth - 1) * 7;
  if (!isValidDate(y, m, day)) return null;
  if (day > lastDayOfMonth(y, m)) return null;
  return day;
}

function uniqByDate(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = `${r.event_date}|${r.start_time}|${r.end_time}|${r.title}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

function escapeHtml(s) {
 
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 年月を「連番」にして、年度またぎを簡単に回す
function ymToIndex(y, m) { // m:1-12
  return y * 12 + (m - 1);
}
function monthIndexToYm(idx) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return { y, m };
}
function isRangeValid(fromY, fromM, toY, toM) {
  return ymToIndex(fromY, fromM) <= ymToIndex(toY, toM);
}

function makeRow(y, m, d, startT, endT, title, batchId) {
  return {
    event_date: ymd(y, m, d),
    month: m,
    day: d,
    start_time: startT,
    end_time: endT,
    title,
    status: "approved",
    active: true,
    batch_id: batchId
  };
}

function renderPreview(rows) {
  const body = el("previewBody");
  const info = el("previewInfo");
  if (!body || !info) return;

  body.innerHTML = "";

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="3">生成結果がありません。</td></tr>`;
    info.textContent = "0件";
    return;
  }

  info.textContent = `生成件数：${rows.length}件（batch_id: ${currentBatchId}）`;

  for (const r of rows.slice(0, 120)) {
    const tr = document.createElement("tr");
    const time = `${r.start_time.slice(0, 5)}〜${r.end_time.slice(0, 5)}`;
    tr.innerHTML = `
      <td>${r.event_date}</td>
      <td>${time}</td>
      <td>${escapeHtml(r.title)}</td>
    `;
    body.appendChild(tr);
  }

  if (rows.length > 120) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="3">…他 ${rows.length - 120}件（登録は全件します）</td>`;
    body.appendChild(tr);
  }
}

// ===== プレビュー作成 =====
el("btnPreview")?.addEventListener("click", () => {
  const title = el("aeTitle")?.value?.trim() || "";
  const start = el("aeStart")?.value?.trim() || "";
  const end = el("aeEnd")?.value?.trim() || "";
  const type = aeType?.value || "";

  const fromY = Number(el("aeFromYear")?.value);
  const fromM = Number(el("aeFromMonth")?.value);
  const toY = Number(el("aeToYear")?.value);
  const toM = Number(el("aeToMonth")?.value);

  if (!title || !start || !end || !fromY || !fromM || !toY || !toM) {
    alert("未入力があります。（タイトル・時間・開始年月・終了年月）");
    return;
  }
  if (fromM < 1 || fromM > 12 || toM < 1 || toM > 12) {
    alert("月の指定が不正です。");
    return;
  }
  if (!isRangeValid(fromY, fromM, toY, toM)) {
    alert("期間の指定が不正です。（開始が終了より後です）");
    return;
  }

  const startT = hhmmss(start);
  const endT = hhmmss(end);
  if (endT <= startT) {
    alert("終了時間は開始時間より後にしてください。");
    return;
  }

  // batch_id を新しく作る（年度またぎでも1つに統一）
  currentBatchId = (crypto?.randomUUID?.() || String(Date.now()));

  let rows = [];

  if (type === "monthly_day") {
    const day = Number(el("aeDay")?.value);
    if (!day || day < 1 || day > 31) {
      alert("日（1-31）が不正です。");
      return;
    }

    const fromIdx = ymToIndex(fromY, fromM);
    const toIdx = ymToIndex(toY, toM);

    for (let idx = fromIdx; idx <= toIdx; idx++) {
      const { y, m } = monthIndexToYm(idx);
      if (!isValidDate(y, m, day)) continue; // 2/30 等はスキップ
      rows.push(makeRow(y, m, day, startT, endT, title, currentBatchId));
    }
  }

  if (type === "monthly_nth_weekday") {
    const nth = Number(el("aeNth")?.value);
    const weekday = Number(el("aeWeekday1")?.value);

    if (!nth || nth < 1 || nth > 5) {
      alert("第○（1-5）が不正です。");
      return;
    }

    const fromIdx = ymToIndex(fromY, fromM);
    const toIdx = ymToIndex(toY, toM);

    for (let idx = fromIdx; idx <= toIdx; idx++) {
      const { y, m } = monthIndexToYm(idx);
      const day = nthWeekdayOfMonth(y, m, nth, weekday);
      if (!day) continue;
      rows.push(makeRow(y, m, day, startT, endT, title, currentBatchId));
    }
  }

  if (type === "weekly") {
    const weekday = Number(el("aeWeekday2")?.value);

    const startDate = new Date(`${ymd(fromY, fromM, 1)}T00:00:00`);
    const endDate = new Date(`${ymd(toY, toM, lastDayOfMonth(toY, toM))}T00:00:00`);

    // startDate を該当曜日まで進める
    const diff = (weekday - startDate.getDay() + 7) % 7;
    startDate.setDate(startDate.getDate() + diff);

    for (let dt = new Date(startDate); dt <= endDate; dt.setDate(dt.getDate() + 7)) {
      const y = dt.getFullYear();
      const m = dt.getMonth() + 1;
      const d = dt.getDate();
      rows.push(makeRow(y, m, d, startT, endT, title, currentBatchId));
    }
  }

  rows = uniqByDate(rows);
  previewRows = rows;
  renderPreview(previewRows);
});

// ===== プレビュークリア（UI＋内部状態を完全リセット） =====
function clearPreview() {
  previewRows = [];
  currentBatchId = null;

  const body = el("previewBody");
  if (body) body.innerHTML = `<tr><td colspan="3">生成結果がありません。</td></tr>`;

  const info = el("previewInfo");
  if (info) info.textContent = "0件";

  // もし別の表示欄があるならここで消す
  // el("resultInfo") && (el("resultInfo").textContent = "");

  console.log("プレビューをクリアしました");
}

window.addEventListener("DOMContentLoaded", () => {
  el("btnPreviewClear")?.addEventListener("click", clearPreview);
});

// ===== 一括登録 =====
el("btnInsert")?.addEventListener("click", async () => {
  try {
    if (!previewRows.length) {
      alert("先にプレビューを作成してください。");
      return;
    }

    // ★ここで1回だけ生成（この一括登録の束のID）
    const batchId = crypto.randomUUID();
    currentBatchId = batchId;

    const ok = confirm(`この内容で ${previewRows.length}件 を一括登録します。\n（batch_id: ${currentBatchId}）`);
    if (!ok) return;

    // 大量 insert 対策：200件ずつ
    const chunkSize = 200;

    for (let i = 0; i < previewRows.length; i += chunkSize) {
      const chunk = previewRows
        .slice(i, i + chunkSize)
        .map(row => ({
          ...row,
          batch_id: batchId, // ★全行に同じuuid
          org_id: ORG_ID     // ★ここが重要
        }));

      const { error } = await db
        .from("annual_events")
        .insert(chunk);

      if (error) throw error;
    }

    const r = el("resultInfo");
    if (r) r.textContent = `登録しました：${previewRows.length}件（batch_id: ${batchId}）`;

    /* ★ 追加：admin_all へ変更通知 */
    localStorage.setItem("annual_changed", String(Date.now()));

    alert("一括登録できました。");
  } catch (e) {
    console.error(e);
    alert("登録に失敗しました。\n\n" + (e?.message || e));
  }
});


// ===== batch_id で一括停止（active=false） =====
el("btnDisable")?.addEventListener("click", async () => {
  try {
    const input = prompt("停止したい batch_id（フルUUID）を貼り付けてください。");
    if (!input) return;

    const bid = normalizeUuid(input);
    if (!bid) {
      alert("batch_id が不正です。\n短縮（…）ではなくフルUUIDを貼り付けてください。");
      return;
    }

    const ok = confirm(`batch_id=${bid} の行を一括停止（active=false）します。よろしいですか？`);
    if (!ok) return;

    const { data, error } = await db
      .from("annual_events")
      .update({ active: false })
      .eq("org_id",ORG_ID)
      .eq("batch_id", bid)
      .select("id");

    if (error) {
      alert("停止に失敗しました。\n\n" + error.message);
      return;
    }

    if (!data || data.length === 0) {
      alert("停止対象が見つかりませんでした。（0件）\nbatch_id を確認してください。");
      return;
    }

      localStorage.setItem("annual_changed", String(Date.now()));

    alert(`停止しました。（${data.length}件更新）`);
    loadBatchList();

  } catch (e) {
    alert("停止に失敗しました。\n\n" + (e?.message || e));
  }
});



// ==============================
// batch_id 一覧（停止・削除） 完全版：短縮表示対応
// ==============================

// HTMLエスケープ（esc未定義対策としてここで確実に定義）
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// onclick 用：JS文字列として安全に埋め込む
function jsQuote(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

// batch_id を短縮表示
function shortUuid(u) {
  const s = String(u ?? "");
  if (s.length <= 18) return s;
  return s.slice(0, 8) + "…" + s.slice(-6);
}

// UUIDを正規化（短縮や空白を弾く）
function normalizeUuid(s) {
  const t = String(s || "").trim();

  // 「…」が入っていたら短縮表示なので不可
  if (t.includes("…")) return null;

  // UUID形式チェック
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return re.test(t) ? t : null;
}


// ========= Batch list =========
async function loadBatchList() {
  const host = document.getElementById("batchList");
  if (!host) {
    console.warn("batchList が見つかりません（admin_annual.html に id='batchList' が必要）");
    return;
  }

  host.innerHTML = "<div style='color:#666;font-size:13px;'>読み込み中...</div>";

  const { data, error } = await db.rpc("list_annual_batches");

  // ---- error handling（ここはエラー表示だけ）----
  if (error) {
    console.error("rpc error:", error);
    const msg = [error.message, error.details, error.hint, error.code]
      .filter(Boolean)
      .join("\n");

    host.innerHTML = "<div style='color:#b91c1c;font-size:13px;'>一覧取得に失敗しました。</div>";
    alert("batch一覧の取得に失敗しました。\n\n" + msg);
    return;
  }

  // ---- empty ----
  if (!data || data.length === 0) {
    host.innerHTML = "<div style='color:#666;font-size:13px;'>batch_id はありません。</div>";
    return;
  }

  // ---- render ----
  host.innerHTML = data
    .map((r) => {
      const bidFull = String(r.batch_id || "");
      const bidShort = esc(shortUuid(bidFull));

      const items = Number(r.items || 0);
      const from = esc(r.date_from || "");
      const to = esc(r.date_to || "");
      const title = esc(r.title_sample || "");

      return `
        <div class="item">
          <div class="time">
            ${from}〜${to}
            <span style="color:#666;font-size:12px;">（${items}件）</span>
          </div>

          <div class="title">
            ${title}<br/>
            <span style="color:#666;font-size:12px;">
              batch_id: ${bidShort}
            </span>
          </div>

          <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            <button class="btn2 js-copy" type="button" data-batch-id="${esc(bidFull)}">コピー</button>
            <button class="btn2 js-disable" type="button" data-batch-id="${esc(bidFull)}">停止</button>
            <button class="btnDanger js-delete" type="button" data-batch-id="${esc(bidFull)}">削除</button>
          </div>
        </div>
      `;
    })
    .join("");

  // ---- bind events（描画の後にだけ付ける）----
  host.querySelectorAll(".js-copy").forEach((btn) => {
    btn.addEventListener("click", () => copyBatchId(btn.dataset.batchId));
  });
  host.querySelectorAll(".js-disable").forEach((btn) => {
    btn.addEventListener("click", () => disableBatchId(btn.dataset.batchId));
  });
  host.querySelectorAll(".js-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteBatchId(btn.dataset.batchId));
  });
}

async function copyBatchId(bid) {
  try {
    await navigator.clipboard.writeText(bid);
    alert("batch_id をコピーしました。\n" + bid);
  } catch (e) {
    // クリップボードが使えない環境用
    prompt("この batch_id をコピーしてください。", bid);
  }
}

// 停止（active=false）
async function disableBatchId(bid) {
  const cleanBid = String(bid || "").trim();

  const ok = confirm(`batch_id=${cleanBid}\nこの batch を一括停止（active=false）します。よろしいですか？`);
  if (!ok) return;

  const { data, error } = await db.rpc("disable_annual_batch", { p_batch_id: cleanBid });

  if (error) {
    console.error(error);
    alert("停止に失敗しました。\n\n" + error.message);
    return;
  }

  if (!data || data === 0) {
    alert("停止対象が見つかりませんでした。（0件）\nbatch_id を確認してください。");
    return;
  }

  localStorage.setItem("annual_changed", String(Date.now()));

  alert(`停止しました。（${data}件）`);
  loadBatchList();
}

/*async function resolveOrgId() {
  const params = new URLSearchParams(location.search);
  const slug = params.get("org") || "kitataki"; // デフォルト北滝沢
  const { data, error } = await db.from("orgs").select("id,slug,name").eq("slug", slug).single();
  if (error) { alert("団体設定（org）が不正です: " + error.message); throw error; }
  document.title = `${data.name} - ${document.title}`;
  return data.id;
}

let ORG_ID = null;*/

async function deleteBatchId(batchId) {
  try {
    if (!batchId) return;

    const ok = confirm("この batch を削除（論理削除）します。\n※後で復元できます。\n\n実行しますか？");
    if (!ok) return;

    // uuid文字列 → そのまま渡してOK（Supabaseがuuidとして扱う）
    const { data, error } = await db.rpc("delete_annual_batch", { p_batch_id: batchId });
    if (error) throw error;

    const n = Number(data || 0);
    if (n <= 0) {
      alert("削除対象が見つかりませんでした。（0件）\nbatch_id を確認してください。");
      return;
    }

    localStorage.setItem("annual_changed", String(Date.now()));

    alert(`削除しました。（${n}件）`);
    await loadBatchList(); // 一覧を更新
  } catch (e) {
    console.error(e);
    alert("削除に失敗しました。\n\n" + (e?.message || e));
  }
}

