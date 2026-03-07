// ===============================
// 町内会版 管理者画面 admin_all.js（固定ORG）
// ・月カレンダー（checking/approved + annual_events）
// ・日別一覧（checking/approved を内容表示）
// ・checking一覧（承認/却下）
// ・統計カード
// ※ 中央管理（admin_all_center）とは別物：org切替なし
// ===============================

// Supabase
/*const SUPABASE_URL = "https://htrsbjadomyonuelzups.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KQvUS5eLkDyB4dJQlhzoxw_lgNq_66F";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ★町内会 固定ORG（ここだけ変更）
const ORG_ID = "4da381c2-cf21-4c5a-8239-2f28b78a6a01"; // 例：北滝

const el = (id) => document.getElementById(id);*/


// ===============================
// admin_all.js（町内会版）
// ===============================


const CFG = window.APP_CONFIG;
if (!CFG) { alert("config.js が読み込まれていません"); throw new Error("Missing APP_CONFIG"); }

// Supabase
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// 町内会 固定
const ORG_ID = CFG.ORG_ID;

const el = (id) => document.getElementById(id);

//document.getElementById("orgNameBadge")?.textContent = CFG.ORG_NAME;
const badge = document.getElementById("orgNameBadge");
if (badge) badge.textContent = CFG.ORG_NAME;

// -------------------------------
// util
// -------------------------------
function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function pad2(n){ return String(n).padStart(2,"0"); }
function ymd(y,m,d){ return `${y}-${pad2(m)}-${pad2(d)}`; }
function hhmm(t){ return String(t ?? "").slice(0,5); }

function firstOfMonth(y,m){ return new Date(y, m-1, 1); }
function lastOfMonth(y,m){ return new Date(y, m, 0); } // m is 1-12
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtJPDate(d){ return `${d.getFullYear()}年${d.getMonth()+1}月`; }

function setStatus(msg){
  const s = el("status");
  if (s) s.textContent = msg || "";
}

//2026/02/27に追加
function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function kindBadge(kind){
  // kind: "general" | "annual"
  if (kind === "annual"){
    return `<span class="kind-badge annual">年間行事</span>`;
  }
  return `<span class="kind-badge general">一般行事</span>`;
}



// -------------------------------
// state
// -------------------------------
let calYear, calMonth;          // current calendar (YYYY, 1-12)
let selected = "";            // YYYY-MM-DD

// -------------------------------
// header
// -------------------------------
(function showToday(){
  const e = el("today");
  if(!e) return;
  const t = new Date();
  e.textContent = `今日は ${t.getFullYear()}年${t.getMonth()+1}月${t.getDate()}日です。`;
})();

// -------------------------------
// Top Nav（町内会版：org引き継ぎなし）
// -------------------------------
(function bindTopNav(){
  const go = (path) => window.open(path, "_blank", "noopener,noreferrer");
  document.getElementById("btnOpenIndex")?.addEventListener("click", () => go("index.html"));
  document.getElementById("btnOpenAnnual")?.addEventListener("click", () => go("admin_annual.html"));
  document.getElementById("btnOpenHistory")?.addEventListener("click", () => go("admin_history.html"));
  document.getElementById("btnDash")?.addEventListener("click", () => {});
  document.getElementById("btnRefresh")?.addEventListener("click", refreshAll);
})();

// -------------------------------
// Calendar render
// -------------------------------
async function renderMonthCalendar(){
  const host = el("monthCal");
  const monthLabel = el("calMonth");
  if (!host) return;

  host.innerHTML = "";

  const first = new Date(calYear, calMonth - 1, 1);
  const last  = new Date(calYear, calMonth, 0);
  if (monthLabel) monthLabel.textContent = fmtJPDate(first);

  // 表示開始（日曜始まり）
  const start = new Date(first);
  start.setDate(1 - start.getDay());

  // 表示終了：月末の週の土曜まで（index版の自然な段数）
  const end = new Date(last);
  end.setDate(last.getDate() + (6 - last.getDay()));

  const fromStr = ymd(start.getFullYear(), start.getMonth()+1, start.getDate());
  const toStr   = ymd(end.getFullYear(), end.getMonth()+1, end.getDate());

  // 予約（checking/approved）を表示範囲で取得
  const reqRes = await db.from("facility_requests")
    .select("date,status")
    .eq("org_id", ORG_ID)
    .in("status", ["checking","approved"])
    .is("deleted_at", null)
    .gte("date", fromStr)
    .lte("date", toStr);

  if (reqRes.error) console.error(reqRes.error);
  const reqs = reqRes.data || [];

  // 年間行事（当月分だけ）
  const annualRes = await db.from("annual_events")
    .select("month,day,active")
    .eq("org_id", ORG_ID)
    .eq("active", true)
    .eq("month", calMonth);

  if (annualRes.error) console.error(annualRes.error);
  const annual = annualRes.data || [];
  const annualSet = new Set(annual.map(a => ymd(calYear, a.month, a.day)));

  // date -> {approved:n, checking:n}
  const map = new Map();
  for (const r of reqs){
    if (!map.has(r.date)) map.set(r.date, { approved:0, checking:0 });
    const x = map.get(r.date);
    if (r.status === "approved") x.approved++;
    if (r.status === "checking") x.checking++;
  }

  const dows = ["日","月","火","水","木","金","土"];
  let html = dows.map(x=>`<div class="cal-dow">${x}</div>`).join("");

  const todayKey = (() => {
    const t = new Date();
    return ymd(t.getFullYear(), t.getMonth()+1, t.getDate());
  })();

  for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate()+1)){
    const y = cur.getFullYear();
    const m = cur.getMonth() + 1;
    const d = cur.getDate();
    const key = ymd(y,m,d);

    const inMonth = (y === calYear && m === calMonth);

    if (!inMonth){
      html += `<div class="cal-cell is-empty"></div>`;
      continue;
    }

    const cnt = map.get(key) || { approved:0, checking:0 };
    const isToday = (key === todayKey);
    const isSel = (selected === key);

    // ★ マーク（一般＋年間を同じセルに統合）
    /*const marks = [];
    if (cnt.approved > 0)  marks.push(`<span class="cal-mark reserved">予約 (${cnt.approved})</span>`);
    if (cnt.checking > 0)  marks.push(`<span class="cal-mark checking">確認 (${cnt.checking})</span>`);
    if (annualSet.has(key)) marks.push(`<span class="cal-mark annual">年</span>`);*/

    //2026/02/27に変更する
    // ---- 表示用カウント（一般+年間を合算）----
    /*const annualCount = annualSet.has(key) ? 1 : 0;

    // 「予約」表示に合算したい場合（※意味の誤解に注意）
    const totalReservedLike = (cnt.approved || 0) + annualCount;

    // 「確認」は別カウントのままにする（checkingは予約ではないので混ぜない）
    const marks = [];

    if (totalReservedLike > 0){
      marks.push(`<span class="cal-mark reserved">予約 (${totalReservedLike})</span>`);
    }
    if ((cnt.checking || 0) > 0){
      marks.push(`<span class="cal-mark checking">確認 (${cnt.checking})</span>`);
    }*/

//2026/02/27訂正

// ---- 表示用カウント（一般+年間を合算）----
/*const annualCount = annualSet.has(key) ? 1 : 0;

// 既存：承認済み＋年間（予約っぽいもの）
const totalReservedLike = (cnt.approved || 0) + annualCount;

// 新規：その日の総稼働（承認＋確認＋年間）
const totalPlanned =
  (cnt.approved || 0) +
  (cnt.checking || 0) +
  annualCount;

const marks = [];

// 表示を「予定」に寄せる（見たいのは“その日の件数”）
if (totalPlanned > 0){
  marks.push(`<span class="cal-mark reserved">予定 (${totalPlanned})</span>`);
}

// 任意：未確認があることを強調したいなら残す（推奨）
if ((cnt.checking || 0) > 0){
  marks.push(`<span class="cal-mark checking">確認 (${cnt.checking})</span>`);
}*/


//予定と確認を別々に表示するCode　2026/02/27

// ---- 表示用カウント（一般+年間を合算）----
const annualCount = annualSet.has(key) ? 1 : 0;

// PC管理の思想：
// 予定 = 承認済み（approved） + 年間行事（annual）
// 確認 = checking（未確定）
const plannedCount  = (cnt.approved || 0) + annualCount;
const checkingCount = (cnt.checking || 0);

const marks = [];

if (plannedCount > 0){
  marks.push(`<span class="cal-mark reserved">予定 (${plannedCount})</span>`);
}
if (checkingCount > 0){
  marks.push(`<span class="cal-mark checking">確認 (${checkingCount})</span>`);
}


    // 年マークを“別表示したくない”なら、ここは出さない
    // どうしても「年」も視認したいなら、右上に小さく出す（後述）

   /* html += `
      <div class="cal-cell ${isToday ? "is-today":""} ${isSel ? "is-selected":""}"
           data-date="${key}">
        <div class="cal-date">${d}</div>
        <div class="cal-marks">${marks.join(" ")}</div>
      </div>
    `;
  }*/

    // key = "YYYY-MM-DD"
    const dow = new Date(`${key}T00:00:00`).getDay(); // 0=日, 6=土
    const isSun = dow === 0;
    const isSat = dow === 6;

    html += `
      <div class="cal-cell
          ${isToday ? "is-today":""}
          ${isSel ? "is-selected":""}
          ${isSun ? "is-sun":""}
          ${isSat ? "is-sat":""}
        "
        data-date="${key}">
        <div class="cal-date">${d}</div>
        <div class="cal-marks">${marks.join(" ")}</div>
      </div>
    `;
    }
  host.innerHTML = html;

  // クリック
  host.querySelectorAll(".cal-cell[data-date]").forEach(cell=>{
    cell.addEventListener("click", async ()=>{
      selected = cell.dataset.date;

      const sd = el("selectedDate");
      if (sd) sd.textContent = selected;

      host.querySelectorAll(".cal-cell").forEach(x=>{
        x.classList.toggle("is-selected", x.dataset.date === selected);
      });

      await loadDay(selected);
    });
  });
}

// -------------------------------
// Day list
// -------------------------------
// ===============================
// この日の予定（管理者：内容表示）
// - 年間行事 + 一般予約(approved/checking) を合体表示
// - 削除（soft delete）：facility_requests.deleted_at にISOを入れる
// - クリックはイベント委任（1回だけバインド）
// ===============================

// ================================
// dayList: 編集/削除 イベント委任（完全版）
// ================================
let dayListBound = false;

function bindDayListEvents(){
  if (dayListBound) return;
  dayListBound = true;

  const host = document.getElementById("dayList");
  if (!host) return;

  host.addEventListener("click", async (e) => {

    // =========================
    // 編集開始（✎）
    // =========================
    const btnEdit = e.target.closest(".btn-edit");
    if (btnEdit) {
      e.preventDefault();
      e.stopPropagation();

      const id = btnEdit.dataset.id;
      const card = btnEdit.closest('.item[data-id]');
      if (!id || !card) return;

      // 二重編集防止
      if (card.dataset.editing === "1") return;

      // 元HTML退避（取消用）
      if (!card.dataset.origHtml) {
        card.dataset.origHtml = card.innerHTML;
      }
      card.dataset.editing = "1";

      // 現在値（loadDayが data-* で埋めてくれている前提）
      const date0  = card.dataset.date  || (document.getElementById("selectedDate")?.textContent?.trim() || "");
      const st0    = card.dataset.start || "";
      const et0    = card.dataset.end   || "";
      const title0 = card.dataset.title || "";

      // 編集フォームに差し替え
      card.innerHTML = `
        <div class="item-head">
          <div>
            <span class="kind-badge general">一般行事</span>
            <span class="time">編集</span>
          </div>
          <div class="item-actions">
            <button type="button" class="btn btn-save-edit" data-id="${esc(id)}">保存</button>
            <button type="button" class="btn2 btn-cancel-edit" data-id="${esc(id)}">取消</button>
          </div>
        </div>

        <div class="edit-grid">
          <label>
            日付
            <input type="date" class="edit-date" value="${esc(date0)}" />
          </label>

          <label>
            開始
            <input type="time" class="edit-start" step="1800" value="${esc(st0)}" />
          </label>

          <label>
            終了
            <input type="time" class="edit-end" step="1800" value="${esc(et0)}" />
          </label>

          <label class="edit-wide">
            内容
            <input type="text" class="edit-title" value="${esc(title0)}" />
          </label>
        </div>

        <div class="note">※ 一般予約のみ編集できます（年間行事は削除→再登録）</div>
      `;
      return;
    }

    // =========================
    // 編集取消
    // =========================
    const btnCancel = e.target.closest(".btn-cancel-edit");
    if (btnCancel) {
      e.preventDefault();
      e.stopPropagation();

      const card = btnCancel.closest('.item[data-id]');
      if (!card) return;

      const orig = card.dataset.origHtml || "";
      card.innerHTML = orig;
      card.dataset.editing = "0";
      return;
    }

    // =========================
    // 編集保存
    // =========================
    const btnSave = e.target.closest(".btn-save-edit");
    if (btnSave) {
      e.preventDefault();
      e.stopPropagation();

      const id = btnSave.dataset.id;
      const card = btnSave.closest('.item[data-id]');
      if (!id || !card) return;

      const newDate = card.querySelector(".edit-date")?.value || "";
      const st = card.querySelector(".edit-start")?.value || "";
      const et = card.querySelector(".edit-end")?.value || "";
      const title = card.querySelector(".edit-title")?.value?.trim() || "";

      if (!newDate) return alert("利用日を入力してください。");
      if (!title)   return alert("内容（タイトル）を入力してください。");
      if (!st || !et) return alert("開始・終了時間を入力してください。");
      if (st >= et) return alert("終了時間は開始時間より後にしてください。");

      btnSave.disabled = true;

      try{
        const { error } = await db
          .from("facility_requests")
          .update({
            date: newDate,
            start_time: st,
            end_time: et,
            title: title
          })
          .eq("id", id)
          .eq("org_id", ORG_ID)
          .is("deleted_at", null);

        if (error) throw new Error(error.message);

        // 選択日も合わせて更新（右上の「選択日：」）
        const selEl = document.getElementById("selectedDate");
        if (selEl) selEl.textContent = newDate;

        alert("更新しました。");

        // ✅ これで 月カレンダー / この日の予定 / 確認中一覧 / 統計 ぜんぶ更新
        if (typeof reloadAll === "function") {
          await reloadAll();
        } else {
          // 最低限の保険
          if (typeof renderMonthCalendar === "function") await renderMonthCalendar();
          if (typeof loadDay === "function") await loadDay(newDate);
          if (typeof loadPending === "function") await loadPending();
          if (typeof loadDashboardStats === "function") await loadDashboardStats();
        }

      } catch(err){
        alert("更新エラー：" + (err?.message || String(err)));
      } finally{
        btnSave.disabled = false;
      }
      return;
    }

    // =========================
    // 削除（✕）
    // =========================
    const btnDelete = e.target.closest(".btn-delete");
    if (!btnDelete) return;

    e.preventDefault();
    e.stopPropagation();

    const id = btnDelete.dataset.id;
    if (!id) return;

    if (!confirm("この予約を削除しますか？\n※元に戻せません")) return;

    btnDelete.disabled = true;

    try{
      const { error } = await db
        .from("facility_requests")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .eq("org_id", ORG_ID)
        .is("deleted_at", null);

      if (error) throw new Error(error.message);

      alert("削除しました。");

      // ✅ これで全部更新
      if (typeof reloadAll === "function") {
        await reloadAll();
      } else {
        if (typeof renderMonthCalendar === "function") await renderMonthCalendar();
        const selected = document.getElementById("selectedDate")?.textContent?.trim();
        if (selected && typeof loadDay === "function") await loadDay(selected);
        if (typeof loadPending === "function") await loadPending();
        if (typeof loadDashboardStats === "function") await loadDashboardStats();
      }

    } catch(err){
      alert("削除エラー：" + (err?.message || String(err)));
    } finally{
      btnDelete.disabled = false;
    }
  });
}


// ================================
// loadDay（完全版：data-* を埋める）
// ================================
async function loadDay(dateStr){
  const host = document.getElementById("dayList");
  if (!host) return;

  // イベント委任を1回だけ仕込む
  bindDayListEvents();

  // dateStrが空ならクリア
  if (!dateStr){
    host.innerHTML = "";
    return;
  }

  host.innerHTML = `<div class="item">読み込み中...</div>`;

  // YYYY-MM-DD -> y,m,d
  const [yy, mm, dd] = String(dateStr).split("-").map(n => parseInt(n, 10));
  const month = mm;
  const day   = dd;

  try{
    // 1) 一般（予約/確認）
    const reqRes = await db
      .from("facility_requests")
      .select("id,date,start_time,end_time,title,status,phone,name,email,deleted_at")
      .eq("org_id", ORG_ID)
      .eq("date", dateStr)
      .in("status", ["approved","checking"])
      .is("deleted_at", null)
      .order("start_time", { ascending: true });

    if (reqRes.error) throw new Error(reqRes.error.message);

    // 2) 年間行事
    const annRes = await db
      .from("annual_events")
      .select("id,month,day,start_time,end_time,title")
      .eq("org_id", ORG_ID)
      .eq("active", true)
      .eq("month", month)
      .eq("day", day)
      .order("start_time", { ascending: true });

    if (annRes.error) throw new Error(annRes.error.message);

    const reqs = reqRes.data || [];
    const anns = annRes.data || [];

    // 3) 共通形式へ
    const items = [
      ...anns.map(a => ({
        kind: "annual",
        start_time: a.start_time || "",
        end_time: a.end_time || "",
        title: a.title || "",
        raw: a
      })),
      ...reqs.map(r => ({
        kind: "request",
        start_time: r.start_time || "",
        end_time: r.end_time || "",
        title: r.title || "",
        raw: r
      })),
    ];

    // 4) 時刻順
    items.sort((a,b)=>{
      const as = a.start_time || "99:99";
      const bs = b.start_time || "99:99";
      return as.localeCompare(bs);
    });

    // 5) 空表示
    if (items.length === 0){
      host.innerHTML = `<div class="item">この日の予定はありません。</div>`;
      return;
    }

    // 6) 描画（一般予約は data-* を埋める＝編集が安定）
    host.innerHTML = items.map(it => {
      const s = String(it.start_time || "").slice(0,5);
      const e = String(it.end_time   || "").slice(0,5);
      const time = (s && e) ? `${s}〜${e}` : (s ? `${s}〜` : "");

      if (it.kind === "annual"){
        return `
          <div class="item">
            <div class="item-head">
              <div>
                <span class="kind-badge annual">年間行事</span>
                <span class="time">${esc(time)}</span>
              </div>
            </div>
            <div class="title">${esc(it.title)}</div>
          </div>
        `;
      }

      // 一般予約
      const r = it.raw;
      return `
        <div class="item"
             data-id="${esc(r.id)}"
             data-kind="request"
             data-date="${esc(r.date || dateStr)}"
             data-start="${esc(String(r.start_time || "").slice(0,5))}"
             data-end="${esc(String(r.end_time || "").slice(0,5))}"
             data-title="${esc(r.title || "")}">
          <div class="item-head">
            <div>
              <span class="kind-badge general">一般行事</span>
              <span class="time">${esc(time)}</span>
            </div>

            <div class="item-actions">
              <button type="button"
                      class="icon-btn btn-edit"
                      data-id="${esc(r.id)}"
                      title="編集">✎</button>

              <button type="button"
                      class="icon-btn ng btn-delete"
                      data-id="${esc(r.id)}"
                      title="削除">✕</button>
            </div>
          </div>

          <div class="title">${esc(r.title || "")}</div>

          <div class="contact">
            電話：${esc(r.phone || "")}
            ${r.name  ? ` / 氏名：${esc(r.name)}` : ""}
            ${r.email ? ` / Mail：${esc(r.email)}` : ""}
          </div>

          <div class="pill ${r.status==="approved" ? "pill-ok" : "pill-warn"}">
            ${r.status==="approved" ? "承認済" : "確認中"}
          </div>
        </div>
      `;
    }).join("");

  } catch(err){
    console.error(err);
    host.innerHTML = `<div class="item">読み込みエラー：${esc(err?.message || String(err))}</div>`;
  }
}


// -------------------------------
// Pending list (checking)
// -------------------------------
async function loadPending(){
  const host = el("pendingList");
  if(!host) return;

  host.innerHTML = `<div class="item">読み込み中...</div>`;

  const { data, error } = await db
    .from("facility_requests")
    .select("id, date, start_time, end_time, title, status, phone, name, email")
    .eq("org_id", ORG_ID)
    .eq("status", "checking")
    .is("deleted_at", null)
    .order("date", { ascending:true })
    .order("start_time", { ascending:true });

  if(error){
    console.error(error);
    host.innerHTML = `<div class="item">読み込みエラー</div>`;
    return;
  }

  if(!data || data.length===0){
    host.innerHTML = `<div class="item">確認中はありません。</div>`;
    return;
  }

  host.innerHTML = data.map(r=>{
    const s = hhmm(r.start_time);
    const e = hhmm(r.end_time);

    return `
      <div class="item">
        <div class="time">${esc(r.date)} ${esc(s)}〜${esc(e)}</div>
        <div class="title">${esc(r.title)}</div>
        <div class="contact">
          電話：${esc(r.phone || "")}
          ${r.name ? ` / 氏名：${esc(r.name)}` : ""}
          ${r.email ? ` / Mail：${esc(r.email)}` : ""}
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:8px;">
          <button class="btn2" type="button" onclick="copyText('${esc(r.phone||"")}')">電話コピー</button>
          <button class="btn2" type="button" onclick="approveReq('${r.id}')">承認</button>
          <button class="btnDanger" type="button" onclick="rejectReq('${r.id}')">却下</button>
        </div>
      </div>
    `;
  }).join("");
}

window.copyText = async (t)=>{
  try{
    await navigator.clipboard.writeText(String(t||""));
    alert("コピーしました。");
  }catch{
    prompt("コピーしてください", String(t||""));
  }
};

// -------------------------------
// Approve / Reject（町内会版：org表示confirmなし）
// -------------------------------
window.approveReq = async (id)=>{
  const ok = confirm("この申請を承認します。よろしいですか？");
  if(!ok) return;

  const { data, error } = await db
    .from("facility_requests")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by: "town_admin" // ログイン連動後に置換
    })
    .eq("org_id", ORG_ID)
    .eq("id", id)
    .select("id,status");

  if(error){ alert("承認に失敗しました。\n\n"+error.message); return; }
  if(!data || data.length===0){ alert("対象が見つかりません（0件）"); return; }

  alert("承認しました。");
  await reloadAll();
};

window.rejectReq = async (id)=>{
  const reason = prompt("却下理由（任意）を入力してください。", "都合により不可");
  if(reason === null) return;

  const ok = confirm("この申請を却下します。よろしいですか？");
  if(!ok) return;

  const { data, error } = await db
    .from("facility_requests")
    .update({
      status: "rejected",
      reject_reason: (reason||"").trim() || null,
      rejected_at: new Date().toISOString(),
      rejected_by: "town_admin" // ログイン連動後に置換
    })
    .eq("org_id", ORG_ID)
    .eq("id", id)
    .select("id,status");

  if(error){ alert("却下に失敗しました。\n\n"+error.message); return; }
  if(!data || data.length===0){ alert("対象が見つかりません（0件）"); return; }

  alert("却下しました。");
  await reloadAll();
};

// -------------------------------
// Stats
// -------------------------------
async function loadDashboardStats(){
  // 今日は
  const now = new Date();
  const today = ymd(now.getFullYear(), now.getMonth()+1, now.getDate());
  const monthStart = `${now.getFullYear()}-${pad2(now.getMonth()+1)}-01`;

  // 今日（申請+承認）= approved + checking の合計
  const todayRes = await db
    .from("facility_requests")
    .select("id", { count:"exact", head:true })
    .eq("org_id", ORG_ID)
    .eq("date", today)
    .in("status", ["checking","approved"])
    .is("deleted_at", null);

  // 確認中
  const checkingRes = await db
    .from("facility_requests")
    .select("id", { count:"exact", head:true })
    .eq("org_id", ORG_ID)
    .eq("status","checking")
    .is("deleted_at", null);

  // 今月 承認済
  const approvedRes = await db
    .from("facility_requests")
    .select("id", { count:"exact", head:true })
    .eq("org_id", ORG_ID)
    .eq("status","approved")
    .gte("date", monthStart)
    .is("deleted_at", null);

  // 今月 合計（deleted除く）
  const totalRes = await db
    .from("facility_requests")
    .select("id", { count:"exact", head:true })
    .eq("org_id", ORG_ID)
    .gte("date", monthStart)
    .is("deleted_at", null);

  el("statToday").textContent = (todayRes.count ?? "-") + "件";
  el("statChecking").textContent = (checkingRes.count ?? "-") + "件";
  el("statMonthApproved").textContent = (approvedRes.count ?? "-") + "件";
  el("statMonthTotal").textContent = (totalRes.count ?? "-") + "件";
}

// -------------------------------
// Reload all
// -------------------------------
async function reloadAll(){
  await renderMonthCalendar();
  if (selected) await loadDay(selected);
  await loadPending();
  await loadDashboardStats();
}

// -------------------------------
// init
// -------------------------------
(async function init(){

  // 1) ORG_IDチェック（固定UUID運用）
  if (!ORG_ID){
    const status = document.getElementById("status");
    if (status) status.textContent = "ORG_ID が未設定です";
    console.error("ORG_ID is missing");
    return;
  }

  // 2) 日付初期値
  const now = new Date();
  calYear  = now.getFullYear();
  calMonth = now.getMonth() + 1;

  selected = ymd(now.getFullYear(), now.getMonth() + 1, now.getDate());
  el("selectedDate") && (el("selectedDate").textContent = selected);

  // 3) カレンダー操作
  el("btnPrev")?.addEventListener("click", async ()=>{
    calMonth -= 1;
    if (calMonth <= 0){ calMonth = 12; calYear -= 1; }
    await renderMonthCalendar();
  });

  el("btnNext")?.addEventListener("click", async ()=>{
    calMonth += 1;
    if (calMonth >= 13){ calMonth = 1; calYear += 1; }
    await renderMonthCalendar();
  });

  // 初回ロード
  await reloadAll();
})();

async function refreshAfterChange(dateStr){
  // 1) この日の予定
  if (dateStr) await loadDay(dateStr);

  // 2) 月カレンダー
  if (typeof renderMonthCalendar === "function") {
    await renderMonthCalendar();
  }

  // 3) 確認中一覧（今回の要）
  if (typeof loadPending === "function") {
    await loadPending();
  }

  // 4) 統計（確認中件数など）
  if (typeof loadDashboardStats === "function") {
    await loadDashboardStats();
  }
}


// ================================
// 試供版 全リセット（地区別・論理削除）
// 対象：facility_requests / annual_events
// 条件：org_id = ORG_ID のみ 2026/03/07に変更
// ================================
async function resetAllTestData() {
  const orgLabel = `${CFG.ORG_NAME} (${ORG_ID})`;

  const word = (prompt(
    "【試供版 全リセット】\n\n" +
    `対象地区: ${orgLabel}\n\n` +
    "実行する場合は「RESET」と入力してください。"
  ) || "").trim().toUpperCase();

  if (word !== "RESET") {
    alert("キャンセルしました。");
    return;
  }

  const ok = confirm(
    "【試供版】テストデータを全リセットします。\n\n" +
    `対象地区：${orgLabel}\n` +
    "対象テーブル：\n" +
    "・一般予約（facility_requests）\n" +
    "・年間行事（annual_events）\n\n" +
    "処理内容：\n" +
    "・当該地区のデータのみ削除扱い（deleted_at設定）にします\n" +
    "・元に戻すにはDB操作が必要です\n\n" +
    "実行しますか？"
  );
  if (!ok) return;

  const btn = document.getElementById("btnResetAll");
  if (btn) btn.disabled = true;

  try {
    const nowIso = new Date().toISOString();

    // 1) 一般予約：当該地区のみ論理削除
    const { error: reqErr } = await db
      .from("facility_requests")
      .update({ deleted_at: nowIso })
      .eq("org_id", ORG_ID)
      .is("deleted_at", null);

    if (reqErr) throw new Error("facility_requests: " + reqErr.message);

    // 2) 年間行事：当該地区のみ論理削除
    const { error: annualErr } = await db
      .from("annual_events")
      .update({ deleted_at: nowIso })
      .eq("org_id", ORG_ID)
      .is("deleted_at", null);

    if (annualErr) throw new Error("annual_events: " + annualErr.message);

    alert(`全リセットしました。\n対象地区：${orgLabel}`);

    // 画面を今日に戻す
    const t = new Date();
    selected = ymd(t.getFullYear(), t.getMonth() + 1, t.getDate());
    calYear = t.getFullYear();
    calMonth = t.getMonth() + 1;

    const selEl = document.getElementById("selectedDate");
    if (selEl) selEl.textContent = selected;

    // 別タブへ変更通知
    localStorage.setItem("annual_changed", String(Date.now()));
    localStorage.setItem("facility_changed", String(Date.now()));

    await reloadAll();

  } catch (err) {
    console.error(err);
    alert("リセット失敗：" + (err?.message || String(err)));
  } finally {
    if (btn) btn.disabled = false;
  }
}
// ================================
// テストデータ 全リセット（論理削除）
// ================================
/*async function resetAllTestData(){

  const word = (prompt(
    "【試供版 全リセット】\n\n" +
    "実行する場合は「RESET」と入力してください。"
  ) || "").trim().toUpperCase();

  if(word !== "RESET"){
    alert("キャンセルしました。");
    return;
  }

  const ok = confirm(
    "【試供版】テストデータを全リセットします。\n" +
    "対象：一般予約（facility_requests）\n\n" +
    "・全件を削除扱い（deleted_at設定）にします\n" +
    "・元に戻すにはDB操作が必要です\n\n" +
    "実行しますか？"
  );
  if(!ok) return;

  const btn = document.getElementById("btnResetAll");
  if (btn) btn.disabled = true;

  try{
    const nowIso = new Date().toISOString();

    // ★全件“論理削除”（当該orgのみ）
    const { error } = await db
      .from("facility_requests")
      .update({ deleted_at: nowIso })
      .eq("org_id", ORG_ID)
      .is("deleted_at", null);

    if (error) throw new Error(error.message);

    alert("全リセットしました。");

    // 選択日を今日に戻す（任意）
    const t = new Date();
    selected = ymd(t.getFullYear(), t.getMonth()+1, t.getDate());

    // 月カレンダーも今日の月へ
    calYear  = t.getFullYear();
    calMonth = t.getMonth() + 1;

    const selEl = document.getElementById("selectedDate");
    if (selEl) selEl.textContent = selected;

    await reloadAll();

  }catch(err){
    alert("リセット失敗：" + (err?.message || String(err)));
  }finally{
    if (btn) btn.disabled = false;
  }
}*/

function refreshAll(){
  // ★ここをあなたの実関数に合わせる
  // 例：loadMonth(); loadDay(); loadChecking(); updateCounters();
  if (typeof loadAll === "function") return loadAll();
  if (typeof refreshAllImpl === "function") return refreshAllImpl();
  if (typeof init === "function") return init();
  location.reload(); // 最終手段（できれば上で吸収）
}

let __t = null;
function refreshSoon(){
  clearTimeout(__t);
  __t = setTimeout(refreshAll, 200);
}

// 別タブから戻った時に効く
window.addEventListener("focus", refreshSoon);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshSoon();
});



// ================================
// ボタン bind（initの最後でもOK）
// ================================
document.getElementById("btnResetAll")
  ?.addEventListener("click", resetAllTestData);

  window.addEventListener("storage", (e) => {
  if (e.key === "annual_changed"){
    refreshSoon(); // ②を受け取ったら更新
  }
});