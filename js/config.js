  /* ======================================================================
    config.js — ค่าคงที่/คอนฟิก, ตัวช่วยทั่วไป (HELPERS), วิเคราะห์เวลา, render ส่วนฟอร์ม
  ====================================================================== */
  /* ============ CONFIG ============ */
  const MANPOWER = [
    ['op_mgr', 'Operation Manager'], ['sale', 'Sale Engineer'], ['foreman', 'Foreman'],
    ['permit', 'Permit Holder'], ['safety', 'Safety'], ['fire', 'Fire watch'],
    ['jetter', 'Jetter'], ['jetter_c', 'Jetter (C)']
  ];
  const ACTIVITIES = [
    ['arr_bee', 'Arrival to Site'], ['tb_talk', 'Safety Tool Box Talk'], ['wp_app', 'Work Permit Approve'],
    ['break_time', 'Break'], ['close_permit', 'Close Permit'], ['arr_asia', 'Arrival to Asia']
  ];
  const DAY_START = 6, DAY_END = 18;   // 06:00–17:59 = กะเช้า
  const MAX_GAP_BEFORE_MIDNIGHT = 720; // เวลาย้อนเกิน 12 ชม. = ข้ามเที่ยงคืน
  const MAX_PHOTOS = 3;
  const REPORT_DOM_PAGE = 200;          // รายงาน: วาดการ์ดทีละกี่ใบ (กดแสดงเพิ่มได้)
  const REPORT_REFRESH_MS = 90000;      // รีเฟรชรายงานเองทุก ~90 วินาที ขณะเปิดหน้ารายงาน (เห็นรายการของคนอื่นที่เพิ่งบันทึก)
  const REMIND_WINDOW = { Day: [18 * 60 + 30, 23 * 60 + 59], Night: [6 * 60 + 30, 12 * 60] };
  const QR_LIB = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
  const KEYS = { url: 'googleScriptUrl', job: 'lastJobNo', reporter: 'lastReporter', draft: 'formDraft',
                 queue: 'pendingQueue', sent: 'sentLog', loc: 'lastLocation', locs: 'recentLocs', sections: 'formSections', sound: 'soundOn', autofill: 'autoFill', timeHist: 'timeHist', reportLimit: 'reportLimit', jobList: 'jobList', jobHist: 'jobHist', emp: 'empIdentity', cfg: 'serverCfg', dev: 'devId', ann: 'annSeen', soundLevel: 'soundLevel', bg: 'bgOn', pin: 'adminPin', install: 'installDismissed',
                 presets: 'mpPresets', glove: 'gloveMode', remindOn: 'remindOn', reminded: 'remindedKey' };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // เปิดผ่าน Apps Script (HtmlService) หรือโฮสต์เอง
  const IS_GAS = typeof google !== 'undefined' && !!(google.script && google.script.run);

  /* ===== วาง Web App URL ของ Apps Script ที่นี่ (ลงท้ายด้วย /exec) =====
     ตัวอย่างค่าที่วาง: 'https://script.google.com/macros/s/AKfy..../exec' (วางแทนเครื่องหมายคำพูดว่างในบรรทัดล่าง)
     - ฝังแล้ว: ทุกเครื่องใช้ URL นี้ทันที, หน้าตั้งค่าจะไม่แสดงช่อง URL
       และ URL นี้ชนะค่าเก่าที่เคยบันทึกค้างในเครื่องพนักงาน
     - เว้นว่าง: ผู้ใช้ต้องวาง URL เองที่ปุ่มตั้งค่า (ไอคอนฟันเฟือง)
     เปลี่ยน URL ภายหลัง: แก้บรรทัดนี้แล้วอัปโหลดไฟล์ใหม่ (เปลี่ยนเลข CACHE ใน sw.js ด้วย) */
  // >>>>>>>>>> TODO (ทำเอง): วาง Web App URL ระหว่างเครื่องหมายคำพูดบรรทัดล่างนี้ <<<<<<<<<<
  // รูปแบบ: 'https://script.google.com/macros/s/AKfy.........../exec'  (ต้องลงท้ายด้วย /exec ไม่ใช่ /dev)
  // ถ้าเว้นว่าง: เครื่องใหม่จะไม่มี URL -> ดึงรายชื่อ People ไม่ได้ -> ล็อกอินด้วยรหัสพนักงานไม่ผ่าน (นี่คือสาเหตุหลักที่เข้าระบบไม่ได้)
  // หลังวางแล้ว ต้องทำต่อ 2 อย่าง:
  //   1) เปลี่ยนเลขเวอร์ชัน CACHE ใน sw.js (เช่น 'field-app-v5-21' -> 'field-app-v5-22') ไม่งั้นเครื่องเดิมจะยังใช้ไฟล์เก่าจากแคช
  //   2) ฝั่ง Apps Script ต้อง Deploy เป็น Web app: Execute as = Me, Who has access = Anyone และกด New version ทุกครั้งที่แก้โค้ด
  // ทดสอบ: เปิด <URL>/exec?action=ping ในเบราว์เซอร์ ต้องได้ JSON ที่มี "status":"ok"
  const DEFAULT_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzdova2mMYDOjhs5isAkAhdTpFAD9M4h6wbzxyejsO3D67PJKU8G_jsW5bpDURiRqZN/exec';
  const EMBEDDED_URL = (DEFAULT_SCRIPT_URL || '').trim();

  /* รูปพื้นหลังของหน่วยงาน (ไม่บังคับ): วางไฟล์ภาพไว้ใน repo แล้วใส่ชื่อไฟล์ เช่น 'bg.jpg'
     เว้นว่าง = ใช้ภาพโรงงานและคลื่นน้ำที่มากับแอป (ภาพที่ใส่จะถูกซ้อนฟิล์มสีขาวบาง ๆ เพื่อให้อ่านตัวหนังสือง่าย) */
  const BG_IMAGE_URL = '';

  /* ส่วนของแบบฟอร์มที่แสดงโดยปริยายของทุกเครื่อง (true = แสดง, false = ซ่อน)
     ผู้ใช้ปรับเฉพาะเครื่องตัวเองได้ที่ ตั้งค่า > ส่วนของแบบฟอร์มที่แสดง */
  const DEFAULT_SECTIONS = { location: true, manpower: true, times: true, photos: true };

  /* ============ HELPERS ============ */
  const $ = id => document.getElementById(id);
  // ไอคอนแบบเส้น (SVG sprite ที่ต้นหน้า) ใช้แทนอีโมจิทั้งแอป
  const ic = (n, cls = '') => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const pad = n => String(n).padStart(2, '0');
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
    getJSON(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    setJSON(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  };
  function escapeHTML(v) {
    return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayLocal = () => ymd(new Date());
  const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // ขอให้เบราว์เซอร์เก็บข้อมูลของแอปถาวร (กันถูกล้างเมื่อพื้นที่เครื่องเต็ม)
  function requestPersist() { try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (_) {} }
  requestPersist();
  const APP_VERSION = '5.27';   // เพิ่มเลขทุกครั้งที่ปล่อยเวอร์ชันใหม่ ผู้ดูแลตั้ง min_app_version ในแท็บ Config เพื่อบังคับให้เครื่องเก่ารีเฟรชได้
  $('sideVerNum').textContent = APP_VERSION;
  const DEVICE_ID = (() => { let v = store.get(KEYS.dev); if (!v) { v = uid(); store.set(KEYS.dev, v); } return v; })();   // ใช้นับการใส่ PIN ผิดต่อเครื่อง
  function haptic(ms = 10) { if (navigator.vibrate) navigator.vibrate(ms); }
  const shiftLabel = s => String(s || '').toLowerCase() === 'day' ? 'กะเช้า' : 'กะดึก';
  function thaiDate(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return s || '-';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  function normTime(v) {
    const s = String(v ?? '').trim();
    if (!s) return '';
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) { const d = new Date(s); if (!isNaN(d)) return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
    const m = s.match(/(\d{1,2}):(\d{2})/);
    return m ? `${pad(m[1])}:${m[2]}` : '';
  }
  function toFormData(obj) {
    const fd = new FormData();
    Object.entries(obj).forEach(([k, v]) => fd.append(k, v ?? ''));
    return fd;
  }
  const hasBackend = () => IS_GAS || !!googleScriptUrl;
  // ค่าเริ่มต้น = ปิด: ฟอร์มว่างทุกช่อง ไม่เติมอะไรให้เอง (เปิดได้ที่ ตั้งค่า > การกรอกข้อมูล)
  function autofillOn() { return store.get(KEYS.autofill) === '1'; }

  /* ============ TIME ANALYSIS ============ */
  const toMin = v => { const [h, m] = v.split(':').map(Number); return h * 60 + m; };
  function fmtDur(d, plus = true) {
    const h = Math.floor(d / 60), m = Math.round(d % 60);
    return (plus ? '+' : '') + (h ? `${h} ชม. ${m} น.` : `${m} น.`);
  }
  function diffMin(a, b) {
    if (!a || !b) return null;
    let d = toMin(b) - toMin(a);
    if (d < 0) { if (-d > MAX_GAP_BEFORE_MIDNIGHT) d += 1440; else return null; }
    return d;
  }
  function analyzeTimes(values) {
    let prevAbs = null, first = null;
    const items = values.map(v => ({ done: !!v, gap: null, warn: false }));
    values.forEach((v, i) => {
      if (!v) return;
      const m = toMin(v);
      if (prevAbs === null) { prevAbs = first = m; return; }
      let c = m + 1440 * Math.floor(prevAbs / 1440);
      if (c < prevAbs) {
        if (prevAbs - c > MAX_GAP_BEFORE_MIDNIGHT) c += 1440;
        else { items[i].warn = true; return; }
      }
      items[i].gap = c - prevAbs;
      prevAbs = c;
    });
    return { items, total: first === null ? 0 : prevAbs - first, warns: items.filter(x => x.warn).length };
  }

  /* ============ RENDER FORM PARTS ============ */
  $('manpower-list').innerHTML = MANPOWER.map(([n, l]) => `
    <div class="data-item">
      <span>${l}</span>
      <div class="stepper">
        <button type="button" class="step-btn" data-target="${n}" data-step="-1" aria-label="ลด ${l}">−</button>
        <input type="number" name="${n}" placeholder="-" min="0" inputmode="numeric" aria-label="${l}">
        <button type="button" class="step-btn" data-target="${n}" data-step="1" aria-label="เพิ่ม ${l}">+</button>
      </div>
    </div>`).join('');

  $('tlList').innerHTML = ACTIVITIES.map(([n, l], i) => `
    <li class="tl-item">
      <span class="tl-dot"><span class="tl-num">${i + 1}</span><svg viewBox="0 0 24 24"><polyline points="5 12 10 17 19 8"></polyline></svg></span>
      <div class="tl-label"><label for="${n}">${l}</label><span class="tl-gap"></span></div>
      <div class="input-group">
        <input type="text" class="time-input" name="${n}" id="${n}" inputmode="numeric" enterkeyhint="next" autocomplete="off" maxlength="5" placeholder="เช่น 07:00" aria-label="${l} เวลา พิมพ์ เช่น 0700">
        <input type="time" class="time-native" id="${n}_t" tabindex="-1" aria-hidden="true">
        <button type="button" class="btn-time-pick" onclick="pickTime('${n}')" aria-label="เลือกเวลา ${l} จากนาฬิกา">${ic('clock')}</button>
        <button type="button" class="btn-time-now" onclick="setCurrentTime('${n}')">Now</button>
      </div>
      <div class="tl-chips" aria-label="เวลาที่แนะนำสำหรับ ${l}"></div>
    </li>`).join('');

