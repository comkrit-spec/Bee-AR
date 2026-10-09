  /* ======================================================================
    admin.js — แจ้งเตือน Close Permit, ศูนย์ผู้ดูแลระบบ, PWA (ติดตั้งแอป/อัปเดต)
  ====================================================================== */
  /* ============ REMINDERS ============ */
  function updateRemindBtn() {
    const on = store.get(KEYS.remindOn) === '1';
    $('remindBtn').innerHTML = ic('bell') + (on ? ' เปิดการแจ้งเตือนอยู่ (แตะเพื่อปิด)' : ' เปิดการแจ้งเตือน');
  }
  async function toggleReminders() {
    if (store.get(KEYS.remindOn) === '1') {
      store.set(KEYS.remindOn, '');
      updateRemindBtn();
      return showToast('ปิดการแจ้งเตือนแล้ว', 'info', 2500);
    }
    store.set(KEYS.remindOn, '1');
    if ('Notification' in window && Notification.permission !== 'granted') {
      try { await Notification.requestPermission(); } catch (_) {}
    }
    updateRemindBtn();
    const sys = 'Notification' in window && Notification.permission === 'granted';
    showToast(sys ? 'เปิดการแจ้งเตือนแล้ว' : 'เปิดแล้ว (เตือนเป็นข้อความในแอป เพราะเบราว์เซอร์ไม่อนุญาตการแจ้งเตือน)', 'success', 4000);
  }
  function notify(title, body) {
    showToast(title, 'info', 8000);
    playSound('alert');
    haptic([60, 60, 60]);
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const opts = { body, icon: 'icon-192.png', tag: 'field-remind' };
    const fallback = () => { try { new Notification(title, opts); } catch (_) {} };
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
      navigator.serviceWorker.getRegistration().then(r => r ? r.showNotification(title, opts) : fallback()).catch(fallback);
    } else fallback();
  }
  function checkReminder() {
    if (store.get(KEYS.remindOn) !== '1' || editing) return;
    const d = collectForm();
    if (!hasWork(d) || d.close_permit) return;
    const win = REMIND_WINDOW[d.shift];
    if (!win) return;
    const now = new Date(), m = now.getHours() * 60 + now.getMinutes();
    if (m < win[0] || m > win[1]) return;
    const key = `${todayLocal()}:${d.shift}`;
    if (store.get(KEYS.reminded) === key) return;
    store.set(KEYS.reminded, key);
    notify('ยังไม่ได้บันทึก Close Permit', `Job ${d.job || '-'} ${shiftLabel(d.shift)} มีข้อมูลค้างในฟอร์ม กรอกเวลาที่เหลือแล้วกดส่ง`);
  }
  updateRemindBtn();
  setInterval(checkReminder, 60000);
  setTimeout(checkReminder, 5000);

  if (EMBEDDED_URL && !IS_GAS && urlProblem(EMBEDDED_URL)) {
    setTimeout(() => showToast('URL ที่ฝังใน index.html ไม่ถูกต้อง (ต้องลงท้ายด้วย /exec) กดตั้งค่า แล้วกด "ทดสอบการเชื่อมต่อ"', 'error', 9000), 900);
  }

  /* ============ ADMIN CENTER (ศูนย์ผู้ดูแลระบบ) ============ */
  const ACTION_LABEL = { update: 'แก้ไข', delete: 'ลบ', restore: 'กู้คืน', config: 'ตั้งค่า', backup: 'สำรองข้อมูล', job: 'รายชื่อ Job', purge: 'ล้างถังขยะ' };
  const FIELD_LABEL = (() => {
    const o = { reporter: 'ผู้รายงาน', job: 'Job', date: 'วันที่', shift: 'กะ', location: 'สถานที่', lat: 'ละติจูด', lng: 'ลองจิจูด', acc: 'ความแม่นยำ', photos: 'รูป', status: 'สถานะ', daily: 'รายงานทุกวัน' };
    Object.assign(o, { announcement: 'ข้อความประกาศ', announcement_until: 'ประกาศถึงวันที่', maintenance: 'โหมดปิดปรับปรุง', maintenance_message: 'ข้อความปิดปรับปรุง', min_app_version: 'เวอร์ชันแอปต่ำสุด',
      sections_location: 'ส่วนสถานที่', sections_manpower: 'ส่วนกำลังพล', sections_times: 'ส่วนเวลา', sections_photos: 'ส่วนรูปถ่าย', sections_locked: 'ล็อกส่วนของฟอร์ม', require_location: 'บังคับกรอกสถานที่', admin_require_pin: 'admin ต้องใส่ PIN ซ้ำ',
      restrict_jobs: 'จำกัดเฉพาะ Job ในรายชื่อ', report_default_limit: 'จำนวนรายงานเริ่มต้น', lock_days: 'ล็อกงวด (วัน)', trash_days: 'เก็บถังขยะ (วัน)', backup_keep: 'จำนวนไฟล์สำรอง', daily_summary_hour: 'เวลาสรุป LINE', error_alert: 'แจ้งเตือนข้อผิดพลาด' });
    MANPOWER.concat(ACTIVITIES).forEach(([k, l]) => { o[k] = l; });
    return o;
  })();
  let adminInfo = null, admJobsCount = null, adminLastUrl = '';
  async function adm(action, payload = {}) {
    try { return await callWithPin(action, payload); }
    catch (e) { if (!e.cancelled) showToast(e.message || 'ทำรายการไม่สำเร็จ', 'error', 5000); throw e; }
  }
  async function openAdmin() {
    if (!hasBackend()) { showToast('ตั้งค่า URL ของระบบก่อน', 'error'); return openSettings(); }
    try { adminInfo = await callWithPin('adminLogin', {}); }
    catch (err) { if (!err.cancelled) showToast(err.message || 'เข้าศูนย์ผู้ดูแลไม่ได้', 'error', 5000); return; }
    $('adminWho').textContent = `${adminInfo.name}${adminInfo.email ? ' · ' + adminInfo.email : ''}`;
    renderAdminShell();
    closeSettings();   // เปิดมาจากหน้าตั้งค่า: ปิดหน้าตั้งค่าก่อนแล้วค่อยแสดงศูนย์ผู้ดูแล
    switchTab('admin');
    loadAdminStats();
  }
  function closeAdmin() { switchTab('form'); }
  const swRow = (id, label, desc) => `<label class="sec-row"><span class="sec-name">${label}${desc ? `<small>${desc}</small>` : ''}</span><span class="switch"><input type="checkbox" role="switch" id="${id}"><span></span></span></label>`;
  const admSec = (id, icon, title, inner, open) => `<details class="adm-sec" id="adm-${id}"${open ? ' open' : ''}><summary>${ic(icon)}<span>${title}</span></summary><div class="adm-body">${inner}</div></details>`;
  function renderAdminShell() {
    $('adminBody').innerHTML =
      admSec('stats', 'server', 'สถานะระบบและการสำรองข้อมูล', '<div id="admStats"></div>', true) +
      admSec('announce', 'bell', 'ประกาศและโหมดปิดปรับปรุง', `
        <div class="form-group"><label for="admAnn">ข้อความประกาศ (แสดงบนหน้าแอปของทุกเครื่อง)</label><input type="text" id="admAnn" maxlength="300" placeholder="เช่น พรุ่งนี้หยุดทำการ / ย้ายจุดรวมพล"></div>
        <div class="form-group"><label for="admAnnUntil">แสดงถึงวันที่ (ไม่บังคับ)</label><input type="date" id="admAnnUntil"></div>
        <div class="sec-list">${swRow('admMaint', 'โหมดปิดปรับปรุง', 'แอปยังกดบันทึกได้ แต่เก็บไว้ในเครื่องก่อน แล้วส่งให้เมื่อเปิดใช้งาน')}</div>
        <div class="form-group" style="margin-top: 10px;"><label for="admMaintMsg">ข้อความตอนปิดปรับปรุง</label><input type="text" id="admMaintMsg" maxlength="200"></div>
        <button type="button" class="btn-primary" data-act="saveAnnounce" style="padding: 12px;">บันทึกประกาศ</button>`, true) +
      admSec('form', 'file', 'ตั้งค่ากลางของฟอร์มและกติกา (ใช้กับทุกเครื่อง)', `
        <div class="sec-list">
          ${swRow('admSecLoc', 'แสดงส่วน "สถานที่"', '')}${swRow('admSecMan', 'แสดงส่วน "กำลังพล"', DISABLED_SECTIONS.includes('manpower') ? 'ปิดถาวรในแอปเวอร์ชันนี้' : '')}${swRow('admSecTime', 'แสดงส่วน "เวลา"', '')}${swRow('admSecPhoto', 'แสดงส่วน "รูปถ่าย"', DISABLED_SECTIONS.includes('photos') ? 'ปิดถาวรในแอปเวอร์ชันนี้' : '')}
          ${swRow('admSecLocked', 'ล็อกให้ทุกเครื่องใช้ตามนี้ (บังคับเสมอแล้ว)', 'ตั้งแต่เวอร์ชันนี้ ผู้ใช้ปรับส่วนของฟอร์มเองไม่ได้ในทุกกรณี สวิตช์นี้ไม่มีผลแล้ว')}
          ${swRow('admReqLoc', 'บังคับกรอกสถานที่', 'บังคับเสมอ ปิดไม่ได้ (ส่วนสถานที่จึงแสดงเสมอ)')}
          ${swRow('admReqPin', 'admin ต้องใส่ PIN ซ้ำ', 'admin ที่เข้าด้วยรหัสพนักงาน ต้องใส่ PIN ผู้ดูแลอีกชั้นก่อนใช้เครื่องมือผู้ดูแล (ข้ามให้ถ้ายังไม่ได้ตั้ง PIN ใน Script properties)')}
          ${swRow('admRestrict', 'แนะนำเฉพาะ Job ในรายชื่อหลัก', 'มีผลกับรายการแนะนำตอนพิมพ์เท่านั้น Job/สถานที่ใหม่ยังบันทึกได้ และถูกเพิ่มเข้ารายชื่อหลักให้อัตโนมัติ')}
        </div>
        <div class="form-group" style="margin-top: 12px;"><label for="admLockDays">ล็อกงวด: ผู้ดูแลระดับ editor แก้/ลบรายการที่เก่ากว่ากี่วันไม่ได้ (0 = ไม่ล็อก)</label><input type="number" id="admLockDays" min="0" inputmode="numeric"></div>
        <div class="form-group"><label for="admLimit">จำนวนรายการที่หน้ารายงานโหลดเป็นค่าเริ่มต้น</label>
          <select id="admLimit"><option value="50">50</option><option value="100">100</option><option value="200">200</option><option value="0">ทั้งหมด</option></select></div>
        <button type="button" class="btn-primary" data-act="saveForm" style="padding: 12px;">บันทึกการตั้งค่า</button>`, false) +
      admSec('jobs', 'clipboard', 'รายชื่อ Job (รายชื่อหลัก)', `
        <p class="meta" style="margin: 0 0 10px;">Job ที่เพิ่มที่นี่จะขึ้นให้พนักงานเลือก ปิดงานแล้วจะไม่ขึ้นแนะนำ ตั้ง "รายงานทุกวัน" เพื่อให้สรุป LINE เตือนเมื่อวันนี้ยังไม่มีรายงาน</p>
        <div class="form-group"><label for="admJobName">Job ใหม่</label><input type="text" id="admJobName" maxlength="100" placeholder="เช่น V-20601"></div>
        <div class="form-group"><label for="admJobLoc">สถานที่ตั้งต้น (ไม่บังคับ)</label><input type="text" id="admJobLoc" maxlength="100" list="locList"></div>
        <div class="sec-list">${swRow('admJobDaily', 'ต้องรายงานทุกวัน', '')}</div>
        <button type="button" class="btn-outline" data-act="jobAdd" style="padding: 11px; margin: 10px 0 14px;">${ic('plus')} เพิ่ม / อัปเดต Job</button>
        <div id="admJobs"></div>`, false) +
      admSec('people', 'users', 'รายชื่อผู้มีสิทธิ์เข้าใช้งาน (login ด้วยรหัสพนักงาน)', `
        <p class="meta" style="margin: 0 0 10px;">คนที่มีรายชื่อนี้ (พร้อมรหัส) ใช้รหัสพนักงาน login เข้าแอปได้ บทบาท <b>admin</b> จะเข้าเครื่องมือผู้ดูแลนี้ได้ทันทีไม่ต้องใส่ PIN ซ้ำ ส่วน <b>user</b> ใช้กรอกฟอร์มตามปกติ ปิดใช้งาน = login ไม่ได้อีก (ไม่ลบประวัติ)</p>
        <div class="form-group"><label for="admPplCode">รหัสพนักงาน</label><input type="text" id="admPplCode" maxlength="40" placeholder="เช่น 1001"></div>
        <div class="form-group"><label for="admPplName">ชื่อ</label><input type="text" id="admPplName" maxlength="80" placeholder="เช่น นพดล"></div>
        <div class="form-group"><label for="admPplRole">บทบาท</label><select id="admPplRole"><option value="user">user (กรอกฟอร์มได้ตามปกติ)</option><option value="admin">admin (เข้าเครื่องมือผู้ดูแลได้)</option></select></div>
        <button type="button" class="btn-outline" data-act="personAdd" style="padding: 11px; margin: 10px 0 14px;">${ic('plus')} เพิ่ม / อัปเดตรายชื่อ</button>
        <div id="admPeople"></div>`, false) +
      admSec('audit', 'clock', 'ประวัติการแก้ไข / ลบ / ตั้งค่า', '<div id="admAudit"></div>', false) +
      admSec('trash', 'trash', 'ถังขยะ (กู้คืนรายการที่ลบ)', '<div id="admTrash"></div>', false);
    fillAdminForms(serverCfg);
  }
  function fillAdminForms(c) {
    $('admAnn').value = c.announcement || ''; $('admAnnUntil').value = c.announcement_until || '';
    $('admMaint').checked = !!c.maintenance; $('admMaintMsg').value = c.maintenance_message || '';
    $('admSecLoc').checked = c.sections_location !== false; $('admSecMan').checked = c.sections_manpower !== false;
    $('admSecTime').checked = c.sections_times !== false; $('admSecPhoto').checked = c.sections_photos !== false;
    $('admSecLocked').checked = !!c.sections_locked; $('admReqPin').checked = c.admin_require_pin !== false; $('admReqLoc').checked = true; $('admReqLoc').disabled = true; $('admSecLoc').checked = true; $('admSecLoc').disabled = true;
    ['admSecMan', 'admSecPhoto'].forEach((id, i) => { if (DISABLED_SECTIONS.includes(['manpower', 'photos'][i])) { $(id).checked = false; $(id).disabled = true; } }); $('admRestrict').checked = !!c.restrict_jobs;
    $('admLockDays').value = c.lock_days || 0; $('admLimit').value = String(c.report_default_limit ?? 50);
  }
  const fmtN = n => Number(n || 0).toLocaleString('th-TH');
  async function loadAdminStats() {
    const box = $('admStats');
    box.innerHTML = '<div class="sk-line" style="width: 60%;"></div><div class="sk-line" style="width: 40%;"></div>';
    try {
      const s = await callWithPin('adminStats', {});
      const warn = [];
      if (s.pinOpen) warn.push('ยังไม่ได้ตั้ง PIN ผู้ดูแลที่เซิร์ฟเวอร์ ใครก็แก้/ลบรายการได้ ตั้ง ADMIN_PINS ใน Script properties');
      if (s.editors && s.editors < 2) warn.push('ไฟล์ข้อมูลมีผู้แก้ไขได้บัญชีเดียว ควรเพิ่มผู้ดูแลอย่างน้อย 1 คน เพื่อไม่ให้ระบบพึ่งคนคนเดียว');
      if (!s.triggers.includes('dailyMaintenance')) warn.push('ยังไม่ได้ตั้งการสำรองข้อมูลอัตโนมัติ (รัน setupMaintenanceTrigger ใน Apps Script)');
      if (!s.backup.at) warn.push('ยังไม่เคยสำรองข้อมูล กดปุ่ม "สำรองตอนนี้"');
      if (s.errors24h) warn.push(`มีข้อผิดพลาดของระบบ ${s.errors24h} ครั้งใน 24 ชั่วโมง ดูรายละเอียดในแท็บ ErrorLog ของ Sheet`);
      if (String(s.version).replace(/^v/, '') !== APP_VERSION) warn.push(`เวอร์ชัน Apps Script (${s.version}) ไม่ตรงกับแอป (${APP_VERSION}) ตรวจว่า Deploy เวอร์ชันล่าสุดแล้ว`);
      const tile = (label, val, c) => `<div class="stat" style="--c: ${c}"><div class="num">${val}</div><div class="lbl">${label}</div></div>`;
      const kv = (k, v) => `<div class="adm-kv"><span>${k}</span><span>${v}</span></div>`;
      box.innerHTML = (warn.length ? warn.map(w => `<div class="adm-warn">${escapeHTML(w)}</div>`).join('') : '<div class="adm-ok">ระบบปกติ ไม่พบข้อควรระวัง</div>') +
        `<div class="stats" style="margin: 10px 0 12px;">${tile('รายการวันนี้', fmtN(s.today), 'var(--tw-blue)')}${tile('รายการทั้งหมด', fmtN(s.total), '#3358C9')}${tile('ข้อผิดพลาด 24 ชม.', fmtN(s.errors24h), 'var(--tw-red)')}${tile('ในถังขยะ', fmtN(s.trash), '#F59E0B')}</div>` +
        kv('ส่งล่าสุด', escapeHTML(s.lastSubmit || '-')) + kv('ระบบไม่ว่างวันนี้', `${fmtN(s.busyToday)} ครั้ง`) +
        kv('สำรองข้อมูลล่าสุด', s.backup.at ? `${escapeHTML(s.backup.at)}${s.backup.url ? ` <a href="${escapeHTML(s.backup.url)}" target="_blank" rel="noopener">เปิดไฟล์</a>` : ''}` : 'ยังไม่เคย') +
        (s.backup.status ? kv('สถานะสำรอง', escapeHTML(s.backup.status)) : '') +
        kv('เจ้าของระบบ (บัญชีที่รันสคริปต์)', escapeHTML(s.owner || '-')) + kv('ผู้แก้ไขไฟล์ข้อมูล', `${s.editors || '-'} บัญชี`) +
        kv('บัญชีผู้ดูแล', s.accounts.length ? escapeHTML(s.accounts.map(a => `${a.name} (${a.role}${a.by === 'email' ? ', อีเมล' : ''})`).join(', ')) : 'ยังไม่ได้ตั้ง') +
        kv('โหมดบัญชีองค์กร', s.domainMode ? 'เปิดอยู่ (ระบุตัวตนด้วยอีเมล)' : 'ปิด (ใช้ PIN)') + kv('LINE', s.lineConfigured ? (s.lineTarget ? 'พร้อมส่งสรุปรายวัน' : 'มี token แต่ยังไม่ได้ลงทะเบียนกลุ่ม') : 'ยังไม่ตั้ง') +
        kv('เวอร์ชัน', `แอป ${APP_VERSION} · Apps Script ${escapeHTML(s.version)}`) +
        kv('URL เว็บแอปปัจจุบัน', s.appUrl
          ? `<span class="adm-url">${escapeHTML(s.appUrl)}</span> <button type="button" class="mini-btn" data-act="copyAppUrl" data-url="${escapeHTML(s.appUrl)}" style="padding:3px 9px;">คัดลอก</button>`
          : '<span style="color:var(--tw-red);">ยังไม่ได้ Deploy เป็น Web app</span>') +
        `<div class="adm-actions"><button type="button" class="btn-primary" data-act="backup" style="padding: 11px; width: auto;">สำรองข้อมูลตอนนี้</button><button type="button" class="mini-btn" data-act="refreshStats">${ic('refresh')} รีเฟรช</button><a class="mini-btn" href="${escapeHTML(s.spreadsheet.url)}" target="_blank" rel="noopener">เปิด Google Sheet</a></div>`;
      if (s.config) { serverCfg = s.config; store.setJSON(KEYS.cfg, s.config); fillAdminForms(s.config); renderBanners(); }
      adminLastUrl = s.appUrl || '';
    } catch (err) { box.innerHTML = `<div class="adm-warn">โหลดสถานะไม่สำเร็จ: ${escapeHTML(err.message || '')}</div>`; }
  }
  async function loadAdminJobs() {
    const box = $('admJobs'); box.innerHTML = '<div class="sk-line" style="width: 50%;"></div>';
    try {
      const r = await callWithPin('adminJobs', {});
      admJobsCount = r.jobs.length;
      box.innerHTML = r.jobs.length ? r.jobs.map(j => `<div class="adm-row"><div><b>${escapeHTML(j.job)}</b><div class="meta">${escapeHTML(j.location || 'ไม่ระบุสถานที่')}${j.daily ? ' · รายงานทุกวัน' : ''}${j.note ? ' · ' + escapeHTML(j.note) : ''}</div></div>
        <div class="adm-actions" style="margin: 0;"><span class="adm-chip${j.closed ? ' closed' : ''}">${j.closed ? 'ปิดงานแล้ว' : 'เปิดอยู่'}</span>
        <button type="button" class="mini-btn" data-act="jobStatus" data-job="${escapeHTML(j.job)}" data-status="${j.closed ? 'active' : 'closed'}">${j.closed ? 'เปิดใหม่' : 'ปิดงาน'}</button>
        <button type="button" class="mini-btn" data-act="jobDaily" data-job="${escapeHTML(j.job)}" data-daily="${j.daily ? '' : 'Y'}">${j.daily ? 'เลิกรายงานทุกวัน' : 'ตั้งรายงานทุกวัน'}</button></div></div>`).join('')
        : '<div class="meta">ยังไม่มีรายชื่อหลัก (พนักงานยังพิมพ์ Job เองได้ตามปกติ)</div>';
    } catch (err) { box.innerHTML = `<div class="adm-warn">โหลดไม่สำเร็จ: ${escapeHTML(err.message || '')}</div>`; }
  }
  async function loadAdminPeople() {
    const box = $('admPeople'); box.innerHTML = '<div class="sk-line" style="width: 50%;"></div>';
    try {
      const r = await callWithPin('adminPeople', {});
      box.innerHTML = r.people.length ? r.people.map(p => `<div class="adm-row"><div><b>${escapeHTML(p.name)}</b><div class="meta">รหัส ${escapeHTML(p.code)}${p.active ? '' : ' · ปิดใช้งาน'}</div></div>
        <div class="adm-actions" style="margin: 0;"><span class="adm-chip${p.role === 'admin' ? '' : ' closed'}">${p.role}</span>
        <button type="button" class="mini-btn" data-act="personRole" data-code="${escapeHTML(p.code)}" data-role="${p.role === 'admin' ? 'user' : 'admin'}">${p.role === 'admin' ? 'ลดเป็น user' : 'ตั้งเป็น admin'}</button>
        <button type="button" class="mini-btn" data-act="personActive" data-code="${escapeHTML(p.code)}" data-active="${p.active ? '0' : '1'}">${p.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></div></div>`).join('')
        : '<div class="meta">ยังไม่มีรายชื่อ (เพิ่มอย่างน้อย 1 คนเพื่อเปิดใช้งาน login ด้วยรหัสพนักงาน)</div>';
    } catch (err) { box.innerHTML = `<div class="adm-warn">โหลดไม่สำเร็จ: ${escapeHTML(err.message || '')}</div>`; }
  }
  function auditDetail(r) {
    let d = r.detail; try { d = JSON.parse(d); } catch (_) {}
    const v = x => (x === '' || x == null) ? '(ว่าง)' : (x === 'true' ? 'เปิด' : x === 'false' ? 'ปิด' : x);
    if (d && typeof d === 'object') return Object.entries(d).map(([k, x]) => Array.isArray(x) ? `${FIELD_LABEL[k] || k}: ${v(x[0])} → ${v(x[1])}` : `${FIELD_LABEL[k] || k}: ${v(x)}`).join(' · ');
    return String(d || '');
  }
  async function loadAdminAudit() {
    const box = $('admAudit'); box.innerHTML = '<div class="sk-line" style="width: 60%;"></div>';
    try {
      const r = await callWithPin('adminAudit', {});
      box.innerHTML = r.rows.length ? r.rows.map(x => `<div class="adm-log"><b>${escapeHTML(ACTION_LABEL[x.action] || x.action)}</b> โดย ${escapeHTML(x.who)} <span class="meta">(${escapeHTML(x.role)}) · ${escapeHTML(x.time)}</span>
        ${x.job ? `<div>${escapeHTML(x.job)} ${x.date ? '· ' + escapeHTML(thaiDate(x.date)) : ''} ${x.shift ? '· ' + shiftLabel(x.shift) : ''}</div>` : ''}<div class="detail">${escapeHTML(auditDetail(x))}</div></div>`).join('')
        : '<div class="meta">ยังไม่มีประวัติ</div>';
    } catch (err) { box.innerHTML = `<div class="adm-warn">โหลดไม่สำเร็จ: ${escapeHTML(err.message || '')}</div>`; }
  }
  async function loadAdminTrash() {
    const box = $('admTrash'); box.innerHTML = '<div class="sk-line" style="width: 60%;"></div>';
    try {
      const r = await callWithPin('adminTrash', {});
      box.innerHTML = r.rows.length ? `<p class="meta" style="margin: 0 0 8px;">เก็บไว้ ${serverCfg.trash_days || 90} วัน แล้วลบถาวรพร้อมรูปถ่ายของรายการนั้น</p>` + r.rows.map(x => `<div class="adm-row"><div><b>${escapeHTML(x.job)}</b> <span class="meta">${escapeHTML(thaiDate(x.date))} · ${shiftLabel(x.shift)}</span>
        <div class="meta">${x.location ? escapeHTML(x.location) + ' · ' : ''}ผู้รายงาน ${escapeHTML(x.reporter)} · ลบโดย ${escapeHTML(x.deleted_by)} เมื่อ ${escapeHTML(x.deleted_at)}</div></div>
        <button type="button" class="mini-btn" data-act="restore" data-sid="${escapeHTML(x.sid)}">${ic('undo')} กู้คืน</button></div>`).join('')
        : '<div class="meta">ถังขยะว่าง</div>';
    } catch (err) { box.innerHTML = `<div class="adm-warn">โหลดไม่สำเร็จ: ${escapeHTML(err.message || '')}</div>`; }
  }
  async function saveAdminConfig(data, okMsg) {
    try {
      const r = await adm('adminSetConfig', { data: JSON.stringify(data) });
      serverCfg = r.config; store.setJSON(KEYS.cfg, r.config); applyServerConfig(); fillAdminForms(r.config);
      showToast(okMsg, 'success'); playSound('success');
    } catch (_) {}
  }
  $('adminBody').addEventListener('click', async e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'refreshStats') return loadAdminStats();
    if (act === 'copyAppUrl') {
      const url = e.target.closest('[data-act]').dataset.url;
      try { await navigator.clipboard.writeText(url); showToast('คัดลอก URL เว็บแอปแล้ว', 'success'); }
      catch (_) { showToast('คัดลอกไม่ได้ กดค้างที่ข้อความ URL เพื่อคัดลอกเอง', 'error'); }
      return;
    }
    if (act === 'backup') {
      if (!(await confirmDialog('สำรองข้อมูลตอนนี้', 'คัดลอกไฟล์ Google Sheet ทั้งไฟล์ไปไว้ในโฟลเดอร์สำรองข้อมูลใน Drive (ใช้เวลาสักครู่)', 'สำรอง'))) return;
      b.disabled = true;
      try { const r = await adm('backupNow', {}); showToast('สำรองข้อมูลแล้ว', 'success'); playSound('success'); loadAdminStats(); } catch (_) {} finally { b.disabled = false; }
    }
    if (act === 'saveAnnounce') saveAdminConfig({ announcement: $('admAnn').value.trim(), announcement_until: $('admAnnUntil').value, maintenance: $('admMaint').checked, maintenance_message: $('admMaintMsg').value.trim() },
      $('admMaint').checked ? 'เปิดโหมดปิดปรับปรุงแล้ว' : 'บันทึกประกาศแล้ว');
    if (act === 'saveForm') saveAdminConfig({ sections_location: true, sections_manpower: $('admSecMan').checked, sections_times: $('admSecTime').checked, sections_photos: $('admSecPhoto').checked,
      sections_locked: $('admSecLocked').checked, require_location: true, admin_require_pin: $('admReqPin').checked, restrict_jobs: $('admRestrict').checked, lock_days: Number($('admLockDays').value) || 0, report_default_limit: $('admLimit').value }, 'บันทึกการตั้งค่ากลางแล้ว ทุกเครื่องจะได้ค่าใหม่ภายในไม่กี่นาที');
    const jobCall = async payload => { try { await adm('adminJobSet', payload); showToast('บันทึกรายชื่อ Job แล้ว', 'success'); loadAdminJobs(); loadJobs(true); } catch (_) {} };
    if (act === 'jobAdd') { const job = $('admJobName').value.trim(); if (!job) return showToast('ใส่ชื่อ Job ก่อน', 'error'); await jobCall({ job, location: $('admJobLoc').value.trim(), daily: $('admJobDaily').checked ? 'Y' : '', status: 'active' }); $('admJobName').value = ''; }
    if (act === 'jobStatus') jobCall({ job: b.dataset.job, status: b.dataset.status });
    if (act === 'jobDaily') jobCall({ job: b.dataset.job, daily: b.dataset.daily });
    const personCall = async payload => { try { await adm('adminPeopleSet', payload); showToast('บันทึกรายชื่อแล้ว', 'success'); loadAdminPeople(); loadJobs(true); } catch (_) {} };
    if (act === 'personAdd') {
      const code = $('admPplCode').value.trim(), name = $('admPplName').value.trim();
      if (!code || !name) return showToast('ใส่รหัสและชื่อก่อน', 'error');
      await personCall({ code, name, role: $('admPplRole').value, active: '1' });
      $('admPplCode').value = ''; $('admPplName').value = ''; $('admPplRole').value = 'user';
    }
    if (act === 'personRole') {
      if (b.dataset.role === 'admin' && !(await confirmDialog('ตั้งเป็น admin', 'คนนี้จะเข้าเครื่องมือผู้ดูแลได้ทันทีด้วยรหัสพนักงานของตัวเอง โดยไม่ต้องใส่ PIN', 'ตั้งเป็น admin'))) return;
      personCall({ code: b.dataset.code, role: b.dataset.role });
    }
    if (act === 'personActive') personCall({ code: b.dataset.code, active: b.dataset.active });
    if (act === 'restore') {
      if (!(await confirmDialog('กู้คืนรายการ', 'ย้ายรายการนี้กลับเข้ารายงาน และบันทึกประวัติการกู้คืน', 'กู้คืน'))) return;
      try { await adm('adminRestore', { sid: b.dataset.sid }); showToast('กู้คืนรายการแล้ว', 'success'); playSound('success'); reportSig = ''; loadAdminTrash(); loadAdminStats(); } catch (_) {}
    }
  });
  $('adminBody').addEventListener('toggle', e => {
    if (!e.target.open) return;
    if (e.target.id === 'adm-jobs') loadAdminJobs();
    if (e.target.id === 'adm-people') loadAdminPeople();
    if (e.target.id === 'adm-audit') loadAdminAudit();
    if (e.target.id === 'adm-trash') loadAdminTrash();
  }, true);

  // เริ่มต้น: แสดงแถบประกาศ/รายชื่อจากที่จำไว้ แล้วโหลดค่ากลางล่าสุดจากเซิร์ฟเวอร์ (ทุก ~10 นาที เหลื่อมเวลาแต่ละเครื่อง)
  renderPeopleList();
  applyServerConfig();
  setTimeout(() => loadConfig(), 1200 + Math.random() * 3000);   // เหลื่อมเวลาแต่ละเครื่อง
  setTimeout(() => setInterval(() => { if (!document.hidden) loadConfig(); }, 10 * 60 * 1000), Math.random() * 60000);
  window.addEventListener('online', () => setTimeout(() => loadConfig(), 800 + Math.random() * 2000));
  // ดึงค่ากลางใหม่ทุกครั้งที่กลับมาเปิดแอป (สลับแอปกลับมา/ปลดล็อกหน้าจอ) ห่างกันอย่างน้อย 30 วินาที
  // เดิมดึงแค่ตอนเปิดแอปและทุก 10 นาที ทำให้เครื่องที่เปิดค้างไว้ยังเห็นค่าเก่า ทั้งที่ admin บันทึกค่ากลางไปแล้ว
  let lastCfgPull = Date.now();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || Date.now() - lastCfgPull < 30000) return;
    lastCfgPull = Date.now();
    loadConfig();
  });

  /* ============ PWA ============ */
  if (!IS_GAS && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  let installEvent = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    installEvent = e;
    if (!store.get(KEYS.install)) $('installCard').hidden = false;
  });
  async function installApp() {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null;
    $('installCard').hidden = true;
  }
  function dismissInstall() {
    store.set(KEYS.install, '1');
    $('installCard').hidden = true;
  }
  window.addEventListener('appinstalled', () => { $('installCard').hidden = true; showToast('ติดตั้งแอปแล้ว', 'success'); });
