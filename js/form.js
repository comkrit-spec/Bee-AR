  /* ======================================================================
    form.js — state ของฟอร์ม, นาฬิกา/กะ, โหมดถุงมือ, กำลังพล, timeline/เวลา, รูปถ่าย, GPS, เปิด-ปิดส่วนฟอร์ม, บันทึกร่างอัตโนมัติ, toast, dialog
  ====================================================================== */
  /* ============ STATE ============ */
  const form = $('dataForm');
  const SUBMIT_HTML = $('submitBtn').innerHTML;
  let googleScriptUrl = EMBEDDED_URL || store.get(KEYS.url) || '';
  if (EMBEDDED_URL) store.del(KEYS.url);   // ล้าง URL เก่าที่ค้างในเครื่อง ป้องกันส่งไปผิดที่
  // ค่าตั้งต้นกลางจากเซิร์ฟเวอร์ (แท็บ Config) และรายชื่อหลัก จำไว้ในเครื่องเผื่อออฟไลน์
  let serverCfg = store.getJSON(KEYS.cfg) || {}, serverVersion = '';
  let masterLocs = (store.getJSON(KEYS.jobList) || {}).locations || [], peopleDir = (store.getJSON(KEYS.jobList) || {}).people || [];
  const server = { state: (IS_GAS || googleScriptUrl) ? 'checking' : 'nourl', latency: null, lastOk: null, lastCheck: null, info: null, outdated: false, err: '' };
  let timelineState = { warns: 0, total: 0 };
  let lastSummary = '';
  let photos = [];          // รูปใหม่ (data URL) ที่จะส่ง
  let editing = null;       // { sid, item } ขณะแก้ไขรายการเดิม
  let sessionPin = '';      // PIN ฝั่งเซิร์ฟเวอร์ที่ใส่ถูกแล้วในรอบนี้

  /* ============ LOGIN ด้วยรหัสพนักงาน (ภาคบังคับ) + บทบาท user/admin ============ */
  // อยู่ต้นไฟล์ form.js (ไม่ใช่ submit.js เหมือนตอนแรก) เพราะ prefillBasics() ด้านล่างเรียก applyEmployeeLock() ทันทีตั้งแต่ form.js เริ่มทำงาน
  // ต้องมีฟังก์ชันนี้พร้อมใช้ก่อนบรรทัดนั้น ไม่งั้น form.js ทั้งไฟล์จะพังตั้งแต่ต้น (เคยเกิดปัญหานี้มาแล้ว)
  // ตรวจกับเซิร์ฟเวอร์ก่อนเสมอเมื่อออนไลน์ (ได้ role ล่าสุดแน่นอน) ออฟไลน์ค่อย fallback ไปเทียบกับรายชื่อที่แคชไว้ในเครื่อง (เหมือนการค้นหา Job)
  // role=admin ที่ได้จากการ login นี้ จะใช้เปิดเครื่องมือผู้ดูแล/ทำรายการสำคัญได้ทันทีโดยไม่ต้องใส่ PIN ซ้ำ (ดู callWithPin ใน sync.js)
  const normEmpCode_ = v => String(v || '').trim().toLowerCase();
  function hasEmployeeDirectory() { return peopleDir.some(p => p.code); }
  function getEmpIdentity() { return store.getJSON(KEYS.emp); }
  function setEmpIdentity(v) { store.setJSON(KEYS.emp, v); }
  function clearEmpIdentity() { store.del(KEYS.emp); }
  function isAdminIdentity() { const id = getEmpIdentity(); return !!(id && id.role === 'admin'); }
  function empMatch(raw) {
    const code = normEmpCode_(raw);
    if (!code) return null;
    let hit = peopleDir.find(p => p.code && normEmpCode_(p.code) === code);
    if (!hit && /^\d+$/.test(code)) {                         // ยอมรับเลข 0 นำหน้าต่างกัน เช่น 007 เทียบเท่า 7
      const n = String(parseInt(code, 10));
      hit = peopleDir.find(p => p.code && /^\d+$/.test(p.code) && String(parseInt(p.code, 10)) === n);
    }
    return hit || null;
  }
  // ล็อกช่องชื่อผู้รายงานด้วยตัวตนที่ล็อกอินไว้ (ยกเว้นระหว่างแก้ไขรายการเดิม ซึ่งต้องแสดงชื่อเจ้าของรายการนั้น ไม่ใช่ผู้ใช้เครื่องนี้)
  function applyEmployeeLock() {
    const id = getEmpIdentity(), input = $('reporterName');
    const locked = !!(id && id.name && !editing);
    input.readOnly = locked;
    input.classList.toggle('ro-field', locked);
    if (locked) input.value = id.name;
    renderEmpLine();
    renderEmpSettingsRow();
  }
  function renderEmpLine() {
    const id = getEmpIdentity(), el = $('empLine');
    if (id && id.name && !editing) {
      el.hidden = false;
      el.innerHTML = `${ic('check-circle')}<span>เข้าสู่ระบบ: <b>${escapeHTML(id.name)}</b>${id.role === 'admin' ? ' <span class="adm-chip">admin</span>' : ''}</span><button type="button" class="link-btn" onclick="empLogout()">ออกจากระบบ</button>`;
    } else el.hidden = true;
  }
  function renderEmpSettingsRow() {
    const id = getEmpIdentity();
    $('empSettingsRow').hidden = false;
    $('empSettingsText').textContent = id && id.name ? `เข้าสู่ระบบ: ${id.name}${id.code ? ` (${id.code})` : ''}${id.role === 'admin' ? ' · admin' : ''}` : 'ยังไม่เข้าสู่ระบบ';
    const btn = $('empSettingsBtn');
    btn.textContent = 'ออกจากระบบ / เปลี่ยนผู้ใช้';
    btn.onclick = () => { closeSettings(); empLogout(); };
  }
  function markEmpInvalid(msg) {
    $('empLoginErr').hidden = false;
    $('empLoginErr').textContent = msg;
    $('empCodeInput').classList.add('invalid');
    haptic(15);
  }
  function openEmpLogin() {
    $('empLoginErr').hidden = true;
    $('empCodeInput').value = '';
    $('empCodeInput').classList.remove('invalid');
    $('empLoginModal').classList.add('active');
    setTimeout(() => $('empCodeInput').focus(), 150);
  }
  function closeEmpLogin() { $('empLoginModal').classList.remove('active'); }
  function finishEmpLogin(name, role) {
    closeEmpLogin();
    applyEmployeeLock();
    refreshForm(); scheduleDraftSave();
    showToast(`เข้าสู่ระบบ: ${name}${role === 'admin' ? ' (admin)' : ''}`, 'success');
    playSound('success');
  }
  async function submitEmpLogin() {
    const raw = $('empCodeInput').value.trim();
    if (!raw) return markEmpInvalid('กรุณาใส่รหัสพนักงาน');
    const btn = $('empLoginBtn'), orig = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      if (hasBackend() && navigator.onLine) {
        try {
          const r = await api('employeeLogin', { code: raw }, { timeout: 10000 });
          setEmpIdentity({ code: r.code, name: r.name, role: r.role || 'user' });
          return finishEmpLogin(r.name, r.role);
        } catch (err) {
          if (err.code === 'EMPLOYEE_NOT_FOUND') return markEmpInvalid('ไม่พบรหัสพนักงานนี้ หรือถูกปิดใช้งานแล้ว ตรวจรหัสอีกครั้ง หรือติดต่อผู้ดูแล');
          if (err.code === 'NO_DIRECTORY') return markEmpInvalid('ยังไม่มีรายชื่อพนักงานในระบบ ให้ผู้ดูแลกด "เข้าด้วย PIN" ด้านล่างเพื่อตั้งค่าเริ่มต้น');
          // ปัญหาเครือข่าย/เซิร์ฟเวอร์ไม่ตอบ: ลองจากรายชื่อที่แคชไว้ในเครื่องแทน (ใช้งานหน้างานแบบออฟไลน์)
        }
      }
      const hit = empMatch(raw);
      if (!hit) return markEmpInvalid(navigator.onLine ? 'ไม่พบรหัสพนักงานนี้ในระบบ ตรวจรหัสอีกครั้ง หรือติดต่อผู้ดูแล' : 'ไม่พบรหัสนี้ในรายชื่อที่เครื่องเคยซิงก์ไว้ (ตอนนี้ออฟไลน์) ลองใหม่เมื่อมีเน็ต');
      setEmpIdentity({ code: hit.code, name: hit.name, role: hit.role || 'user' });
      finishEmpLogin(hit.name, hit.role);
    } finally { btn.disabled = false; btn.innerHTML = orig; }
  }
  // ทางเข้าสำรองสำหรับผู้ดูแล: ใช้ PIN เดิม (ADMIN_PINS) ตอนยังไม่มีใครตั้ง role=admin ไว้ในชีต People เลย หรือลืมรหัสพนักงานตัวเอง
  async function loginViaPin() {
    if (!hasBackend()) { showToast('ตั้งค่า URL ของระบบก่อน', 'error'); return openSettings(); }
    const pin = await askPin('ใส่ PIN ผู้ดูแล (เฉพาะระดับ admin)');
    if (pin === null) return;
    try {
      const r = await api('adminLogin', { pin });
      setEmpIdentity({ code: '', name: r.name, role: 'admin' });
      finishEmpLogin(r.name, 'admin');
    } catch (err) { showToast(err.message || 'PIN ไม่ถูกต้อง', 'error', 5000); }
  }
  function empLogout() { clearEmpIdentity(); applyEmployeeLock(); showToast('ออกจากระบบแล้ว', 'info', 2500); openEmpLogin(); }
  $('empCodeInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitEmpLogin(); } });
  $('empCodeInput').addEventListener('input', () => { $('empCodeInput').classList.remove('invalid'); $('empLoginErr').hidden = true; });
  // บังคับ login ก่อนใช้แอปเสมอ: เครื่องนี้มีตัวตนค้างไว้แล้ว (จนกว่าจะออกจากระบบ) ก็ผ่านไปได้เลย ไม่งั้นต้องกรอกรหัสพนักงานก่อนเสมอ
  function enforceLogin() {
    if (getEmpIdentity()) { renderEmpSettingsRow(); return; }
    if ($('empLoginModal').classList.contains('active') || $('settingsModal').classList.contains('active')) return;
    openEmpLogin();
  }

  // เติมข้อมูลเริ่มต้นเฉพาะเมื่อผู้ใช้เปิด "เติมข้อมูลให้อัตโนมัติ" ไม่เช่นนั้นทุกช่องว่าง
  function prefillBasics() {
    const on = autofillOn();
    $('reporterName').value = on ? (store.get(KEYS.reporter) || '') : '';
    $('jobNo').value = on ? (store.get(KEYS.job) || '') : '';
    $('siteLocation').value = on ? (store.get(KEYS.loc) || '') : '';
    $('currentDate').value = on ? todayLocal() : '';
    autoSelectShift();
    applyEmployeeLock();
  }
  // เพิ่งเปิดสวิตช์: เติมเฉพาะช่องที่ยังว่าง ไม่ทับสิ่งที่กรอกไว้
  function applyAutofillNow() {
    if (!autofillOn()) return;
    if (!$('reporterName').value) $('reporterName').value = store.get(KEYS.reporter) || '';
    if (!$('jobNo').value) $('jobNo').value = store.get(KEYS.job) || '';
    if (!$('siteLocation').value && sectionOn('location')) $('siteLocation').value = store.get(KEYS.loc) || '';
    if (!$('currentDate').value) $('currentDate').value = todayLocal();
    if (!form.querySelector('input[name="shift"]:checked')) autoSelectShift();
    applyEmployeeLock();
    refreshForm(); scheduleDraftSave();
  }
  prefillBasics();

  /* ============ CLOCK + GREETING ============ */
  function tickClock() {
    const d = new Date();
    $('clockHM').textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    $('clockS').textContent = pad(d.getSeconds());
    $('clockDate').textContent = d.toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short' });
    const heroDate = d.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    if ($('heroDate').textContent !== heroDate) $('heroDate').textContent = heroDate;
    const h = d.getHours();
    const g = h < 12 ? 'สวัสดีตอนเช้า' : h < 17 ? 'สวัสดีตอนบ่าย' : h < 21 ? 'สวัสดีตอนเย็น' : 'สวัสดีตอนดึก';
    const name = $('reporterName').value.trim();
    $('greeting').textContent = name ? `${g}, ${name}` : g;
  }
  tickClock();
  setInterval(tickClock, 1000);

  /* ============ SHIFT + THEME ============ */
  // ใช้ธีมสว่างแบบเดิมเสมอ ไม่เปลี่ยนตามกะ
  function applyTheme() {
    document.documentElement.dataset.theme = 'light';
  }
  function autoSelectShift() {
    if (autofillOn()) {
      const h = new Date().getHours();
      const shift = (h >= DAY_START && h < DAY_END) ? 'Day' : 'Night';
      (shift === 'Day' ? $('shiftDay') : $('shiftNight')).checked = true;
      $('shiftHint').textContent = 'เลือกให้อัตโนมัติตามเวลาตอนนี้ เปลี่ยนได้';
    } else {
      $('shiftDay').checked = false; $('shiftNight').checked = false;
      $('shiftHint').textContent = '';
    }
    applyTheme();
  }
  document.querySelectorAll('input[name="shift"]').forEach(r => r.addEventListener('change', () => {
    applyTheme(r.value);
    $('shiftHint').textContent = '';
    haptic();
  }));
  autoSelectShift();

  /* ============ GLOVE MODE ============ */
  function setGlove(on) {
    document.documentElement.toggleAttribute('data-glove', on);
    $('gloveBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
    store.set(KEYS.glove, on ? '1' : '');
    requestAnimationFrame(updateTimeline);
  }
  function toggleGlove() {
    const on = !document.documentElement.hasAttribute('data-glove');
    setGlove(on);
    showToast(on ? 'เปิดโหมดถุงมือ: ปุ่มใหญ่ขึ้น สีชัดขึ้น' : 'ปิดโหมดถุงมือแล้ว', 'info', 2500);
  }
  if (store.get(KEYS.glove)) setGlove(true);

  /* ============ MANPOWER + PRESETS ============ */
  const manpowerInputs = [...document.querySelectorAll('#manpower-list input[type="number"]')];
  const totalBadge = $('total-manpower');
  let lastTotal = 0;
  function calculateTotalManpower() {
    let total = 0;
    manpowerInputs.forEach(input => {
      total += (parseInt(input.value) || 0);
      input.closest('.stepper').classList.toggle('has-value', input.value !== '');
    });
    totalBadge.textContent = `รวม ${total} คน`;
    totalBadge.style.background = total > 0 ? 'var(--tw-red)' : 'var(--muted)';
    if (total !== lastTotal) {
      totalBadge.classList.remove('bump'); void totalBadge.offsetWidth; totalBadge.classList.add('bump');
    }
    lastTotal = total;
    return total;
  }
  $('manpower-list').addEventListener('click', e => {
    const btn = e.target.closest('.step-btn');
    if (!btn) return;
    const input = form.elements[btn.dataset.target];
    const step = Number(btn.dataset.step);
    if (input.value === '' && step < 0) return;
    input.value = Math.max(0, (parseInt(input.value) || 0) + step);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    haptic(8);
  });

  const getPresets = () => store.getJSON(KEYS.presets) || [];
  const presetTotal = p => Object.values(p.values).reduce((s, v) => s + (Number(v) || 0), 0);
  function renderPresets() {
    $('presetRow').innerHTML = getPresets().map((p, i) => `
      <span class="preset">
        <button type="button" class="chip" data-apply="${i}">${ic('users')} ${escapeHTML(p.name)}<small>${presetTotal(p)} คน</small></button>
        <button type="button" class="preset-del" data-del="${i}" aria-label="ลบชุด ${escapeHTML(p.name)}">×</button>
      </span>`).join('') + '<button type="button" class="chip chip-add" data-add="1">+ บันทึกชุดนี้</button>';
  }
  $('presetRow').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const list = getPresets();
    if (b.dataset.apply !== undefined) {
      const p = list[+b.dataset.apply];
      manpowerInputs.forEach(inp => { inp.value = p.values[inp.name] ?? ''; });
      form.dispatchEvent(new Event('input'));
      haptic(12);
      showToast(`ใช้ชุด "${p.name}" แล้ว`, 'success');
    } else if (b.dataset.del !== undefined) {
      const p = list[+b.dataset.del];
      if (await confirmDialog('ลบชุดกำลังพล', `ลบชุด "${p.name}" ออกจากเครื่องนี้`, 'ลบ')) {
        list.splice(+b.dataset.del, 1);
        store.setJSON(KEYS.presets, list);
        renderPresets();
      }
    } else if (b.dataset.add) {
      const values = {};
      manpowerInputs.forEach(inp => { if (inp.value !== '') values[inp.name] = inp.value; });
      if (!Object.keys(values).length) return showToast('กรอกจำนวนกำลังพลก่อน แล้วค่อยบันทึกเป็นชุด', 'error');
      const name = await promptDialog('บันทึกชุดกำลังพล', 'ตั้งชื่อชุดนี้ เช่น ทีมปกติ หรือ ทีมกะดึก', list.length ? '' : 'ทีมปกติ');
      if (!name) return;
      const idx = list.findIndex(p => p.name === name);
      if (idx > -1) list[idx].values = values;
      else if (list.length >= 6) return showToast('บันทึกได้สูงสุด 6 ชุด ลบชุดเก่าก่อน', 'error');
      else list.push({ name, values });
      store.setJSON(KEYS.presets, list);
      renderPresets();
      showToast(`บันทึกชุด "${name}" แล้ว`, 'success');
    }
  });
  renderPresets();

  /* ============ TIMELINE ============ */
  /* ============ TIME INPUT (พิมพ์เอง + ปุ่มเลือกแบบฉลาด) ============ */
  const fmtHM = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
  const addMin = (t, g) => fmtHM(toMin(t) + g);
  const round5 = m => Math.round(m / 5) * 5;
  const fmtGapShort = g => g % 60 === 0 ? `${g / 60}ชม.` : (g > 60 ? `${Math.floor(g / 60)}ชม.${g % 60}น.` : `${g}น.`);
  // แปลงสิ่งที่พิมพ์เป็น HH:MM  รองรับ 2012, 20:12, 20.12, 20 12, 7, 715, 7:5, "20.12 น." (ไม่ถูกต้อง = '')
  function parseTime(raw) {
    const s = String(raw ?? '').trim().replace(/\s*น\.?$/i, '');
    if (!s) return '';
    let h, m;
    const mt = s.match(/^(\d{1,2})\s*[:.,;\s]\s*(\d{1,2})$/);
    if (mt) { h = +mt[1]; m = +mt[2]; }
    else if (/^\d{1,4}$/.test(s)) {
      if (s.length <= 2) { h = +s; m = 0; } else { h = +s.slice(0, -2); m = +s.slice(-2); }
    } else return '';
    return (h >= 0 && h <= 23 && m >= 0 && m <= 59) ? `${pad(h)}:${pad(m)}` : '';
  }
  const timeValues = () => ACTIVITIES.map(([n]) => parseTime($(n).value));
  // เมื่อพิมพ์ครบ 4 หลักล้วน (2012) ใส่ : ให้เอง
  function liveFormatTime(input) {
    if (/^\d{4}$/.test(input.value)) input.value = input.value.slice(0, 2) + ':' + input.value.slice(2);
  }
  // คืน true ถ้าว่างหรือถูกต้อง (แล้วปรับเป็น HH:MM) / false ถ้าพิมพ์มาแต่อ่านไม่ออก
  function commitTime(input) {
    const raw = input.value.trim(), v = parseTime(raw);
    if (v) { input.value = v; input.classList.remove('invalid'); return true; }
    input.classList.toggle('invalid', !!raw);
    return !raw;
  }

  // ประวัติเวลาที่เคยกรอก (เก็บในเครื่อง) ใช้เรียนรู้เวลาที่ใช้บ่อยและช่วงห่างระหว่างขั้นตอน
  let reportRecs = [];   // เวลาจากรายงานที่โหลดมา (ใช้ช่วยให้เครื่องใหม่ได้คำแนะนำที่ดีด้วย)
  function recordTimes(d) {
    const t = {};
    ACTIVITIES.forEach(([n]) => { const v = parseTime(normTime(d[n])); if (v) t[n] = v; });
    return t;
  }
  function learnTimes(d) {
    const t = recordTimes(d);
    if (!Object.keys(t).length) return;
    const hist = (store.getJSON(KEYS.timeHist) || []).slice(-39);
    hist.push({ shift: d.shift, t });
    store.setJSON(KEYS.timeHist, hist);
  }
  function timeRecords() {
    const sh = (form.querySelector('input[name="shift"]:checked') || {}).value;
    const base = reportRecs.length >= 8 ? reportRecs : (store.getJSON(KEYS.timeHist) || []);
    const same = sh ? base.filter(r => String(r.shift).toLowerCase() === sh.toLowerCase()) : base;
    return same.length >= 3 ? same : base;
  }
  // คำแนะนำเวลาของขั้นที่ i: เวลาที่ใช้บ่อย, ต่อจากขั้นก่อน + ช่วงห่างที่มักเกิด, หรือย้อนหลังจากตอนนี้
  function smartTimes(i) {
    const name = ACTIVITIES[i][0], vals = timeValues(), cur = vals[i];
    let pi = -1;
    for (let k = i - 1; k >= 0; k--) if (vals[k]) { pi = k; break; }
    const prev = pi >= 0 ? vals[pi] : '';
    const recs = timeRecords(), out = [];
    const add = (t, tag, kind) => { if (t && t !== cur && !out.some(o => o.t === t)) out.push({ t, tag, kind }); };
    const fwdOk = t => !prev || diffMin(prev, t) !== null;     // ไม่ย้อนเวลาจากขั้นก่อนหน้า
    const counts = {};
    recs.forEach(r => { const t = r.t && r.t[name]; if (t) { const k = fmtHM(round5(toMin(t))); counts[k] = (counts[k] || 0) + 1; } });
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3)
      .forEach(([t, c]) => { if (c >= 2 && fwdOk(t)) add(t, 'บ่อย', 'freq'); });
    if (prev) {
      const pn = ACTIVITIES[pi][0];
      const gaps = recs.map(r => (r.t && r.t[pn] && r.t[name]) ? diffMin(r.t[pn], r.t[name]) : null).filter(g => g !== null).sort((a, b) => a - b);
      if (gaps.length >= 3) { const med = round5(gaps[Math.floor(gaps.length / 2)]); if (med > 0) add(addMin(prev, med), '+' + fmtGapShort(med), 'rel'); }
      [15, 30, 60].forEach(g => add(addMin(prev, g), '+' + fmtGapShort(g), 'rel'));
    } else {
      const n = new Date(), nowM = n.getHours() * 60 + n.getMinutes();
      add(fmtHM(round5(nowM)), 'ใกล้ตอนนี้', 'now');
      add(fmtHM(round5(nowM - 15)), '-15น.', 'ago');
      add(fmtHM(round5(nowM - 30)), '-30น.', 'ago');
    }
    return out.slice(0, 4);
  }
  function renderTimeChips() {
    document.querySelectorAll('.tl-item').forEach((it, i) => {
      const box = it.querySelector('.tl-chips'); if (!box) return;
      const cur = parseTime($(ACTIVITIES[i][0]).value);
      let html = smartTimes(i).map(o => `<button type="button" class="tchip ${o.kind}" data-t="${o.t}" aria-label="ใช้เวลา ${o.t} (${o.tag})">${o.t}<small>${o.tag}</small></button>`).join('');
      if (cur) html += '<button type="button" class="tchip adj" data-adj="-5" aria-label="ลด 5 นาที">−5</button><button type="button" class="tchip adj" data-adj="5" aria-label="เพิ่ม 5 นาที">+5</button>';
      if (box.dataset.sig !== html) { box.innerHTML = html; box.dataset.sig = html; }   // ไม่วาดซ้ำถ้าเหมือนเดิม กันปุ่มหายตอนกำลังกด
    });
  }
  function setTimeValue(input, v) {
    input.value = v; input.classList.remove('invalid');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    haptic(10);
  }
  const tlList = $('tlList');
  tlList.addEventListener('input', e => { const t = e.target; if (t.classList.contains('time-input')) { t.classList.remove('invalid'); liveFormatTime(t); } });
  tlList.addEventListener('focusin', e => { if (e.target.classList.contains('time-input')) { try { e.target.select(); } catch (_) {} } requestAnimationFrame(layoutTrack); });
  tlList.addEventListener('focusout', e => {
    if (e.target.classList.contains('time-input')) { commitTime(e.target); refreshForm(); scheduleDraftSave(); }
    requestAnimationFrame(layoutTrack);
  });
  tlList.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.classList.contains('time-input')) return;
    e.preventDefault();                                   // Enter ไม่ส่งฟอร์ม แต่ไปช่องเวลาถัดไป
    commitTime(e.target);
    const inputs = [...tlList.querySelectorAll('.time-input')], nx = inputs[inputs.indexOf(e.target) + 1];
    nx ? nx.focus() : e.target.blur();
  });
  tlList.addEventListener('mousedown', e => { if (e.target.closest('.tchip')) e.preventDefault(); });   // กดปุ่มแล้วช่องพิมพ์ไม่เสียโฟกัส
  tlList.addEventListener('click', e => {
    const b = e.target.closest('.tchip'); if (!b) return;
    const idx = [...document.querySelectorAll('.tl-item')].indexOf(b.closest('.tl-item'));
    const input = $(ACTIVITIES[idx][0]);
    let v = b.dataset.t;
    if (b.dataset.adj) { const cur = parseTime(input.value); if (!cur) return; v = addMin(cur, Number(b.dataset.adj)); }
    setTimeValue(input, v);
  });
  $('dateChips').addEventListener('click', e => {
    const b = e.target.closest('[data-day]'); if (!b) return;
    const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.day));
    $('currentDate').value = ymd(d);
    $('currentDate').dispatchEvent(new Event('input', { bubbles: true }));
    haptic(8);
  });

  /* ============ TIMELINE ============ */
  let tlLastDone = -1;
  function layoutTrack() {
    const items = [...document.querySelectorAll('.tl-item')];
    if (!items.length) return;
    $('tlTrack').style.height = items[items.length - 1].offsetTop + 'px';
    $('tlFill').style.height = tlLastDone >= 0 ? items[tlLastDone].offsetTop + 'px' : '0';
  }
  function updateTimeline() {
    const items = [...document.querySelectorAll('.tl-item')];
    const res = analyzeTimes(timeValues());
    let doneCount = 0; tlLastDone = -1;
    items.forEach((it, i) => {
      const r = res.items[i], bad = $(ACTIVITIES[i][0]).classList.contains('invalid');
      it.classList.toggle('done', r.done && !r.warn);
      it.classList.toggle('warn', r.warn);
      it.classList.toggle('bad', bad);
      it.classList.remove('next');
      it.querySelector('.tl-gap').textContent = bad ? 'พิมพ์ เช่น 07:00 หรือ 0700' : (r.warn ? 'เวลาก่อนขั้นก่อนหน้า' : (r.gap !== null ? fmtDur(r.gap) : ''));
      if (r.done) { tlLastDone = i; doneCount++; }
    });
    const nextIdx = res.items.findIndex(r => !r.done);
    if (nextIdx > -1) items[nextIdx].classList.add('next');
    const badge = $('tl-count');
    badge.textContent = res.warns ? `ตรวจเวลา ${res.warns} จุด` : (doneCount > 1 ? `${doneCount}/${items.length}, ${fmtDur(res.total, false)}` : `${doneCount}/${items.length}`);
    badge.style.background = res.warns ? '#F59E0B' : doneCount === items.length ? '#10B981' : 'var(--tw-blue)';
    timelineState = res;
    renderTimeChips();
    layoutTrack();
  }
  // เปิด picker นาฬิกาของเครื่อง (input type=time ที่ซ่อนไว้) แล้วซิงก์ค่ากลับเข้าช่องพิมพ์เวลาเดิม ผ่าน setTimeValue (จุดเดียวกับที่ชิปแนะนำเวลาใช้)
  function pickTime(inputId) {
    const text = $(inputId), native = $(inputId + '_t');
    if (!native) return;
    native.value = /^\d{2}:\d{2}$/.test(text.value) ? text.value : '';
    if (typeof native.showPicker === 'function') { try { return native.showPicker(); } catch (_) {} }
    native.focus(); native.click();   // เบราว์เซอร์ที่ไม่รองรับ showPicker(): เปิดผ่านการโฟกัส/คลิกแทน
  }
  tlList.addEventListener('change', e => {
    if (!e.target.classList.contains('time-native') || !e.target.value) return;
    setTimeValue($(e.target.id.replace(/_t$/, '')), e.target.value);
  });
  function setCurrentTime(inputId) {
    const input = $(inputId);
    if (!input) return;
    const now = new Date();
    input.value = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    haptic(15);
    showToast(`บันทึกเวลา ${input.value} แล้ว`, 'success');
  }
  window.addEventListener('resize', updateTimeline);

  /* ============ PHOTOS ============ */
  function compressImage(file, maxSide = 1280, quality = 0.6) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', quality));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('อ่านรูปไม่ได้')); };
      img.src = url;
    });
  }
  function renderPhotos() {
    const room = MAX_PHOTOS - photos.length;
    $('photoGrid').innerHTML = photos.map((src, i) => `
      <div class="photo-thumb"><img src="${src}" alt="รูปที่ ${i + 1}"><button type="button" data-rm="${i}" aria-label="ลบรูปที่ ${i + 1}">×</button></div>`).join('') +
      (room > 0 ? `<label class="photo-add" for="photoInput">${ic('camera')}<span>ถ่าย/เลือกรูป</span></label>` : '');
    $('photoCount').textContent = `${photos.length}/${MAX_PHOTOS}`;
  }
  $('photoGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-rm]');
    if (!b) return;
    photos.splice(+b.dataset.rm, 1);
    renderPhotos(); scheduleDraftSave();
  });
  $('photoInput').addEventListener('change', async e => {
    const files = [...e.target.files].slice(0, MAX_PHOTOS - photos.length);
    e.target.value = '';
    if (!files.length) return;
    const add = document.querySelector('.photo-add');
    add && add.classList.add('busy');
    for (const f of files) {
      try { photos.push(await compressImage(f)); } catch (err) { showToast(err.message, 'error'); }
    }
    renderPhotos(); scheduleDraftSave();
    haptic(10);
  });
  renderPhotos();

  /* ============ GPS ============ */

  /* ============ PROGRESS ============ */
  function updateProgress() {
    const fields = [
      $('reporterName').value.trim(), $('jobNo').value.trim(), $('currentDate').value,
      form.querySelector('input[name="shift"]:checked') ? '1' : '',
      ...(sectionOn('location') ? [$('siteLocation').value.trim()] : []),
      ...(sectionOn('manpower') ? manpowerInputs.map(i => i.value) : []),
      ...(sectionOn('times') ? timeValues() : [])
    ];
    const pct = Math.round(fields.filter(Boolean).length / fields.length * 100);
    $('formProgress').style.width = pct + '%';
    $('formProgress').classList.toggle('complete', pct === 100);
  }

  /* ============ FORM SECTIONS (เปิด/ปิดส่วนของฟอร์ม) ============ */
  const SECTIONS = [
    { key: 'basic',    label: 'ข้อมูลเบื้องต้น', desc: 'ชื่อผู้รายงาน, วันที่, กะ (ต้องมีเสมอ)', locked: true },
    { key: 'location', label: 'สถานที่',        desc: 'ชื่อสถานที่และพิกัด GPS (ช่อง Job No. แสดงเสมอ)' },
    { key: 'manpower', label: 'กำลังพล',        desc: 'จำนวนคนแยกตามตำแหน่ง' },
    { key: 'times',    label: 'เวลา (Activity)', desc: 'เวลาของแต่ละขั้นตอน' },
    { key: 'photos',   label: 'รูปถ่าย',         desc: 'แนบรูปหน้างาน' }
  ];
  function getSections() {
    const base = Object.assign({}, DEFAULT_SECTIONS);
    ['location', 'manpower', 'times', 'photos'].forEach(k => { if (typeof serverCfg['sections_' + k] === 'boolean') base[k] = serverCfg['sections_' + k]; });
    return serverCfg.sections_locked ? base : Object.assign(base, store.getJSON(KEYS.sections) || {});   // ผู้ดูแลล็อก = ใช้ค่ากลางอย่างเดียว
  }
  // ขณะแก้ไขรายการเดิม แสดงทุกส่วนเสมอ เพื่อไม่ให้ข้อมูลของส่วนที่ซ่อนถูกทับเป็นค่าว่าง
  const sectionOn = key => { const s = SECTIONS.find(x => x.key === key); return !!(editing || (s && s.locked) || (key === 'location' && serverCfg.require_location) || getSections()[key]); };
  function sectionHasData(key) {
    if (key === 'location') return !!$('siteLocation').value.trim();
    if (key === 'manpower') return manpowerInputs.some(i => i.value !== '');
    if (key === 'times') return ACTIVITIES.some(([n]) => $(n).value);
    if (key === 'photos') return photos.length > 0;
    return false;
  }
  function clearSection(key) {
    if (key === 'location') { $('siteLocation').value = ''; }
    if (key === 'manpower') manpowerInputs.forEach(i => { i.value = ''; });
    if (key === 'times') ACTIVITIES.forEach(([n]) => { $(n).value = ''; $(n).classList.remove('invalid'); });
    if (key === 'photos') { photos = []; renderPhotos(); $('existingPhotos').textContent = ''; }
  }
  function applySectionVisibility(clearHidden = false) {
    SECTIONS.forEach(s => {
      const on = sectionOn(s.key);
      document.querySelectorAll(`[data-section="${s.key}"]`).forEach(el => { el.hidden = !on; });
      if (!on && clearHidden) clearSection(s.key);
    });
    // ถ้าซ่อนการ์ดคู่ (กำลังพล/เวลา) ไว้ใบเดียว ให้อีกใบกว้างเต็มแถว
    const man = sectionOn('manpower'), tim = sectionOn('times');
    document.querySelector('[data-section="manpower"]').classList.toggle('full-width', man && !tim);
    document.querySelector('[data-section="times"]').classList.toggle('full-width', tim && !man);
    $('jobCardTitle').textContent = sectionOn('location') ? 'งานและสถานที่' : 'งาน';
    refreshForm();
  }
  function renderSectionSettings() {
    const cfg = getSections(), adminLocked = !!serverCfg.sections_locked;
    $('secLockHint').hidden = !adminLocked;
    $('secList').innerHTML = SECTIONS.map(s => `
      <label class="sec-row">
        <span class="sec-name">${escapeHTML(s.label)}<small>${escapeHTML(s.desc)}</small></span>
        <span class="switch"><input type="checkbox" role="switch" id="sec-${s.key}" ${s.locked || cfg[s.key] ? 'checked' : ''} ${s.locked || adminLocked ? 'disabled' : ''}><span></span></span>
      </label>`).join('');
  }

  /* ============ RECENT LOCATIONS ============ */
  function renderLocList() {
    const all = [...new Set([...masterLocs, ...(store.getJSON(KEYS.locs) || [])])];
    $('locList').innerHTML = all.map(l => `<option value="${escapeHTML(l)}">`).join('');
  }
  function rememberLocation(name, front = true) {
    name = String(name || '').trim();
    if (!name) return;
    let list = store.getJSON(KEYS.locs) || [];
    const has = list.includes(name);
    if (front) list = [name, ...list.filter(x => x !== name)];
    else if (!has) list.push(name);
    store.setJSON(KEYS.locs, list.slice(0, 12));
    renderLocList();
  }
  renderLocList();

  /* ============ DRAFT AUTOSAVE ============ */
  function collectForm() {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = v; });
    return o;
  }
  const hasWork = d => MANPOWER.some(([k]) => d[k]) || ACTIVITIES.some(([k]) => d[k]);
  function setDraftStatus(t) { $('draftStatus').innerHTML = t ? ic('save') + '<span>' + escapeHTML(t) + '</span>' : ''; }
  let draftTimer;
  function scheduleDraftSave() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); }
  function saveDraft() {
    if (editing) return; // ขณะแก้ไขรายการเดิม ไม่ทับร่างที่ค้างไว้
    const data = collectForm();
    if (!hasWork(data) && !photos.length) { store.del(KEYS.draft); setDraftStatus(''); return; }
    const d = new Date(), t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    if (store.setJSON(KEYS.draft, { data, photos, savedAt: Date.now() })) {
      setDraftStatus(`บันทึกร่างในเครื่องแล้ว ${t}`);
    } else {
      store.setJSON(KEYS.draft, { data, photos: [], savedAt: Date.now() });
      setDraftStatus(`บันทึกร่างแล้ว ${t} (ไม่รวมรูป เพราะพื้นที่ในเครื่องไม่พอ)`);
    }
  }
  function fillForm(data) {
    Object.entries(data).forEach(([k, v]) => {
      const el = form.elements[k];
      if (el) el.value = v ?? '';
    });
  }
  function restoreDraft(silent) {
    const draft = store.getJSON(KEYS.draft);
    if (!draft || !draft.data || (!hasWork(draft.data) && !(draft.photos || []).length)) return false;
    fillForm(draft.data);
    ACTIVITIES.forEach(([n]) => commitTime($(n)));
    photos = draft.photos || [];
    renderPhotos();
    if (draft.data.shift) {
      applyTheme(draft.data.shift);
      $('shiftHint').textContent = 'ใช้กะจากข้อมูลที่กรอกค้างไว้';
    }
    const t = new Date(draft.savedAt);
    setDraftStatus(`ร่างล่าสุด ${pad(t.getHours())}:${pad(t.getMinutes())}`);
    if (!silent) setTimeout(() => showToast('กู้คืนข้อมูลที่กรอกค้างไว้แล้ว', 'info'), 400);
    return true;
  }
  function resetWorkFields(keepDraft = false, clearText = false) {
    form.querySelectorAll('input[type="number"], input.time-input, input.time-native, input[type="hidden"]').forEach(input => { input.value = ''; input.classList.remove('invalid'); });
    if (clearText) ['reporterName', 'jobNo', 'siteLocation'].forEach(id => { if (id === 'reporterName' && getEmpIdentity()) return; $(id).value = ''; });
    $('currentDate').value = autofillOn() ? todayLocal() : '';
    photos = [];
    renderPhotos();
    $('existingPhotos').textContent = '';
    autoSelectShift();
    applyEmployeeLock();
    if (!keepDraft) { store.del(KEYS.draft); setDraftStatus(''); }
    refreshForm();
  }
  async function clearForm() {
    const keep = autofillOn(), locked = !!getEmpIdentity();
    const anyText = ['jobNo', 'siteLocation'].concat(locked ? [] : ['reporterName']).some(id => $(id).value.trim());
    if (!hasWork(collectForm()) && !photos.length && (keep || !anyText)) return showToast('ฟอร์มว่างอยู่แล้ว', 'info');
    const msg = keep ? 'ล้างจำนวนกำลังพล เวลา และรูปที่กรอกไว้ ชื่อผู้รายงาน, Job No. และสถานที่ จะยังอยู่'
      : (locked ? 'ล้างข้อมูลที่กรอกไว้ในฟอร์มทั้งหมด (ชื่อผู้รายงานจะคงไว้เพราะเข้าสู่ระบบอยู่)' : 'ล้างข้อมูลที่กรอกไว้ในฟอร์มทั้งหมด');
    const ok = await confirmDialog('ล้างฟอร์ม', msg, 'ล้างฟอร์ม');
    if (ok) { resetWorkFields(false, !keep); showToast('ล้างฟอร์มแล้ว', 'success'); }
  }

  function refreshForm() { calculateTotalManpower(); updateTimeline(); updateProgress(); }
  // บันทึกร่างทันทีเมื่อปิดหรือซ่อนหน้า (เช่น สลับแอป รีโหลด) ไม่ต้องรอ 0.4 วินาที
  document.addEventListener('visibilitychange', () => { if (document.hidden) { clearTimeout(draftTimer); saveDraft(); } });
  window.addEventListener('pagehide', () => { clearTimeout(draftTimer); saveDraft(); });
  form.addEventListener('input', () => { refreshForm(); scheduleDraftSave(); });
  form.addEventListener('change', () => { refreshForm(); scheduleDraftSave(); });
  restoreDraft();
  applySectionVisibility(true);   // ส่วนที่ปิดไว้: ล้างค่าที่ค้างจากร่างเก่า
  document.fonts && document.fonts.ready.then(updateTimeline);

  /* ============ TOAST ============ */
  let toastTimer;
  function showToast(message, type = 'info', ms) {
    const toast = $('toast');
    const icon = type === 'success' ? ic('check-circle') : type === 'error' ? ic('alert') : ic('info');
    toast.innerHTML = `${icon} <span style="font-weight:600;">${escapeHTML(message)}</span>`;
    toast.className = `toast-container toast-${type} show`;
    if (type === 'error') playSound('error');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), ms ?? (type === 'info' ? 5000 : 3000));
  }

  /* ============ DIALOGS ============ */
  function confirmDialog(title, msg, okText = 'ตกลง', inputDefault = null) {
    return new Promise(resolve => {
      const modal = $('confirmModal'), input = $('confirmInput');
      $('confirmTitle').textContent = title;
      $('confirmMsg').textContent = msg;
      $('confirmOk').textContent = okText;
      input.hidden = inputDefault === null;
      input.value = inputDefault ?? '';
      modal.classList.add('active');
      setTimeout(() => (inputDefault === null ? $('confirmOk') : input).focus(), 100);
      const done = v => {
        modal.classList.remove('active');
        $('confirmOk').onclick = $('confirmCancel').onclick = input.onkeydown = null;
        resolve(v);
      };
      $('confirmOk').onclick = () => done(inputDefault === null ? true : input.value.trim());
      $('confirmCancel').onclick = () => done(inputDefault === null ? false : '');
      input.onkeydown = e => { if (e.key === 'Enter') $('confirmOk').click(); };
    });
  }
  const promptDialog = (title, msg, def = '') => confirmDialog(title, msg, 'บันทึก', def);
  function askPin(title = 'ใส่ PIN แอดมิน') {
    return new Promise(resolve => {
      const modal = $('pinModal'), input = $('pinInput');
      $('pinTitle').innerHTML = ic('lock') + '<span>' + escapeHTML(title) + '</span>';
      input.value = '';
      modal.classList.add('active');
      setTimeout(() => input.focus(), 120);
      const done = v => {
        modal.classList.remove('active');
        $('pinOk').onclick = $('pinCancel').onclick = input.onkeydown = null;
        resolve(v);
      };
      $('pinOk').onclick = () => done(input.value);
      $('pinCancel').onclick = () => done(null);
      input.onkeydown = e => { if (e.key === 'Enter') done(input.value); };
    });
  }
  async function hashPin(p) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('field-app:' + p));
      return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
    }
    return 'b64:' + btoa(p);
  }

