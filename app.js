// ======== הגדרות ========
const SHEET_ID = "1pX951W-sau0RuKhhPxm1KZCCNcb-Fswxs2t64zpmGC4";
const SHEET_GID = "0"; // עדכן אם ה-gid בלשונית שונה
const RECIPIENT_EMAIL = "efratw@m-lemaase.co.il";
const SITE_URL = "https://shlomik20.github.io/kivunjobs/";
// =========================

// אלמנטים בעמוד
const JOBS_GRID  = document.getElementById("jobsGrid");
const JOB_COUNT  = document.getElementById("jobCount");
const YEAR_EL    = document.getElementById("year");
if (YEAR_EL) YEAR_EL.textContent = new Date().getFullYear();

// כתובת GViz
const GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;

// אליאסים (עדיין נשארים כשלב ראשון)
const HEADER_ALIASES = {
  title:  ["כותרת המשרה","כותרת","שם משרה","שם המשרה","כותרת המישרה"],
  desc:   ["תיאור המשרה","תיאור","תאור המשרה","תאור","תיאור תמציתי","תיאור קצר"],
  req:    ["דרישות המשרה","דרישות","כישורים","כישורים נדרשים","תיאור מלא","תיאור המלא","תאור מלא"],
  notes:  ["הערות נוספות","הערות נוספות במידה ויש","הערות"],
  jobId:  ["מס' משרה","מס׳ משרה","מספר משרה","מספר המשרה","מספרמשרה","מספרהמשרה","מס משרה"]
};

// ---------- עוזרים ----------
function normalizeHeader(s){
  if(!s) return "";
  return String(s)
    .replace(/[׳’`"]/g,"'")       // איחוד גרשיים
    .replace(/\s+/g,"")           // הסרת רווחים
    .replace(/[^\p{L}\p{N}]/gu,"")// אותיות/ספרות בלבד
    .toLowerCase();
}
function fuzzyIndex(cols, variants){
  const normVars = variants.map(v => normalizeHeader(v));
  for (let i=0;i<cols.length;i++){
    const n = normalizeHeader(cols[i]);
    if (normVars.some(v => n === v || n.includes(v))) return i;
  }
  return undefined;
}
function mapHeaderIndexes(cols){
  return {
    title: fuzzyIndex(cols, HEADER_ALIASES.title),
    desc:  fuzzyIndex(cols, HEADER_ALIASES.desc),
    req:   fuzzyIndex(cols, HEADER_ALIASES.req),
    notes: fuzzyIndex(cols, HEADER_ALIASES.notes),
    jobId: fuzzyIndex(cols, HEADER_ALIASES.jobId)
  };
}
function rawCellVal(cell){
  if(!cell) return "";
  if (typeof cell.v === "string") return cell.v.trim();
  if (typeof cell.v === "number") return String(cell.v);
  return cell.v ?? "";
}
function onlyText(s){ return (s||"").replace(/\s+/g," ").trim(); }
function isMostlyDigits(s){ return /^[0-9]+$/.test(String(s||"").trim()); }

// זיהוי חכם לפי תוכן (כשאין כותרות אמינות)
function inferIndexesFromData(rows){
  // נהפוך את הטבלה למערך של שורות טקסט
  const data = rows.map(r => (r.c || []).map(rawCellVal));
  const colsCount = Math.max(...data.map(r => r.length), 0);
  if (!colsCount) return {};

  // נחשב לכל עמודה: יחס ספרות, אורך ממוצע, מספר ערכים לא-ריקים
  const stats = [];
  for (let c=0;c<colsCount;c++){
    let digits=0, nonEmpty=0, totalLen=0;
    for (const row of data){
      const v = (row[c]||"").toString().trim();
      if (v !== "") { nonEmpty++; totalLen += v.length; }
      if (isMostlyDigits(v)) digits++;
    }
    const ratioDigits = nonEmpty ? digits/nonEmpty : 0;
    const avgLen = nonEmpty ? totalLen/nonEmpty : 0;
    stats.push({ c, ratioDigits, avgLen, nonEmpty });
  }

  // jobId: העמודה עם יחס ספרות הגבוה ביותר (>= 0.6) ומספיקה לא-ריקה
  const byDigits = [...stats].sort((a,b)=>b.ratioDigits-a.ratioDigits);
  let jobIdIdx = undefined;
  if (byDigits[0] && byDigits[0].ratioDigits >= 0.6 && byDigits[0].nonEmpty > 0){
    jobIdIdx = byDigits[0].c;
  }

  // title: העמודה עם הטקסט הארוך/עשיר ביותר שלא זהה ל-jobId
  const textCols = stats.filter(s => s.c !== jobIdIdx);
  const byLen = [...textCols].sort((a,b)=>b.avgLen-a.avgLen);
  let titleIdx = byLen[0]?.c;

  // desc/req/notes: נשארות לפי אורך ממוצע יורד
  const rest = byLen.slice(1).map(s=>s.c);

  // ניסיון הגיוני: אם יש 5 עמודות — סדר טיפוסי 0..4
  // אך אם ההיסק מעלה שונה — נעדיף את החישוב.
  return {
    title: titleIdx,
    desc:  rest[0],
    req:   rest[1],
    notes: rest[2],
    jobId: jobIdIdx
  };
}

// ---------- לוגיקה ראשית ----------
async function loadJobs(){
  try{
    const res  = await fetch(GVIZ_URL, { cache: "no-store" });
    const text = await res.text();

    if (!text.includes("google.visualization.Query.setResponse")) {
      throw new Error("NO_ACCESS_OR_BAD_GID");
    }

    const json  = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const cols  = (json.table.cols || []).map(c => (c.label || "").trim());
    let rows    = json.table.rows || [];

    console.log("GViz columns:", cols, "rows:", rows.length);

    // 1) נסה לפי labels
    let idx = mapHeaderIndexes(cols);

    // 2) Fallback: שורת כותרות בתוך הנתונים
    if ((!idx.title || idx.title === undefined) && rows.length){
      const headerCandidates = (rows[0].c || []).map(rawCellVal);
      const altIdx = mapHeaderIndexes(headerCandidates);
      const found  = Object.values(altIdx).filter(v => v !== undefined).length;
      if (found >= 2){
        idx  = altIdx;
        rows = rows.slice(1); // דילוג על שורת הכותרות
        console.log("Using first-row headers:", headerCandidates);
      }
    }

    // 3) Fallback אחרון: זיהוי לפי תוכן
    let usingHeuristics = false;
    if (!idx.title){
      idx = inferIndexesFromData(rows);
      usingHeuristics = true;
      console.log("Heuristic index mapping:", idx);
    }

    if (!idx.title){
      throw new Error("MISSING_HEADERS");
    }

    const usingDerivedIds = (idx.jobId === undefined);

    // בניית רשימת המשרות
    const jobs = [];
    for (let i=0;i<rows.length;i++){
      const r = rows[i];
      const c = r.c || [];

      const get = (k)=> (idx[k] !== undefined ? rawCellVal(c[idx[k]]) : "");
      const title = onlyText(get("title"));
      if (!title) continue;

      let jobId = onlyText(get("jobId"));
      if (!jobId) jobId = String(1001 + i); // מזהה זמני יציב לפי מיקום שורה

      jobs.push({
        title,
        desc:  onlyText(get("desc")),
        req:   onlyText(get("req")),
        notes: onlyText(get("notes")),
        jobId,
        _derived: usingDerivedIds
      });
    }

    // מיון: אם יש מזהה אמיתי — מיין לפיו; אחרת השאר סדר מקורי
    if (!usingDerivedIds){
      jobs.sort((a,b) => (b.jobId||"").localeCompare(a.jobId||"", "he"));
    }

    if (JOB_COUNT) JOB_COUNT.textContent = String(jobs.length);
    JOBS_GRID.innerHTML = jobs.map(card).join("");

  } catch(err){
    console.error("Load error:", err);
    let hint = `בדוק:
1) שיתוף הגיליון: Anyone with the link → Viewer.
2) שה־gid נכון (פתח את הלשונית והעתק את המספר אחרי gid= ב־URL).
3) אין שורות ריקות/תאים ממוזגים מעל שורת הכותרות.
4) אם עדיין לא עובד — אשר לי לעבור לגרסת CSV (Publish to web) חסינה.`;
    if (err.message === "MISSING_HEADERS") {
      hint = `לא זוהו כותרות אפילו אחרי ניסיונות. ודא שלפחות יש עמודות עם טקסט (לכותרת) ועמודה אחת מספרית (למס' משרה), או אפשר לעבור לגרסת CSV.`;
    }
    JOBS_GRID.innerHTML = `
      <article class="job-card">
        <div class="card-body">
          <h3 class="job-title">תקלה בטעינת המשרות</h3>
          <pre style="white-space:pre-wrap">${escapeHtml(hint)}</pre>
        </div>
      </article>`;
  }
}

// ---------- תצוגת כרטיס ----------
function card(job){
  const subject = encodeURIComponent(`קורות חיים – משרה ${job.jobId}`);
  const body = encodeURIComponent([
    "שלום,",
    "",
    `מצ״ב קורות חיים עבור משרה ${job.jobId}: ${job.title}`,
    "",
    "שם מלא:",
    "טלפון:",
    "ניסיון רלוונטי בקצרה:",
    "",
    "תודה!"
  ].join("\n"));
  const mailto = `mailto:${RECIPIENT_EMAIL}?subject=${subject}&body=${body}`;

  const shareTextJob =
    `רציתי לעניין אותך במשרה שראיתי אצל כיוון – מחוז מרכז:\n` +
    `${job.title}\nמס' משרה: ${job.jobId}\nפרטים מלאים והגשת קו״ח בדף המשרות:\n${SITE_URL}`;
  const shareWaJob = `https://wa.me/?text=${encodeURIComponent(shareTextJob)}`;

  return `
    <article class="job-card">
      <div class="card-bar">
        <span class="badge">מס' משרה: ${escapeHtml(job.jobId)}</span>
      </div>
      <div class="card-body">
        <h3 class="job-title">${escapeHtml(job.title)}</h3>
        <dl class="job-fields">
          ${section("תיאור", job.desc)}
          ${section("דרישות", job.req)}
          ${job.notes ? section("הערות", job.notes) : ""}
        </dl>
      </div>
      <div class="job-actions">
        <a class="btn" href="${mailto}">שלח/י קו״ח</a>
        <a class="btn-wa" href="${shareWaJob}" target="_blank" rel="noopener">
          <svg aria-hidden="true" viewBox="0 0 32 32" class="wa-ico"><path d="M19.11 17.19c-.28-.14-1.63-.8-1.88-.89-.25-.09-.43-.14-.62.14-.19.28-.72.89-.88 1.07-.16.19-.33.21-.61.07-.28-.14-1.17-.43-2.24-1.38-.83-.74-1.39-1.66-1.55-1.94-.16-.28-.02-.43.12-.57.12-.12.28-.33.41-.49.14-.16.19-.28.28-.47.09-.19.05-.35-.02-.49-.07-.14-.62-1.5-.85-2.06-.22-.53-.45-.46-.62-.46h-.53c-.19 0-.49.07-.75.35-.26.28-.99.97-.99 2.36 0 1.39 1.02 2.74 1.17 2.93.14.19 2.01 3.07 4.87 4.3.68.29 1.21.46 1.63.59.68.22 1.3.19 1.79.11.55-.08 1.63-.66 1.86-1.29.23-.63.23-1.17.16-1.29-.07-.12-.26-.19-.54-.33zM16 3C9.37 3 4 8.37 4 15c0 2.12.56 4.18 1.62 6.01L4 29l8.17-1.55C14.07 28.46 15.02 28.6 16 28.6 22.63 28.6 28 23.23 28 16.6S22.63 3 16 3zm0 23.6c-.86 0-1.7-.14-2.49-.41l-.18-.06-4.87.93.93-4.75-.06-.18C8.07 21 7.4 18.83 7.4 16.6 7.4 10.96 11.96 6.4 16.6 6.4s9.2 4.56 9.2 10.2-4.56 10-10 10z"/></svg>
          שתפו משרה
        </a>
      </div>
    </article>
  `;
}

// ---------- עזרי HTML ----------
function section(label, content){
  if(!content) return "";
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(content)}</dd></div>`;
}
function escapeHtml(str){
  return (str ?? "").replace(/[&<>"']/g, s => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[s]));
}

// הפעלה
loadJobs();
