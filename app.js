
/* Scanner-device app: reads input like keyboard. No camera. */
(function () {
  const ITEMS = window.__UPC_ITEMS__ || [];
  const meta = document.getElementById('meta');
  const scanInput = document.getElementById('scanInput');
  const searchInput = document.getElementById('searchInput');
  const dropdown = document.getElementById('dropdown');
  const statusEl = document.getElementById('status');
  const lastParsed = document.getElementById('lastParsed');

  const resultEmpty = document.getElementById('resultEmpty');
  const resultCard = document.getElementById('resultCard');
  const rDesc = document.getElementById('rDesc');
  const rId = document.getElementById('rId');
  const rBarcode = document.getElementById('rBarcode');
  const rDept = document.getElementById('rDept');
  const rZone = document.getElementById('rZone');
  const rBin = document.getElementById('rBin');

  meta.textContent = `Loaded ${ITEMS.length.toLocaleString()} materials`;

  // Build fast lookup maps.
  const byBarcode = new Map();
  const byMatId = new Map();

  function normalizeDigits(s) {
    return (s || '').toString().replace(/[^\d]/g, '');
  }
  function stripLeadingZeros(s) {
    return (s || '').replace(/^0+/, '') || '0';
  }

  for (const it of ITEMS) {
    const bc = (it.barcode || '').toString().trim();
    const bcNorm = normalizeDigits(bc);
    if (bcNorm) {
      if (!byBarcode.has(bcNorm)) byBarcode.set(bcNorm, it);
      const bcNo0 = stripLeadingZeros(bcNorm);
      if (bcNo0 && !byBarcode.has(bcNo0)) byBarcode.set(bcNo0, it);
    }
    if (it.materialId != null) {
      byMatId.set(String(it.materialId), it);
    }
  }

  // GS1/QR parsing: support strings like:
  // 010628509500834417270226102485061 21ZY2T00D36AC8FQF
  function extractBestCode(raw) {
    const s = (raw || '').toString().trim();
    if (!s) return { raw: '', candidates: [] };

    // Candidate 1: GS1 AI (01) GTIN-14
    const m1 = s.match(/(?:\(?01\)?)(\d{14})/);
    const cands = [];
    if (m1 && m1[1]) cands.push({ type: 'GS1 GTIN-14', value: m1[1] });

    // Candidate 2: longest digit sequences
    const digitSeqs = s.match(/\d{8,18}/g) || [];
    // Prefer 14, 13, 12 digit sequences (GTIN-14/EAN-13/UPC-A)
    for (const len of [14, 13, 12]) {
      const hit = digitSeqs.find(x => x.length === len);
      if (hit) cands.push({ type: `Digits-${len}`, value: hit });
    }
    // Fallback: longest digits
    if (digitSeqs.length) {
      const longest = digitSeqs.slice().sort((a,b)=>b.length-a.length)[0];
      cands.push({ type: `Digits-${longest.length}`, value: longest });
    }

    // Candidate 3: material ID typed/scanned
    const onlyDigits = normalizeDigits(s);
    if (onlyDigits.length >= 5 && onlyDigits.length <= 9) {
      cands.push({ type: 'Material ID', value: onlyDigits });
    }

    // Unique candidates by value
    const seen = new Set();
    const uniq = [];
    for (const c of cands) {
      const v = normalizeDigits(c.value);
      if (!v) continue;
      if (seen.has(v)) continue;
      seen.add(v);
      uniq.push({ ...c, value: v });
    }
    return { raw: s, candidates: uniq };
  }

  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.style.color = kind === 'ok' ? '#16a34a' : (kind === 'bad' ? '#dc2626' : '#64748b');
    statusEl.style.borderColor = kind === 'ok' ? 'rgba(22,163,74,.35)' : (kind === 'bad' ? 'rgba(220,38,38,.35)' : '#e5e7eb');
  }

  function showResult(it) {
    if (!it) {
      resultCard.classList.add('hidden');
      resultEmpty.classList.remove('hidden');
      return;
    }
    resultEmpty.classList.add('hidden');
    resultCard.classList.remove('hidden');
    rDesc.textContent = it.description || '(No description)';
    rId.textContent = it.materialId != null ? String(it.materialId) : '-';
    rBarcode.textContent = it.barcode ? String(it.barcode) : '-';
    rDept.textContent = it.department || '-';
    rZone.textContent = it.zone || '-';
    rBin.textContent = it.bin || '-';
  }

  function findByScan(raw) {
    const parsed = extractBestCode(raw);
    if (!parsed.raw) return null;

    // Show parsing info (but not JSON)
    if (parsed.candidates.length) {
      lastParsed.textContent = 'Parsed: ' + parsed.candidates.map(c => `${c.type}: ${c.value}`).join(' • ');
    } else {
      lastParsed.textContent = '';
    }

    for (const c of parsed.candidates) {
      const v = c.value;
      // Try as barcode
      const hit1 = byBarcode.get(v);
      if (hit1) return hit1;
      const v2 = stripLeadingZeros(v);
      const hit2 = byBarcode.get(v2);
      if (hit2) return hit2;
      // Try as material id
      const hit3 = byMatId.get(v);
      if (hit3) return hit3;
    }
    return null;
  }

  // --- Scanner input behavior ---
  let debounceTimer = null;
  function processScanNow() {
    const raw = scanInput.value.trim();
    if (!raw) return;
    const hit = findByScan(raw);
    if (hit) {
      setStatus('Found', 'ok');
      showResult(hit);
    } else {
      setStatus('Not found (use search)', 'bad');
      showResult(null);
    }
    scanInput.value = '';
    // keep always ready
    setTimeout(() => scanInput.focus(), 10);
  }

  scanInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimer) clearTimeout(debounceTimer);
      processScanNow();
    }
  });

  scanInput.addEventListener('input', () => {
    // If scanner does not send Enter, process after a brief idle.
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      processScanNow();
    }, 220);
  });

  // --- Search dropdown ---
  function hideDropdown() {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  }

  function renderDropdown(list) {
    dropdown.innerHTML = '';
    if (!list.length) {
      hideDropdown();
      return;
    }
    for (const it of list) {
      const div = document.createElement('div');
      div.className = 'ddItem';
      div.innerHTML = `
        <div class="ddTop">${escapeHtml(it.description || '(No description)')}</div>
        <div class="ddBottom">ID: ${it.materialId ?? '-'} • Barcode: ${escapeHtml(it.barcode || '-')} • ${escapeHtml(it.department || '-')} • ${escapeHtml(it.zone || '-')}/${escapeHtml(it.bin || '-')}</div>
      `;
      div.addEventListener('click', () => {
        // instantly show details (no Add button)
        setStatus('Selected', 'ok');
        showResult(it);
        searchInput.value = '';
        hideDropdown();
        setTimeout(() => scanInput.focus(), 10);
      });
      dropdown.appendChild(div);
    }
    dropdown.classList.remove('hidden');
  }

  function escapeHtml(str){
    return (str || '').replace(/[&<>"']/g, s => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[s]));
  }

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    if (!q) { hideDropdown(); return; }

    const qLower = q.toLowerCase();
    const isDigits = /^\d+$/.test(q);

    // Fast filter with limit
    const results = [];
    for (let i=0;i<ITEMS.length;i++){
      const it = ITEMS[i];
      if (isDigits) {
        if (it.materialId != null && String(it.materialId).includes(q)) { results.push(it); }
        else if ((it.barcode || '').replace(/[^\d]/g,'').includes(q)) { results.push(it); }
      } else {
        if ((it.description || '').toLowerCase().includes(qLower)) results.push(it);
      }
      if (results.length >= 20) break;
    }
    renderDropdown(results);
  });

  // Keep scan input focused by default.
  function keepFocus() {
    if (document.activeElement === searchInput) return;
    scanInput.focus();
  }
  window.addEventListener('load', () => setTimeout(() => scanInput.focus(), 30));
  document.addEventListener('click', (e) => {
    // don't steal focus if user is typing in search
    if (e.target === searchInput) return;
    if (e.target.closest && e.target.closest('#dropdown')) return;
    setTimeout(keepFocus, 20);
  });

  // Small safety: close dropdown if user taps outside
  document.addEventListener('mousedown', (e) => {
    if (e.target === searchInput || (e.target.closest && e.target.closest('#dropdown'))) return;
    hideDropdown();
  });

})();
