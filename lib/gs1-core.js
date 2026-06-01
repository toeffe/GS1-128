/**
 * Pure GS1-128 logic — no DOM. Used by gs1-128.html and Node tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.GS1Core = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {
  const FNC1 = String.fromCharCode(29);

  const GS1_AI = {
    '00': { name: 'SSCC', len: 18, fixed: true },
    '01': { name: 'GTIN', len: 14, fixed: true },
    '02': { name: 'CONTENT', len: 14, fixed: true },
    '10': { name: 'BATCH/LOT', len: 20, fixed: false },
    '11': { name: 'PROD DATE', len: 6, fixed: true },
    '12': { name: 'DUE DATE', len: 6, fixed: true },
    '13': { name: 'PACK DATE', len: 6, fixed: true },
    '15': { name: 'BEST BEFORE', len: 6, fixed: true },
    '16': { name: 'SELL BY', len: 6, fixed: true },
    '17': { name: 'USE BY', len: 6, fixed: true },
    '20': { name: 'VARIANT', len: 2, fixed: true },
    '21': { name: 'SERIAL', len: 20, fixed: false },
    '22': { name: 'CPV', len: 20, fixed: false },
    '30': { name: 'VAR COUNT', len: 8, fixed: false },
    '3100': { name: 'NET WEIGHT kg', len: 6, fixed: true },
    '3101': { name: 'NET WEIGHT kg', len: 6, fixed: true },
    '3102': { name: 'NET WEIGHT kg', len: 6, fixed: true },
    '3103': { name: 'NET WEIGHT kg', len: 6, fixed: true },
    '3200': { name: 'NET WEIGHT lb', len: 6, fixed: true },
    '3202': { name: 'NET WEIGHT lb', len: 6, fixed: true },
    '37': { name: 'COUNT', len: 8, fixed: false },
    '410': { name: 'SHIP FROM GLN', len: 13, fixed: true },
    '411': { name: 'BILL TO GLN', len: 13, fixed: true },
    '412': { name: 'PURCHASE FROM GLN', len: 13, fixed: true },
    '413': { name: 'SHIP FOR GLN', len: 13, fixed: true },
    '414': { name: 'LOC GLN', len: 13, fixed: true },
    '420': { name: 'SHIP TO POST', len: 20, fixed: false },
    '422': { name: 'ORIGIN', len: 3, fixed: true },
    '91': { name: 'INT REF 1', len: 90, fixed: false },
    '92': { name: 'INT REF 2', len: 90, fixed: false },
  };

  const SAVED_ITEM_FIELDS = ['itemDescription', 'gtin', 'netWeight', 'count'];

  const GS1_82 = /^[\x21-\x22\x25-\x2F\x30-\x39\x3A-\x3F\x41-\x5A\x5F\x61-\x7A\x7B-\x7E]+$/;

  function gs1Mod10(s) {
    const d = s.split('').map(Number);
    const check = d.pop();
    let sum = 0;
    d.forEach((n, i) => { sum += i % 2 === 0 ? n * 3 : n; });
    return (10 - (sum % 10)) % 10 === check;
  }

  function luhn14(s) { return gs1Mod10(s); }

  function calcCheckDigit(s) {
    const d = s.split('').map(Number);
    let sum = 0;
    d.forEach((n, i) => { sum += i % 2 === 0 ? n * 3 : n; });
    return (10 - (sum % 10)) % 10;
  }

  function isGS182(s) { return s === '' || GS1_82.test(s); }

  function stripNonGS182(s) {
    return s.replace(/[^\x21-\x22\x25-\x2F\x30-\x39\x3A-\x3F\x41-\x5A\x5F\x61-\x7A\x7B-\x7E]/g, '');
  }

  function dateToYYMMDD(v) {
    if (!v) return null;
    const [y, m, d] = v.split('-');
    return y.slice(-2) + m + d;
  }

  function yyToFullYear(yy) {
    const now = new Date().getFullYear();
    const century = Math.floor(now / 100) * 100;
    const full2000s = century + yy;
    const full1900s = century - 100 + yy;
    return Math.abs(full2000s - now) <= Math.abs(full1900s - now) ? full2000s : full1900s;
  }

  function parseDate(s) {
    if (!/^\d{6}$/.test(s)) return null;
    const yy = parseInt(s.slice(0, 2), 10);
    const mm = parseInt(s.slice(2, 4), 10);
    const dd = parseInt(s.slice(4, 6), 10);
    if (mm < 1 || mm > 12) return null;
    if (dd < 0 || dd > 31) return null;
    const year = yyToFullYear(yy);
    return dd === 0
      ? `${year}-${String(mm).padStart(2, '0')} (last day of month)`
      : `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  }

  function parseDateObj(s) {
    if (!/^\d{6}$/.test(s)) return null;
    const yy = parseInt(s.slice(0, 2), 10);
    const mm = parseInt(s.slice(2, 4), 10);
    const dd = parseInt(s.slice(4, 6), 10) || 1;
    if (mm < 1 || mm > 12) return null;
    return new Date(yyToFullYear(yy), mm - 1, dd);
  }

  function derivePrefixFromGtin(gtin) {
    const g = gtin.replace(/\D/g, '').padStart(14, '0').slice(0, 14);
    if (!/^\d{14}$/.test(g)) return null;
    return g.slice(1, 8);
  }

  function composeSSCC(extension, prefix, serialNum) {
    const ext = String(extension).replace(/\D/g, '').slice(-1) || '0';
    const p = prefix.replace(/\D/g, '');
    if (!p) return { error: 'Could not derive company prefix from GTIN-14.' };
    if (p.length > 15) return { error: 'Company prefix derived from GTIN is too long.' };
    const serialLen = 16 - p.length;
    if (serialLen < 1) return { error: 'Company prefix leaves no room for a serial number.' };
    const maxSerial = Math.pow(10, serialLen) - 1;
    if (serialNum > maxSerial) return { error: `Serial counter exhausted for this prefix (max ${maxSerial}).` };
    const serial = String(serialNum).padStart(serialLen, '0');
    const base17 = ext + p + serial;
    const check = calcCheckDigit(base17);
    return { sscc: base17 + String(check) };
  }

  function mergeSSCCLogData(fileData, localData) {
    const merged = { version: 1, nextCounter: 1, issued: [] };
    const known = new Set();
    [...(localData?.issued || []), ...(fileData?.issued || [])].forEach(item => {
      const sscc = String(item.sscc || '').replace(/\D/g, '');
      if (sscc.length === 18 && !known.has(sscc)) {
        merged.issued.push({
          sscc,
          issuedAt: item.issuedAt || new Date().toISOString(),
          gtin: item.gtin || '',
          batch: item.batch || '',
        });
        known.add(sscc);
      }
    });
    merged.nextCounter = Math.max(
      parseInt(fileData?.nextCounter, 10) || 1,
      parseInt(localData?.nextCounter, 10) || 1,
      1,
    );
    return merged;
  }

  function normalizeSavedItem(item) {
    const out = { id: item.id, name: String(item.name || '').trim() };
    SAVED_ITEM_FIELDS.forEach(f => { out[f] = item[f] != null ? String(item[f]) : ''; });
    out.updatedAt = item.updatedAt || new Date().toISOString();
    return out;
  }

  function mergeItemsCatalog(fileData, localData) {
    const byId = new Map();
    [...(localData?.items || []), ...(fileData?.items || [])].forEach(item => {
      if (!item?.id) return;
      const next = normalizeSavedItem(item);
      const prev = byId.get(next.id);
      if (!prev || (next.updatedAt || '') > (prev.updatedAt || '')) byId.set(next.id, next);
    });
    return {
      version: 1,
      items: [...byId.values()].sort((a, b) =>
        (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }),
      ),
    };
  }

  function splitVerifyInput(raw) {
    const text = raw.trim();
    if (!text) return [];

    const lineSplit = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (lineSplit.length > 1) return lineSplit;

    const markers = [...text.matchAll(/\((?:01|10|00)\)/g)];
    if (markers.length <= 1) return [text];

    const segments = [];
    for (let i = 0; i < markers.length; i++) {
      const start = markers[i].index;
      const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
      segments.push(text.slice(start, end).trim());
    }
    return segments.filter(Boolean);
  }

  function normalise(raw) {
    let s = raw.trim();
    if (s.startsWith(']C1')) s = s.slice(3);
    s = s.replace(/<GS>|\\x1D|\[GS\]/gi, FNC1);

    if (/\(\d{2,4}\)/.test(s)) {
      const matches = [...s.matchAll(/\((\d{2,4})\)/g)];
      if (!matches.length) return s;
      const parts = [];
      for (let i = 0; i < matches.length; i++) {
        const ai = matches[i][1];
        const start = matches[i].index + matches[i][0].length;
        const end = i + 1 < matches.length ? matches[i + 1].index : s.length;
        const val = s.slice(start, end).replace(/\s+/g, '');
        parts.push({ ai, val });
      }
      return parts.map((p, idx) => {
        const def = GS1_AI[p.ai];
        const needsSep = def && !def.fixed && idx < parts.length - 1;
        return p.ai + p.val + (needsSep ? FNC1 : '');
      }).join('');
    }

    return s.replace(/\s+/g, '');
  }

  function findAI(str, pos) {
    for (let len = 4; len >= 2; len--) {
      const c = str.slice(pos, pos + len);
      if (GS1_AI[c]) return { ai: c, def: GS1_AI[c] };
    }
    return null;
  }

  function formatValue(ai, val) {
    if (['11', '12', '13', '15', '16', '17'].includes(ai)) {
      const d = parseDate(val);
      return d || val + ' ⚠';
    }
    if (ai.startsWith('31')) {
      const dec = parseInt(ai[3], 10);
      const n = parseInt(val, 10);
      return isNaN(n) ? val : (n / Math.pow(10, dec)).toFixed(dec) + ' kg';
    }
    return val;
  }

  function validateField(ai, val) {
    const issues = [];
    const def = GS1_AI[ai];
    if (!def) return issues;
    if (def.fixed && val.length !== def.len) {
      issues.push({ sev: 'err', msg: `Length error: expected ${def.len} chars, got ${val.length}` });
    }
    if (!def.fixed && val.length > def.len) {
      issues.push({ sev: 'err', msg: `Too long: max ${def.len} chars, got ${val.length}` });
    }
    if (['11', '12', '13', '15', '16', '17'].includes(ai)) {
      const d = parseDate(val);
      if (!d) issues.push({ sev: 'err', msg: 'Invalid date — must be YYMMDD' });
      else if (['15', '17'].includes(ai)) {
        const dt = parseDateObj(val);
        if (dt && dt < new Date()) issues.push({ sev: 'warn', msg: 'Date is in the past' });
      }
    }
    if (ai === '00') {
      if (!/^\d{18}$/.test(val)) issues.push({ sev: 'err', msg: 'SSCC must be 18 digits' });
      else if (!gs1Mod10(val)) {
        const exp = calcCheckDigit(val.slice(0, 17));
        issues.push({ sev: 'err', msg: `Check digit invalid — should be ${exp}` });
      } else issues.push({ sev: 'ok', msg: 'Check digit verified ✓' });
    }
    if (ai === '01' || ai === '02') {
      if (!/^\d{14}$/.test(val)) issues.push({ sev: 'err', msg: 'GTIN must be 14 digits' });
      else if (!luhn14(val)) {
        const exp = calcCheckDigit(val.slice(0, 13));
        issues.push({ sev: 'err', msg: `Check digit invalid — should be ${exp}` });
      } else issues.push({ sev: 'ok', msg: 'Check digit verified ✓' });
    }
    if (['410', '411', '412', '413', '414'].includes(ai) && val.length !== 13) {
      issues.push({ sev: 'err', msg: 'GLN must be 13 digits' });
    }
    if (ai === '30') {
      if (!/^\d+$/.test(val)) issues.push({ sev: 'err', msg: 'Count must be numeric' });
      else if (val.length > 8) issues.push({ sev: 'err', msg: `Count too long: max 8 digits, got ${val.length}` });
    }
    if ((ai === '10' || ai === '21') && val.length > 0 && !isGS182(val)) {
      issues.push({ sev: 'warn', msg: 'Contains characters outside GS1-82 charset' });
    }
    return issues;
  }

  function parseFields(raw) {
    const norm = normalise(raw);
    const fields = [];
    let pos = 0;
    while (pos < norm.length) {
      if (norm[pos] === FNC1) { pos++; continue; }
      const found = findAI(norm, pos);
      if (!found) { pos++; continue; }
      const { ai, def } = found;
      pos += ai.length;
      let val = '';
      if (def.fixed) {
        val = norm.slice(pos, pos + def.len);
        pos += def.len;
      } else {
        const fnc = norm.indexOf(FNC1, pos);
        val = fnc === -1 ? norm.slice(pos) : norm.slice(pos, fnc);
        pos += val.length;
      }
      fields.push({ ai, def, val });
    }
    return fields;
  }

  function barcodeTitleFromFields(fields) {
    if (!fields.length) return 'Barcode';
    if (fields[0].ai === '01') return 'Product';
    if (fields[0].ai === '10') return 'Batch / Lot';
    if (fields[0].ai === '00') return 'SSCC';
    return 'Barcode';
  }

  return {
    FNC1,
    GS1_AI,
    SAVED_ITEM_FIELDS,
    gs1Mod10,
    luhn14,
    calcCheckDigit,
    isGS182,
    stripNonGS182,
    dateToYYMMDD,
    parseDate,
    parseDateObj,
    derivePrefixFromGtin,
    composeSSCC,
    mergeSSCCLogData,
    mergeItemsCatalog,
    normalizeSavedItem,
    splitVerifyInput,
    normalise,
    findAI,
    formatValue,
    validateField,
    parseFields,
    barcodeTitleFromFields,
  };
});
