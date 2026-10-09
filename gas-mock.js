const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
function makeSheet(name) {
  const data = []; // rows of arrays
  const sh = {
    name, data,
    getName: () => name,
    getLastRow: () => { for (let i = data.length - 1; i >= 0; i--) if (data[i] && data[i].some(v => v !== '' && v != null)) return i + 1; return 0; },
    getLastColumn: () => Math.max(1, ...data.map(r => { let n = 0; (r || []).forEach((v, i) => { if (v !== '' && v != null) n = i + 1; }); return n; })),
    getMaxRows: () => Math.max(1000, data.length), getMaxColumns: () => 50,
    insertColumnsAfter() {}, setFrozenRows() {}, insertColumnBefore() { data.forEach(r => r.unshift('')); },
    deleteRow(r) { data.splice(r - 1, 1); },
    appendRow(vals) { data[sh.getLastRow()] = vals.map(String); },
    getRange(r, c, nr = 1, nc = 1) {
      const rg = {
        getDisplayValues() { const out = []; for (let i = 0; i < nr; i++) { const row = []; for (let j = 0; j < nc; j++) { const v = (data[r - 1 + i] || [])[c - 1 + j]; row.push(v == null ? '' : String(v)); } out.push(row); } return out; },
        setValues(v) { v.forEach((row, i) => { data[r - 1 + i] = data[r - 1 + i] || []; row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; }); }); return rg; },
        setValue(x) { return rg.setValues([[x]]); },
        setNumberFormat() { return rg; }, setFontWeight() { return rg; },
        createTextFinder(t) { let hits = []; for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (String((data[r - 1 + i] || [])[c - 1 + j] ?? '') === t) hits.push(r + i); let k = 0;
          const f = { matchEntireCell() { return f; }, findNext() { return k < hits.length ? { getRow: () => hits[k++] } : null; } }; return f; }
      };
      return rg;
    }
  };
  return sh;
}
const sheets = {};
const ss = { getName: () => 'TestSS', getUrl: () => 'u', getId: () => 'id', getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)), getEditors: () => [] };
const cacheStore = {};
const ctx = {
  console,
  SpreadsheetApp: { getActiveSpreadsheet: () => ss },
  CacheService: { getScriptCache: () => ({ get: k => cacheStore[k] ?? null, put: (k, v) => { cacheStore[k] = v; }, remove: k => { delete cacheStore[k]; }, removeAll: ks => ks.forEach(k => delete cacheStore[k]) }) },
  LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
  PropertiesService: { getScriptProperties: () => ({ props: {}, getProperty(k) { return ctx.__props[k] ?? null; }, setProperty(k, v) { ctx.__props[k] = v; } }) },
  __props: {},
  Utilities: { getUuid: () => crypto.randomUUID(), sleep() {}, formatDate: (d, tz, f) => d.toISOString().replace('T', ' ').slice(0, f.length === 10 ? 10 : 19),
    computeDigest: (a, s) => [...crypto.createHash('md5').update(s).digest()].map(b => b > 127 ? b - 256 : b), DigestAlgorithm: { MD5: 1 }, Charset: { UTF_8: 1 } },
  Session: { getActiveUser: () => ({ getEmail: () => '' }), getEffectiveUser: () => ({ getEmail: () => 'owner@x' }) },
  ScriptApp: { getService: () => ({ getUrl: () => 'https://script/exec' }), getProjectTriggers: () => [] },
  DriveApp: { getFolderById: () => ({ createFile: () => ({ getId: () => 'f' + Math.random(), setSharing() {} }) }), createFolder: () => ({ getId: () => 'fold', createFile: () => ({ getId: () => 'p1', setSharing() {} }) }), getFileById: () => ({ setTrashed() {} }), Access: {}, Permission: {} },
  ContentService: { createTextOutput: t => ({ setMimeType: () => t }), MimeType: {} },
  HtmlService: { createHtmlOutputFromFile() { throw new Error('no'); } },
  UrlFetchApp: { fetch() {} }, Logger: { log() {} },
};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(require('path').join(__dirname, 'Code.gs'), 'utf8'), ctx);
module.exports = { ctx, sheets, cacheStore };
