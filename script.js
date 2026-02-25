/* BWK Zeiterfassung – script.js
   - local first (localStorage)
   - month view with day cards
   - v0.1
*/

(() => {
  'use strict';

  const STORAGE_KEY = 'bwk_timesheet_v1';
  const APP_VERSION = '0.1';

  const $ = (sel) => document.querySelector(sel);

  const weekdayNames = ['So','Mo','Di','Mi','Do','Fr','Sa'];
  const monthNames = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];

  const stateDefaults = () => ({
    version: APP_VERSION,
    settings: { theme: 'system' }, // system | dark | light
    month: ymToday(),
    requiredHours: 160,
    carryHours: 0,
    days: {} // 'YYYY-MM-DD': { workday, start, end, breakMin, note, open }
  });

  let data = null;
  let saveTimer = null;

  // ---------- Helpers ----------
  function ymToday(){
    const d = new Date();
    return d.toISOString().slice(0,7);
  }

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }
  function pad2(n){ return String(n).padStart(2,'0'); }

  function parseHHMM(s){
    if(!s || typeof s !== 'string') return null;
    const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if(!m) return null;
    return (+m[1])*60 + (+m[2]);
  }

  function formatMin(min){
    const sign = min < 0 ? '-' : '';
    const a = Math.abs(min);
    const h = Math.floor(a/60);
    const m = a % 60;
    return sign + h + ':' + pad2(m);
  }

  function minToDec(min){
    return Math.round((min/60)*100)/100;
  }

  function toast(msg){
    const d = $('#toast');
    $('#toastMsg').textContent = msg;
    if(!d.open) d.showModal();
  }
  function closeToast(){
    const d = $('#toast');
    if(d.open) d.close();
  }

  function applyTheme(){
    const t = data.settings.theme;
    const root = document.documentElement;
    if(t === 'system'){
      root.removeAttribute('data-theme');
      return;
    }
    root.setAttribute('data-theme', t);
  }

  function cycleTheme(){
    const t = data.settings.theme;
    data.settings.theme = (t === 'system') ? 'dark' : (t === 'dark' ? 'light' : 'system');
    applyTheme();
    scheduleSave();
    toast('Theme: ' + data.settings.theme);
  }

  function getMonthMeta(ym){
    const [Y, M] = ym.split('-').map(Number);
    const first = new Date(Y, M-1, 1);
    const last = new Date(Y, M, 0); // last day
    const daysInMonth = last.getDate();
    return { Y, M, first, last, daysInMonth };
  }

  function dateKey(Y, M, D){
    return Y + '-' + pad2(M) + '-' + pad2(D);
  }

  function defaultWorkdayForDate(dateObj){
    const wd = dateObj.getDay(); // 0..6, So..Sa
    return (wd >= 1 && wd <= 5); // Mo–Fr
  }

  function ensureDayDefaults(key){
    if(!data.days[key]) data.days[key] = {};
    const o = data.days[key];
    if(typeof o.workday !== 'boolean'){
      const d = new Date(key + 'T00:00:00');
      o.workday = defaultWorkdayForDate(d);
    }
    if(o.breakMin == null) o.breakMin = 30;
    if(o.note == null) o.note = '';
    if(o.open == null) o.open = false;
    return o;
  }

  function computeDayMinutes(entry){
    const s = parseHHMM(entry.start);
    const e = parseHHMM(entry.end);
    const br = Number(entry.breakMin || 0);
    if(s == null || e == null) return 0;

    let dur = e - s;
    if(dur < 0) dur += 24*60; // overnight shift
    dur -= clamp(br, 0, 24*60);
    return Math.max(0, dur);
  }

  function getMonthKeys(ym){
    const { Y, M, daysInMonth } = getMonthMeta(ym);
    const keys = [];
    for(let d=1; d<=daysInMonth; d++){
      keys.push(dateKey(Y, M, d));
    }
    return keys;
  }

  function scheduleSave(){
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 250);
  }

  function saveNow(){
    saveTimer = null;
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }catch(err){
      console.error(err);
      toast('Speichern fehlgeschlagen (Storage voll?)');
    }
  }

  function load(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      if(!raw) return stateDefaults();
      const obj = JSON.parse(raw);
      return migrate(obj);
    }catch(err){
      console.warn('load failed', err);
      return stateDefaults();
    }
  }

  function migrate(obj){
    if(!obj || typeof obj !== 'object') return stateDefaults();
    if(!obj.version) obj.version = APP_VERSION;
    if(!obj.settings) obj.settings = { theme: 'system' };
    if(!obj.month) obj.month = ymToday();
    if(obj.requiredHours == null) obj.requiredHours = 160;
    if(obj.carryHours == null) obj.carryHours = 0;
    if(!obj.days) obj.days = {};
    return obj;
  }

  // ---------- Rendering ----------
  function render(){
    applyTheme();

    $('#verOut').textContent = APP_VERSION;
    $('#monthPicker').value = data.month;

    const { Y, M } = getMonthMeta(data.month);
    $('#monthTitle').textContent = monthNames[M-1] + ' ' + Y;

    $('#requiredHours').value = data.requiredHours;
    $('#carryHours').value = data.carryHours;

    const keys = getMonthKeys(data.month);
    const list = $('#dayList');
    list.innerHTML = '';

    for(const key of keys){
      const entry = ensureDayDefaults(key);
      const dateObj = new Date(key + 'T00:00:00');
      const wd = dateObj.getDay();
      const min = computeDayMinutes(entry);

      const dayEl = document.createElement('div');
      dayEl.className = 'day' + (entry.open ? ' open' : '');
      dayEl.dataset.key = key;

      const head = document.createElement('div');
      head.className = 'day-head';
      head.innerHTML = `
        <div class="day-left">
          <div class="day-date">
            <div class="d">${key.slice(8,10)}.${pad2(M)}.${String(Y).slice(2)}</div>
            <div class="w">${weekdayNames[wd]}</div>
          </div>
          <div class="badge ${entry.workday ? 'work' : ''}">${entry.workday ? '✓ Arbeitstag' : '– frei'}</div>
        </div>
        <div class="day-right">
          <div class="day-hours">${formatMin(min)}</div>
          <div class="chev" aria-hidden="true">${entry.open ? '▾' : '▸'}</div>
        </div>
      `;

      const body = document.createElement('div');
      body.className = 'day-body';
      body.innerHTML = `
        <div class="day-grid">
          <label class="tog span3" title="Arbeitstag an/aus">
            <input type="checkbox" data-act="workday" ${entry.workday ? 'checked' : ''} />
            <span>Arbeitstag</span>
          </label>

          <label class="field">
            <span>Start</span>
            <input type="time" data-act="start" value="${entry.start || ''}" />
          </label>

          <label class="field">
            <span>Ende</span>
            <input type="time" data-act="end" value="${entry.end || ''}" />
          </label>

          <label class="field">
            <span>Pause (min)</span>
            <input type="number" min="0" step="5" data-act="breakMin" value="${entry.breakMin ?? 0}" />
          </label>

          <label class="field span3">
            <span>Notiz</span>
            <textarea class="note" data-act="note" placeholder="z.B. Dienstreise, Workshop, Homeoffice…">${escapeHtml(entry.note || '')}</textarea>
          </label>
        </div>

        <div class="day-actions">
          <button class="btn ghost" data-act="clear">Eintrag löschen</button>
          <button class="btn" data-act="collapse">Zuklappen</button>
        </div>
      `;

      head.addEventListener('click', () => {
        entry.open = !entry.open;
        scheduleSave();
        render();
      });

      body.addEventListener('input', (e) => {
        const t = e.target;
        if(!(t instanceof HTMLElement)) return;
        const act = t.getAttribute('data-act');
        if(!act) return;

        if(act === 'workday' && t instanceof HTMLInputElement){
          entry.workday = !!t.checked;
        }else if(act === 'start' && t instanceof HTMLInputElement){
          entry.start = t.value || '';
        }else if(act === 'end' && t instanceof HTMLInputElement){
          entry.end = t.value || '';
        }else if(act === 'breakMin' && t instanceof HTMLInputElement){
          entry.breakMin = (t.value === '' ? 0 : Number(t.value));
        }else if(act === 'note' && t instanceof HTMLTextAreaElement){
          entry.note = t.value || '';
        }

        data.days[key] = entry;
        scheduleSave();
        updateSummaryOnly();

        const newMin = computeDayMinutes(entry);
        head.querySelector('.day-hours').textContent = formatMin(newMin);
      });

      body.addEventListener('click', (e) => {
        const t = e.target;
        if(!(t instanceof HTMLElement)) return;
        const act = t.getAttribute('data-act');
        if(!act) return;

        if(act === 'clear'){
          entry.start = '';
          entry.end = '';
          entry.note = '';
          data.days[key] = entry;
          scheduleSave();
          render();
          toast('Eintrag gelöscht');
        }
        if(act === 'collapse'){
          entry.open = false;
          data.days[key] = entry;
          scheduleSave();
          render();
        }
      });

      dayEl.appendChild(head);
      dayEl.appendChild(body);
      list.appendChild(dayEl);
    }

    updateSummaryOnly();
  }

  function escapeHtml(s){
    return String(s)
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'","&#039;");
  }

  function getMonthTotals(){
    const keys = getMonthKeys(data.month);
    let worked = 0;
    let remainingPlanned = 0;

    for(const key of keys){
      const entry = ensureDayDefaults(key);
      const min = computeDayMinutes(entry);
      worked += min;

      const hasEntry = !!(entry.start && entry.end);
      if(entry.workday && !hasEntry) remainingPlanned++;
    }

    const target = Math.round(Number(data.requiredHours || 0) * 60);
    const carry = Math.round(Number(data.carryHours || 0) * 60);
    const diff = worked - target;
    const rest = Math.max(0, target - worked);
    const perDay = remainingPlanned > 0 ? Math.round(rest / remainingPlanned) : null;
    const saldo = (worked + carry) - target;

    return { worked, target, diff, rest, perDay, remainingPlanned, carry, saldo };
  }

  function updateSummaryOnly(){
    const t = getMonthTotals();

    $('#workedOut').textContent = formatMin(t.worked);
    $('#targetOut').textContent = formatMin(t.target);
    $('#diffOut').textContent = formatMin(t.diff);
    $('#restOut').textContent = formatMin(t.rest);
    $('#saldoOut').textContent = formatMin(t.saldo);

    $('#perDayOut').textContent = (t.perDay == null)
      ? '–'
      : (formatMin(t.perDay) + ` (${t.remainingPlanned} Tage)`);

    const diffEl = $('#diffOut');
    diffEl.style.color = '';
    if(t.diff > 0) diffEl.style.color = 'rgba(var(--accent-rgb), .95)';
  }

  // ---------- Actions ----------
  function applyWeekdays(){
    const keys = getMonthKeys(data.month);
    for(const key of keys){
      const d = new Date(key + 'T00:00:00');
      const entry = ensureDayDefaults(key);
      entry.workday = defaultWorkdayForDate(d);
      data.days[key] = entry;
    }
    scheduleSave();
    render();
    toast('Mo–Fr gesetzt');
  }

  function clearMonth(){
    const keys = new Set(getMonthKeys(data.month));
    for(const k of Object.keys(data.days)){
      if(keys.has(k)) delete data.days[k];
    }
    scheduleSave();
    render();
    toast('Monat geleert');
  }

  function downloadBlob(blob, filename){
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  function exportJson(){
    const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
    downloadBlob(blob, 'bwk-zeiterfassung_' + data.month + '.json');
  }

  function exportCsv(){
    const keys = getMonthKeys(data.month);
    const rows = [
      ['date','weekday','workday','start','end','breakMin','minutes','hoursDec','note'].join(',')
    ];

    for(const key of keys){
      const e = ensureDayDefaults(key);
      const d = new Date(key + 'T00:00:00');
      const wd = weekdayNames[d.getDay()];
      const min = computeDayMinutes(e);
      const note = (e.note || '').replaceAll('"','""');
      rows.push([
        key,
        wd,
        e.workday ? '1' : '0',
        e.start || '',
        e.end || '',
        String(e.breakMin ?? 0),
        String(min),
        String(minToDec(min)),
        '"' + note + '"'
      ].join(','));
    }

    const blob = new Blob([rows.join('\n')], {type: 'text/csv'});
    downloadBlob(blob, 'bwk-zeiterfassung_' + data.month + '.csv');
  }

  async function importJsonFile(file){
    const text = await file.text();
    let obj = null;
    try{
      obj = JSON.parse(text);
    }catch{
      toast('Ungültiges JSON');
      return;
    }
    data = migrate(obj);
    applyTheme();
    saveNow();
    render();
    toast('Import ok');
  }

  // ---------- Wire up ----------
  function init(){
    data = load();

    $('#themeBtn').addEventListener('click', cycleTheme);
    $('#toastClose').addEventListener('click', closeToast);
    $('#toast').addEventListener('click', (e) => { if(e.target === $('#toast')) closeToast(); });

    $('#monthPicker').addEventListener('change', (e) => {
      data.month = e.target.value || ymToday();
      scheduleSave();
      render();
    });

    $('#requiredHours').addEventListener('input', (e) => {
      data.requiredHours = Number(e.target.value || 0);
      scheduleSave();
      updateSummaryOnly();
    });

    $('#carryHours').addEventListener('input', (e) => {
      data.carryHours = Number(e.target.value || 0);
      scheduleSave();
      updateSummaryOnly();
    });

    $('#applyWeekdaysBtn').addEventListener('click', applyWeekdays);
    $('#clearMonthBtn').addEventListener('click', clearMonth);
    $('#exportJsonBtn').addEventListener('click', exportJson);
    $('#exportCsvBtn').addEventListener('click', exportCsv);

    $('#importFile').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      await importJsonFile(f);
      e.target.value = '';
    });

    render();
  }

  init();
})();
