// ========= Supabase =========
/*const SUPABASE_URL = "https://htrsbjadomyonuelzups.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KQvUS5eLkDyB4dJQlhzoxw_lgNq_66F";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const ORG_ID = "4da381c2-cf21-4c5a-8239-2f28b78a6a01";*/

// ===============================
// admin_annual.js（町内会版）
// ===============================

const CFG = window.APP_CONFIG;
if (!CFG) { alert("config.js が読み込まれていません"); throw new Error("Missing APP_CONFIG"); }

// Supabase
const db = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

// 町内会 固定
const ORG_ID = CFG.ORG_ID;

//const el = (id) => document.getElementById(id);


// ========= Utils =========
function pad2(n){ return String(n).padStart(2,"0"); }
function hhmmss(hhmm){
  if (!hhmm) return null;
  return hhmm.length === 5 ? `${hhmm}:00` : hhmm;
}
function dateToStr(d){
  return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
}
function inRangeDate(d, from, to){
  return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
}
function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

let currentBatchId = null;


// 第n曜日の日付を求める（存在しない場合はnull）
function nthDowOfMonth(y, m, nth, dow){ // m:1-12
  const first = new Date(y, m-1, 1);
  const firstDow = first.getDay();
  const offset = (dow - firstDow + 7) % 7;
  const day = 1 + offset + (nth-1)*7;
  const dt = new Date(y, m-1, day);
  if (dt.getMonth() !== (m-1)) return null;
  return dt;
}

// ========= UI init =========
(function init(){
  // batch_id 自動生成
  /*const batch = document.getElementById("aeBatch");
  batch.value = `batch-${new Date().toISOString().slice(0,10)}-${Math.random().toString(16).slice(2,6)}`;*/

  // 月確認用 初期値：今月
  const checkMonth = document.getElementById("checkMonth");
  const now = new Date();
  checkMonth.value = `${now.getFullYear()}-${pad2(now.getMonth()+1)}`;

  // type 切替
  document.getElementById("aeType").addEventListener("change", syncTypeRows);
  syncTypeRows();
})();

function syncTypeRows(){
  const t = document.getElementById("aeType").value;
  document.getElementById("rowWeekly").style.display      = (t === "weekly") ? "" : "none";
  document.getElementById("rowMonthlyDate").style.display = (t === "monthly_date") ? "" : "none";
  document.getElementById("rowMonthlyNth").style.display  = (t === "monthly_nth") ? "" : "none";
}

// ========= Preview memory =========
let previewRows = []; // {event_date,start_time,end_time,title,active,batch_id, warn:boolean}

// ========= Generate =========
async function generatePreview(){
  const title = document.getElementById("aeTitle").value.trim();
  const from  = document.getElementById("aeFrom").value;
  const to    = document.getElementById("aeTo").value;
  const st    = document.getElementById("aeStart").value;
  const et    = document.getElementById("aeEnd").value;
  const type  = document.getElementById("aeType").value;

  /*const batch = document.getElementById("aeBatch").value.trim();
  if (!title || !from || !to || !st || !et || !batch){
    alert("未入力があります（タイトル・期間・時刻・batch_id）。");
    return;
  }*/
// batch_id は画面入力しない：プレビュー生成のたびにuuidを1回発行

  currentBatchId = crypto.randomUUID();

  if (!title || !from || !to || !st || !et){
    alert("未入力があります（タイトル・期間・時刻）。");
    return;
  }

  const startTime = hhmmss(st);
  const endTime   = hhmmss(et);
  if (endTime <= startTime){
    alert("終了時間は開始時間より後にしてください。");
    return;
  }

  const fromDt = new Date(from + "T00:00:00");
  const toDt   = new Date(to   + "T00:00:00");
  if (Number.isNaN(fromDt.getTime()) || Number.isNaN(toDt.getTime()) || toDt < fromDt){
    alert("期間（日付）の指定が正しくありません。");
    return;
  }

  // 生成候補 dates[]
  let dates = [];

  if (type === "once"){
    dates = [from]; // from=toの運用推奨。違う場合でもfromだけ採用
  }

  if (type === "weekly"){
    const checked = Array.from(document.querySelectorAll("#rowWeekly input[type=checkbox]:checked"))
      .map(x => Number(x.value));
    if (checked.length === 0){
      alert("毎週の場合は曜日を1つ以上選んでください。");
      return;
    }
    for (let d = new Date(fromDt); d <= toDt; d.setDate(d.getDate()+1)){
      if (checked.includes(d.getDay())){
        dates.push(dateToStr(d));
      }
    }
  }

  if (type === "monthly_date"){
    const day = Number(document.getElementById("aeDay").value);
    if (!day || day < 1 || day > 31){
      alert("毎月○日の「日」を 1〜31 で入力してください。");
      return;
    }
    // from〜toの範囲で月を走査
    const cur = new Date(fromDt.getFullYear(), fromDt.getMonth(), 1);
    const end = new Date(toDt.getFullYear(), toDt.getMonth(), 1);
    while (cur <= end){
      const y = cur.getFullYear();
      const m = cur.getMonth()+1;
      const dt = new Date(y, m-1, day);
      if (dt.getMonth()+1 === m && inRangeDate(dt, fromDt, toDt)){
        dates.push(dateToStr(dt));
      }
      cur.setMonth(cur.getMonth()+1);
    }
  }

  if (type === "monthly_nth"){
    const nth = Number(document.getElementById("aeNth").value);
    const dow = Number(document.getElementById("aeDow").value);
    const cur = new Date(fromDt.getFullYear(), fromDt.getMonth(), 1);
    const end = new Date(toDt.getFullYear(), toDt.getMonth(), 1);
    while (cur <= end){
      const y = cur.getFullYear();
      const m = cur.getMonth()+1;
      const dt = nthDowOfMonth(y, m, nth, dow);
      if (dt && inRangeDate(dt, fromDt, toDt)){
        dates.push(dateToStr(dt));
      }
      cur.setMonth(cur.getMonth()+1);
    }
  }

  // 生成結果を previewRows に追加（同じ batch_id は上書きしたいならここでクリアしてもOK）
  const rows = dates.map(ds => ({
    event_date: ds,
    start_time: startTime,
    end_time: endTime,
    title,
    active: true,
    batch_id: currentBatchId, // ★ここ
    warn: false
  }));

  // 衝突チェック（facility_requests approved と重なるか）
  // overlap: existing.start < newEnd AND existing.end > newStart
  const warnCount = await markConflicts(rows);

  previewRows = rows;
  renderPreview(warnCount);
}

async function markConflicts(rows){
  if (!rows.length) return 0;

  // 日付の集合でまとめて問い合わせ（IN句）
  const dates = [...new Set(rows.map(r => r.event_date))];

  // その月の承認済を拾う（簡易：日付IN + approved）
  const { data, error } = await db
    .from("facility_requests")
    .select("date, start_time, end_time, status")
    .in("date", dates)
    .eq("org_id",ORG_ID)
    .eq("status", "approved");

  if (error){
    console.error(error);
    // 衝突チェック失敗でもプレビュー自体は出す
    return 0;
  }

  const map = new Map(); // date -> array
  for (const r of (data || [])){
    const key = (typeof r.date === "string") ? r.date : null;
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }

  let warns = 0;
  for (const pv of rows){
    const arr = map.get(pv.event_date) || [];
    const pvStart = pv.start_time;
    const pvEnd   = pv.end_time;

    // overlap
    const hit = arr.some(x => (x.start_time < pvEnd) && (x.end_time > pvStart));
    pv.warn = hit;
    if (hit) warns++;
  }
  return warns;
}

function renderPreview(warnCount){
  const box = document.getElementById("preview");
  const pvCount = document.getElementById("pvCount");
  const pvWarn  = document.getElementById("pvWarn");
  pvCount.textContent = String(previewRows.length);
  pvWarn.textContent  = String(warnCount);

  if (!previewRows.length){
    box.innerHTML = "<div style='color:#666;font-size:13px;'>プレビューは空です。</div>";
    return;
  }

  box.innerHTML = previewRows.map(r => `
    <div class="pv-row">
      <div>${esc(r.event_date)}</div>
      <div>${esc(r.start_time.slice(0,5))}〜${esc(r.end_time.slice(0,5))}</div>
      <div>${esc(r.title)}</div>
      <div>${r.warn ? `<span class="badge-warn">衝突</span>` : `<span class="badge-ok">OK</span>`}</div>
    </div>
  `).join("");
}

function clearPreview(){
  previewRows = [];
  document.getElementById("preview").innerHTML = "<div style='color:#666;font-size:13px;'>プレビューは空です。</div>";
  document.getElementById("pvCount").textContent = "0";
  document.getElementById("pvWarn").textContent = "0";
}

// ========= Insert =========
async function insertPreview(){
  if (!previewRows.length){
    alert("プレビューが空です。先に生成してください。");
    return;
  }

  if (!currentBatchId){
    alert("batch_id が生成されていません。再度プレビューを作成してください。");
    return;
  }

  const warnExists = previewRows.some(r => r.warn);
  const ok = warnExists
    ? confirm("衝突（承認済と重なる）候補があります。\nそれでも annual_events に登録しますか？")
    : confirm(`プレビュー ${previewRows.length} 件を annual_events に登録しますか？`);
  if (!ok) return;

  // ★ここが最重要：batch_id を必ず上書き
  const payload = previewRows.map(r => {
  const { month, day } = ymdToMonthDay(r.event_date);
  return {
    org_id: ORG_ID,
    event_date: r.event_date,
    month,               // ★追加
    day,                 // ★追加
    start_time: r.start_time,
    end_time: r.end_time,
    title: r.title,
    active: true,
    batch_id: currentBatchId
  };
});


  const { error } = await db.from("annual_events").insert(payload);
  if (error){
    console.error(error);
    alert("登録に失敗しました。\n\n" + error.message);
    return;
  }

  alert("登録できました。");
}
    clearPreview();
    currentBatchId = null;


// ========= Month list =========
async function loadMonth(){
  const v = document.getElementById("checkMonth").value; // YYYY-MM
  if (!v){
    alert("月を選んでください。");
    return;
  }
  const [y, m] = v.split("-").map(Number);
  const from = `${y}-${pad2(m)}-01`;
  const toDt = new Date(y, m, 1); // 次月1日
  const to = `${toDt.getFullYear()}-${pad2(toDt.getMonth()+1)}-01`;

  const { data, error } = await db
    .from("annual_events")
    .select("event_date, start_time, end_time, title, active, batch_id")
    .gte("event_date", from)
    .lt("event_date", to)
    .eq("org_id",ORG_ID)
    .eq("active", true)
    .order("event_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (error){
    alert("読み込みに失敗しました。\n\n" + error.message);
    console.error(error);
    return;
  }

  const el = document.getElementById("monthList");
  if (!data || data.length === 0){
    el.innerHTML = "<div style='color:#666;font-size:13px;'>この月の年間行事はありません。</div>";
    return;
  }

  el.innerHTML = data.map(r => {
    const t1 = String(r.start_time).slice(0,5);
    const t2 = String(r.end_time).slice(0,5);
    return `
      <div class="item">
        <div class="time">${esc(r.event_date)} ${esc(t1)}〜${esc(t2)}</div>
        <div class="title">${esc(r.title)}</div>
        <div class="tag approved">確定</div>
      </div>
    `;
  }).join("");
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
function ymdToMonthDay(ymd){
  // ymd: "YYYY-MM-DD"
  const m = Number(ymd.slice(5,7));
  const d = Number(ymd.slice(8,10));
  return { month: m, day: d };
}


// グローバル公開（onclick用）
window.generatePreview = generatePreview;
window.clearPreview = clearPreview;
window.insertPreview = insertPreview;
window.loadMonth = loadMonth;

