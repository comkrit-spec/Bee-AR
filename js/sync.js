  /* ======================================================================
    sync.js — ตั้งค่า PIN ในเครื่อง, ทดสอบการเชื่อมต่อ, แท็บ, API layer, คิวออฟไลน์, สถานะเซิร์ฟเวอร์, เสียง, พื้นหลัง
  ====================================================================== */
  /* ============ SETTINGS (PIN ในเครื่อง) ============ */
  let pinFails = 0, pinLockUntil = 0;
  async function openSettings() {
    const saved = store.get(KEYS.pin);
    if (saved) {
      if (Date.now() < pinLockUntil) {
        return showToast(`ใส่ PIN ผิดหลายครั้ง ลองใหม่ใน ${Math.ceil((pinLockUntil - Date.now()) / 1000)} วินาที`, 'error');
      }
      const p = await askPin('ใส่ PIN เพื่อเปิดหน้าตั้งค่า');
      if (p === null) return;
      if (await hashPin(p) !== saved) {
        pinFails++;
        if (pinFails >= 5) { pinLockUntil = Date.now() + 60000; pinFails = 0; }
        return showToast('PIN ไม่ถูกต้อง', 'error');
      }
      pinFails = 0;
    }
    $('urlGroup').hidden = IS_GAS || !!EMBEDDED_URL;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
    $('iosHint').hidden = !(isIOS && !standalone && !IS_GAS);
    $('urlNote').textContent = IS_GAS
      ? 'แอปนี้เปิดผ่าน Google Apps Script และเชื่อมกับ Sheet โดยตรง ไม่ต้องตั้ง URL'
      : EMBEDDED_URL
        ? 'แอปนี้เชื่อมต่อกับฐานข้อมูลของหน่วยงานแล้ว ไม่ต้องตั้ง URL กด "ทดสอบการเชื่อมต่อ" เพื่อตรวจสอบได้'
        : 'วาง Web App URL ของ Google Apps Script ที่นี่ ระบบจะจำค่าไว้ในเครื่องนี้ทันที ไม่ต้องกดบันทึกและไม่ต้องใส่ซ้ำ';
    $('scriptUrlInput').value = googleScriptUrl;
    $('pinNew').value = '';
    $('pinNew').placeholder = saved ? 'ตั้งไว้แล้ว เว้นว่างเพื่อใช้ PIN เดิม' : 'เว้นว่างถ้าไม่ต้องการล็อก';
    $('pinRemoveBtn').hidden = !saved;
    $('connResult').hidden = true;
    renderSectionSettings();
    renderPrefs();
    $('verInfo').textContent = `เวอร์ชันแอป ${APP_VERSION} · Apps Script ${serverVersion || (server.state === 'ok' ? '(เก่า ยังไม่รายงานเวอร์ชัน)' : '-')}`;
    $('settingsModal').classList.add('active');
    setTimeout(() => (IS_GAS || EMBEDDED_URL ? $('pinNew') : $('scriptUrlInput')).focus(), 150);
  }
  function closeSettings() { $('settingsModal').classList.remove('active'); }
  async function saveSettings() {
    const url = $('scriptUrlInput').value.trim();
    const pin = $('pinNew').value.trim();
    const needUrl = !IS_GAS && !EMBEDDED_URL;
    if (needUrl && (!url || !url.includes('script.google.com'))) return showToast('URL ต้องเป็นลิงก์ script.google.com', 'error');
    if (needUrl && !/\/exec\/?$/.test(url)) return showToast('URL ต้องลงท้ายด้วย /exec (ไม่ใช่ /dev) กด "ทดสอบการเชื่อมต่อ" เพื่อตรวจ', 'error', 5000);
    if (pin && !/^\d{4,6}$/.test(pin)) return showToast('PIN ต้องเป็นตัวเลข 4–6 หลัก', 'error');
    // ส่วนของแบบฟอร์ม: ถ้าปิดส่วนที่มีข้อมูลค้าง ต้องยืนยันก่อนล้าง
    const adminLocked = !!serverCfg.sections_locked;
    const cur = getSections(), next = { ...cur };
    if (!adminLocked) SECTIONS.filter(x => !x.locked).forEach(x => { const el = $('sec-' + x.key); if (el) next[x.key] = el.checked; });
    if (!editing && !adminLocked) {
      const losing = SECTIONS.filter(x => !x.locked && cur[x.key] && !next[x.key] && sectionHasData(x.key));
      if (losing.length) {
        const ok = await confirmDialog('ปิดส่วนที่มีข้อมูลค้างอยู่',
          `ส่วน ${losing.map(x => x.label).join(', ')} มีข้อมูลที่กรอกไว้ การปิดจะล้างข้อมูลในส่วนนั้น`, 'ปิดและล้างข้อมูล');
        if (!ok) return;
      }
    }
    if (!adminLocked) store.setJSON(KEYS.sections, next);
    applySectionVisibility(true);
    if (needUrl) { googleScriptUrl = url; store.set(KEYS.url, url); }
    if (pin) store.set(KEYS.pin, await hashPin(pin));
    showToast(pin ? 'บันทึกการตั้งค่าและ PIN แล้ว' : 'บันทึกการตั้งค่าแล้ว', 'success');
    closeSettings();
    flushQueue();
    checkServer();
    renderSetupCard();
    loadJobs(true);
  }
  function removePin() {
    store.del(KEYS.pin);
    $('pinRemoveBtn').hidden = true;
    $('pinNew').placeholder = 'เว้นว่างถ้าไม่ต้องการล็อก';
    showToast('เลิกใช้ PIN แล้ว', 'success');
  }
  // จำ URL ทันทีที่วางลงช่อง (ถ้ารูปแบบถูกต้อง) ไม่ต้องกดบันทึก แล้วทดสอบการเชื่อมต่อให้เลย
  let urlSaveTimer;
  $('scriptUrlInput').addEventListener('input', () => {
    clearTimeout(urlSaveTimer);
    urlSaveTimer = setTimeout(() => {
      if (IS_GAS || EMBEDDED_URL) return;
      const v = $('scriptUrlInput').value.trim();
      if (!v || urlProblem(v) || v === googleScriptUrl) return;
      googleScriptUrl = v; store.set(KEYS.url, v); requestPersist();
      showToast('จำ URL ไว้ในเครื่องนี้แล้ว ครั้งหน้าเปิดแอปใช้งานได้ทันที', 'success', 3500);
      checkServer(); loadJobs(true); renderSetupCard();
      testConnection();
    }, 600);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('confirmModal').classList.contains('active')) return $('confirmCancel').click();
    if ($('pinModal').classList.contains('active')) return $('pinCancel').click();
    closeSettings(); hideSuccess(); closeSheet(); closeStatus();
  });

  /* ============ CONNECTION TEST ============ */
  function urlProblem(url) {
    if (!url) return 'ยังไม่ได้ใส่ URL ของ Apps Script';
    if (/\/dev(\?|$)/.test(url)) return 'URL นี้ลงท้ายด้วย <b>/dev</b> ซึ่งใช้ได้เฉพาะเจ้าของสคริปต์ ต้องใช้ URL ที่ลงท้ายด้วย <b>/exec</b> จากหน้า Deploy > Manage deployments';
    if (!/^https:\/\/script\.google\.com\/(a\/[^/]+\/)?macros\/s\/[\w-]+\/exec\/?$/.test(url)) {
      return 'รูปแบบ URL ไม่ถูกต้อง ต้องเป็น <b>https://script.google.com/macros/s/.../exec</b> (คัดลอกจาก Deploy > Manage deployments > Web app URL)';
    }
    return '';
  }
  async function testConnection() {
    const box = $('connResult');
    const show = (cls, html) => { box.className = `conn-result ${cls}`; box.innerHTML = ic({ ok: 'check-circle', bad: 'alert', wait: 'clock' }[cls] || 'info') + '<div>' + html + '</div>'; box.hidden = false; };
    const url = IS_GAS ? '' : (EMBEDDED_URL || $('scriptUrlInput').value.trim() || googleScriptUrl);
    const pending = getQueue().length;
    const pendingNote = pending ? `<br>มีรายการรอส่ง ${pending} รายการ จะถูกส่งให้อัตโนมัติเมื่อเชื่อมต่อได้` : '';

    if (!IS_GAS) {
      const prob = urlProblem(url);
      if (prob) return show('bad', prob + (EMBEDDED_URL ? '<br>URL นี้ฝังอยู่ในโค้ด แก้ที่บรรทัด <b>DEFAULT_SCRIPT_URL</b> ใน index.html' : ''));
    }
    if (!navigator.onLine) return show('bad', 'เครื่องนี้ออฟไลน์อยู่ ต่ออินเทอร์เน็ตแล้วลองใหม่');
    show('wait', 'กำลังทดสอบ...');

    if (IS_GAS) {
      try { const r = await gasCall('ping', {}); return show('ok', `เชื่อมต่อสำเร็จ ข้อมูลอยู่ในไฟล์ <b>${escapeHTML(r.spreadsheet || '')}</b> ชีต <b>${escapeHTML(r.sheet || '')}</b> (${r.rows} แถว)${pendingNote}`); }
      catch (e) { return show('bad', `เชื่อมต่อไม่ได้: ${escapeHTML(e.message)}`); }
    }

    let res, text;
    try {
      const ctrl = new AbortController(); setTimeout(() => ctrl.abort(), 15000);
      res = await fetch(`${url}?action=ping&t=${Date.now()}`, { signal: ctrl.signal });
      text = await res.text();
    } catch (e) {
      return show('bad', `เข้าถึง Apps Script ไม่ได้ สาเหตุที่พบบ่อย:<ul>
        <li>ตอน Deploy ตั้ง <b>Who has access</b> ไม่ใช่ <b>Anyone</b> (ถ้าเป็นบัญชีองค์กร อาจเห็นแค่ "Anyone within ..." ให้ติดต่อผู้ดูแลระบบ)</li>
        <li>URL ผิดหรือ Deployment ถูกลบ/ปิดไปแล้ว</li>
        <li>ยังไม่ได้กด Run ฟังก์ชัน <b>setup</b> เพื่ออนุญาตสิทธิ์</li></ul>`);
    }
    let data = null; try { data = JSON.parse(text); } catch (_) {}
    if (!data) {
      return show('bad', `Apps Script ตอบกลับเป็นหน้าเว็บแทนข้อมูล${/ScriptError|not found|ไม่พบ/i.test(text) ? ' (สคริปต์ error)' : ''} สาเหตุที่พบบ่อย:<ul>
        <li>ยังไม่ได้วางโค้ด <b>Code.gs</b> ตัวใหม่ หรือแก้โค้ดแล้วยังไม่ได้ Deploy เป็น <b>New version</b></li>
        <li>ยังไม่ได้ Run ฟังก์ชัน <b>setup</b> เพื่ออนุญาตสิทธิ์</li>
        <li>Deploy เป็นประเภทอื่นที่ไม่ใช่ <b>Web app</b></li></ul>`);
    }
    if (Array.isArray(data) || data.code === 'UNKNOWN_ACTION') {
      return show('bad', 'เชื่อมต่อได้ แต่ Apps Script ที่ Deploy อยู่เป็นเวอร์ชันเก่า วางโค้ด Code.gs ตัวใหม่ แล้ว Deploy > Manage deployments > Edit > <b>New version</b>');
    }
    if (data.status === 'error') return show('bad', `Apps Script แจ้งข้อผิดพลาด: ${escapeHTML(data.message)}`);
    // ทดสอบการส่งข้อมูล (POST) ด้วย เพราะบางครั้งอ่านได้แต่ส่งไม่ได้
    show('wait', 'อ่านข้อมูลได้แล้ว กำลังทดสอบการส่งข้อมูล...');
    let post = null;
    try {
      const pr = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping' }) });
      const pt = await pr.text();
      try { post = JSON.parse(pt); } catch (_) { post = { status: 'error', message: `ตอบกลับไม่ใช่ข้อมูล (HTTP ${pr.status})` }; }
    } catch (e) { post = { status: 'error', message: 'ถูกบล็อกระหว่างส่งข้อมูล' }; }
    if (!post || post.status !== 'ok') {
      return show('bad', `อ่านข้อมูลได้ แต่<b>ส่งข้อมูลไม่ได้</b> (${escapeHTML(post && post.message || '')})<br>
        ตรวจว่าวางโค้ด <b>Code.gs</b> ตัวล่าสุดแล้ว และ Deploy เป็น <b>New version</b> แล้ว`);
    }
    show('ok', `เชื่อมต่อสำเร็จ (อ่านและส่งข้อมูลได้)<br>ข้อมูลจะถูกบันทึกในไฟล์ <b>${escapeHTML(data.spreadsheet || '-')}</b> ชีต <b>${escapeHTML(data.sheet || '-')}</b> (มีแล้ว ${data.rows} แถว)${pendingNote}`);
    if (pending) flushQueue(true);
  }

  /* ============ TABS ============ */
  const TABS = ['form', 'report', 'import'];
  function switchTab(tabId) {
    window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    document.querySelectorAll('.view-page').forEach(p => p.classList.remove('active'));
    $(`page-${tabId}`).classList.add('active');
    const navId = tabId === 'admin' ? 'import' : tabId;   // ศูนย์ผู้ดูแลเป็นหน้าย่อยของแท็บ "เครื่องมือ"
    document.querySelectorAll('[data-tab]').forEach(n => n.classList.toggle('active', n.dataset.tab === navId));
    $('bottomNav').style.setProperty('--idx', TABS.indexOf(navId));
    $('appHeader').classList.toggle('no-progress', tabId !== 'form');
    haptic(6);
    if (tabId === 'form') requestAnimationFrame(updateTimeline);
    if (tabId === 'report') { fetchReport(); startReportAutoRefresh(); } else stopReportAutoRefresh();
    if (tabId === 'import') renderSetupCard();
  }

  /* ============ API LAYER ============ */
  function netErr(kind, msg) {
    const e = new Error(msg || (kind === 'offline' ? 'ไม่มีอินเทอร์เน็ต' : kind === 'timeout' ? 'เซิร์ฟเวอร์ตอบช้าเกินไป' : 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'));
    e.network = true; e.kind = kind;
    return e;
  }
  function apiErr(d) {
    const e = new Error(d.message || 'Google Script แจ้งข้อผิดพลาด');
    e.code = d.code;
    return e;
  }
  function gasCall(action, payload) {
    return new Promise((resolve, reject) => {
      google.script.run
        .withSuccessHandler(d => (d && d.status === 'error') ? reject(apiErr(d)) : resolve(d))
        .withFailureHandler(err => reject(netErr('network', err && err.message)))
        .api(action, payload);
    });
  }
  async function api(action, payload = {}, opts = {}) {
    if (!navigator.onLine) { noteServer(false); throw netErr('offline'); }
    if (IS_GAS) {
      try { const r = await gasCall(action, payload); noteServer(true); return r; }
      catch (e) { noteServer(!e.network, e.network ? e.message : ''); throw e; }
    }
    const READ = ['getReport', 'checkDuplicate', 'ping', 'getJobs', 'getConfig'];
    const ctrl = opts.timeout ? new AbortController() : null;
    if (ctrl) setTimeout(() => ctrl.abort(), opts.timeout);
    let res;
    try {
      if (READ.includes(action)) {
        res = await fetch(`${googleScriptUrl}?${new URLSearchParams({ action, ...payload })}`, { signal: ctrl && ctrl.signal });
      } else {
        // ส่งเป็น JSON แบบ text/plain: เป็น "simple request" ที่ Apps Script รับได้เสถียรที่สุด
        res = await fetch(googleScriptUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({ action, ...payload }),
          redirect: 'follow',
          signal: ctrl && ctrl.signal
        });
      }
    } catch (e) {
      const ne = netErr(e.name === 'AbortError' ? 'timeout' : 'network');
      noteServer(false, ne.message);
      throw ne;
    }
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) {}
    if (!res.ok) { const he = new Error(`เซิร์ฟเวอร์ตอบกลับผิดพลาด (${res.status})`); he.status = res.status; noteServer(false, he.message); throw he; }
    if (data === null) {
      // Google ตอบเป็นหน้าเว็บ (เช่น หน้า login หรือหน้า error) = ข้อมูลไม่ได้ถูกบันทึก
      if (/<html|<!doctype/i.test(text)) {
        noteServer(false, 'Apps Script ตอบกลับเป็นหน้าเว็บแทนข้อมูล');
        throw Object.assign(new Error('Apps Script ตอบกลับเป็นหน้าเว็บแทนข้อมูล ข้อมูลยังไม่ถูกบันทึก เปิดตั้งค่า แล้วกด "ทดสอบการเชื่อมต่อ" เพื่อดูสาเหตุ'), { code: 'BAD_RESPONSE' });
      }
      noteServer(true);
      return { status: 'ok', unconfirmed: true };
    }
    noteServer(true);   // เซิร์ฟเวอร์ตอบเป็นข้อมูลแล้ว = เชื่อมต่อได้ (แม้คำสั่งนั้นจะถูกปฏิเสธ)
    if (!Array.isArray(data) && data.status === 'error') throw apiErr(data);
    return data;
  }
  // เซิร์ฟเวอร์ไม่ว่าง (มีคนใช้พร้อมกันเยอะ หรือติดคิวเขียนนานเกินไป) = ลองใหม่ได้อย่างปลอดภัย
  function isBusyErr(err) {
    return !!err && (err.code === 'BUSY' || err.status === 429 || err.status === 503 ||
      /simultaneous|too many|rate limit|quota|server busy|service unavailable/i.test(err.message || ''));
  }
  // ลองใหม่อัตโนมัติ 3 ครั้งแบบหน่วงเวลาเพิ่มขึ้น + สุ่ม (กันทุกเครื่องลองพร้อมกันอีก) ปลอดภัยเพราะทุกรายการมีรหัส เซิร์ฟเวอร์ไม่บันทึกซ้ำ
  async function apiRetry(action, payload, opts = {}) {
    const waits = [1200, 3500, 8000];
    for (let i = 0; ; i++) {
      try { return await api(action, payload, opts); }
      catch (err) {
        if (err.code === 'MAINTENANCE') { err.network = true; err.kind = 'maintenance'; throw err; }   // ปิดปรับปรุง: ไม่ลองซ้ำ เก็บเข้าคิวทันที
        if (!isBusyErr(err)) throw err;
        if (i >= waits.length) { err.network = true; err.kind = 'busy'; throw err; }   // ยังไม่ว่าง: ให้เก็บเข้าคิวส่งทีหลัง
        if (opts.onRetry) opts.onRetry(i + 1);
        await sleep(waits[i] * (0.7 + Math.random() * 0.6));
      }
    }
  }
  /**
   * คำสั่งที่ต้องใช้สิทธิ์ผู้ดูแลฝั่งเซิร์ฟเวอร์ (แก้ไข/ลบ/ตั้งค่า ฯลฯ)
   * ถ้าเครื่องนี้ login ด้วยรหัสพนักงานที่ role = admin ไว้แล้ว ใช้รหัสพนักงานนั้นส่งไปตรวจแทน PIN ทันที ไม่ต้องถาม PIN ซ้ำ
   * ถ้ายังไม่มีใคร login เป็น admin เลย (หรือ login เป็น user ธรรมดา) fallback ไปใช้ระบบ PIN เดิม (ADMIN_PINS) เป็นทางสำรอง
   */
  async function callWithPin(action, payload) {
    const id = getEmpIdentity();
    if (id && id.role === 'admin' && id.code) {
      try {
        return await apiRetry(action, { ...payload, empCode: id.code, dev: DEVICE_ID });
      } catch (err) {
        if (err.code === 'FORBIDDEN' || err.code === 'EMPLOYEE_NOT_FOUND') {
          // บัญชีที่ login ไว้ถูกถอดสิทธิ์/ปิดใช้งานไปแล้วที่ฝั่งเซิร์ฟเวอร์ (อีกเครื่องแก้ไว้) เคลียร์ตัวตนแล้วให้ login ใหม่
          clearEmpIdentity(); applyEmployeeLock();
          showToast('บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลแล้ว กรุณาเข้าสู่ระบบใหม่', 'error', 6000);
          openEmpLogin();
        }
        throw err;
      }
    }
    try {
      return await apiRetry(action, { ...payload, pin: sessionPin, dev: DEVICE_ID });
    } catch (err) {
      if (err.code !== 'PIN_REQUIRED' && err.code !== 'PIN_WRONG') throw err;
      if (err.code === 'PIN_WRONG') { sessionPin = ''; showToast('PIN ไม่ถูกต้อง', 'error'); }
      const p = await askPin('ใส่ PIN แอดมิน (สำหรับแก้ไข/ลบ)');
      if (p === null) throw Object.assign(new Error('ยกเลิกแล้ว'), { cancelled: true });
      sessionPin = p;
      return callWithPin(action, payload);
    }
  }

  /* ============ OFFLINE QUEUE ============ */
  const getQueue = () => store.getJSON(KEYS.queue) || [];
  function setQueue(q) { const ok = store.setJSON(KEYS.queue, q); updatePendingBadge(); return ok; }
  // คืนค่า 'ok' | 'nophotos' | 'fail'
  function enqueue(item) {
    const q = getQueue();
    const entry = { ...item, id: uid(), at: Date.now() };
    q.push(entry);
    if (setQueue(q)) return 'ok';
    if (entry.data && entry.data.photos && entry.data.photos !== '[]') {
      entry.data = { ...entry.data, photos: '[]' };
      if (setQueue(q)) return 'nophotos';
    }
    q.pop(); setQueue(q);
    return 'fail';
  }
  function updatePendingBadge() {
    const n = getQueue().length;
    $('pendingBadge').hidden = n === 0;
    $('pendingCount').textContent = `รอส่ง ${n}`;
  }
  let flushing = false;
  let flushHold = 0;   // เซิร์ฟเวอร์ไม่ว่าง: พักการส่งอัตโนมัติสักครู่ (กันทุกเครื่องรุมส่งพร้อมกัน)
  async function flushQueue(manual = false) {
    if (flushing) return;
    if (!manual && Date.now() < flushHold) return;
    const q = getQueue();
    if (!q.length) { if (manual) showToast('ไม่มีรายการค้างส่ง', 'info'); return; }
    if (!hasBackend()) { if (manual) openSettings(); return; }
    if (!navigator.onLine) { if (manual) showToast('ยังไม่มีสัญญาณ ระบบจะส่งให้อัตโนมัติเมื่อออนไลน์', 'error'); return; }
    flushing = true;
    $('pendingBadge').classList.add('syncing');
    let sent = 0, failed = null;
    for (const item of q) {
      try {
        if (item.kind === 'bulk') await api('bulkImport', { data: JSON.stringify(item.rows) });
        else await api('submit', item.data);
        sent++;
        setQueue(getQueue().filter(x => x.id !== item.id));
      } catch (err) {
        if (isBusyErr(err) || err.code === 'MAINTENANCE' || err.code === 'JOB_NOT_ALLOWED') { flushHold = Date.now() + 20000 + Math.random() * 10000; failed = err; break; }   // ไม่ว่าง/ปิดปรับปรุง/Job ยังไม่อนุญาต: เก็บรายการไว้ ลองรอบหน้า
        if (!err.network) { // เซิร์ฟเวอร์ปฏิเสธข้อมูล: ไม่ต้องลองซ้ำไปเรื่อย ๆ
          setQueue(getQueue().filter(x => x.id !== item.id));
          showToast(`ส่งรายการค้างไม่ผ่าน: ${err.message}`, 'error', 6000);
          continue;
        }
        failed = err; break;
      }
    }
    flushing = false;
    $('pendingBadge').classList.remove('syncing');
    if (sent) { showToast(`ส่งรายการที่ค้างไว้ ${sent} รายการแล้ว`, 'success'); playSound('success'); }
    else if (failed && manual) showToast(failed.code === 'MAINTENANCE' || failed.code === 'JOB_NOT_ALLOWED' ? `ส่งรายการค้างยังไม่ได้: ${failed.message}` : 'ส่งรายการค้างไม่สำเร็จ: เชื่อมต่อ Apps Script ไม่ได้ เปิดตั้งค่า แล้วกด "ทดสอบการเชื่อมต่อ"', 'error', 7000);
  }
  window.addEventListener('online', () => setTimeout(() => flushQueue(), Math.random() * 3000));
  window.addEventListener('offline', () => showToast('ออฟไลน์อยู่ บันทึกต่อได้ ระบบจะเก็บไว้ส่งทีหลัง', 'info', 4000));
  setTimeout(() => setInterval(() => flushQueue(), 30000), Math.random() * 10000);   // เหลื่อมเวลาแต่ละเครื่อง
  updatePendingBadge();
  setTimeout(() => flushQueue(), 1500 + Math.random() * 1500);

  /* ============ SERVER STATUS (สถานะการเชื่อมต่อเซิร์ฟเวอร์) ============ */
  const SERVER_LABEL = { ok: 'เชื่อมต่อแล้ว', checking: 'กำลังตรวจสอบ', down: 'เชื่อมต่อไม่ได้', offline: 'ออฟไลน์', nourl: 'ยังไม่ตั้งค่า' };
  const SLOW_MS = 4000;
  let serverChecking = false;
  function setServer(patch) {
    Object.assign(server, patch);
    renderServerChip();
    if ($('statusModal').classList.contains('active')) renderStatusPanel();
  }
  // ทุกครั้งที่เรียก API สำเร็จ/ล้มเหลว สถานะจะอัปเดตเองโดยไม่ต้องรอตรวจเป็นรอบ
  function noteServer(ok, err = '') {
    const was = server.state;
    if (ok) setServer({ state: 'ok', lastOk: Date.now(), lastCheck: Date.now(), err: '' });
    else setServer({ state: navigator.onLine ? 'down' : 'offline', lastCheck: Date.now(), err });
    if (ok && (was === 'down' || was === 'offline') && getQueue().length) setTimeout(() => flushQueue(), 300 + Math.random() * 2700);
  }
  function serverSlow() { return server.state === 'ok' && server.latency > SLOW_MS; }
  function renderServerChip() {
    const c = $('connChip'); if (!c) return;
    c.dataset.state = server.state;
    c.toggleAttribute('data-slow', serverSlow());
    const label = serverSlow() ? 'ตอบช้า' : SERVER_LABEL[server.state];
    $('connLbl').textContent = label;
    c.setAttribute('aria-label', `สถานะเซิร์ฟเวอร์: ${label} แตะเพื่อดูรายละเอียด`);
  }
  async function checkServer(manual = false) {
    if (!hasBackend()) return setServer({ state: 'nourl' });
    if (!navigator.onLine) return setServer({ state: 'offline' });
    if (serverChecking) return;
    serverChecking = true;
    const btn = $('statusCheckBtn');
    if (manual) { btn.disabled = true; btn.innerHTML = '<span class="spinner dark"></span> กำลังตรวจสอบ...'; }
    if (server.state !== 'ok') setServer({ state: 'checking' });
    const t0 = performance.now();
    try {
      // แบบเบา (light) ไม่เปิด Sheet จึงเรียกถี่ได้ ส่วนตอนกดตรวจเองจะอ่านชื่อไฟล์/ชีต/จำนวนแถวด้วย
      const r = await api('ping', manual ? {} : { light: '1' }, { timeout: 12000 });
      const patch = { latency: Math.round(performance.now() - t0), outdated: false };
      if (manual && r && r.spreadsheet) patch.info = { file: r.spreadsheet, sheet: r.sheet, rows: r.rows };
      setServer(patch);
    } catch (err) {
      if (err.code === 'UNKNOWN_ACTION') setServer({ latency: Math.round(performance.now() - t0), outdated: true });
    } finally {
      serverChecking = false;
      if (manual) { btn.disabled = false; btn.innerHTML = ic('refresh') + ' ตรวจสอบตอนนี้'; }
      if (server.state === 'checking') setServer({ state: 'down' });
    }
  }
  function renderStatusPanel() {
    const st = server.state, slow = serverSlow();
    const title = slow ? 'เชื่อมต่อได้ แต่ตอบช้า' : { ok: 'เชื่อมต่อเซิร์ฟเวอร์แล้ว', checking: 'กำลังตรวจสอบ...', down: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้', offline: 'ไม่มีอินเทอร์เน็ต', nourl: 'ยังไม่ได้ตั้งค่าเซิร์ฟเวอร์' }[st];
    const desc = { ok: 'ข้อมูลที่บันทึกจะถูกส่งเข้า Google Sheet ทันที', checking: 'รอสักครู่', down: 'ข้อมูลจะเก็บในเครื่องก่อน แล้วส่งให้อัตโนมัติเมื่อเชื่อมต่อได้', offline: 'บันทึกต่อได้ ระบบจะเก็บไว้ส่งทีหลัง', nourl: 'เปิดตั้งค่าเพื่อกำหนด URL ของ Apps Script' }[st];
    const hero = $('statusHero');
    hero.dataset.state = st; hero.toggleAttribute('data-slow', slow);
    hero.innerHTML = `<span class="big-dot"></span><div><b>${title}</b><small>${desc}</small></div>`;
    const t = server.lastCheck ? new Date(server.lastCheck).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-';
    const mode = IS_GAS ? 'เปิดผ่าน Google Apps Script' : EMBEDDED_URL ? 'ผู้ดูแลกำหนดไว้ในแอป' : googleScriptUrl ? 'ตั้งค่าในเครื่องนี้' : 'ยังไม่ตั้งค่า';
    const info = server.info ? `${escapeHTML(server.info.file)} / ${escapeHTML(server.info.sheet)} (${server.info.rows} แถว)` : 'กด "ตรวจสอบตอนนี้" เพื่อดู';
    const pending = getQueue().length;
    $('statusRows').innerHTML = [
      ['อินเทอร์เน็ต', navigator.onLine ? 'ออนไลน์' : 'ออฟไลน์'],
      ['เซิร์ฟเวอร์', mode],
      ['เวลาตอบกลับ', server.latency != null ? `${server.latency.toLocaleString('th-TH')} มิลลิวินาที` : '-'],
      ['ตรวจล่าสุด', t],
      ['ฐานข้อมูล', info],
      ['รายการรอส่ง', pending ? `${pending} รายการ` : 'ไม่มี']
    ].map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
    let hint = '';
    if (st === 'down') hint = (server.err ? escapeHTML(server.err) + ' ' : '') + 'ถ้าเกิดซ้ำ ให้เปิดตั้งค่า แล้วกด "ทดสอบการเชื่อมต่อ" เพื่อดูสาเหตุ หรือแจ้งผู้ดูแลระบบตรวจการ Deploy ของ Apps Script';
    else if (server.outdated) hint = 'Apps Script ที่ Deploy อยู่เป็นเวอร์ชันเก่า (ยังไม่รองรับคำสั่งตรวจสถานะ) ควรอัปเดต Code.gs และ Deploy เวอร์ชันใหม่';
    else if (slow) hint = 'เซิร์ฟเวอร์ตอบช้า การบันทึกอาจใช้เวลานานกว่าปกติ';
    $('statusHint').hidden = !hint; $('statusHint').innerHTML = hint;
    const fb = $('statusFlushBtn'); fb.hidden = !pending;
    fb.innerHTML = pending ? ic('refresh') + ` ส่งรายการที่ค้าง ${pending} รายการตอนนี้` : '';
  }
  function openStatus() {
    renderStatusPanel();
    $('statusModal').classList.add('active');
    if (Date.now() - (server.lastCheck || 0) > 10000) checkServer();
  }
  function closeStatus() { $('statusModal').classList.remove('active'); }
  window.addEventListener('online', () => checkServer());
  window.addEventListener('offline', () => setServer({ state: 'offline' }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - (server.lastCheck || 0) > 30000) checkServer(); });
  setTimeout(() => setInterval(() => { if (!document.hidden) checkServer(); }, 120000), Math.random() * 30000);   // ทุก 2 นาที (แบบเบา) เหลื่อมเวลาแต่ละเครื่อง
  renderServerChip();
  setTimeout(() => checkServer(), 700);

  /* ============ SOUND (สังเคราะห์เสียงด้วย Web Audio ไม่ต้องมีไฟล์เสียง ใช้ได้ตอนออฟไลน์) ============ */
  const SOUND_LEVELS = { low: 0.45, mid: 1, high: 1.9 };
  // [ความถี่ Hz, เริ่มที่ (วินาที), ยาว, ความดัง, รูปคลื่น]
  const SOUNDS = {
    success: [[659.25, 0, .14, .28, 'sine'], [783.99, .11, .14, .28, 'sine'], [1046.5, .22, .32, .30, 'sine']],   // ไล่เสียงขึ้น 3 โน้ต
    queued:  [[523.25, 0, .12, .24, 'triangle'], [523.25, .16, .16, .24, 'triangle']],                            // ติ๊ก-ติ๊ก เก็บไว้ส่งทีหลัง
    error:   [[196, 0, .18, .22, 'sawtooth'], [196, .24, .26, .22, 'sawtooth']],                                  // ต่ำ 2 ครั้ง ผิดพลาด
    alert:   [[880, 0, .12, .20, 'square'], [880, .2, .12, .20, 'square'], [880, .4, .12, .20, 'square']]         // บี๊บ 3 ครั้ง เตือน
  };
  let audioCtxObj = null, audioOut = null, lastErrSound = 0;
  function soundOn() { return store.get(KEYS.sound) !== '0'; }
  function soundLevel() { const v = store.get(KEYS.soundLevel); return SOUND_LEVELS[v] ? v : 'mid'; }
  function getAudio() {
    if (audioCtxObj) return audioCtxObj;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtxObj = new AC();
      audioOut = audioCtxObj.createDynamicsCompressor();   // กันเสียงแตกเมื่อเลือกระดับ "ดัง"
      audioOut.connect(audioCtxObj.destination);
    } catch (_) { audioCtxObj = null; }
    return audioCtxObj;
  }
  // เบราว์เซอร์ต้องให้ผู้ใช้แตะหน้าจอก่อนจึงจะเล่นเสียงได้ จึงปลดล็อกตอนแตะครั้งแรก
  function unlockAudio() { const c = getAudio(); if (c && c.state === 'suspended') c.resume().catch(() => {}); }
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { passive: true }));
  function tone(c, freq, at, dur, vol, type) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(audioOut);
    o.start(at); o.stop(at + dur + 0.03);
  }
  function playSound(kind, opts = {}) {
    if (!opts.force && !soundOn()) return;
    if (kind === 'error') { const n = Date.now(); if (n - lastErrSound < 700) return; lastErrSound = n; }
    const c = getAudio(); if (!c) return;
    if (c.state === 'suspended') c.resume().catch(() => {});
    const mult = SOUND_LEVELS[opts.level || soundLevel()];
    const t0 = c.currentTime + 0.03;
    (SOUNDS[kind] || []).forEach(([f, at, d, v, type]) => tone(c, f, t0 + at, d, Math.min(0.9, v * mult), type));
  }
  function testSounds() {
    unlockAudio();
    ['success', 'queued', 'error'].forEach((k, i) => setTimeout(() => playSound(k, { force: true }), i * 1000));
    showToast('กำลังเล่นเสียงทดสอบ: สำเร็จ, เก็บไว้ส่งทีหลัง, ผิดพลาด', 'info', 3500);
  }
  function renderPrefs() {
    $('pref-autofill').checked = autofillOn();
    $('pref-sound').checked = soundOn();
    $('pref-bg').checked = bgOn();
    $('soundLevelSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.level === soundLevel()));
    $('soundLevelRow').style.opacity = soundOn() ? '1' : '.45';
  }
  $('pref-autofill').addEventListener('change', e => {
    store.set(KEYS.autofill, e.target.checked ? '1' : '0');
    if (e.target.checked) { applyAutofillNow(); showToast('เปิดเติมข้อมูลอัตโนมัติแล้ว', 'info', 2500); }
    else { showToast('ปิดเติมข้อมูลอัตโนมัติแล้ว ฟอร์มถัดไปจะว่างทุกช่อง', 'info', 3500); }
  });
  $('pref-sound').addEventListener('change', e => {
    store.set(KEYS.sound, e.target.checked ? '1' : '0');
    renderPrefs();
    if (e.target.checked) { unlockAudio(); playSound('success'); }
  });
  $('soundLevelSeg').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    store.set(KEYS.soundLevel, b.dataset.level);
    renderPrefs(); unlockAudio(); playSound('success', { force: true });
  });
  $('pref-bg').addEventListener('change', e => { store.set(KEYS.bg, e.target.checked ? '1' : '0'); applyBackground(); });

  /* ============ BACKGROUND (ภาพพื้นหลัง) ============ */
  function bgOn() { return store.get(KEYS.bg) !== '0'; }
  function applyBackground() { document.documentElement.toggleAttribute('data-nobg', !bgOn()); }
  applyBackground();
  if (BG_IMAGE_URL) {
    const bg = $('appBg');
    bg.classList.add('custom');
    bg.style.backgroundImage = `linear-gradient(rgba(248, 250, 252, .86), rgba(248, 250, 252, .94)), url("${BG_IMAGE_URL.replace(/"/g, '%22')}")`;
  }

