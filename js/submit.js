  /* ======================================================================
    submit.js — ล็อกอินพนักงาน (รหัสพนักงาน+บทบาท), รายชื่อ Job, ตั้งค่ากลาง/ประกาศ, ตรวจรายการซ้ำ, สรุป/แชร์, โหมดแก้ไข, ส่งฟอร์ม, หน้าสำเร็จ
  ====================================================================== */
  /* ============ LOGIN ด้วยรหัสพนักงาน (ภาคบังคับ) + บทบาท user/admin ============ */
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

  /* ============ JOB LIST (รายชื่อ Job: พิมพ์แล้วขึ้นรายการที่ตรงกันอัตโนมัติ) ============ */
  const JOB_REFRESH_MS = 10 * 60 * 1000;
  const jobCacheInit = store.getJSON(KEYS.jobList) || {};
  let jobsServer = Array.isArray(jobCacheInit.jobs) ? jobCacheInit.jobs : [], jobsAt = jobCacheInit.at || 0;
  let jobSel = -1, jobShown = [], jobSuppress = false;
  const normJob = v => String(v || '').toLowerCase().replace(/[\s_\-.,/]+/g, '');   // V-20601 / v20601 / "v 20601" ถือว่าเหมือนกัน
  function localJobs() { const h = store.getJSON(KEYS.jobHist) || {}; return Object.keys(h).map(k => ({ job: k, ...h[k] })); }
  function learnJob(d) {
    const job = String(d.job || '').trim(); if (!job) return;
    const h = store.getJSON(KEYS.jobHist) || {};
    const e = h[job] || { location: '', lastDate: '', count: 0 };
    e.count++;
    if (d.location) e.location = d.location;
    if (!e.lastDate || String(d.date) >= e.lastDate) e.lastDate = String(d.date || '');
    h[job] = e;
    const keys = Object.keys(h);
    if (keys.length > 300) keys.sort((a, b) => String(h[a].lastDate).localeCompare(String(h[b].lastDate))).slice(0, keys.length - 300).forEach(k => delete h[k]);
    store.setJSON(KEYS.jobHist, h);
  }
  // รวมรายชื่อจากฐานข้อมูล (ทุกเครื่อง) กับที่เครื่องนี้เพิ่งบันทึก เรียงใหม่สุดก่อน
  function allJobs() {
    const map = new Map();
    jobsServer.forEach(j => map.set(j.job, { ...j }));
    localJobs().forEach(j => {
      const sv = map.get(j.job);
      if (!sv) map.set(j.job, j);
      else if (String(j.lastDate) > String(sv.lastDate)) { sv.lastDate = j.lastDate; if (j.location) sv.location = j.location; }
    });
    return [...map.values()].sort((a, b) => String(b.lastDate).localeCompare(String(a.lastDate)) || (b.count || 0) - (a.count || 0));
  }
  async function loadJobs(force = false) {
    if (!hasBackend() || !navigator.onLine) return;
    if (!force && Date.now() - jobsAt < JOB_REFRESH_MS) return;
    try {
      const r = await api('getJobs', {}, { timeout: 15000 });
      if (r && Array.isArray(r.jobs)) {
        jobsServer = r.jobs; jobsAt = Date.now();
        masterLocs = Array.isArray(r.locations) ? r.locations : []; peopleDir = Array.isArray(r.people) ? r.people : [];
        enforceLogin();
        store.setJSON(KEYS.jobList, { at: jobsAt, jobs: jobsServer, locations: masterLocs, people: peopleDir });
        renderLocList(); renderPeopleList();
      }
    } catch (_) { /* เซิร์ฟเวอร์เวอร์ชันเก่าหรือเชื่อมต่อไม่ได้: ใช้รายการที่จำไว้ในเครื่อง */ }
  }
  function matchJobs(q) {
    const nq = normJob(q);
    let list = allJobs().filter(j => !j.closed || normJob(j.job) === nq);                 // ซ่อน Job ที่ปิดงานแล้ว (ยกเว้นพิมพ์ชื่อตรงทั้งหมด)
    if (serverCfg.restrict_jobs && list.some(j => j.master)) list = list.filter(j => j.master);   // ผู้ดูแลจำกัดเฉพาะรายชื่อหลัก
    if (!nq) return list.slice(0, 6);                                   // ยังไม่พิมพ์: แสดง Job ล่าสุด
    return list.map(j => { const nj = normJob(j.job); return { j, sc: nj === nq ? 0 : nj.startsWith(nq) ? 1 : nj.includes(nq) ? 2 : -1 }; })
      .filter(x => x.sc >= 0).sort((a, b) => a.sc - b.sc).map(x => x.j).slice(0, 6);
  }
  function hideJobSuggest() { $('jobSuggest').hidden = true; $('jobNo').setAttribute('aria-expanded', 'false'); jobSel = -1; }
  function renderJobSuggest() {
    const box = $('jobSuggest'), input = $('jobNo'), q = input.value;
    jobShown = document.activeElement === input ? matchJobs(q) : [];
    if (!jobShown.length) return hideJobSuggest();
    box.innerHTML = (q.trim() ? '' : '<div class="js-head">Job ล่าสุด</div>') + jobShown.map((j, i) => {
      const meta = [j.location && `${ic('pin')} ${escapeHTML(j.location)}`, j.lastDate && `ล่าสุด ${escapeHTML(thaiDate(j.lastDate))}`, j.count && `${j.count} ครั้ง`, j.closed && 'ปิดงานแล้ว'].filter(Boolean).join(' · ');
      return `<button type="button" class="js-item${i === jobSel ? ' sel' : ''}" role="option" data-i="${i}"><b>${escapeHTML(j.job)}</b>${meta ? `<small>${meta}</small>` : ''}</button>`;
    }).join('');
    box.hidden = false; input.setAttribute('aria-expanded', 'true');
  }
  // Job ที่รู้จัก: ใส่สถานที่เดิมให้ (เฉพาะเมื่อช่องสถานที่ยังว่าง)
  function fillLocationFromJob(item) {
    if (!item || !item.location || !sectionOn('location') || $('siteLocation').value.trim()) return false;
    $('siteLocation').value = item.location;
    $('siteLocation').dispatchEvent(new Event('input', { bubbles: true }));
    showToast(`ใส่สถานที่ "${item.location}" ให้แล้ว (จาก Job นี้)`, 'info', 3500);
    return true;
  }
  async function pickJob(item) {
    if (item.closed && !(await confirmDialog('Job นี้ปิดงานแล้ว', `Job ${item.job} ถูกตั้งเป็นปิดงานแล้ว ต้องการใช้ต่อหรือไม่`, 'ใช้ต่อ'))) return;
    jobSuppress = true;
    $('jobNo').value = item.job;
    $('jobNo').dispatchEvent(new Event('input', { bubbles: true }));
    jobSuppress = false;
    hideJobSuggest();
    fillLocationFromJob(item);
    $('jobNo').blur();
  }
  $('jobNo').addEventListener('input', () => { if (jobSuppress) return; jobSel = -1; renderJobSuggest(); });
  $('jobNo').addEventListener('focus', () => { loadJobs(); jobSel = -1; renderJobSuggest(); });
  $('jobNo').addEventListener('blur', () => setTimeout(() => {
    if (document.activeElement === $('jobNo')) return;     // กลับมาแตะช่องอีกแล้ว ไม่ต้องปิดรายการ
    hideJobSuggest();
    const v = normJob($('jobNo').value);
    if (v) fillLocationFromJob(allJobs().find(j => normJob(j.job) === v));   // พิมพ์ชื่อ Job ที่มีอยู่ครบ -> ใส่สถานที่ให้
  }, 120));
  $('jobNo').addEventListener('keydown', e => {
    const open = !$('jobSuggest').hidden;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!open) return renderJobSuggest();
      e.preventDefault();
      jobSel = (jobSel + (e.key === 'ArrowDown' ? 1 : -1) + jobShown.length) % jobShown.length;
      renderJobSuggest();
    } else if (e.key === 'Enter' && open && jobSel >= 0) { e.preventDefault(); pickJob(jobShown[jobSel]); }
    else if (e.key === 'Escape' && open) { e.stopPropagation(); hideJobSuggest(); }
  });
  $('jobSuggest').addEventListener('mousedown', e => e.preventDefault());   // กดเลือกแล้วช่องไม่เสียโฟกัสก่อน
  $('jobSuggest').addEventListener('click', e => { const b = e.target.closest('.js-item'); if (b) pickJob(jobShown[Number(b.dataset.i)]); });
  setTimeout(() => loadJobs(), 1500);
  enforceLogin();   // ใช้ข้อมูลที่แคชไว้จากครั้งก่อนไปก่อน ระหว่างรอโหลดข้อมูลล่าสุด

  /* ============ SERVER CONFIG (ตั้งค่ากลางจากแท็บ Config ใน Sheet) + แถบประกาศ ============ */
  const cmpVer = (a, b) => {
    const x = String(a || '0').split('.').map(Number), y = String(b || '0').split('.').map(Number);
    for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; }
    return 0;
  };
  const annKey = () => `${serverCfg.announcement || ''}|${serverCfg.announcement_until || ''}`;
  function renderBanners() {
    const items = [];
    if (serverCfg.maintenance) items.push({ cls: 'warn', icon: 'alert', html: `<b>ระบบปิดปรับปรุงชั่วคราว</b> ${escapeHTML(serverCfg.maintenance_message || '')} บันทึกได้ ข้อมูลจะเก็บไว้ในเครื่องแล้วส่งให้เมื่อเปิดใช้งาน` });
    if (serverCfg.min_app_version && cmpVer(APP_VERSION, serverCfg.min_app_version) < 0) {
      items.push({ cls: 'upd', icon: 'refresh', html: `<b>มีแอปเวอร์ชันใหม่</b> เครื่องนี้ใช้ ${APP_VERSION} ต้องเป็น ${escapeHTML(serverCfg.min_app_version)} ขึ้นไป`, action: 'refresh' });
    }
    const ann = String(serverCfg.announcement || '').trim(), until = String(serverCfg.announcement_until || '').trim();
    if (ann && (!until || todayLocal() <= until) && store.get(KEYS.ann) !== annKey()) items.push({ cls: 'info', icon: 'info', html: escapeHTML(ann), dismiss: true });
    $('bannerBox').innerHTML = items.map(b => `<div class="banner ${b.cls}" role="status">${ic(b.icon)}<div class="bn-text">${b.html}</div>` +
      (b.action ? '<button type="button" class="bn-btn" data-act="refresh">รีเฟรช</button>' : '') +
      (b.dismiss ? `<button type="button" class="bn-x" data-act="dismiss" aria-label="ปิดประกาศ">${ic('x')}</button>` : '') + '</div>').join('');
  }
  $('bannerBox').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'dismiss') { store.set(KEYS.ann, annKey()); renderBanners(); }
    if (b.dataset.act === 'refresh') { try { const r = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (r) await r.update(); } catch (_) {} location.reload(); }
  });
  function renderPeopleList() {
    const seen = {};
    $('peopleList').innerHTML = peopleDir.filter(p => p.name && !seen[p.name] && (seen[p.name] = 1)).map(p => `<option value="${escapeHTML(p.name)}">`).join('');
  }
  // ส่วนของฟอร์มที่ซ่อนอยู่ (ผู้ดูแลปิดจากส่วนกลาง หรือผู้ใช้ปิดเอง) ไม่ส่งค่าเข้า Sheet
  function stripHiddenFields(d) {
    if (!sectionOn('location')) { d.location = ''; }
    if (!sectionOn('manpower')) MANPOWER.forEach(([k]) => { d[k] = ''; });
    if (!sectionOn('times')) ACTIVITIES.forEach(([k]) => { d[k] = ''; });
    if (!sectionOn('photos')) d.photos = '[]';
  }
  function applyServerConfig() {
    renderBanners();
    applySectionVisibility(false);
    if (!store.get(KEYS.reportLimit) && adminLimit() !== reportLimit) { reportLimit = adminLimit(); renderLimitSeg(); }
    if ($('settingsModal').classList.contains('active')) {      // ห้ามวาดสวิตช์ทับ (ผู้ใช้อาจกดค้างไว้ยังไม่บันทึก) อัปเดตเฉพาะสถานะ "ผู้ดูแลล็อก"
      const locked = !!serverCfg.sections_locked;
      $('secLockHint').hidden = !locked;
      document.querySelectorAll('#secList input').forEach(i => { const sec = SECTIONS.find(x => 'sec-' + x.key === i.id); if (sec && !sec.locked) i.disabled = locked; });
    }
  }
  async function loadConfig() {
    if (!hasBackend() || !navigator.onLine) return;
    try {
      const r = await api('getConfig', {}, { timeout: 12000 });
      if (r && r.config) { serverCfg = r.config; serverVersion = r.version || ''; store.setJSON(KEYS.cfg, r.config); applyServerConfig(); }
    } catch (_) { /* เซิร์ฟเวอร์เวอร์ชันเก่า (ยังไม่มี getConfig) หรือเชื่อมต่อไม่ได้: ใช้ค่าที่จำไว้ */ }
  }

  /* ============ DUPLICATE CHECK ============ */
  function logSent(d) {
    const log = (store.getJSON(KEYS.sent) || []).slice(-199);
    log.push({ job: d.job, date: d.date, shift: d.shift, sid: d.sid, at: Date.now() });
    store.setJSON(KEYS.sent, log);
    learnTimes(d);
    learnJob(d);
  }
  async function findDuplicates(d) {
    const same = r => r.job === d.job && r.date === d.date && r.shift === d.shift && r.sid !== d.sid;
    const local = (store.getJSON(KEYS.sent) || []).some(same) || getQueue().some(i => i.data && same(i.data));
    let remote = 0;
    if (hasBackend() && navigator.onLine) {
      try {
        const r = await api('checkDuplicate', { job: d.job, date: d.date, shift: d.shift, sid: d.sid || '' }, { timeout: 4000 });
        if (r && typeof r.count === 'number') remote = r.count;
      } catch (_) { /* ตรวจที่เซิร์ฟเวอร์ไม่ได้ ใช้ผลในเครื่องแทน */ }
    }
    return { local, remote };
  }

  /* ============ SUMMARY + SHARE ============ */
  function buildSummary(d) {
    const lines = ['รายงานหน้างาน', `Job: ${d.job || '-'}`, `ผู้รายงาน: ${d.reporter || '-'}`, `วันที่: ${thaiDate(d.date)} (${shiftLabel(d.shift)})`];
    if (d.location) lines.push(`สถานที่: ${d.location}`);
    const mp = MANPOWER.filter(([k]) => Number(d[k]) > 0);
    const total = MANPOWER.reduce((s, [k]) => s + (Number(d[k]) || 0), 0);
    if (mp.length) {
      lines.push('', `กำลังพล ${total} คน`);
      mp.forEach(([k, l]) => lines.push(`• ${l}: ${d[k]}`));
    }
    const times = ACTIVITIES.map(([k]) => normTime(d[k]));
    if (times.some(Boolean)) {
      lines.push('', 'เวลาปฏิบัติงาน');
      ACTIVITIES.forEach(([, l], i) => { if (times[i]) lines.push(`• ${l}: ${times[i]}`); });
      const t = analyzeTimes(times);
      if (t.total) lines.push(`รวมเวลา ${fmtDur(t.total, false)}`);
    }
    if (d.lat && d.lng) lines.push('', `พิกัด: https://www.google.com/maps?q=${d.lat},${d.lng}`);
    return lines.join('\n');
  }
  async function shareSummary(text) {
    if (!text) return;
    clearTimeout(successTimer);
    if (navigator.share) {
      try { await navigator.share({ text }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(text); showToast('คัดลอกสรุปแล้ว กำลังเปิด LINE', 'success'); } catch (_) {}
    window.open('https://line.me/R/msg/text/?' + encodeURIComponent(text), '_blank', 'noopener');
  }

  /* ============ EDIT MODE ============ */
  async function startEdit(item) {
    if (!item || !item.sid) return;
    if (!editing && (hasWork(collectForm()) || photos.length)) {
      const ok = await confirmDialog('แก้ไขรายการนี้', 'ข้อมูลที่กรอกค้างในฟอร์มจะถูกพักไว้ และจะกลับมาเมื่อแก้ไขเสร็จหรือกดยกเลิก', 'แก้ไข');
      if (!ok) return;
      clearTimeout(draftTimer); saveDraft();
    }
    editing = { sid: item.sid, item, base: item.updated_at || item.timestamp || '' };
    applySectionVisibility();
    $('reporterName').readOnly = false; $('reporterName').classList.remove('ro-field');
    closeSheet();
    switchTab('form');
    const data = { reporter: item.reporter || '', job: item.job || '', date: String(item.date || '').slice(0, 10), shift: item.shift,
                   location: item.location || '' };
    MANPOWER.forEach(([k]) => { data[k] = item[k] ?? ''; });
    ACTIVITIES.forEach(([k]) => { data[k] = normTime(item[k]); });
    fillForm(data);
    photos = [];
    renderPhotos();
    const oldPhotos = String(item.photos || '').split(',').filter(Boolean).length;
    $('existingPhotos').textContent = oldPhotos ? `มีรูปเดิม ${oldPhotos} รูปใน Drive รูปที่เพิ่มตอนนี้จะถูกต่อท้าย` : '';
    applyTheme(item.shift);
    $('shiftHint').textContent = '';
    $('editInfo').textContent = `${item.job || '-'}, ${thaiDate(item.date)} (${shiftLabel(item.shift)})`;
    $('editBanner').hidden = false;
    $('submitBtn').innerHTML = SUBMIT_HTML.replace('บันทึกส่งข้อมูล', 'บันทึกการแก้ไข');
    setDraftStatus('');
    refreshForm();
  }
  function exitEdit() {
    editing = null;
    $('editBanner').hidden = true;
    $('submitBtn').innerHTML = SUBMIT_HTML;
    resetWorkFields(true, true);
    if (autofillOn()) {
      $('jobNo').value = store.get(KEYS.job) || '';
      $('siteLocation').value = store.get(KEYS.loc) || '';
    }
    applyEmployeeLock();
    restoreDraft(true);
    applySectionVisibility(true);
  }
  function cancelEdit() { exitEdit(); showToast('ยกเลิกการแก้ไขแล้ว', 'info', 2500); }

  async function deleteRecord(item) {
    const ok = await confirmDialog('ลบรายการนี้',
      `ลบ Job ${item.job || '-'} วันที่ ${thaiDate(item.date)} ${shiftLabel(item.shift)} ออกจากรายงาน ระบบย้ายไปถังขยะและบันทึกชื่อผู้ลบไว้ ผู้ดูแลระดับ admin กู้คืนได้ภายใน ${serverCfg.trash_days || 90} วัน`, 'ลบรายการ');
    if (!ok) return;
    try {
      await callWithPin('delete', { sid: item.sid });
      reportData = reportData.filter(r => r.sid !== item.sid);
      reportTotal = Math.max(0, reportTotal - 1);
      closeSheet();
      applyReportFilter();
      showToast('ย้ายรายการไปถังขยะแล้ว (กู้คืนได้โดยผู้ดูแล)', 'success'); playSound('success');
    } catch (err) {
      if (!err.cancelled) showToast(err.message || 'ลบไม่สำเร็จ', 'error', 4500);
    }
  }

  /* ============ SUBMIT ============ */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    if (!hasBackend()) { showToast('ตั้งค่า Script URL ก่อนส่งข้อมูล', 'error'); return openSettings(); }
    for (const [n, label] of ACTIVITIES) {
      const inp = $(n);
      if (!commitTime(inp)) { updateTimeline(); inp.focus(); return showToast(`เวลา "${label}" อ่านไม่ออก พิมพ์ เช่น 07:00 หรือ 0700`, 'error', 4500); }
    }
    if (!form.checkValidity()) {
      const bad = form.querySelector(':invalid');
      bad && bad.focus();
      return showToast('กรอกช่องที่มีเครื่องหมาย * ให้ครบ', 'error');
    }
    const data = collectForm();
    data.sid = editing ? editing.sid : uid();
    data.photos = JSON.stringify(photos);
    stripHiddenFields(data);

    if (timelineState.warns) {
      const ok = await confirmDialog('ลำดับเวลาไม่ถูกต้อง',
        `มี ${timelineState.warns} ขั้นที่เวลาเกิดก่อนขั้นก่อนหน้า (จุดสีส้ม) ตรวจสอบก่อนส่ง หรือส่งต่อถ้าถูกต้องแล้ว`, 'ส่งต่อ');
      if (!ok) { const w = document.querySelector('.tl-item.warn input'); w && w.focus(); return; }
    }

    if (serverCfg.require_location && !String(data.location || '').trim()) { showToast('ผู้ดูแลระบบกำหนดให้ต้องระบุสถานที่', 'error', 4500); $('siteLocation').focus(); return; }
    const jobHit = allJobs().find(j => normJob(j.job) === normJob(data.job));
    if (serverCfg.restrict_jobs && !editing) {
      const allowed = allJobs().filter(j => j.master && !j.closed);
      if (allowed.length && !(jobHit && jobHit.master && !jobHit.closed)) { showToast('Job นี้ไม่อยู่ในรายชื่อที่ผู้ดูแลอนุญาต เลือกจากรายการที่แนะนำ', 'error', 5000); $('jobNo').focus(); return; }
    } else if (jobHit && jobHit.closed && !editing) {
      const ok = await confirmDialog('Job นี้ปิดงานแล้ว', `Job ${data.job} ถูกตั้งเป็นปิดงานแล้ว ต้องการบันทึกต่อหรือไม่`, 'บันทึกต่อ');
      if (!ok) return;
    }
    const submitBtn = $('submitBtn');
    const btnHTML = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner"></span> กำลังตรวจสอบ...';
    const restoreBtn = () => { submitBtn.disabled = false; submitBtn.innerHTML = btnHTML; };

    const dup = await findDuplicates(data);
    if (dup.remote || dup.local) {
      const where = dup.remote ? `ใน Sheet มีรายการนี้แล้ว ${dup.remote} รายการ (รวมจากทุกเครื่อง)` : 'เครื่องนี้เคยส่งรายการนี้ไปแล้ว';
      const ok = await confirmDialog('มีรายการนี้แล้ว',
        `Job ${data.job} วันที่ ${thaiDate(data.date)} ${shiftLabel(data.shift)}: ${where} ต้องการ${editing ? 'บันทึกการแก้ไข' : 'ส่งเพิ่ม'}หรือไม่`,
        editing ? 'บันทึก' : 'ส่งเพิ่ม');
      if (!ok) return restoreBtn();
    }

    submitBtn.innerHTML = `<span class="spinner"></span> ${photos.length ? 'กำลังส่งข้อมูลและรูป...' : 'กำลังส่งข้อมูล...'}`;
    store.set(KEYS.job, data.job);
    store.set(KEYS.reporter, data.reporter);
    store.set(KEYS.loc, data.location || '');
    rememberLocation(data.location);
    const total = calculateTotalManpower();
    const detail = `Job ${escapeHTML(data.job)}<br>${shiftLabel(data.shift)}, กำลังพล ${total} คน` +
      (photos.length ? `, รูป ${photos.length} รูป` : '');
    const summary = buildSummary(data);

    // แก้ไขรายการเดิม: ต้องออนไลน์
    if (editing) {
      data.base = editing.base;     // เวอร์ชันที่เห็นตอนเริ่มแก้ ใช้ตรวจว่ามีคนอื่นแก้ไปก่อนหรือไม่
      const doUpdate = async force => {
        const r = await callWithPin('update', force ? { ...data, force: '1' } : data);
        const sid = editing.sid;
        exitEdit();
        showSuccess(detail, summary, '', 'แก้ไขแล้ว');
        if (reportData.length) reportData = reportData.map(x => x.sid === sid ? { ...x, ...data, photos: x.photos, updated_at: r.updated_at || x.updated_at } : x);
      };
      try {
        await doUpdate(false);
      } catch (err) {
        if (err.code === 'CONFLICT') {
          const ok = await confirmDialog('รายการถูกแก้ไขโดยผู้อื่น', 'มีผู้ใช้อื่นแก้ไขรายการนี้ไปก่อนแล้ว ต้องการเขียนทับด้วยข้อมูลของคุณหรือไม่ (เลือกยกเลิกเพื่อกลับไปดูข้อมูลล่าสุด)', 'เขียนทับ');
          if (ok) { try { await doUpdate(true); } catch (e2) { if (!e2.cancelled) showToast(e2.message || 'แก้ไขไม่สำเร็จ', 'error', 4500); } }
          else { exitEdit(); fetchReport(); }
        } else if (!err.cancelled) showToast(err.network ? 'ต้องออนไลน์เพื่อแก้ไขรายการ' : (err.message || 'แก้ไขไม่สำเร็จ'), 'error', 4500);
      } finally { submitBtn.disabled = false; if (editing) submitBtn.innerHTML = btnHTML; }
      return;
    }

    const queueIt = (kind) => {
      const r = enqueue({ kind: 'single', data });
      if (r === 'fail') return showToast('พื้นที่ในเครื่องเต็ม เก็บรายการไว้ส่งทีหลังไม่ได้ ลองลบรูปออกแล้วส่งใหม่', 'error', 6000);
      logSent(data);
      resetWorkFields(false, !autofillOn());
      const why = kind === 'maintenance' ? 'ระบบปิดปรับปรุงชั่วคราว' : kind === 'busy' ? 'เซิร์ฟเวอร์ไม่ว่าง (มีผู้ใช้พร้อมกันจำนวนมาก)' : kind !== 'offline' ? 'เชื่อมต่อ Apps Script ไม่ได้' : 'ยังไม่มีสัญญาณ';
      showSuccess(detail, summary,
        r === 'nophotos' ? `${why} เก็บข้อมูลไว้ส่งทีหลังแล้ว แต่รูปใหญ่เกินพื้นที่ในเครื่อง รูปจะไม่ถูกส่ง`
                         : `${why} เก็บไว้ในเครื่องแล้ว จะลองส่งใหม่อัตโนมัติ` +
                           (kind !== 'offline' && kind !== 'busy' && kind !== 'maintenance' ? ' ถ้าเกิดซ้ำ เปิดตั้งค่า แล้วกด "ทดสอบการเชื่อมต่อ"' : ''),
        'ยังไม่ได้ส่ง', 'queued');
    };

    try {
      const emp = getEmpIdentity(); if (emp && emp.code) data.empCode = emp.code;
      const res = await apiRetry('submit', data, { onRetry: n => { submitBtn.innerHTML = `<span class="spinner"></span> เซิร์ฟเวอร์ไม่ว่าง กำลังลองใหม่ (${n}/3)...`; } });
      logSent(data);
      resetWorkFields(false, !autofillOn());
      showSuccess(detail, summary, res.unconfirmed ? 'ส่งข้อมูลแล้ว ตรวจสอบได้ที่หน้ารายงาน' : '');
    } catch (err) {
      // ทุกรายการมีรหัสประจำตัว (sid) เซิร์ฟเวอร์จะไม่บันทึกซ้ำ จึงเก็บไว้ลองใหม่ได้อย่างปลอดภัย
      if (err.network) queueIt(err.kind);
      else showToast(err.message || 'ส่งข้อมูลไม่สำเร็จ ลองอีกครั้ง', 'error', 7000);
    } finally {
      restoreBtn();
    }
  });

  /* ============ SUCCESS + CONFETTI ============ */
  let successTimer;
  function showSuccess(detailHTML, summary = '', note = '', title = 'บันทึกแล้ว', sound = 'success') {
    lastSummary = summary;
    document.querySelector('.success-card h3').textContent = title;
    $('successDetail').innerHTML = detailHTML;
    $('successNote').hidden = !note;
    $('successNote').textContent = note;
    $('successShare').hidden = !summary;
    $('successOverlay').classList.add('show');
    haptic([30, 40, 30]);
    playSound(sound);
    if (!reduceMotion) runConfetti();
    clearTimeout(successTimer);
    successTimer = setTimeout(hideSuccess, 8000);
  }
  function hideSuccess() {
    const o = $('successOverlay');
    if (!o.classList.contains('show')) return;
    clearTimeout(successTimer);
    o.classList.remove('show');
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
  }
  function runConfetti() {
    const canvas = $('confetti');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth, H = canvas.clientHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#1E3A8A', '#DC2626', '#FFFFFF', '#9DB8FF', '#F87171'];
    const parts = Array.from({ length: 140 }, () => ({
      x: W / 2, y: H / 2 - 40,
      vx: (Math.random() - 0.5) * 16, vy: -Math.random() * 14 - 4,
      w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      c: colors[Math.floor(Math.random() * colors.length)]
    }));
    const start = performance.now();
    (function frame(t) {
      const el = t - start;
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = Math.max(0, 1 - el / 2400);
      parts.forEach(p => {
        p.vy += 0.38; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)));
        ctx.restore();
      });
      if (el < 2400) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(start);
  }

