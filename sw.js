// Service worker: เปิดแอปได้แม้ออฟไลน์ (ข้อมูลที่ส่งไม่ผ่านจะถูกเก็บในคิวของหน้าแอปเอง)
// เปลี่ยนเลขเวอร์ชันทุกครั้งที่อัปเดตไฟล์ เพื่อให้เครื่องผู้ใช้ดึงไฟล์ใหม่
// TODO: หลังฝัง DEFAULT_SCRIPT_URL ใน js/config.js (หรือแก้ไฟล์ใดก็ตาม) ให้เปลี่ยนเลขด้านล่างทุกครั้ง เช่น v5-22
const CACHE = 'field-app-v5-33';
const SHELL = ['./', './index.html', './style.css',
  './js/config.js', './js/form.js', './js/sync.js', './js/submit.js', './js/report.js', './js/admin.js',
  './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // ห้ามแคชการเรียก Google Apps Script — ต้องได้ข้อมูลสดเสมอ
  if (/script\.google(usercontent)?\.com$/.test(url.hostname)) return;

  // หน้า HTML: ลองเน็ตก่อน (ได้เวอร์ชันล่าสุด) ถ้าออฟไลน์ใช้ที่แคชไว้
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(fetch(req)
      .then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); return res; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }

  // ไฟล์อื่น (ฟอนต์, Chart.js, ไอคอน): ใช้แคชทันที แล้วอัปเดตเบื้องหลัง
  e.respondWith(caches.match(req).then(cached => {
    const net = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => cached);
    return cached || net;
  }));
});
