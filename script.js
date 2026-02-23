/* BWK Zeiterfassung – v0.1
   - LocalStorage
   - Projekte
   - Timer Start/Pause/Stop -> Eintrag
   - Manuelle Einträge
   - Kalender (Monat/Woche/Tag)
   - Suche + Projektfilter
*/

const STORAGE_KEY = "bwk_time_v01";

const state = {
  viewMode: "month",
  cursorDate: new Date(),
  selectedDate: startOfDay(new Date()),
  activeProjectId: null,
  search: "",
  timer: {
    running: false,
    paused: false,
    startTs: null,
    pauseTs: null,
    pausedMs: 0,
    projectId: null,
    note: ""
  },
  data: {
    projects: [],
    entries: [] // {id, projectId, startTs, endTs, breakMin, note}
  }
};

// ---------- Utilities ----------
function uid() { return Math.random().toString(16).slice(2) + Date.now().toString(16); }

function startOfDay(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x;
}
function sameDay(a,b){
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function fmtDate(d){
  const x = new Date(d);
  return x.toLocaleDateString("de-DE", { weekday:"long", year:"numeric", month:"long", day:"2-digit" });
}
function fmtShort(d){
  const x = new Date(d);
  return x.toLocaleDateString("de-DE", { day:"2-digit", month:"2-digit", year:"numeric" });
}
function fmtTime(ts){
  const d = new Date(ts);
  return d.toLocaleTimeString("de-DE", { hour:"2-digit", minute:"2-digit" });
}
function clamp(n,min,max){ return Math.max(min, Math.min(max,n)); }

function msToHhmmss(ms){
  ms = Math.max(0, ms);
  const s = Math.floor(ms/1000);
  const hh = Math.floor(s/3600);
  const mm = Math.floor((s%3600)/60);
  const ss = s%60;
  return `${String(hh).padStart(2,"0")}:${String(mm).padStart(2,"0")}:${String(ss).padStart(2,"0")}`;
}
function msToHhmm(ms){
  ms = Math.max(0, ms);
  const totalMin = Math.round(ms/60000);
  const hh = Math.floor(totalMin/60);
  const mm = totalMin%60;
  return `${hh}:${String(mm).padStart(2,"0")}`;
}
function minutesToHhmm(min){
  const hh = Math.floor(min/60);
  const mm = min%60;
  return `${hh}:${String(mm).padStart(2,"0")}`;
}

function weekStart(d){
  const x = startOfDay(d);
  // ISO-ish: Monday start
  const day = (x.getDay()+6)%7; // Mon=0
  x.setDate(x.getDate()-day);
  return x;
}

// ---------- Storage ----------
function load(){
  const raw = localStorage.getItem(STORAGE_KEY);
  if(!raw){
    // defaults
    state.data.projects = [
      { id: uid(), name: "Allgemein", color: "accent" }
    ];
    state.activeProjectId = state.data.projects[0].id;
    save();
    return;
  }
  try{
    const obj = JSON.parse(raw);
    if(obj?.data){
      state.data = obj.data;
      state.activeProjectId = obj.activeProjectId ?? state.data.projects?.[0]?.id ?? null;
      state.viewMode = obj.viewMode ?? "month";
      state.cursorDate = obj.cursorDate ? new Date(obj.cursorDate) : new Date();
      state.selectedDate = obj.selectedDate ? new Date(obj.selectedDate) : startOfDay(new Date());
      // timer intentionally not persisted as "running" to avoid confusion after reload
    }
  }catch(e){
    console.warn("Load failed", e);
  }
}
function save(){
  const obj = {
    data: state.data,
    activeProjectId: state.activeProjectId,
    viewMode: state.viewMode,
    cursorDate: state.cursorDate.toISOString(),
    selectedDate: state.selectedDate.toISOString()
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

// ---------- DOM ----------
const el = (id)=>document.getElementById(id);

const dom = {
  sidebar: el("sidebar"),
  btnToggleSidebar: el("btnToggleSidebar"),

  projectSelect: el("projectSelect"),
  projectList: el("projectList"),
  btnAddProject: el("btnAddProject"),
  btnAddProject2: el("btnAddProject2"),

  viewMode: el("viewMode"),
  btnPrev: el("btnPrev"),
  btnNext: el("btnNext"),
  btnToday: el("btnToday"),

  searchInput: el("searchInput"),

  centerTitle: el("centerTitle"),
  centerSub: el("centerSub"),
  calendar: el("calendar"),
  selectedDateLabel: el("selectedDateLabel"),

  dayEntries: el("dayEntries"),
  daySumLabel: el("daySumLabel"),

  // Timer
  activeProjectLabel: el("activeProjectLabel"),
  timerDisplay: el("timerDisplay"),
  timerNote: el("timerNote"),
  btnStart: el("btnStart"),
  btnPause: el("btnPause"),
  btnStop: el("btnStop"),

  // Manual
  btnAddManual: el("btnAddManual"),
  manualForm: el("manualForm"),
  mDate: el("mDate"),
  mStart: el("mStart"),
  mEnd: el("mEnd"),
  mBreak: el("mBreak"),
  mNote: el("mNote"),

  // Stats
  statToday: el("statToday"),
  statWeek: el("statWeek"),
  statMonth: el("statMonth"),
  stat14: el("stat14"),

  // Export/Import/Reset
  btnExport: el("btnExport"),
  fileImport: el("fileImport"),
  btnReset: el("btnReset"),

  // Modal
  modalBackdrop: el("modalBackdrop"),
  modalTitle: el("modalTitle"),
  modalBody: el("modalBody"),
  modalFooter: el("modalFooter"),
  btnCloseModal: el("btnCloseModal")
};

// ---------- Filters ----------
function matchesFilters(entry){
  if(state.activeProjectId && entry.projectId !== state.activeProjectId) return false;
  if(state.search.trim()){
    const s = state.search.trim().toLowerCase();
    const proj = projectById(entry.projectId)?.name?.toLowerCase() ?? "";
    const note = (entry.note ?? "").toLowerCase();
    if(!proj.includes(s) && !note.includes(s)) return false;
  }
  return true;
}

function projectById(id){
  return state.data.projects.find(p=>p.id===id) ?? null;
}

// ---------- Rendering ----------
function renderAll(){
  renderProjects();
  renderTopProjectSelect();
  renderCalendar();
  renderDayEntries();
  renderStats();
  syncTimerUI();
  save();
}

function renderProjects(){
  dom.projectList.innerHTML = "";
  for(const p of state.data.projects){
    const div = document.createElement("div");
    div.className = "item" + (p.id===state.activeProjectId ? " active" : "");
    div.innerHTML = `
      <div class="meta">
        <div class="name">${escapeHtml(p.name)}</div>
        <div class="sub">${countProjectHours(p.id)}</div>
      </div>
      <div class="tools">
        <button class="mini-btn" title="Umbenennen">✎</button>
        <button class="mini-btn" title="Löschen">🗑️</button>
      </div>
    `;
    div.addEventListener("click", (ev)=>{
      // ignore clicks on buttons -> handled below
      if(ev.target.closest("button")) return;
      state.activeProjectId = p.id;
      renderAll();
    });

    const [btnRename, btnDel] = div.querySelectorAll("button");
    btnRename.addEventListener("click", ()=>{
      openProjectRename(p.id);
    });
    btnDel.addEventListener("click", ()=>{
      openProjectDelete(p.id);
    });

    dom.projectList.appendChild(div);
  }
  dom.activeProjectLabel.textContent = projectById(state.activeProjectId)?.name ?? "—";
}

function renderTopProjectSelect(){
  dom.projectSelect.innerHTML = "";
  for(const p of state.data.projects){
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    dom.projectSelect.appendChild(opt);
  }
  if(state.activeProjectId) dom.projectSelect.value = state.activeProjectId;
}

function renderCalendar(){
  const mode = state.viewMode;
  dom.calendar.className = "calendar " + mode;

  const c = new Date(state.cursorDate);

  if(mode==="month"){
    const monthStart = new Date(c.getFullYear(), c.getMonth(), 1);
    const gridStart = weekStart(monthStart);
    const grid = [];
    for(let i=0;i<42;i++){
      const d = new Date(gridStart);
      d.setDate(d.getDate()+i);
      grid.push(d);
    }

    dom.centerTitle.textContent = "Kalender";
    dom.centerSub.textContent = c.toLocaleDateString("de-DE", { month:"long", year:"numeric" });

    dom.calendar.innerHTML = "";
    const heads = ["Mo","Di","Mi","Do","Fr","Sa","So"];
    for(const h of heads){
      const head = document.createElement("div");
      head.className = "cal-head";
      head.textContent = h;
      dom.calendar.appendChild(head);
    }

    for(const d of grid){
      dom.calendar.appendChild(dayCell(d, d.getMonth()!==c.getMonth()));
    }
  }

  if(mode==="week"){
    const ws = weekStart(c);
    const days = [];
    for(let i=0;i<7;i++){
      const d = new Date(ws); d.setDate(d.getDate()+i);
      days.push(d);
    }
    dom.centerTitle.textContent = "Woche";
    dom.centerSub.textContent = `${fmtShort(days[0])} – ${fmtShort(days[6])}`;

    dom.calendar.innerHTML = "";
    const heads = ["Mo","Di","Mi","Do","Fr","Sa","So"];
    for(let i=0;i<7;i++){
      const head = document.createElement("div");
      head.className = "cal-head";
      head.textContent = heads[i];
      dom.calendar.appendChild(head);
    }
    for(const d of days){
      dom.calendar.appendChild(dayCell(d, false));
    }
  }

  if(mode==="day"){
    dom.centerTitle.textContent = "Tag";
    dom.centerSub.textContent = fmtDate(state.selectedDate);
    dom.calendar.innerHTML = "";
    dom.calendar.appendChild(dayCell(state.selectedDate, false, true));
  }

  dom.selectedDateLabel.textContent = fmtDate(state.selectedDate);
}

function dayCell(date, isOut, big=false){
  const div = document.createElement("div");
  div.className = "daycell" + (isOut ? " out" : "") + (sameDay(date, state.selectedDate) ? " selected" : "");
  const sumMs = sumForDay(date);
  const cnt = countEntriesForDay(date);
  div.innerHTML = `
    <div class="date">${date.getDate()}</div>
    <div class="badge">${cnt}×</div>
    <div class="sum">${msToHhmm(sumMs)} h</div>
  `;
  if(big){
    div.style.minHeight = "120px";
  }
  div.addEventListener("click", ()=>{
    state.selectedDate = startOfDay(date);
    if(state.viewMode === "day"){
      state.cursorDate = new Date(state.selectedDate);
    }
    renderAll();
  });
  return div;
}

function renderDayEntries(){
  const d = state.selectedDate;
  const entries = state.data.entries
    .filter(e=> sameDay(new Date(e.startTs), d))
    .filter(matchesFilters)
    .sort((a,b)=>a.startTs-b.startTs);

  dom.dayEntries.innerHTML = "";
  if(entries.length===0){
    const empty = document.createElement("div");
    empty.className = "hint";
    empty.textContent = "Keine Einträge für diesen Tag (mit aktuellem Filter).";
    dom.dayEntries.appendChild(empty);
  }else{
    for(const e of entries){
      const proj = projectById(e.projectId)?.name ?? "—";
      const durMs = Math.max(0, e.endTs - e.startTs - (e.breakMin*60000));
      const row = document.createElement("div");
      row.className = "entry";
      row.innerHTML = `
        <div>
          <div class="line1">
            <div class="proj">${escapeHtml(proj)}</div>
            <div class="time">${fmtTime(e.startTs)}–${fmtTime(e.endTs)} • Pause ${e.breakMin} min</div>
          </div>
          <div class="note">${escapeHtml(e.note || "")}</div>
        </div>
        <div>
          <div class="dur">${msToHhmm(durMs)} h</div>
          <div class="btns">
            <button class="mini-btn" title="Bearbeiten">✎</button>
            <button class="mini-btn" title="Löschen">🗑️</button>
          </div>
        </div>
      `;
      const [btnEdit, btnDel] = row.querySelectorAll("button");
      btnEdit.addEventListener("click", ()=> openEntryEdit(e.id));
      btnDel.addEventListener("click", ()=> openEntryDelete(e.id));

      dom.dayEntries.appendChild(row);
    }
  }

  dom.daySumLabel.textContent = `${msToHhmm(sumForDay(d))} h`;
}

function renderStats(){
  const today = startOfDay(new Date());
  dom.statToday.textContent = msToHhmm(sumForDay(today));

  const ws = weekStart(new Date());
  dom.statWeek.textContent = msToHhmm(sumRange(ws, addDays(ws,7)));

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth()+1, 1);
  dom.statMonth.textContent = msToHhmm(sumRange(monthStart, nextMonth));

  const d14 = addDays(today, -13);
  dom.stat14.textContent = msToHhmm(sumRange(d14, addDays(today,1)));
}

function addDays(d, n){
  const x = new Date(d); x.setDate(x.getDate()+n); return x;
}

// ---------- Summaries ----------
function sumForDay(day){
  const d0 = startOfDay(day);
  const d1 = addDays(d0, 1);
  return sumRange(d0, d1);
}

function sumRange(from, to){
  let ms = 0;
  for(const e of state.data.entries){
    const st = new Date(e.startTs);
    if(st >= from && st < to && matchesFilters(e)){
      ms += Math.max(0, e.endTs - e.startTs - (e.breakMin*60000));
    }
  }
  return ms;
}

function countEntriesForDay(day){
  const d0 = startOfDay(day);
  const d1 = addDays(d0, 1);
  return state.data.entries.filter(e=>{
    const st = new Date(e.startTs);
    return st>=d0 && st<d1 && matchesFilters(e);
  }).length;
}

function countProjectHours(projectId){
  const ms = state.data.entries
    .filter(e=>e.projectId===projectId)
    .reduce((acc,e)=> acc + Math.max(0, e.endTs - e.startTs - (e.breakMin*60000)), 0);
  return msToHhmm(ms) + " h gesamt";
}

// ---------- Timer ----------
let timerTick = null;

function syncTimerUI(){
  const t = state.timer;
  dom.timerNote.value = t.note || "";

  dom.btnStart.disabled = t.running && !t.paused;
  dom.btnPause.disabled = !t.running;
  dom.btnStop.disabled = !t.running;

  if(!t.running){
    dom.timerDisplay.textContent = "00:00:00";
    if(timerTick){ clearInterval(timerTick); timerTick=null; }
    return;
  }
  if(!timerTick){
    timerTick = setInterval(()=> {
      dom.timerDisplay.textContent = msToHhmm(timerElapsedMs());
    }, 250);
  }
  dom.timerDisplay.textContent = msToHhmm(timerElapsedMs());
  dom.btnPause.textContent = t.paused ? "Weiter" : "Pause";
}

function timerElapsedMs(){
  const t = state.timer;
  if(!t.running || !t.startTs) return 0;
  const now = Date.now();
  const base = (t.paused ? t.pauseTs : now) - t.startTs;
  return base - t.pausedMs;
}

function timerStart(){
  const projId = state.activeProjectId;
  if(!projId){
    alert("Bitte zuerst ein Projekt auswählen.");
    return;
  }
  const t = state.timer;
  t.running = true;
  t.paused = false;
  t.startTs = Date.now();
  t.pauseTs = null;
  t.pausedMs = 0;
  t.projectId = projId;
  t.note = dom.timerNote.value.trim();
  syncTimerUI();
}

function timerTogglePause(){
  const t = state.timer;
  if(!t.running) return;
  if(!t.paused){
    t.paused = true;
    t.pauseTs = Date.now();
  }else{
    t.paused = false;
    const now = Date.now();
    t.pausedMs += (now - t.pauseTs);
    t.pauseTs = null;
  }
  syncTimerUI();
}

function timerStop(){
  const t = state.timer;
  if(!t.running) return;

  // finalize pausedMs if paused
  if(t.paused && t.pauseTs){
    t.pausedMs += (Date.now() - t.pauseTs);
  }

  const endTs = Date.now();
  const durMs = timerElapsedMs();
  if(durMs < 60000){
    // under 1 min: confirm
    openModal(
      "Eintrag sehr kurz",
      `Der Timer lief nur ${msToHhmmss(durMs)}. Trotzdem speichern?`,
      [
        { text:"Abbrechen", cls:"btn ghost", onClick: closeModal },
        { text:"Speichern", cls:"btn", onClick: ()=>{ closeModal(); commitTimer(endTs); } }
      ]
    );
  }else{
    commitTimer(endTs);
  }
}

function commitTimer(endTs){
  const t = state.timer;
  const entry = {
    id: uid(),
    projectId: t.projectId,
    startTs: t.startTs,
    endTs,
    breakMin: Math.round(t.pausedMs/60000),
    note: dom.timerNote.value.trim()
  };
  state.data.entries.push(entry);

  // reset timer
  state.timer = {
    running:false, paused:false, startTs:null, pauseTs:null, pausedMs:0, projectId:null, note:""
  };
  dom.timerNote.value = "";
  syncTimerUI();
  renderAll();
}

// ---------- Manual entry ----------
function manualDefault(){
  dom.mDate.valueAsDate = new Date(state.selectedDate);
  dom.mStart.value = "09:00";
  dom.mEnd.value = "17:00";
  dom.mBreak.value = 0;
  dom.mNote.value = "";
}

function submitManual(ev){
  ev.preventDefault();
  const projId = state.activeProjectId;
  if(!projId){ alert("Bitte Projekt wählen."); return; }

  const d = dom.mDate.value;
  const s = dom.mStart.value;
  const e = dom.mEnd.value;
  if(!d || !s || !e){ alert("Datum/Start/Ende ausfüllen."); return; }

  const startTs = new Date(`${d}T${s}:00`).getTime();
  const endTs = new Date(`${d}T${e}:00`).getTime();
  if(endTs <= startTs){
    alert("Ende muss nach Start liegen.");
    return;
  }

  const breakMin = clamp(parseInt(dom.mBreak.value||"0",10), 0, 600);
  state.data.entries.push({
    id: uid(),
    projectId: projId,
    startTs,
    endTs,
    breakMin,
    note: dom.mNote.value.trim()
  });

  state.selectedDate = startOfDay(new Date(startTs));
  renderAll();
}

// ---------- Entry edit/delete ----------
function openEntryDelete(entryId){
  openModal(
    "Eintrag löschen?",
    "Dieser Zeiteintrag wird dauerhaft entfernt (lokal).",
    [
      { text:"Abbrechen", cls:"btn ghost", onClick: closeModal },
      { text:"Löschen", cls:"btn danger", onClick: ()=>{
        state.data.entries = state.data.entries.filter(x=>x.id!==entryId);
        closeModal(); renderAll();
      }}
    ]
  );
}

function openEntryEdit(entryId){
  const e = state.data.entries.find(x=>x.id===entryId);
  if(!e) return;

  const proj = projectById(e.projectId)?.name ?? "—";
  const d = new Date(e.startTs);
  const dateStr = d.toISOString().slice(0,10);
  const startStr = new Date(e.startTs).toTimeString().slice(0,5);
  const endStr = new Date(e.endTs).toTimeString().slice(0,5);

  const body = document.createElement("div");
  body.innerHTML = `
    <div style="margin-bottom:10px; color: rgba(255,255,255,.7); font-size:12px;">
      Projekt: <b>${escapeHtml(proj)}</b>
    </div>
    <div class="form-row">
      <label>Datum</label>
      <input id="eeDate" type="date" value="${dateStr}" />
    </div>
    <div class="form-row two" style="margin-top:10px;">
      <div>
        <label>Start</label>
        <input id="eeStart" type="time" value="${startStr}" />
      </div>
      <div>
        <label>Ende</label>
        <input id="eeEnd" type="time" value="${endStr}" />
      </div>
    </div>
    <div class="form-row" style="margin-top:10px;">
      <label>Pause (Min.)</label>
      <input id="eeBreak" type="number" min="0" step="5" value="${e.breakMin}" />
    </div>
    <div class="form-row" style="margin-top:10px;">
      <label>Notiz</label>
      <input id="eeNote" type="text" value="${escapeAttr(e.note||"")}" />
    </div>
  `;

  openModal("Eintrag bearbeiten", body, [
    { text:"Abbrechen", cls:"btn ghost", onClick: closeModal },
    { text:"Speichern", cls:"btn", onClick: ()=>{
      const nd = elInModal("eeDate").value;
      const ns = elInModal("eeStart").value;
      const ne = elInModal("eeEnd").value;
      const nb = clamp(parseInt(elInModal("eeBreak").value||"0",10), 0, 600);
      const nn = elInModal("eeNote").value.trim();

      if(!nd || !ns || !ne){ alert("Datum/Start/Ende ausfüllen."); return; }
      const nStart = new Date(`${nd}T${ns}:00`).getTime();
      const nEnd = new Date(`${nd}T${ne}:00`).getTime();
      if(nEnd <= nStart){ alert("Ende muss nach Start liegen."); return; }

      e.startTs = nStart;
      e.endTs = nEnd;
      e.breakMin = nb;
      e.note = nn;

      state.selectedDate = startOfDay(new Date(nStart));
      closeModal();
      renderAll();
    }}
  ]);
}

function elInModal(id){ return document.getElementById(id); }

// ---------- Project modals ----------
function openProjectRename(projectId){
  const p = projectById(projectId);
  if(!p) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="form-row">
      <label>Name</label>
      <input id="prName" type="text" value="${escapeAttr(p.name)}" />
    </div>
  `;

  openModal("Projekt umbenennen", wrap, [
    { text:"Abbrechen", cls:"btn ghost", onClick: closeModal },
    { text:"Speichern", cls:"btn", onClick: ()=>{
      const name = elInModal("prName").value.trim();
      if(!name){ alert("Name darf nicht leer sein."); return; }
      p.name = name;
      closeModal(); renderAll();
    }}
  ]);
}

function openProjectDelete(projectId){
  const p = projectById(projectId);
  if(!p) return;

  const hasEntries = state.data.entries.some(e=>e.projectId===projectId);
  const msg = hasEntries
    ? "Dieses Projekt hat Einträge. Beim Löschen werden diese Einträge ebenfalls gelöscht."
    : "Projekt wirklich löschen?";

  openModal("Projekt löschen?", msg, [
    { text:"Abbrechen", cls:"btn ghost", onClick: closeModal },
    { text:"Löschen", cls:"btn danger", onClick: ()=>{
      state.data.projects = state.data.projects.filter(x=>x.id!==projectId);
      state.data.entries = state.data.entries.filter(e=>e.projectId!==projectId);
      if(state.activeProjectId===projectId){
        state.activeProjectId = state.data.projects[0]?.id ?? null;
      }
      closeModal(); renderAll();
    }}
  ]);
}

function openProjectAdd(){
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <div class="form-row">
      <label>Projektname</label>
      <input id="paName" type="text" placeholder="z.B. AVöD Planung, Workshop, Doku…" />
    </div>
  `;
  openModal("Neues Projekt", wrap, [
    { text:"Abbrechen", cls:"btn ghost", onClick: closeModal },
    { text:"Anlegen", cls:"btn", onClick: ()=>{
      const name = elInModal("paName").value.trim();
      if(!name){ alert("Bitte Name eingeben."); return; }
      const p = { id: uid(), name, color:"accent" };
      state.data.projects.push(p);
      state.activeProjectId = p.id;
      closeModal(); renderAll();
    }}
  ]);
}

// ---------- Navigation (prev/next/today) ----------
function stepCursor(dir){
  const m = state.viewMode;
  const c = new Date(state.cursorDate);

  if(m==="month"){
    c.setMonth(c.getMonth()+dir);
  }else if(m==="week"){
    c.setDate(c.getDate()+7*dir);
  }else{
    c.setDate(c.getDate()+dir);
    state.selectedDate = startOfDay(c);
  }
  state.cursorDate = c;
  renderAll();
}

// ---------- Export/Import/Reset ----------
function exportJson(){
  const payload = {
    exportedAt: new Date().toISOString(),
    app: "BWK-Zeiterfassung",
    version: "0.1",
    data: state.data
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:"application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `bwk-zeiterfassung-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJsonFile(file){
  const reader = new FileReader();
  reader.onload = ()=>{
    try{
      const obj = JSON.parse(reader.result);
      const data = obj.data ?? obj;
      if(!data.projects || !data.entries) throw new Error("Format ungültig");
      state.data = data;
      state.activeProjectId = state.data.projects[0]?.id ?? null;
      closeModal();
      renderAll();
    }catch(e){
      alert("Import fehlgeschlagen: " + e.message);
    }
  };
  reader.readAsText(file);
}

function resetAll(){
  openModal(
    "Alles zurücksetzen?",
    "Das löscht alle lokalen Projekte und Einträge auf diesem Gerät (LocalStorage). Export vorher empfohlen.",
    [
      { text:"Abbrechen", cls:"btn ghost", onClick: closeModal },
      { text:"Zurücksetzen", cls:"btn danger", onClick: ()=>{
        localStorage.removeItem(STORAGE_KEY);
        location.reload();
      }}
    ]
  );
}

// ---------- Modal ----------
function openModal(title, body, actions){
  dom.modalTitle.textContent = title;
  dom.modalBody.innerHTML = "";
  if(typeof body === "string"){
    const p = document.createElement("div");
    p.textContent = body;
    dom.modalBody.appendChild(p);
  }else{
    dom.modalBody.appendChild(body);
  }

  dom.modalFooter.innerHTML = "";
  for(const a of actions){
    const b = document.createElement("button");
    b.className = a.cls || "btn";
    b.textContent = a.text;
    b.addEventListener("click", a.onClick);
    dom.modalFooter.appendChild(b);
  }

  dom.modalBackdrop.classList.remove("hidden");
}
function closeModal(){
  dom.modalBackdrop.classList.add("hidden");
}

// ---------- Escaping ----------
function escapeHtml(str){
  return (str ?? "").replace(/[&<>"']/g, m=>({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[m]));
}
function escapeAttr(str){ return escapeHtml(str).replace(/"/g, "&quot;"); }

// ---------- Events ----------
function bindEvents(){
  dom.btnToggleSidebar.addEventListener("click", ()=>{
    dom.sidebar.classList.toggle("open");
  });

  dom.btnAddProject.addEventListener("click", openProjectAdd);
  dom.btnAddProject2.addEventListener("click", openProjectAdd);

  dom.projectSelect.addEventListener("change", ()=>{
    state.activeProjectId = dom.projectSelect.value;
    renderAll();
  });

  dom.viewMode.addEventListener("change", ()=>{
    state.viewMode = dom.viewMode.value;
    renderAll();
  });

  dom.btnPrev.addEventListener("click", ()=> stepCursor(-1));
  dom.btnNext.addEventListener("click", ()=> stepCursor(1));
  dom.btnToday.addEventListener("click", ()=>{
    state.cursorDate = new Date();
    state.selectedDate = startOfDay(new Date());
    renderAll();
  });

  dom.searchInput.addEventListener("input", ()=>{
    state.search = dom.searchInput.value;
    renderAll();
  });

  dom.timerNote.addEventListener("input", ()=>{
    state.timer.note = dom.timerNote.value;
  });

  dom.btnStart.addEventListener("click", timerStart);
  dom.btnPause.addEventListener("click", timerTogglePause);
  dom.btnStop.addEventListener("click", timerStop);

  dom.btnAddManual.addEventListener("click", ()=>{
    manualDefault();
    dom.mDate.focus();
  });

  dom.manualForm.addEventListener("submit", submitManual);

  dom.btnExport.addEventListener("click", exportJson);
  dom.fileImport.addEventListener("change", ()=>{
    const f = dom.fileImport.files?.[0];
    if(!f) return;
    openModal("Import", "Datei wird importiert…", [{text:"OK", cls:"btn", onClick: closeModal}]);
    importJsonFile(f);
    dom.fileImport.value = "";
  });

  dom.btnReset.addEventListener("click", resetAll);

  dom.btnCloseModal.addEventListener("click", closeModal);
  dom.modalBackdrop.addEventListener("click", (ev)=>{
    if(ev.target === dom.modalBackdrop) closeModal();
  });

  // keyboard: space start/pause, shift+space stop
  window.addEventListener("keydown", (ev)=>{
    if(ev.target && ["INPUT","TEXTAREA","SELECT"].includes(ev.target.tagName)) return;
    if(ev.code === "Space"){
      ev.preventDefault();
      if(ev.shiftKey){
        if(state.timer.running) timerStop();
      }else{
        if(!state.timer.running) timerStart();
        else timerTogglePause();
      }
    }
  });
}

// ---------- Init ----------
function init(){
  load();
  bindEvents();
  dom.viewMode.value = state.viewMode;
  dom.searchInput.value = state.search || "";
  manualDefault();
  renderAll();
}
init();
