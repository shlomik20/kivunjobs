// ======== הגדרות ========
const SHEET_ID = "1pX951W-sau0RuKhhPxm1KZCCNcb-Fswxs2t64zpmGC4";
const SHEET_GID = "0"; // עדכן אם ה-gid בלשונית שונה
const RECIPIENT_EMAIL = "efratw@m-lemaase.co.il";
const SITE_URL = "https://shlomik20.github.io/kivunjobs/";
// =========================

const JOBS_GRID = document.getElementById("jobsGrid");
const JOB_COUNT = document.getElementById("jobCount");
const YEAR_EL = document.getElementById("year");
if (YEAR_EL) YEAR_EL.textContent = new Date().getFullYear();

const GVIZ_URL =
  `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&gid=${SHEET_GID}`;

// וריאציות שמות כותרות בעברית
const HEADER_ALIASES = {
  title:  ["כותרת המשרה","כותרת"],
  desc:   ["תיאור המשרה","תיאור"],
  req:    ["דרישות המשרה","דרישות"],
  notes:  ["הערות נוספות","הערות נוספות במידה ויש","הערות"],
  jobId:  ["מס' משרה","מספר משרה","מספר המשרה"]
};

async function loadJobs(){
  try{
    const res = await fetch(GVIZ_URL, { cache: "no-store" });
    const text = await res.text();
    if (!text.includes("google.visualization.Query.setResponse")) {
      throw new Error("NO_ACCESS_OR_BAD_GID");
    }
    const json = JSON.parse(text.substring(text.indexOf("{"), text.lastIndexOf("}") + 1));
    const cols = json.table.cols.map(c => (c.label || "").trim());
    const rows = json.table.rows;
console.log("GViz columns:", cols, "rows:", rows?.length);


    const idx = mapHeaderIndexes(cols);
    if (!idx.title || !idx.jobId) throw new Error("MISSING_HEADERS");

    const jobs = [];
    for (const r of rows){
      const c = r.c || [];
      const title = val(c[idx.title]);
      const jobId = val(c[idx.jobId]);
      if(!title || !jobId) continue;
      jobs.push({
        title,
        desc:  val(c[idx.desc]),
        req:   val(c[idx.req]),
        notes: val(c[idx.notes]),
        jobId
      });
    }

    jobs.sort((a,b) => (b.jobId||"").localeCompare(a.jobId||"", "he"));
    if (JOB_COUNT) JOB_COUNT.textContent = String(jobs.length);
    JOBS_GRID.innerHTML = jobs.map(job => card(job)).join("");
  } catch(err){
    console.error("Load error:", err);
    let hint = `בדוק:
1) שיתוף: Anyone with the link → Viewer.
2) שה־gid נכון (פתח את הלשונית והעתק את המספר אחרי gid= ב־URL).`;
    if (err.message === "MISSING_HEADERS") {
      hint = `וודא שכותרות השורה הראשונה תואמות (או וריאציות):
"כותרת המשרה", "תיאור המשרה", "דרישות המשרה", "הערות נוספות", "מס' משרה".`;
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

function mapHeaderIndexes(cols){
  const findIndex = (aliases) => {
    for (const a of aliases) {
      const i = cols.findIndex(h => h === a);
      if (i !== -1) return i;
    }
    return undefined;
  };
  return {
    title: findIndex(HEADER_ALIASES.title),
    desc:  findIndex(HEADER_ALIASES.desc),
    req:   findIndex(HEADER_ALIASES.req),
    notes: findIndex(HEADER_ALIASES.notes),
    jobId: findIndex(HEADER_ALIASES.jobId)
  };
}

function val(cell){
  if(!cell) return "";
  if(typeof cell.v === "string") return cell.v.trim();
  if(typeof cell.v === "number") return String(cell.v);
  return cell.v ?? "";
}

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

  // שיתוף פר-משרה
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

function section(label, content){
  if(!content) return "";
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(content)}</dd></div>`;
}
function escapeHtml(str){
  return (str ?? "").replace(/[&<>"']/g, s => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[s]));
}

loadJobs();
