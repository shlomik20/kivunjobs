// ===== הגדרות =====
const SITE_URL = "https://shlomik20.github.io/kivunjobs/";
// CSV פומבי (Publish to web → CSV)
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQvg671v_gMTRGnQ4hg1lyJvjUT6kgUZrnUWM_f7zZ7pMe-BklVsvLLLpwE9RT3g-6G4WzSiTnF-lEH/pub?gid=0&single=true&output=csv";
// כתובת ה-Web App של Google Apps Script (מופעל אצלך):
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyMLkkxysiM2kW3PJj_ikUDsZMFJ1MRMrIWQdFqQpdp7v-JbLVJNtfD0ieB82Qpqm8/exec";

// ===== אלמנטים =====
const JOBS_GRID  = document.getElementById("jobsGrid");
const JOB_COUNT  = document.getElementById("jobCount");
const YEAR_EL    = document.getElementById("year");
if (YEAR_EL) YEAR_EL.textContent = new Date().getFullYear();

// מודאל
const modal       = document.getElementById("applyModal");
const fJobId      = document.getElementById("fJobId");
const fJobTitle   = document.getElementById("fJobTitle");
const fName       = document.getElementById("fName");
const fPhone      = document.getElementById("fPhone");
const fEmail      = document.getElementById("fEmail");
const fFile       = document.getElementById("fFile");
const applyMsg    = document.getElementById("applyMsg");
const applyForm   = document.getElementById("applyForm");

// ===== אליאסים לכותרות CSV =====
const HEADER_ALIASES = {
  title:  ["כותרת המשרה","כותרת","שם משרה","שם המשרה"],
  desc:   ["תיאור המשרה","תיאור","תיאור תמציתי","תאור","תאור המשרה"],
  req:    ["דרישות המשרה","דרישות","כישורים","כישורים נדרשים","תיאור מלא","התיאור המלא"],
  notes:  ["הערות נוספות","הערות נוספות במידה ויש","הערות"],
  jobId:  ["מספר משרה","מס' משרה","מס׳ משרה","מספר המשרה","מס משרה"],
  date:   ["תאריך פרסום","תאריך","תאריך המשרה","תאריך פירסום"]
};

// ===== CSV Parser =====
function parseCSV(str){
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
      if (ch === "\r"){ if (next === "\n") i++; row.push(cur); rows.push(row); cur=""; row=[]; continue; }
      if (ch === "\n"){ row.push(cur); rows.push(row); cur=""; row=[]; continue; }
      cur += ch;
    }
  }
  row.push(cur); rows.push(row);
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}

// ===== נירמול כותרות =====
const normalizeHeader = s => String(s||"").replace(/[׳’`"]/g,"'").replace(/\s+/g,"").toLowerCase();
function aliasIndex(headers, variants){
  const norm = headers.map(normalizeHeader);
  const vv = variants.map(normalizeHeader);
  for (let i=0;i<norm.length;i++) if (vv.includes(norm[i])) return i;
  return -1;
}
function mapHeaderIndexes(headers){
  return {
    title: aliasIndex(headers, HEADER_ALIASES.title),
    desc:  aliasIndex(headers, HEADER_ALIASES.desc),
    req:   aliasIndex(headers, HEADER_ALIASES.req),
    notes: aliasIndex(headers, HEADER_ALIASES.notes),
    jobId: aliasIndex(headers, HEADER_ALIASES.jobId),
    date:  aliasIndex(headers, HEADER_ALIASES.date),
  };
}

// ===== עזרי טקסט/תאריך =====
const onlyText = s => String(s ?? "").trim();
const slugId = id => `job-${String(id||"").replace(/[^\w\-]/g,"")}`;

function parseHebDate(s){
  const t = onlyText(s);
  if (!t) return null;
  const patterns = [
    {re:/^\d{4}-\d{2}-\d{2}$/, fmt:r=>new Date(t)},
    {re:/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, fmt:r=>new Date(+r[3], +r[2]-1, +r[1])},
    {re:/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, fmt:r=>new Date(+r[3], +r[2]-1, +r[1])},
    {re:/^(\d{1,2})-(\d{1,2})-(\d{2})$/, fmt:r=>new Date(2000+ +r[3], +r[2]-1, +r[1])},
    {re:/^(\d{1,2})-(\d{1,2})-(\d{4})$/, fmt:r=>new Date(+r[3], +r[2]-1, +r[1])},
    {re:/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, fmt:r=>new Date(2000+ +r[3], +r[1]-1, +r[2])}
  ];
  for (const p of patterns){ const m = t.match(p.re); if (m) return p.fmt(m); }
  const d = new Date(t);
  return isNaN(d) ? null : d;
}
function isNew(dateObj){
  if (!dateObj) return false;
  const MS = 24*60*60*1000;
  return (Date.now() - dateObj.getTime()) <= 7*MS;
}

// ===== טעינת משרות =====
async function loadJobs(){
  if (!JOBS_GRID.innerHTML.trim()){
    JOBS_GRID.innerHTML = `<div class="loading">טוען משרות…</div>`;
  }
  try{
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error("CSV_FETCH_FAILED");
    const text = await res.text();
    const rows = parseCSV(text);
    if (!rows.length) throw new Error("CSV_EMPTY");

    const headers = rows[0].map(onlyText);
    const idx = mapHeaderIndexes(headers);
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
      const dpub  = idx.date  !== -1 ? parseHebDate(r[idx.date]) : null;

      jobs.push({ title, jobId, desc, req, notes, dpub, isNew: isNew(dpub) });
    }

    const hasRealIds = idx.jobId !== -1 && jobs.every(j => j.jobId);
    if (hasRealIds){
      jobs.sort((a,b) => (b.jobId||"").localeCompare(a.jobId||"", "he"));
    }

    if (JOB_COUNT) JOB_COUNT.textContent = String(jobs.length);
    JOBS_GRID.innerHTML = jobs.map(card).join("");

    highlightAndScrollToHash();
    window.addEventListener("hashchange", highlightAndScrollToHash);

  } catch(err){
    console.error("Load error:", err);
    JOBS_GRID.innerHTML = `
      <article class="job-card">
        <div class="card-body">
          <h3 class="job-title">תקלה בטעינת המשרות</h3>
          <pre style="white-space:pre-wrap">לא הצלחתי לטעון CSV. בדוק פרסום/כותרות וגישה.</pre>
        </div>
      </article>`;
  }
}

// ===== רנדר כרטיס =====
function card(job){
  const id = slugId(job.jobId);

  // שיתוף משרה ספציפית (Deep link)
  const shareTextJob = `מצאתי משרה שנראית לי רלוונטית עבורך במשרות של כיוון: ${job.title}\n${SITE_URL}#${id}`;
  const shareWaJob = `https://wa.me/?text=${encodeURIComponent(shareTextJob)}`;

  return `
    <article class="job-card" id="${id}">
      <div class="card-bar">
        <div>
          ${job.isNew ? `<span class="tag-new">חדש</span>` : ``}
          <span class="badge">מס' משרה: ${escapeHtml(job.jobId)}</span>
        </div>
      </div>
      <div class="card-body">
        <h3 class="job-title">${escapeHtml(job.title)}</h3>
        <dl class="job-fields">
          ${section("תיאור המשרה", job.desc)}
          ${section("דרישות המשרה", job.req)}
          ${job.notes ? section("הערות נוספות", job.notes) : ""}
        </dl>
      </div>
      <div class="job-actions">
        <button class="btn btn-apply" data-job-id="${escapeHtml(job.jobId)}" data-job-title="${escapeHtml(job.title)}">שלח/י קו״ח</button>
        <a class="btn-wa" href="${shareWaJob}" target="_blank" rel="noopener">
          <svg aria-hidden="true" viewBox="0 0 32 32" class="wa-ico"><path d="M19.11 17.19c-.28-.14-1.63-.8-1.88-.89-.25-.09-.43-.14-.62.14-.19.28-.72.89-.88 1.07-.16.19-.33.21-.61.07-.28-.14-1.17-.43-2.24-1.38-.83-.74-1.39-1.66-1.55-1.94-.16-.28-.02-.43.12-.57.12-.12.28-.33.41-.49.14-.16.19-.28.28-.47.09-.19.05-.35-.02-.49-.07-.14-.62-1.5-.85-2.06-.22-.53-.45-.46-.62-.46h-.53c-.19 0-.49.07-.75.35-.26.28-.99.97-.99 2.36 0 1.39 1.02 2.74 1.17 2.93.14.19 2.01 3.07 4.87 4.3.68.29 1.21.46 1.63.59.68.22 1.3.19 1.79.11.55-.08 1.63-.66 1.86-1.29.23-.63.23-1.17.16-1.29-.07-.12-.26-.19-.54-.33zM16 3C9.37 3 4 8.37 4 15c0 2.12.56 4.18 1.62 6.01L4 29l8.17-1.55C14.07 28.46 15.02 28.6 16 28.6 22.63 28.6 28 23.23 28 16.6S22.63 3 16 3zm0 23.6c-.86 0-1.7-.14-2.49-.41l-.18-.06-4.87.93.93-4.75-.06-.18C8.07 21 7.4 18.83 7.4 16.6 7.4 10.96 11.96 6.4 16.6 6.4s9.2 4.56 9.2 10.2-4.56 10-10 10z"/></svg>
          שתפו משרה
        </a>
      </div>
    </article>
  `;
}

// ===== הדגשת כרטיס מ-hash =====
function highlightAndScrollToHash(){
  const h = (location.hash||"").replace(/^#/, "");
  if (!h) return;
  const el = document.getElementById(h);
  if (!el) return;
  el.classList.add("targeted");
  setTimeout(()=> el.classList.remove("targeted"), 2200);
}

// ===== מודאל: פתיחה/סגירה =====
function openApplyModal(jobId, jobTitle){
  document.getElementById("applyJobTitle").textContent = jobTitle;
  document.getElementById("applyJobId").textContent = `מס' משרה: ${jobId}`;
  fJobId.value = jobId;
  fJobTitle.value = jobTitle;
  fName.value = ""; fPhone.value = ""; fEmail.value = ""; fFile.value = "";
  applyMsg.textContent = "";
  modal.classList.add("show");
  modal.setAttribute("aria-hidden","false");
  fName.focus();
}
function closeApplyModal(){
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden","true");
}

// האזנות
document.addEventListener("click", (e)=>{
  const btn = e.target.closest(".btn-apply");
  if (btn){
    e.preventDefault();
    openApplyModal(btn.dataset.jobId, btn.dataset.jobTitle);
  }
  if (e.target.matches("[data-close]")){
    e.preventDefault();
    closeApplyModal();
  }
});

// המרת קובץ ל-Base64
function fileToBase64(file){
  return new Promise((resolve,reject)=>{
    const r = new FileReader();
    r.onload = () => {
      const res = String(r.result||"");
      const b64 = res.includes(",") ? res.split(",")[1] : res; // הסרת prefix data:
      resolve(b64);
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// שליחת הטופס ל-Apps Script
applyForm?.addEventListener("submit", async (e)=>{
  e.preventDefault();
  applyMsg.textContent = "";

  if (!APPS_SCRIPT_URL){
    applyMsg.textContent = "שגיאה: כתובת ה-Web App חסרה.";
    return;
  }

  const name  = fName.value.trim();
  const phone = fPhone.value.trim();
  const email = fEmail.value.trim();

  if (!name || !phone){
    applyMsg.textContent = "נא למלא שם מלא וטלפון.";
    return;
  }
  const file = fFile.files[0];
  if (!file){ applyMsg.textContent = "נא לצרף קובץ קורות חיים."; return; }

  const okType = /(\.pdf|\.docx?|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i.test(file.type) || /\.(pdf|docx?)$/i.test(file.name);
  if (!okType){ applyMsg.textContent = "קובץ לא נתמך. נא לצרף PDF / DOC / DOCX."; return; }
  if (file.size > 20*1024*1024){ applyMsg.textContent = "הקובץ גדול מדי (מעל 20MB)."; return; }

  const sendBtn = document.getElementById("sendBtn");
  sendBtn.disabled = true; sendBtn.textContent = "שולח…";

  try{
    const fileB64 = await fileToBase64(file);
    const payload = {
      jobId: fJobId.value,
      jobTitle: fJobTitle.value,
      name, phone, email,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      fileB64
    };

    // text/plain + no-cors כדי להימנע מ-preflight; התשובה לא נצרכת בדף.
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
      mode: "no-cors"
    });

    applyMsg.textContent = "נשלח! תודה, אנו נחזור אליך בהקדם.";
    setTimeout(()=> closeApplyModal(), 1500);

  } catch (err){
    console.error(err);
    applyMsg.textContent = "אירעה שגיאה בשליחה. נסה/י שוב מאוחר יותר או שלח/י מייל ידנית.";
  } finally {
    sendBtn.disabled = false; sendBtn.textContent = "שליחה";
  }
});

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
