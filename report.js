  /* ======================================================================
    report.js — รายงาน, รายละเอียดรายการ, ส่งออก CSV/Excel, นำเข้าข้อมูล, QR code, ลิงก์ตั้งค่าเครื่องใหม่
  ====================================================================== */
  /* ============ REPORT ============ */
  let reportChart = null;
  let reportData = [];
  let reportView = [];
  const reportFilter = { q: '', shift: 'all' };
  const isDay = item => String(item.shift || '').toLowerCase() === 'day';
  const dateKey = item => {
    const s = String(item.date || '');
    const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : (s || 'ไม่ระบุ');
  };
  const mpTotal = it => MANPOWER.reduce((s, [k]) => s + (Number(it[k]) || 0), 0);
  function recordMetrics(it) {
    const t = k => normTime(it[k]);
    const permit = diffMin(t('tb_talk'), t('wp_app'));
    const onsite = diffMin(t('arr_bee'), t('arr_asia'));
    const mp = mpTotal(it);
    return { permit, onsite, mp, manHours: onsite !== null && mp ? mp * onsite / 60 : null };
  }
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;

  function animateNumber(el, to, decimals = 0) {
    const fmt = v => v.toLocaleString('th-TH', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    if (reduceMotion || to === 0) { el.firstChild.textContent = fmt(to); return; }
    const dur = 900, start = performance.now();
    (function step(t) {
      const p = Math.min(1, (t - start) / dur);
      el.firstChild.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }
  function statTiles(tiles) {
    return tiles.map(([l, , c, unit]) => `<div class="stat" style="--c:${c}"><div class="num">0${unit ? `<small>${unit}</small>` : ''}</div><div class="lbl">${l}</div></div>`).join('');
  }
  function animateTiles(box, tiles) {
    box.querySelectorAll('.num').forEach((el, i) => {
      if (!el.firstChild || el.firstChild.nodeType !== 3) el.insertBefore(document.createTextNode('0'), el.firstChild);
      animateNumber(el, tiles[i][1], tiles[i][4] || 0);
    });
  }

  function renderStats(data) {
    const day = data.filter(isDay).length;
    const reporters = new Set(data.map(d => d.reporter).filter(Boolean)).size;
    let mp = 0, hasMp = false;
    data.forEach(it => MANPOWER.forEach(([k]) => {
      if (it[k] !== undefined && it[k] !== '') { hasMp = true; mp += Number(it[k]) || 0; }
    }));
    const tiles = [
      [reportTotal > data.length ? 'รายการที่แสดง' : 'รายงานทั้งหมด', data.length, 'var(--tw-blue)'],
      ['กะเช้า', day, 'var(--day)'],
      ['กะดึก', data.length - day, '#3358C9'],
      hasMp ? ['กำลังพลรวม', mp, 'var(--tw-red)', 'คน'] : ['ผู้รายงาน', reporters, 'var(--tw-red)', 'คน']
    ];
    const box = $('report-stats');
    box.innerHTML = statTiles(tiles);
    animateTiles(box, tiles);
  }

  function renderMetrics(data) {
    const ms = data.map(recordMetrics);
    const permits = ms.map(m => m.permit).filter(v => v !== null);
    const onsites = ms.map(m => m.onsite).filter(v => v !== null);
    const mh = ms.map(m => m.manHours).filter(v => v !== null);
    const box = $('report-metrics');
    if (!permits.length && !onsites.length && !mh.length) { box.innerHTML = ''; $('jobTableCard').hidden = true; return; }
    const tiles = [];
    if (permits.length) tiles.push(['รอ Permit เฉลี่ย', Math.round(avg(permits)), '#F59E0B', 'นาที']);
    if (onsites.length) tiles.push(['อยู่หน้างานเฉลี่ย', Math.round(avg(onsites) / 6) / 10, '#10B981', 'ชม.', 1]);
    if (mh.length) tiles.push(['คน-ชั่วโมงรวม', Math.round(mh.reduce((a, b) => a + b, 0) * 10) / 10, 'var(--tw-blue)', 'ชม.', 1]);
    box.innerHTML = `<div class="metrics-title">ตัวชี้วัดการทำงาน</div><div class="stats">${statTiles(tiles)}</div>`;
    animateTiles(box, tiles);

    // สรุปตาม Job
    const groups = {};
    data.forEach((it, i) => {
      const k = it.job || '-';
      const g = groups[k] = groups[k] || { n: 0, permit: [], onsite: [], mh: 0, mp: 0 };
      g.n++; g.mp += ms[i].mp;
      if (ms[i].permit !== null) g.permit.push(ms[i].permit);
      if (ms[i].onsite !== null) g.onsite.push(ms[i].onsite);
      if (ms[i].manHours !== null) g.mh += ms[i].manHours;
    });
    const rows = Object.entries(groups).sort((a, b) => b[1].mh - a[1].mh || b[1].n - a[1].n).slice(0, 30);
    $('jobTable').innerHTML = `<thead><tr><th>Job</th><th>รายงาน</th><th>กำลังพลเฉลี่ย</th><th>รอ Permit เฉลี่ย</th><th>คน-ชั่วโมง</th></tr></thead><tbody>` +
      rows.map(([job, g]) => `<tr><td>${escapeHTML(job)}</td><td>${g.n}</td><td>${(g.mp / g.n).toFixed(1)}</td>` +
        `<td>${g.permit.length ? fmtDur(Math.round(avg(g.permit)), false) : '-'}</td><td>${g.mh ? g.mh.toFixed(1) : '-'}</td></tr>`).join('') + '</tbody>';
    $('jobTableCard').hidden = false;
  }

  // โหลด Chart.js เมื่อต้องใช้ครั้งแรก (ไม่ให้หน้าแรกของแอปต้องรอไฟล์นี้)
  let chartLoading = null;
  function loadChartLib() {
    if (window.Chart) return Promise.resolve(true);
    if (!chartLoading) chartLoading = new Promise(res => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js';
      s.async = true; s.onload = () => res(true); s.onerror = () => { chartLoading = null; res(false); };
      document.head.appendChild(s);
    });
    return chartLoading;
  }
  function renderChart(data) {
    const card = $('chartCard');
    if (!data.length) { card.hidden = true; return; }
    if (!window.Chart) { loadChartLib().then(ok => { if (ok && reportView === data) renderChart(data); }); return; }
    const groups = {};
    data.forEach(it => {
      const k = dateKey(it);
      groups[k] = groups[k] || { day: 0, night: 0 };
      isDay(it) ? groups[k].day++ : groups[k].night++;
    });
    const keys = Object.keys(groups).sort().slice(-14);
    const labels = keys.map(k => { const m = k.match(/^\d{4}-(\d{2})-(\d{2})$/); return m ? `${+m[2]}/${+m[1]}` : k; });
    card.hidden = false;
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue('--muted').trim();
    const border = css.getPropertyValue('--border').trim();
    // มีกราฟอยู่แล้ว (พิมพ์ค้นหา / เปลี่ยนกะ / รีเฟรชเบื้องหลัง): อัปเดตข้อมูลในกราฟเดิม ไม่สร้างใหม่และไม่เล่นแอนิเมชันซ้ำ
    if (reportChart && reportChart.canvas && reportChart.canvas.isConnected) {
      reportChart.data.labels = labels;
      reportChart.data.datasets[0].data = keys.map(k => groups[k].day);
      reportChart.data.datasets[1].data = keys.map(k => groups[k].night);
      reportChart.update('none');
      return;
    }
    if (reportChart) reportChart.destroy();
    reportChart = new Chart($('reportChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'กะเช้า', data: keys.map(k => groups[k].day), backgroundColor: '#DC2626', borderRadius: 6, maxBarThickness: 34 },
          { label: 'กะดึก', data: keys.map(k => groups[k].night), backgroundColor: '#2B4FB8', borderRadius: 6, maxBarThickness: 34 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: reduceMotion ? false : { duration: 800, easing: 'easeOutQuart' },
        plugins: { legend: { position: 'bottom', labels: { color: muted, font: { family: 'Prompt' }, usePointStyle: true, boxWidth: 8 } } },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: muted, font: { family: 'Prompt' } } },
          y: { stacked: true, beginAtZero: true, grid: { color: border }, ticks: { color: muted, precision: 0, font: { family: 'Prompt' } } }
        }
      }
    });
  }

  function skeletonCards(n = 6) {
    return Array.from({ length: n }, () => `
      <div class="card report-card skeleton" style="border-left-color: var(--border);">
        <div class="sk-line" style="width:55%; height:16px;"></div>
        <div class="sk-line" style="width:35%;"></div>
        <div class="sk-line" style="width:70%; margin-bottom:0;"></div>
      </div>`).join('');
  }

  function applyReportFilter(resetShown = true) {
    if (resetShown) reportShown = REPORT_DOM_PAGE;
    reportView = reportData.filter(reportPredicate());
    renderStats(reportView);
    renderMetrics(reportView);
    renderChart(reportView);
    const list = $('report-list');
    const loaded = reportData.length, fmtN = n => Number(n).toLocaleString('th-TH');
    const num = n => `<span style="color: var(--tw-red); font-size: 16px;">${fmtN(n)}</span>`;
    let sum = reportView.length === loaded ? `พบ ${num(loaded)} รายการ` : `ตรงกับตัวกรอง ${num(reportView.length)} จาก ${fmtN(loaded)} รายการที่โหลด`;
    if (reportTotal > loaded) sum += ` · ทั้งหมดในช่วงนี้ ${fmtN(reportTotal)}`;
    if (reportTruncated) sum += ' (ระบบแสดงสูงสุดตามที่รองรับ เลือกช่วงวันที่เพื่อดูส่วนที่เหลือ)';
    if (reportTotal > loaded && reportLimit !== '0') sum += ' <button type="button" class="link-btn" id="loadAllBtn">โหลดทั้งหมด</button>';
    $('report-summary').innerHTML = sum;
    if (!reportView.length) {
      $('reportMore').hidden = true;
      list.innerHTML = reportData.length
        ? '<div class="empty-state">ไม่พบรายการที่ตรงกับคำค้นหรือตัวกรอง ลองเปลี่ยนคำค้นหรือเลือก "ทั้งหมด"</div>'
        : '<div class="empty-state">ไม่พบรายการในช่วงนี้</div>';
      return;
    }
    list.innerHTML = reportView.slice(0, reportShown).map((item, i) => {
      const day = isDay(item);
      const nPhotos = String(item.photos || '').split(',').filter(Boolean).length;
      return `
      <div class="card report-card ${day ? 'is-day' : 'is-night'}${i >= 12 ? ' no-anim' : ''}" style="--i:${Math.min(i, 12)}" role="button" tabindex="0" data-idx="${i}" aria-label="ดูรายละเอียด Job ${escapeHTML(item.job || '')}">
        <div class="rc-header">
          <span class="rc-job">${escapeHTML(item.job || '-')}</span>
          <span class="rc-shift ${day ? 'day' : 'night'}">${day ? ic('sun') + ' กะเช้า' : ic('moon') + ' กะดึก'}</span>
        </div>
        <div style="margin-bottom:8px;"><span class="rc-reporter">${ic('user')} ${escapeHTML(item.reporter || 'ไม่ระบุ')}</span></div>
        <div class="rc-meta">
          <span>${ic('calendar')} ปฏิบัติงาน: ${escapeHTML(thaiDate(item.date))}</span>
          ${item.location ? `<span>${ic('pin')} สถานที่: ${escapeHTML(item.location)}</span>` : ''}
          <span style="font-size: 11px;">${ic('clock')} บันทึก: ${escapeHTML(item.timestamp || '-')}${item.updated_at ? ' (แก้ไขแล้ว)' : ''}</span>
        </div>
        <div class="rc-more">${nPhotos ? `<span class="tag">${ic('camera')} ${nPhotos} รูป</span>` : ''}${item.lat ? `<span class="tag">${ic('pin')} มีพิกัด</span>` : ''}<span>แตะเพื่อดูรายละเอียด</span></div>
      </div>`;
    }).join('');
    const rest = reportView.length - reportShown;
    $('reportMore').hidden = rest <= 0;
    if (rest > 0) $('reportMore').innerHTML = `<button type="button" class="btn-outline">แสดงเพิ่มอีก ${Math.min(REPORT_DOM_PAGE, rest)} (เหลือ ${rest.toLocaleString('th-TH')})</button>`;
  }

  $('report-list').addEventListener('click', e => {
    const card = e.target.closest('.report-card[data-idx]');
    if (card) openDetail(+card.dataset.idx);
  });
  $('report-list').addEventListener('keydown', e => {
    const card = e.target.closest('.report-card[data-idx]');
    if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDetail(+card.dataset.idx); }
  });
  let searchTimer;
  $('reportSearch').addEventListener('input', e => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { reportFilter.q = e.target.value; applyReportFilter(); }, 150);
  });
  $('shiftSeg').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    $('shiftSeg').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
    reportFilter.shift = b.dataset.shift;
    applyReportFilter();
  });
  $('rangeChips').addEventListener('click', e => {
    const c = e.target.closest('.chip');
    if (!c) return;
    const now = new Date();
    let s = '', en = '';
    if (c.dataset.range === 'today') { s = en = ymd(now); }
    if (c.dataset.range === '7d') { const d = new Date(now); d.setDate(d.getDate() - 6); s = ymd(d); en = ymd(now); }
    if (c.dataset.range === 'month') { s = ymd(new Date(now.getFullYear(), now.getMonth(), 1)); en = ymd(now); }
    $('filterStartDate').value = s;
    $('filterEndDate').value = en;
    setActiveChip(c.dataset.range);
    fetchReport();
  });
  function setActiveChip(range) {
    $('rangeChips').querySelectorAll('.chip').forEach(x => x.classList.toggle('active', x.dataset.range === range));
  }
  ['filterStartDate', 'filterEndDate'].forEach(id => $(id).addEventListener('change', () => setActiveChip(null)));

  let reportVer = '', reportVerKey = '';   // เวอร์ชันข้อมูลจากเซิร์ฟเวอร์ (Code.gs v5.30+) ใช้ถามว่า "เปลี่ยนไหม" ตอนรีเฟรชเบื้องหลัง
  let reportFailN = 0, reportTotal = 0, reportTruncated = false, reportFetching = false, reportSig = '', reportShown = REPORT_DOM_PAGE;
  const adminLimit = () => { const v = String(serverCfg.report_default_limit); return ['50', '100', '200', '0'].includes(v) ? v : '50'; };
  let reportLimit = ['50', '100', '200', '0'].includes(store.get(KEYS.reportLimit)) ? store.get(KEYS.reportLimit) : adminLimit();
  function renderLimitSeg() { $('limitSeg').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.limit === reportLimit)); }
  renderLimitSeg();
  function setReportLimit(v) { reportLimit = v; store.set(KEYS.reportLimit, v); renderLimitSeg(); fetchReport(); }
  $('limitSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.limit !== reportLimit) setReportLimit(b.dataset.limit); });
  $('report-summary').addEventListener('click', e => { if (e.target.closest('#loadAllBtn')) setReportLimit('0'); });
  $('reportMore').addEventListener('click', () => { reportShown += REPORT_DOM_PAGE; applyReportFilter(false); });

  // opts.silent = รีเฟรชเงียบ ๆ ไม่แสดงโครงโหลด/ไม่แจ้ง error และวาดใหม่เฉพาะเมื่อข้อมูลเปลี่ยน
  async function fetchReport(opts = {}) {
    const silent = !!opts.silent;
    if (!hasBackend()) { if (silent) return; showToast('ตั้งค่า Script URL ในเมนูตั้งค่าก่อน', 'error'); return openSettings(); }
    const sDate = $('filterStartDate').value;
    const eDate = $('filterEndDate').value;
    if ((sDate && !eDate) || (!sDate && eDate)) { if (!silent) showToast('เลือกทั้งวันเริ่มต้นและวันสิ้นสุด', 'error'); return; }
    if (sDate && eDate && sDate > eDate) { if (!silent) showToast('วันเริ่มต้นต้องไม่อยู่หลังวันสิ้นสุด', 'error'); return; }
    if (reportFetching) return;
    reportFetching = true;

    const list = $('report-list');
    if (!silent) {
      list.innerHTML = skeletonCards();
      $('report-summary').innerHTML = '';
      $('report-stats').innerHTML = '';
      $('report-metrics').innerHTML = '';
      $('jobTableCard').hidden = true;
      $('reportMore').hidden = true;
    }
    try {
      const params = { paged: '1', limit: reportLimit };
      if (sDate && eDate) { params.startDate = sDate; params.endDate = eDate; }
      // รีเฟรชเบื้องหลังด้วยเงื่อนไขเดิม: ส่งเวอร์ชันที่มีอยู่ ถ้าไม่มีใครเขียนข้อมูลเพิ่ม เซิร์ฟเวอร์ตอบ unchanged โดยไม่ต้องอ่านชีต
      const verKey = JSON.stringify(params);
      if (silent && reportVer && reportVerKey === verKey) params.ver = reportVer;
      // เปิดดูเอง: ลองใหม่อัตโนมัติถ้าเซิร์ฟเวอร์ไม่ว่าง / รีเฟรชเบื้องหลัง: ลองครั้งเดียว (รอบหน้าค่อยว่ากัน ไม่เพิ่มภาระตอนคนใช้เยอะ)
      const res = silent ? await api('getReport', params, { timeout: 30000 }) : await apiRetry('getReport', params, { timeout: 30000 });
      reportFailN = 0;
      if (res && res.unchanged) return;
      reportVer = (res && !Array.isArray(res) && res.ver) || ''; reportVerKey = verKey;
      let rows, total, truncated = false;
      if (Array.isArray(res)) {              // Apps Script เวอร์ชันเก่า: ส่งมาทั้งหมด ตัดจำนวนที่ฝั่งแอป
        total = res.length; rows = reportLimit !== '0' ? res.slice(0, Number(reportLimit)) : res;
      } else { rows = res.rows || []; total = typeof res.total === 'number' ? res.total : rows.length; truncated = !!res.truncated; }
      const sig = rows.map(r => `${r.sid}|${r.updated_at || r.timestamp}`).join(',') + '#' + total;
      if (silent && sig === reportSig) return;
      const grew = silent && reportSig && total > reportTotal;
      reportSig = sig; reportTotal = total; reportTruncated = truncated;
      if (!rows.length) {
        reportData = [];
        $('reportTools').hidden = true;
        $('chartCard').hidden = true;
        list.innerHTML = '<div class="empty-state">ไม่พบรายการในช่วงนี้ ลองเปลี่ยนช่วงวันที่ หรือบันทึกรายการแรกที่หน้า "บันทึก"</div>';
        return;
      }
      reportData = rows;
      rows.forEach(r => rememberLocation(r.location, false));
      reportRecs = rows.map(r => ({ shift: r.shift, t: recordTimes(r) })).filter(r => Object.keys(r.t).length);
      $('reportTools').hidden = false;
      applyReportFilter(!silent);
      if (grew) showToast('มีรายการใหม่ อัปเดตรายงานแล้ว', 'info', 2500);
    } catch (error) {
      reportFailN++;
      if (silent) return;
      $('chartCard').hidden = true;
      list.innerHTML = error.kind === 'offline'
        ? '<div class="empty-state">ออฟไลน์อยู่ ดูรายงานได้เมื่อมีสัญญาณ ส่วนการบันทึกยังทำได้ตามปกติ</div>'
        : `<div class="empty-state" style="color:var(--tw-red);">โหลดข้อมูลไม่สำเร็จ (${escapeHTML(error.message)}) ตรวจสอบอินเทอร์เน็ตและ Script URL แล้วกด "รีเฟรช"</div>`;
    } finally { reportFetching = false; }
  }
  // หลายคนใช้พร้อมกัน: ขณะเปิดหน้ารายงานจะรีเฟรชเองเป็นระยะ (เฉพาะเมื่อหน้าจอเปิดอยู่และไม่ได้เปิดรายละเอียดค้างไว้)
  let reportTimer = null;
  function stopReportAutoRefresh() { clearTimeout(reportTimer); reportTimer = null; }
  function startReportAutoRefresh() {
    stopReportAutoRefresh();
    const tick = () => {
      reportTimer = setTimeout(async () => {
        if (!document.hidden && navigator.onLine && $('page-report').classList.contains('active') && !$('detailSheet').classList.contains('active')) {
          await fetchReport({ silent: true });
        }
        if ($('page-report').classList.contains('active')) tick();
      }, Math.min(REPORT_REFRESH_MS * Math.pow(2, Math.min(reportFailN, 2)), 6 * 60000) + Math.random() * 15000);   // ล้มเหลวติดกัน: ห่างขึ้นเป็น 3 / 6 นาที
    };
    tick();
  }

  /* ============ DETAIL SHEET ============ */
  function openDetail(i) {
    const it = reportView[i];
    if (!it) return;
    const day = isDay(it);
    const mp = MANPOWER.filter(([k]) => it[k] !== undefined && it[k] !== '');
    const total = mpTotal(it);
    const times = ACTIVITIES.map(([k]) => normTime(it[k]));
    const hasTimes = ACTIVITIES.some(([k]) => it[k] !== undefined);
    const t = analyzeTimes(times);
    const photoIds = String(it.photos || '').split(',').map(x => x.trim()).filter(x => /^[\w-]+$/.test(x));

    let html = `
      <div class="rc-header" style="margin-bottom:4px;">
        <h3>${escapeHTML(it.job || '-')}</h3>
        <span class="rc-shift ${day ? 'day' : 'night'}">${day ? ic('sun') + ' กะเช้า' : ic('moon') + ' กะดึก'}</span>
      </div>
      <div class="sub"><div>${ic('user')}<span>${escapeHTML(it.reporter || 'ไม่ระบุ')}</span></div><div>${ic('calendar')}<span>${escapeHTML(thaiDate(it.date))}</span></div>${it.location ? `<div>${ic('pin')}<span>${escapeHTML(it.location)}</span></div>` : ''}<div>${ic('clock')}<span>บันทึกเมื่อ ${escapeHTML(it.timestamp || '-')}</span></div>${it.submitted_by ? `<div>${ic('user')}<span>บัญชีผู้ส่ง ${escapeHTML(it.submitted_by)}</span></div>` : ''}${it.updated_at ? `<div>${ic('edit')}<span>แก้ไขล่าสุด ${escapeHTML(it.updated_at)}${it.updated_by ? ' โดย ' + escapeHTML(it.updated_by) : ''}</span></div>` : ''}</div>`;
    if (mp.length) {
      html += `<h4>กำลังพล ${total} คน</h4><div class="mp-grid">` +
        mp.map(([k, l]) => `<div><span>${l}</span><b>${escapeHTML(it[k])}</b></div>`).join('') + '</div>';
    }
    if (hasTimes) {
      html += `<h4>เวลา${t.total ? ` (รวม ${fmtDur(t.total, false)})` : ''}</h4><ul class="mini-tl">` +
        ACTIVITIES.map(([, l], idx) => {
          const r = t.items[idx];
          const cls = r.warn ? 'warn' : r.done ? 'done' : '';
          const g = r.warn ? 'เวลาก่อนขั้นก่อนหน้า' : r.gap !== null ? fmtDur(r.gap) : '';
          return `<li class="${cls}"><span>${l}</span><span class="t">${times[idx] || '-'}</span>${g ? `<span class="g">${g}</span>` : ''}</li>`;
        }).join('') + '</ul>';
    }
    if (photoIds.length) {
      html += `<h4>รูปถ่าย ${photoIds.length} รูป</h4><div class="sheet-photos">` +
        photoIds.map(id => encodeURIComponent(id)).map(id => `<a href="https://drive.google.com/file/d/${id}/view" target="_blank" rel="noopener"><img src="https://drive.google.com/thumbnail?id=${id}&sz=w400" alt="" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="ph-fb" hidden>${ic('camera')}<span>เปิดรูป</span></span></a>`).join('') + '</div>';
    }
    if (it.lat && it.lng) {
      html += `<h4>พิกัด</h4><div class="geo-status ok">${ic('pin')}${escapeHTML(it.lat)}, ${escapeHTML(it.lng)}${it.acc ? ` (±${escapeHTML(it.acc)} ม.)` : ''} <a href="https://www.google.com/maps?q=${encodeURIComponent(it.lat)},${encodeURIComponent(it.lng)}" target="_blank" rel="noopener">เปิดแผนที่</a></div>`;
    }
    if (!mp.length && !hasTimes) {
      html += '<p style="font-size:13px; color:var(--muted); line-height:1.6;">รายงานนี้มีเฉพาะข้อมูลหลัก ถ้าต้องการเห็นกำลังพลและเวลา ให้ใช้ Apps Script เวอร์ชันใหม่ (Code.gs)</p>';
    }
    $('sheetBody').innerHTML = html;
    $('sheetShare').onclick = () => shareSummary(buildSummary(it));
    $('sheetAdmin').hidden = !it.sid;
    $('sheetEdit').onclick = () => startEdit(it);
    $('sheetDelete').onclick = () => deleteRecord(it);
    $('detailSheet').classList.add('active');
    haptic(6);
  }
  function closeSheet() { $('detailSheet').classList.remove('active'); }

  /* ============ EXPORT (CSV + Excel ตาราง Activity Project Schedule) ============ */
  // กัน CSV/Formula injection: ค่าที่ขึ้นต้นด้วย = + - @ tab CR จะถูก Excel ตีความเป็นสูตร ใส่ ' นำหน้า (ยกเว้นตัวเลขติดลบล้วน)
  const csvCell = v => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function downloadBlob(text, filename) { downloadFile(new Blob([text], { type: 'text/csv;charset=utf-8;' }), filename); }

  // ตัวกรองเดียวกับที่ใช้ในหน้ารายงาน (ค้นหา + กะ)
  function reportPredicate() {
    const q = reportFilter.q.trim().toLowerCase();
    return it => {
      if (reportFilter.shift === 'day' && !isDay(it)) return false;
      if (reportFilter.shift === 'night' && isDay(it)) return false;
      if (q && !`${it.job || ''} ${it.reporter || ''} ${it.location || ''}`.toLowerCase().includes(q)) return false;
      return true;
    };
  }
  // ข้อมูลที่จะส่งออก: ถ้าหน้ารายงานโหลดมาไม่ครบ (เลือก 50/100/200) จะดึง "ทั้งหมดของช่วงวันที่ที่เลือก" มาให้ ไม่ขึ้นกับจำนวนที่แสดง
  let exporting = false;
  async function getExportRows() {
    let rows = reportData, truncated = false;
    if (reportTotal > reportData.length) {
      showToast('กำลังเตรียมข้อมูลทั้งหมดของช่วงที่เลือก...', 'info', 4000);
      const params = { paged: '1', limit: '0' };
      const sDate = $('filterStartDate').value, eDate = $('filterEndDate').value;
      if (sDate && eDate) { params.startDate = sDate; params.endDate = eDate; }
      const res = await api('getReport', params);
      if (Array.isArray(res)) rows = res; else { rows = res.rows || []; truncated = !!res.truncated; }
    }
    return { rows: rows.filter(reportPredicate()), truncated };
  }
  const exportSuffix = () => { const s = $('filterStartDate').value, e = $('filterEndDate').value; return s && e ? `${s}_to_${e}` : todayLocal(); };
  const capNote = t => t ? ' (ระบบรองรับสูงสุด 5,000 รายการล่าสุด เลือกช่วงวันที่เพื่อส่งออกส่วนที่เหลือ)' : '';

  async function exportCSV() {
    if (exporting) return;
    exporting = true;
    try {
      const { rows: data, truncated } = await getExportRows();
      if (!data.length) return showToast('ไม่มีข้อมูลให้ส่งออก', 'error');
      const labels = { timestamp: 'เวลาบันทึก', reporter: 'ชื่อผู้รายงาน', job: 'Job No.', date: 'วันที่', shift: 'กะ', location: 'สถานที่',
                       lat: 'ละติจูด', lng: 'ลองจิจูด', acc: 'ความแม่นยำ (ม.)', photos: 'รหัสรูปใน Drive', updated_at: 'แก้ไขล่าสุด', sid: 'รหัสรายการ' };
      MANPOWER.concat(ACTIVITIES).forEach(([k, l]) => { labels[k] = l; });
      const order = ['timestamp', 'reporter', 'job', 'date', 'shift', 'location', ...MANPOWER.map(x => x[0]), ...ACTIVITIES.map(x => x[0]), 'photos', 'updated_at', 'sid'];
      const present = new Set(data.flatMap(Object.keys));
      const cols = order.filter(k => present.has(k)).concat([...present].filter(k => !order.includes(k)));
      const table = [cols.map(k => labels[k] || k), ...data.map(it => cols.map(k => it[k]))];
      downloadBlob('\uFEFF' + table.map(r => r.map(csvCell).join(',')).join('\r\n'), `รายงานหน้างาน_${exportSuffix()}.csv`);
      showToast(`ส่งออก CSV ${data.length.toLocaleString('th-TH')} รายการแล้ว${capNote(truncated)}`, 'success', truncated ? 6000 : undefined);
    } catch (err) { showToast(`ส่งออกไม่สำเร็จ: ${err.message}`, 'error', 5000); }
    finally { exporting = false; }
  }

  /* ---------- ตัวสร้างไฟล์ .xlsx (ไม่ใช้ไลบรารี ทำงานได้ตอนออฟไลน์) ---------- */
  const CRC_TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function zipStore(files) {          // .xlsx คือไฟล์ zip: ใช้แบบไม่บีบอัด (store) ก็เปิดใน Excel ได้
    const enc = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    const d = new Date(), dosTime = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const dosDate = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    files.forEach(f => {
      const name = enc.encode(f.name), data = enc.encode(f.data), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      chunks.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    const cdSize = central.reduce((s, c) => s + c.length, 0), end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: XLSX_MIME });
  }
  const xmlEsc = v => String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
  const colLetter = i => { let s = '', n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  // สไตล์เซลล์ (ดัชนีใน cellXfs): 1 ชื่อรายงาน, 2 หัวตาราง, 3 กลาง+เส้น, 4 ซ้าย+เส้น, 5 วันที่, 6 เวลา, 7 หัว D (เช้า), 8 หัว N (ดึก)
  const XLSX_STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="hh:mm"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Tahoma"/><family val="2"/></font><font><b/><sz val="14"/><name val="Tahoma"/><family val="2"/></font><font><b/><sz val="11"/><name val="Tahoma"/><family val="2"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEAF0FA"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF3D1"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDDE5FB"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="center" wrapText="1" indent="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const C = (v, s = 0, kind = 'str') => ({ v, s, kind });   // เซลล์: ค่า, สไตล์, ชนิด (str | num)
  function sheetXml(sh) {
    let data = '';
    sh.rows.forEach((row, ri) => {
      const r = ri + 1, ht = sh.heights && sh.heights[r] ? ` ht="${sh.heights[r]}" customHeight="1"` : '';
      let cells = '';
      row.forEach((c, ci) => {
        if (c == null) return;
        const ref = colLetter(ci) + r, st = c.s ? ` s="${c.s}"` : '';
        if (c.v === '' || c.v == null) cells += `<c r="${ref}"${st}/>`;
        else if (c.kind === 'num') cells += `<c r="${ref}"${st}><v>${c.v}</v></c>`;
        else cells += `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(c.v)}</t></is></c>`;
      });
      data += `<row r="${r}"${ht}>${cells}</row>`;
    });
    const cols = sh.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
    const pane = sh.freezeRows ? `<pane ySplit="${sh.freezeRows}" topLeftCell="A${sh.freezeRows + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${sh.freezeRows + 1}" sqref="A${sh.freezeRows + 1}"/>` : '';
    const merges = sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
    const filter = sh.autoFilter ? `<autoFilter ref="${sh.autoFilter}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"${sh.first ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${cols}</cols><sheetData>${data}</sheetData>${filter}${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
  }
  function buildXlsx(sheets) {
    sheets.forEach((s, i) => { s.first = i === 0; });
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: XLSX_STYLES },
      ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) }))
    ];
    return zipStore(files);
  }
  const excelDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000) : null; };
  const excelTime = v => { const t = parseTime(normTime(v)); return t ? Number((toMin(t) / 1440).toPrecision(15)) : null; };

  // รวมรายการที่ วันที่/สถานที่/Job เดียวกัน เป็นแถวเดียว: เวลากะเช้าลงคอลัมน์ D กะดึกลงคอลัมน์ N
  // (ถ้ากะเดียวกันมีหลายรายการ เช่น คนละคนรายงาน จะแยกเป็นแถวถัดไป ไม่ให้ข้อมูลทับกัน)
  function scheduleRows(rows) {
    const groups = new Map();
    rows.forEach((r, idx) => {
      const k = [dateKey(r), String(r.location || '').trim(), String(r.job || '').trim()].join('\u0001');
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(Object.assign({}, r, { _i: idx }));
    });
    const out = [];
    groups.forEach(list => {
      list.sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')) || b._i - a._i);
      const day = list.filter(isDay), night = list.filter(r => !isDay(r));
      for (let i = 0; i < Math.max(day.length, night.length); i++) {
        out.push({ date: dateKey(list[0]), location: String(list[0].location || '').trim(), job: String(list[0].job || '').trim(), D: day[i], N: night[i] });
      }
    });
    return out.sort((a, b) => a.date.localeCompare(b.date) || a.location.localeCompare(b.location, 'th') || a.job.localeCompare(b.job, 'th'));
  }
  function scheduleSheet(rows) {
    const total = 4 + ACTIVITIES.length * 2, last = colLetter(total - 1);
    const r1 = Array.from({ length: total }, (_, i) => C(i === 0 ? 'Activity Project Schedule' : '', 1));
    const r2 = [C('ลำดับ', 2), C('วันที่', 2), C('สถานที่', 2), C('Job', 2)], r3 = [C('', 2), C('', 2), C('', 2), C('', 2)];
    const merges = [`A1:${last}1`, 'A2:A3', 'B2:B3', 'C2:C3', 'D2:D3'];
    ACTIVITIES.forEach(([, label], i) => {
      r2.push(C(label, 2), C('', 2)); r3.push(C('D', 7), C('N', 8));
      merges.push(`${colLetter(4 + i * 2)}2:${colLetter(5 + i * 2)}2`);
    });
    const body = scheduleRows(rows).map((o, idx) => {
      const row = [C(idx + 1, 3, 'num'), excelDate(o.date) != null ? C(excelDate(o.date), 5, 'num') : C(o.date, 3), C(o.location, 4), C(o.job, 4)];
      ACTIVITIES.forEach(([k]) => [o.D, o.N].forEach(rec => {
        const t = rec ? excelTime(rec[k]) : null;
        row.push(t != null ? C(t, 6, 'num') : C('', 6));
      }));
      return row;
    });
    return { name: 'Activity Schedule', rows: [r1, r2, r3, ...body], merges, heights: { 1: 32, 2: 26, 3: 22 }, freezeRows: 3,
             widths: [8, 13, 26, 20, ...ACTIVITIES.flatMap(() => [12, 12])] };
  }
  // ชีตที่ 2: ข้อมูลทั้งหมดทีละรายการ (กำลังพล พิกัด ผู้รายงาน ฯลฯ) ใช้กรอง/ทำ Pivot ต่อได้
  function rawSheet(rows) {
    const spec = [['timestamp', 'เวลาบันทึก', 'str', 20], ['reporter', 'ชื่อผู้รายงาน', 'str', 20], ['job', 'Job No.', 'str', 18], ['date', 'วันที่', 'date', 12],
      ['shift', 'กะ', 'shift', 9], ['location', 'สถานที่', 'str', 24],
      ...MANPOWER.map(([k, l]) => [k, l, 'num', 11]), ...ACTIVITIES.map(([k, l]) => [k, l, 'time', 12]),
      ['updated_at', 'แก้ไขล่าสุด', 'str', 20]];
    const sorted = rows.slice().sort((a, b) => dateKey(a).localeCompare(dateKey(b)) || String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
    const body = sorted.map(it => spec.map(([k, , kind]) => {
      const v = it[k];
      if (kind === 'date') { const n = excelDate(v); return n != null ? C(n, 5, 'num') : C(v ?? '', 3); }
      if (kind === 'time') { const t = excelTime(v); return t != null ? C(t, 6, 'num') : C('', 6); }
      if (kind === 'shift') return C(isDay(it) ? 'กะเช้า' : 'กะดึก', 3);
      if (kind === 'num') { const n = Number(v); return v === '' || v == null || !isFinite(n) ? C('', 3) : C(n, 3, 'num'); }
      return C(v ?? '', 4);
    }));
    return { name: 'ข้อมูลทั้งหมด', rows: [spec.map(([, h]) => C(h, 2)), ...body], heights: { 1: 32 }, freezeRows: 1,
             widths: spec.map(s => s[3]), autoFilter: `A1:${colLetter(spec.length - 1)}${body.length + 1}` };
  }
  async function exportXLSX() {
    if (exporting) return;
    exporting = true;
    try {
      const { rows, truncated } = await getExportRows();
      if (!rows.length) return showToast('ไม่มีข้อมูลให้ส่งออก', 'error');
      downloadFile(buildXlsx([scheduleSheet(rows), rawSheet(rows)]), `Activity_Project_Schedule_${exportSuffix()}.xlsx`);
      showToast(`ส่งออก Excel ${rows.length.toLocaleString('th-TH')} รายการแล้ว${capNote(truncated)}`, 'success', truncated ? 6000 : undefined);
    } catch (err) { showToast(`ส่งออกไม่สำเร็จ: ${err.message}`, 'error', 5000); }
    finally { exporting = false; }
  }

  /* ============ IMPORT ============ */
  const TEMPLATE_HEADERS = [
    'ชื่อผู้รายงาน', 'Job No.', 'วันที่ (YYYY-MM-DD)', 'กะ (Day หรือ Night)',
    'Operation Manager', 'Sale Engineer', 'Foreman', 'Permit Holder', 'Safety', 'Fire watch', 'Jetter', 'Jetter (C)',
    'Arrival to Site', 'Safety Tool Box Talk', 'Work Permit Approve', 'Break', 'Close Permit', 'Arrival to Asia', 'สถานที่'
  ];
  function parseCSV(text) {
    const rows = []; let row = [], cell = '', q = false;
    text = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cell.trim()); cell = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cell.trim()); rows.push(row); row = []; cell = '';
      } else cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows.filter(r => r.length > 1 && r[0] !== '' && r[0] !== TEMPLATE_HEADERS[0]);
  }
  function downloadTemplate() {
    const example = ['ตัวอย่างนาย เอ', 'V-20601,V-0601', '2026-08-22', 'Day', 1, 0, 2, 1, 2, 2, 4, 3, '06:50', '07:10', '08:40', '11:45', '18:00', '18:40', 'โรงงาน A'];
    downloadBlob('\uFEFF' + TEMPLATE_HEADERS.map(csvCell).join(',') + '\r\n' + example.map(csvCell).join(','), 'template_import_งาน.csv');
  }

  let parsedRows = [];
  const fileInput = $('csvFileInput');
  function resetDropzone() {
    fileInput.value = '';
    parsedRows = [];
    $('dzTitle').textContent = 'แตะเพื่อเลือกไฟล์ CSV';
    $('dzSub').textContent = 'หรือลากไฟล์มาวางที่นี่';
  }
  function readSelectedFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      parsedRows = parseCSV(e.target.result);
      $('dzTitle').innerHTML = ic('file') + '<span>' + escapeHTML(file.name) + '</span>';
      $('dzSub').textContent = parsedRows.length ? `พร้อมนำเข้า ${parsedRows.length} รายการ` : 'ไม่พบข้อมูลในไฟล์ (มีแค่หัวตาราง)';
    };
    reader.readAsText(file, 'UTF-8');
  }
  fileInput.addEventListener('change', () => readSelectedFile(fileInput.files[0]));
  const dz = $('dropzone');
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', e => {
    const f = e.dataTransfer.files[0];
    if (f) { fileInput.files = e.dataTransfer.files; readSelectedFile(f); }
  });

  async function processImport() {
    if (!hasBackend()) { showToast('ตั้งค่า Script URL ก่อนนำเข้า', 'error'); return openSettings(); }
    if (!fileInput.files.length) return showToast('เลือกไฟล์ CSV ก่อน', 'error');
    if (!parsedRows.length) return showToast('ไม่พบข้อมูลที่จะนำเข้า (อาจมีแค่หัวตาราง)', 'error');

    const btn = $('btnImport');
    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span> กำลังนำเข้า ${parsedRows.length} รายการ...`;
    const rows = parsedRows;

    try {
      const res = await apiRetry('bulkImport', { data: JSON.stringify(rows) });
      let note = res.unconfirmed ? 'ตรวจสอบผลได้ที่หน้ารายงาน' : '';
      if (res.skipped || res.invalid) note = [res.skipped ? `ข้าม ${res.skipped} แถวที่เคยนำเข้าแล้ว` : '', res.invalid ? `ข้อมูลไม่ครบ ${res.invalid} แถว` : ''].filter(Boolean).join(', ');
      showSuccess(`นำเข้า ${typeof res.imported === 'number' ? res.imported : rows.length} รายการ`, '', note, 'นำเข้าแล้ว');
      resetDropzone();
    } catch (err) {
      if (err.network) {
        if (enqueue({ kind: 'bulk', rows }) === 'fail') { showToast('พื้นที่ในเครื่องเต็ม เก็บไว้ส่งทีหลังไม่ได้', 'error'); return; }
        showSuccess(`นำเข้า ${rows.length} รายการ`, '', 'ยังไม่มีสัญญาณ เก็บไว้ในเครื่องแล้ว จะส่งให้อัตโนมัติเมื่อออนไลน์', 'เก็บไว้ส่งทีหลัง', 'queued');
        resetDropzone();
      } else showToast(err.message || 'นำเข้าไม่สำเร็จ ลองอีกครั้ง', 'error', 4500);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHTML;
    }
  }

  /* ============ QR CODE ============ */
  let qrLink = '';
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('load'));
      document.head.appendChild(s);
    });
  }
  async function appBaseUrl() {
    if (IS_GAS) return gasCall('getAppUrl', {});
    return location.href.split(/[?#]/)[0];
  }
  async function makeQR() {
    const job = $('qrJob').value.trim() || $('jobNo').value.trim();
    const loc = $('qrLoc').value.trim();
    if (!job) return showToast('ใส่ Job No. ก่อนสร้าง QR', 'error');
    $('qrJob').value = job;
    try {
      if (typeof qrcode === 'undefined') await loadScript(QR_LIB);
      qrLink = `${await appBaseUrl()}?job=${encodeURIComponent(job)}${loc ? '&loc=' + encodeURIComponent(loc) : ''}`;
      const qr = qrcode(0, 'M');
      qr.addData(qrLink);
      qr.make();
      $('qrBox').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
      $('qrJobLabel').textContent = job;
      $('qrLocLabel').textContent = loc;
      $('qrUrl').textContent = qrLink;
      $('qrResult').hidden = false;
      haptic(10);
    } catch (_) {
      showToast('สร้าง QR ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', 'error');
    }
  }
  async function copyQrLink() {
    try { await navigator.clipboard.writeText(qrLink); showToast('คัดลอกลิงก์แล้ว', 'success'); }
    catch (_) { showToast('คัดลอกไม่ได้ กดค้างที่ลิงก์ใต้ QR เพื่อคัดลอกเอง', 'error'); }
  }
  function printQR() {
    document.body.classList.add('print-qr');
    const done = () => { document.body.classList.remove('print-qr'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    window.print();
    setTimeout(done, 1500);
  }

  /* ============ SETUP LINK (ตั้งค่าเครื่องใหม่) ============ */
  let setupLink = '';
  function renderSetupCard() { $('setupCard').hidden = IS_GAS || !!EMBEDDED_URL || !googleScriptUrl || !isAdminIdentity(); }   // QR ตั้งค่าเครื่อง: เฉพาะ admin
  async function makeSetupQR() {
    if (!googleScriptUrl) return;
    try {
      if (typeof qrcode === 'undefined') await loadScript(QR_LIB);
      setupLink = `${await appBaseUrl()}?server=${encodeURIComponent(googleScriptUrl)}`;
      const qr = qrcode(0, 'M');
      qr.addData(setupLink);
      qr.make();
      $('setupQrBox').innerHTML = qr.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
      $('setupLink').textContent = setupLink;
      $('setupResult').hidden = false;
      haptic(10);
    } catch (_) { showToast('สร้าง QR ไม่ได้ ตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง', 'error'); }
  }
  async function copySetupLink() {
    try { await navigator.clipboard.writeText(setupLink); showToast('คัดลอกลิงก์ตั้งค่าแล้ว', 'success'); }
    catch (_) { showToast('คัดลอกไม่ได้ กดค้างที่ลิงก์ใต้ QR เพื่อคัดลอกเอง', 'error'); }
  }
  renderSetupCard();

  // เปิดแอปจากลิงก์/QR: ?job=...&loc=... (ใส่ Job/สถานที่)  หรือ ?server=... (ตั้งค่าเครื่องใหม่)
  const setupParamSeen = /[?&]server=/.test(location.search);
  async function applyUrlParams() {
    let params = {};
    try {
      params = IS_GAS
        ? await new Promise(r => google.script.url.getLocation(l => r(l.parameter || {})))
        : Object.fromEntries(new URLSearchParams(location.search));
    } catch (_) {}
    let touched = false;
    if (params.server && !IS_GAS) {
      touched = true;
      const url = String(params.server).trim();
      if (EMBEDDED_URL) { /* แอปนี้ฝัง URL ไว้แล้ว ไม่รับค่าจากลิงก์ */ }
      else if (urlProblem(url)) showToast('ลิงก์ตั้งค่านี้มี URL ไม่ถูกต้อง', 'error', 5000);
      else if (url === googleScriptUrl) showToast('เครื่องนี้ตั้งค่าไว้แล้ว', 'info', 2500);
      else {
        const ok = await confirmDialog('ตั้งค่าเซิร์ฟเวอร์จากลิงก์', `จะตั้งฐานข้อมูลของแอปเป็น ...${url.slice(-12)} ข้อมูลที่บันทึกจากเครื่องนี้จะถูกส่งไปที่นี่ กดยืนยันเฉพาะลิงก์ที่ได้รับจากผู้ดูแลระบบ`, 'ยืนยัน');
        if (ok) {
          googleScriptUrl = url; store.set(KEYS.url, url); requestPersist();
          showToast('ตั้งค่าเซิร์ฟเวอร์แล้ว จำไว้ในเครื่องนี้ ใช้งานได้ทันที', 'success', 4000);
          checkServer(); loadJobs(true); renderSetupCard();
        }
      }
    }
    if (!editing && (params.job || params.loc)) {
      touched = true;
      if (params.job) { $('jobNo').value = params.job; store.set(KEYS.job, params.job); }
      if (params.loc) { $('siteLocation').value = params.loc; store.set(KEYS.loc, params.loc); }
      refreshForm();
      showToast(`ตั้ง${params.job ? ` Job ${params.job}` : ''}${params.job && params.loc ? ' และ' : ''}${params.loc ? `สถานที่ ${params.loc}` : ''} จาก QR แล้ว`, 'success');
    }
    if (touched && !IS_GAS && history.replaceState) history.replaceState(null, '', location.pathname);
  }
  applyUrlParams();
  // เดิม: เครื่องที่ยังไม่มี URL จะเปิดหน้าตั้งค่า + toast ให้วาง URL เองตอนเปิดแอป
  // ตอนนี้ปิดไว้ เพราะหน่วยงานฝัง URL ใน DEFAULT_SCRIPT_URL (config.js) แล้ว ไม่ต้องให้ผู้ใช้ทั่วไปเห็น popup นี้
  // ถ้า URL หายไปจริง (เช่นอัปโหลด config.js ทับด้วยฉบับว่าง) จะเห็นแค่ชิปสถานะ "ยังไม่ตั้งค่า" บน header
  // และข้อความแจ้งตอนล็อกอิน (ดู submitEmpLogin ใน form.js) ผู้ดูแลยังตั้ง URL เองได้ที่ปุ่มตั้งค่า (ฟันเฟือง)

