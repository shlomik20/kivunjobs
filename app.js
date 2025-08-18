// ======== הגדרות ========
const SHEET_ID = "1pX951W-sau0RuKhhPxm1KZCCNcb-Fswxs2t64zpmGC4";
const SHEET_GID = "0"; // אם פרסמת לשונית אחרת, עדכן/י את המספר
const RECIPIENT_EMAIL = "efratw@m-lemaase.co.il";
const SITE_URL = "https://shlomik20.github.io/kivunjobs/";
// כתובת CSV פומבית (Publish to web)
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/pub?gid=${SHEET_GID}&single=true&output=csv`;
// =========================

// אלמנטים בעמוד
const JOBS_GRID  = document.getElementById("jobsGrid");
const JOB_COUNT  = document.getElementById("jobCount");
const YEAR_EL    = document.getElementById("year");
if (YEAR_EL) YEAR_EL.textContent = new Date().getFullYear();

// אליאסים לשמות כותרות בעברית
const HEADER_ALIASES = {
  title:  ["כותרת המשרה","כותרת","שם משרה","שם המשרה"],
  desc:   ["תיאור המשרה","תיאור","תיאור תמציתי","תאור","תאור המשרה"],
  req:    ["דרישות המשרה","דרישות","כישורים","כישורים נדרשים","תיאור מלא","התיאור המלא"],
  notes:  ["הערות נוספות","הערות נוספות במידה ויש","הערות"],
  jobId:  ["מספר משרה","מס' משרה","מס׳ משרה","מספר המשרה","מס משרה"]
};

// ===== CSV Parser קטן ועמיד לציטוטים/פסיקים/שורות חדשות =====
function parseCSV(str){
  // הסרת BOM אם קיים
  if (str.charCodeAt(0) === 0xFEFF) str = str.slice(1);
  const rows = [];
  let cur = "", row = [], inQuotes = false;

  for (let i=0;i<str.length;i++){
    const ch = str[i], next = str[i+1];
    if (inQuotes){
      if (ch === '"' && next === '"'){ cur += '"'; i++; continue; }
      if (ch === '"'){ inQuotes = false; continue; }
      cur += ch;
    }else{
      if (ch === '"'){ inQuotes = true; continue; }
      if (ch === ","){ row.push(cur); cur = ""; continue; }
      if (ch === "\r"){
        if (next === "\n") i++;
        row.push(cur); rows.push(row); cur=""; row=[]; continue;
      }
      if (ch === "\n"){
        row.push(cur); rows.push(row); cur=""; row=[]; continue;
      }
      cur += ch;
    }
  }
  // אחרון
  row.push(cur); rows.push(row);
  // סינון שורות ריקות לגמרי
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

// נירמול טקסט כותרת
function normalizeHeader(s){
  return String(s||"")
    .replace(/[׳’`"]/g,"'")  // איחוד גרשיים
    .replace(/\s+/g,"")      // הסרת רווחים
    .toLowerCase();
}

// מציאת אינדקס לפי אליאסים
function aliasIndex(headers, variants){
  const norm = headers.map(normalizeHeader);
  const vv = variants.map(normalizeHeader);
  for (let i=0;i<norm.length;i++){
    if (vv.includes(norm[i])) return i;
  }
  return -1;
}

function mapHeaderIndexes(headers){
  return {
    title: aliasIndex(headers, HEADER_ALIASES.title),
    desc:  aliasIndex(headers, HEADER_ALIASES.desc),
    req:   aliasIndex(headers, HEADER_ALIASES.req),
    notes: aliasIndex(headers, HEADER_ALIASES.notes),
    jobId: aliasIndex(headers, HEADER_ALIASES.jobId),
  };
}

// עזרי טקסט
const onlyText = s => String(s ?? "").trim();

// ===== טעינת המשרות מה-CSV =====
async function loadJobs(){
  try{
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("CSV_FETCH_FAILED");
    const text = await res.text();
    const rows = parseCSV(text);
    if (!rows.length) throw new Error("CSV_EMPTY");

    // כותרות
    const headers = rows[0].map(h => onlyText(h));
    const idx = mapHeaderIndexes(headers);

    // בדיקת שדות חובה
    if (idx.title === -1) throw new Error("MISSING_TITLE_HEADER");

    const jobs = [];
    for (let i=1;i<rows.length;i++){
      const r = rows[i];
      const title = onlyText(r[idx.title]);
      if (!title) continue;

      const jobId = idx.jobId !== -1 ? onlyText(r[idx.jobId]) : String(1000 + i);
      const desc  = idx.desc  !== -1 ? onlyText(r[idx.desc])  : "";
      const req   = idx.req   !== -1 ? onlyText(r[idx.req])   : "";
      const notes = idx.notes !== -1 ? onlyText(r[idx.notes]) : "";

      jobs.push({ title, jobId, desc, req, notes });
    }

    // מיון (אם יש מספרי משרה אמיתיים)
    const hasRealIds = idx.jobId !== -1 && jobs.every(j => j.jobId);
    if (hasRealIds){
      jobs.sort((a,b) => (b.jobId||"").localeCompare(a.jobId||"", "he"));
    }

    if (JOB_COUNT) JOB_COUNT.textContent = String(jobs.length);
    JOBS_GRID.innerHTML = jobs.map(card).join("");

  } catch(err){
    console.error("Load error:", err);
    let hint = `לא הצלחתי לטעון CSV.
1) ודא שבחרת: קובץ → "פרסום לאינטרנט" → לשונית נכונה → CSV → פרסם.
2) אם פרסמת לשונית אחרת, עדכן את SHEET_GID ב-app.js.
3) ודא ששורת הכותרות היא הראשונה: "כותרת המשרה, תיאור המשרה, דרישות המשרה, הערות נוספות, מספר משרה".`;
    if (err.message === "MISSING_TITLE_HEADER"){
      hint = `כותרת המשרה לא זוהתה בכותרות ה-CSV. ודא שאחת מהכותרות היא: ${HEADER_ALIASES.title.join(" / ")}`;
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

// ===== רנדר כרטיס =====
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

// ===== עזרי HTML =====
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
