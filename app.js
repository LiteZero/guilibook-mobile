(() => {
  const STORAGE_KEY = 'guilibook-data-v1';
  const NATIVE_DATA_PATH = 'data.json';
  const NATIVE_EXPORT_DIRECTORY = 'DOCUMENTS';
  const today = new Date().toISOString().slice(0, 10);
  const initialData = {
    version: 1,
    updatedAt: new Date().toISOString(),
    records: []
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  let hasLocalStorageData = false;
  let data = loadData();
  let activeView = 'home';
  let recordFilter = 'receive';
  let editingId = null;
  let formType = 'receive';
  let toastTimer;
  let jsonFileHandle = null;
  let pendingPersist = Promise.resolve();
  const capacitorFilesystem = window.Capacitor?.Plugins?.Filesystem || null;
  const capacitorShare = window.Capacitor?.Plugins?.Share || null;

  function loadData() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && Array.isArray(saved.records)) {
        hasLocalStorageData = true;
        const cleaned = { ...saved, records: saved.records.filter((record) => !String(record.id || '').startsWith('demo-')) };
        if (cleaned.records.length !== saved.records.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned, null, 2));
        return cleaned;
      }
    } catch (_) { /* use fresh data */ }
    return structuredClone(initialData);
  }

  function persist() {
    data.updatedAt = new Date().toISOString();
    const serialized = JSON.stringify(data, null, 2);
    localStorage.setItem(STORAGE_KEY, serialized);
    pendingPersist = pendingPersist.then(() => persistJsonSilently(serialized)).catch(() => undefined);
  }

  async function persistJsonSilently(serialized) {
    if (capacitorFilesystem) {
      await capacitorFilesystem.writeFile({ path: NATIVE_DATA_PATH, directory: 'DATA', data: serialized, encoding: 'utf8' });
      return;
    }
    if (jsonFileHandle && await verifyFilePermission(jsonFileHandle)) {
      const writable = await jsonFileHandle.createWritable();
      await writable.write(serialized);
      await writable.close();
    }
  }

  function normalizeData(source) {
    return {
      version: 1,
      updatedAt: new Date().toISOString(),
      records: Array.isArray(source?.records) ? source.records.map(normalizeRecord).filter(Boolean) : []
    };
  }

  function money(value) {
    return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function shortDate(value) {
    if (!value) return '-';
    const parts = value.split('-');
    return parts.length === 3 ? `${parts[1]}.${parts[2]}` : value;
  }

  function fullDate(value) {
    if (!value) return '-';
    return value.replaceAll('-', '.');
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  }

  function initials(name) {
    return Array.from(String(name || '?').trim())[0] || '?';
  }

  function sortedRecords(records = data.records) {
    return [...records].sort((a, b) => `${b.date || ''}${b.createdAt || ''}`.localeCompare(`${a.date || ''}${a.createdAt || ''}`));
  }

  function renderPersonNameSuggestions() {
    const suggestions = $('#personNameSuggestions');
    if (!suggestions) return;
    const names = [];
    const seen = new Set();
    sortedRecords().forEach((record) => {
      const name = String(record.name || '').trim();
      if (name && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
    });
    suggestions.innerHTML = names.map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
  }

  function totals() {
    return data.records.reduce((result, record) => {
      result[record.type] += Number(record.amount) || 0;
      result.count += 1;
      return result;
    }, { receive: 0, send: 0, count: 0 });
  }

  function contacts() {
    const map = new Map();
    data.records.forEach((record) => {
      const current = map.get(record.name) || { name: record.name, receive: 0, send: 0, receiveCount: 0, sendCount: 0, lastDate: record.date };
      current[record.type] += Number(record.amount) || 0;
      current[`${record.type}Count`] += 1;
      if ((record.date || '') > (current.lastDate || '')) current.lastDate = record.date;
      map.set(record.name, current);
    });
    return [...map.values()].map((person) => ({ ...person, balance: person.send - person.receive })).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance) || a.name.localeCompare(b.name, 'zh-CN'));
  }

  function render() {
    renderSummary();
    renderRecentRecords();
    renderHomeBalances();
    renderAllRecords();
    renderFriends();
    $('#recordCountLabel').textContent = `${data.records.length} 条记录`;
  }

  function renderSummary() {
    const total = totals();
    const balance = total.send - total.receive;
    const cards = [
      ['收礼总额', total.receive, 'receive', '收到的礼金总计'],
      ['送礼总额', total.send, 'send', '送出的礼金总计'],
      ['往来净额', Math.abs(balance), balance >= 0 ? 'balance-positive' : 'balance-negative', balance >= 0 ? '别人差我' : '我差别人'],
      ['亲友人数', contacts().length, 'friends', '有往来的亲友']
    ];
    $('#summaryGrid').innerHTML = cards.map(([label, value, color, note]) => `<article class="summary-card" style="--card-color:${color === 'send' ? '#f47732' : color === 'friends' ? '#8b71da' : color === 'balance-negative' ? '#ed626b' : color === 'balance-positive' ? '#24a57d' : '#1268e9'};--card-tint:${color === 'send' ? '#fff0e8' : color === 'friends' ? '#f0ecff' : color === 'balance-negative' ? '#fff0f1' : color === 'balance-positive' ? '#e8faf3' : '#eaf3ff'}"><div class="summary-label"><span class="summary-dot"></span>${label}</div><div class="summary-value">${color === 'friends' ? value : `¥${money(value)}`}${color === 'friends' ? '<span class="summary-unit">位</span>' : ''}</div><div class="summary-note">${note}</div></article>`).join('');
  }

  function renderRecentRecords() {
    const rows = sortedRecords().slice(0, 5);
    $('#recentRecordsBody').innerHTML = rows.map(recordRow).join('');
    $('#recentEmpty').hidden = rows.length > 0;
  }

  function recordRow(record) {
    return `<tr><td><div class="person-cell"><span class="person-avatar">${escapeHtml(initials(record.name))}</span>${escapeHtml(record.name)}</div></td><td><span class="type-badge ${record.type}">${record.type === 'receive' ? '收礼' : '送礼'}</span></td><td>${escapeHtml(record.occasion || '其他')}</td><td>${shortDate(record.date)}</td><td class="align-right amount ${record.type}">${record.type === 'receive' ? '+' : '-'}¥${money(record.amount)}</td><td class="row-actions"><button class="row-action" data-edit-record="${escapeHtml(record.id)}" aria-label="编辑" title="编辑"></button><button class="row-action delete" data-delete-record="${escapeHtml(record.id)}" aria-label="删除" title="删除"></button></td></tr>`;
  }

  function renderHomeBalances() {
    const people = contacts().slice(0, 5);
    $('#homeBalanceList').innerHTML = people.map(balanceRow).join('');
    $('#balanceEmpty').hidden = people.length > 0;
  }

  function balanceRow(person) {
    const positive = person.balance >= 0;
    const caption = person.balance === 0 ? '礼金已平' : positive ? '别人差我' : '我差别人';
    return `<div class="balance-item"><span class="person-avatar">${escapeHtml(initials(person.name))}</span><div class="balance-name"><strong>${escapeHtml(person.name)}</strong><small>${person.receiveCount + person.sendCount} 次往来 · 最近 ${shortDate(person.lastDate)}</small></div><div class="balance-amount ${positive ? 'positive' : 'negative'}">${positive ? '+' : '-'}¥${money(Math.abs(person.balance))}<span class="balance-caption ${positive ? 'positive' : 'negative'}">${caption}</span></div></div>`;
  }

  function renderAllRecords() {
    const query = ($('#recordsSearch')?.value || '').trim().toLowerCase();
    const records = sortedRecords(data.records.filter((record) => record.type === recordFilter)).filter((record) => [record.name, record.occasion, record.note].join(' ').toLowerCase().includes(query));
    $('#allRecordsBody').innerHTML = records.map((record) => `<tr><td><div class="person-cell"><span class="person-avatar">${escapeHtml(initials(record.name))}</span>${escapeHtml(record.name)}</div></td><td>${escapeHtml(record.occasion || '其他')}</td><td>${fullDate(record.date)}</td><td>${escapeHtml(record.note || '—')}</td><td class="align-right amount ${record.type}">${record.type === 'receive' ? '+' : '-'}¥${money(record.amount)}</td><td class="row-actions"><button class="row-action" data-edit-record="${escapeHtml(record.id)}" aria-label="编辑" title="编辑"></button><button class="row-action delete" data-delete-record="${escapeHtml(record.id)}" aria-label="删除" title="删除"></button></td></tr>`).join('');
    $('#recordsEmpty').hidden = records.length > 0;
  }

  function renderFriends() {
    const query = ($('#friendsSearch')?.value || '').trim().toLowerCase();
    const people = contacts().filter((person) => person.name.toLowerCase().includes(query));
    $('#friendsGrid').innerHTML = people.map((person) => {
      const positive = person.balance >= 0;
      return `<article class="friend-card"><div class="friend-card-head"><span class="person-avatar">${escapeHtml(initials(person.name))}</span><div><strong>${escapeHtml(person.name)}</strong><small>最近记录 ${fullDate(person.lastDate)}</small></div></div><div class="friend-balance ${positive ? 'positive' : 'negative'}"><strong>${person.balance === 0 ? '¥0.00' : `${positive ? '+' : '-'}¥${money(Math.abs(person.balance))}`}</strong><small>${person.balance === 0 ? '礼金已平' : positive ? '别人差我' : '我差别人'}</small></div><div class="friend-meta"><span>收礼 <b>¥${money(person.receive)}</b></span><span>送礼 <b>¥${money(person.send)}</b></span><span>${person.receiveCount + person.sendCount} 次往来</span></div></article>`;
    }).join('');
    $('#friendsEmpty').hidden = people.length > 0;
  }

  function setView(view) {
    activeView = view;
    $$('.view').forEach((section) => { section.hidden = !section.id.startsWith(view === 'home' ? 'home' : view === 'friends' ? 'friends' : 'records'); });
    $$('.mobile-nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view || (view === 'receive' && button.dataset.view === 'receive') || (view === 'send' && button.dataset.view === 'send')));
    if (view === 'receive' || view === 'send') { recordFilter = view; updateRecordFilterButtons(); $('#recordsEyebrow').textContent = view === 'receive' ? '收礼记录' : '送礼记录'; $('#recordsTitle').textContent = view === 'receive' ? '收礼' : '送礼'; $('#recordsAddButton').dataset.openForm = view; }
    if (view === 'home') window.location.hash = 'home'; else window.location.hash = view;
    renderAllRecords();
  }

  function updateRecordFilterButtons() { $$('.segment').forEach((button) => button.classList.toggle('is-active', button.dataset.recordFilter === recordFilter)); }

  function openForm(type = 'receive', record = null) {
    editingId = record?.id || null; formType = record?.type || type;
    $('#modalTitle').textContent = editingId ? '编辑记录' : formType === 'receive' ? '新增收礼' : '新增送礼';
    $('#recordId').value = editingId || '';
    renderPersonNameSuggestions();
    $('#personName').value = record?.name || '';
    $('#amount').value = record?.amount ?? '';
    $('#recordDate').value = record?.date || today;
    $('#occasion').value = record?.occasion || '婚礼';
    $('#note').value = record?.note || '';
    $$('.type-choice').forEach((button) => button.classList.toggle('is-active', button.dataset.formType === formType));
    $('#recordModal').hidden = false;
    setTimeout(() => $('#personName').focus(), 20);
  }

  function closeForm() { $('#recordModal').hidden = true; editingId = null; }

  function saveRecord(event) {
    event.preventDefault();
    const name = $('#personName').value.trim(); const amount = Number($('#amount').value);
    if (!name || !amount || amount <= 0) { showToast('请填写姓名和正确的金额'); return; }
    const record = { id: editingId || `record-${Date.now()}`, type: formType, name, amount: Math.round(amount * 100) / 100, date: $('#recordDate').value || today, occasion: $('#occasion').value, note: $('#note').value.trim(), createdAt: new Date().toISOString() };
    if (editingId) { const index = data.records.findIndex((item) => item.id === editingId); if (index > -1) data.records[index] = { ...data.records[index], ...record }; } else data.records.push(record);
    persist(); closeForm(); render(); showToast(editingId ? '记录已更新' : '记录已保存');
  }

  function deleteRecord(id) {
    const record = data.records.find((item) => item.id === id); if (!record) return;
    if (!window.confirm(`确定删除 ${record.name} 的这笔${record.type === 'receive' ? '收礼' : '送礼'}记录吗？`)) return;
    data.records = data.records.filter((item) => item.id !== id); persist(); render(); showToast('记录已删除');
  }

  function download(filename, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); }

  function dateStamp() { return new Date().toISOString().slice(0, 10).replaceAll('-', ''); }

  function openHandleDb() {
    if (!window.indexedDB) return Promise.resolve(null);
    return new Promise((resolve) => {
      const request = indexedDB.open('guilibook-file-handles', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('handles');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
  }

  async function rememberJsonHandle(handle) {
    jsonFileHandle = handle;
    const db = await openHandleDb();
    if (!db) return;
    await new Promise((resolve) => {
      const transaction = db.transaction('handles', 'readwrite');
      transaction.objectStore('handles').put(handle, 'data-json');
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
    });
    db.close();
  }

  async function restoreJsonHandle() {
    const db = await openHandleDb();
    if (!db) return null;
    const handle = await new Promise((resolve) => {
      const transaction = db.transaction('handles', 'readonly');
      const request = transaction.objectStore('handles').get('data-json');
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    db.close();
    return handle;
  }

  async function verifyFilePermission(handle, request = false) {
    if (!handle?.queryPermission) return false;
    let permission = await handle.queryPermission({ mode: 'readwrite' });
    if (permission === 'prompt' && request && handle.requestPermission) permission = await handle.requestPermission({ mode: 'readwrite' });
    return permission === 'granted';
  }

  async function hydratePersistentData() {
    try {
      if (capacitorFilesystem) {
        const result = await capacitorFilesystem.readFile({ path: NATIVE_DATA_PATH, directory: 'DATA', encoding: 'utf8' });
        data = normalizeData(JSON.parse(result.data));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
        render();
        return;
      }
    } catch (_) { /* First run: the native file has not been created yet. */ }

    try {
      const storedHandle = await restoreJsonHandle();
      if (storedHandle && await verifyFilePermission(storedHandle)) {
        const file = await storedHandle.getFile();
        data = normalizeData(JSON.parse(await file.text()));
        jsonFileHandle = storedHandle;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
        render();
        return;
      }
    } catch (_) { /* Permission or file may have changed. */ }

    try {
      if (hasLocalStorageData) return;
      const response = await fetch('data.json', { cache: 'no-store' });
      if (response.ok) {
        data = normalizeData(await response.json());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
        render();
      }
    } catch (_) { /* file:// pages cannot always fetch sibling files. */ }
  }

  async function bindJsonFile() {
    if (!window.showOpenFilePicker) {
      $('#jsonImportInput').click();
      return;
    }
    try {
      const [handle] = await window.showOpenFilePicker({
        multiple: false,
        types: [{ description: 'JSON 数据文件', accept: { 'application/json': ['.json'] } }]
      });
      if (!await verifyFilePermission(handle, true)) throw new Error('permission denied');
      const file = await handle.getFile();
      data = normalizeData(JSON.parse(await file.text()));
      await rememberJsonHandle(handle);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data, null, 2));
      render();
      showToast('已绑定根目录 data.json，之后会自动保存');
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('绑定失败，请选择有效的 data.json');
    }
  }

  async function writeNativeExport(filename, content, mimeType) {
    if (!capacitorFilesystem) return false;
    const result = await capacitorFilesystem.writeFile({ path: filename, directory: NATIVE_EXPORT_DIRECTORY, data: content, encoding: 'utf8', recursive: true });
    if (capacitorShare) {
      try { await capacitorShare.share({ title: filename, text: `贵礼簿导出文件：${filename}`, url: result.uri, dialogTitle: '分享导出文件' }); } catch (_) { /* Sharing can be dismissed by the user. */ }
    }
    return true;
  }

  async function exportJson() {
    const serialized = JSON.stringify(data, null, 2);
    try {
      if (capacitorFilesystem) {
        await writeNativeExport('data.json', serialized, 'application/json');
        showToast('data.json 已保存到应用数据目录并可分享');
        return;
      }
      if (!jsonFileHandle && window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'data.json',
          types: [{ description: 'JSON 数据文件', accept: { 'application/json': ['.json'] } }]
        });
        if (!await verifyFilePermission(handle, true)) throw new Error('permission denied');
        await rememberJsonHandle(handle);
      }
      if (jsonFileHandle && await verifyFilePermission(jsonFileHandle, true)) {
        const writable = await jsonFileHandle.createWritable();
        await writable.write(serialized);
        await writable.close();
        showToast('data.json 已保存，之后会自动同步');
        return;
      }
      download('data.json', serialized, 'application/json;charset=utf-8');
      showToast('浏览器不支持直写，已下载 data.json');
    } catch (error) {
      if (error?.name !== 'AbortError') showToast('保存 data.json 失败');
    }
  }

  function xmlEscape(value) { return escapeHtml(value).replace(/&#39;/g, '&apos;'); }

  async function exportExcel(records = sortedRecords()) {
    const total = records.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const rows = [['类型', '亲友姓名', '金额', '日期', '场合', '备注'], ...records.map((item) => [item.type === 'receive' ? '收礼' : '送礼', item.name, Number(item.amount || 0), item.date, item.occasion || '', item.note || '']), ['', '', total, '', '当前筛选合计', '']];
    const table = rows.map((row) => `<Row>${row.map((cell, index) => `<Cell><Data ss:Type="${typeof cell === 'number' ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`).join('')}</Row>`).join('');
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="贵礼簿记录"><Table>${table}</Table></Worksheet></Workbook>`;
    try {
      if (capacitorFilesystem) {
        await writeNativeExport(`贵礼簿记录-${dateStamp()}.xls`, xml, 'application/vnd.ms-excel');
        showToast('Excel 已保存到应用数据目录并可分享');
        return;
      }
      download(`贵礼簿记录-${dateStamp()}.xls`, xml, 'application/vnd.ms-excel;charset=utf-8'); showToast('Excel 文件已下载');
    } catch (_) { showToast('Excel 导出失败'); }
  }

  function importJson(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { try { const imported = JSON.parse(reader.result); if (!imported || !Array.isArray(imported.records)) throw new Error('格式不正确'); data = normalizeData(imported); persist(); render(); showToast(`已恢复 ${data.records.length} 条记录`); } catch (_) { showToast('导入失败：请选择贵礼簿 JSON 备份'); } $('#jsonImportInput').value = ''; };
    reader.readAsText(file, 'utf-8');
  }

  function normalizeRecord(record) { if (!record || !record.name || !Number(record.amount)) return null; return { id: String(record.id || `record-${Date.now()}-${Math.random()}`), type: record.type === 'send' ? 'send' : 'receive', name: String(record.name), amount: Number(record.amount), date: String(record.date || today), occasion: String(record.occasion || '其他'), note: String(record.note || ''), createdAt: String(record.createdAt || new Date().toISOString()) }; }
  function showToast(message) { clearTimeout(toastTimer); const element = $('#toast'); element.textContent = message; element.classList.add('is-visible'); toastTimer = setTimeout(() => element.classList.remove('is-visible'), 2300); }

  document.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-view]'); if (viewButton) { setView(viewButton.dataset.view); return; }
    const openButton = event.target.closest('[data-open-form]'); if (openButton) { openForm(openButton.dataset.openForm); return; }
    const editButton = event.target.closest('[data-edit-record]'); if (editButton) { const record = data.records.find((item) => item.id === editButton.dataset.editRecord); if (record) openForm(record.type, record); return; }
    const deleteButton = event.target.closest('[data-delete-record]'); if (deleteButton) { deleteRecord(deleteButton.dataset.deleteRecord); return; }
    const filterButton = event.target.closest('[data-record-filter]'); if (filterButton) { recordFilter = filterButton.dataset.recordFilter; updateRecordFilterButtons(); $('#recordsEyebrow').textContent = recordFilter === 'receive' ? '收礼记录' : '送礼记录'; $('#recordsTitle').textContent = recordFilter === 'receive' ? '收礼' : '送礼'; $('#recordsAddButton').dataset.openForm = recordFilter; renderAllRecords(); return; }
    const typeButton = event.target.closest('[data-form-type]'); if (typeButton) { formType = typeButton.dataset.formType; $$('.type-choice').forEach((button) => button.classList.toggle('is-active', button === typeButton)); $('#modalTitle').textContent = editingId ? '编辑记录' : formType === 'receive' ? '新增收礼' : '新增送礼'; }
  });

  $('#recordForm').addEventListener('submit', saveRecord);
  $('#closeModal').addEventListener('click', closeForm); $('#cancelModal').addEventListener('click', closeForm); $('#recordModal').addEventListener('click', (event) => { if (event.target === $('#recordModal')) closeForm(); });
  $('#jsonExportButton').addEventListener('click', exportJson); $('#tipsExportButton').addEventListener('click', exportJson); $('#jsonImportButton').addEventListener('click', bindJsonFile); $('#jsonImportInput').addEventListener('change', (event) => importJson(event.target.files[0]));
  $('#recordsExportButton').addEventListener('click', () => exportExcel(sortedRecords(data.records.filter((record) => record.type === recordFilter)))); $('#friendsExportButton').addEventListener('click', () => exportExcel(sortedRecords()));
  $('#recordsSearch').addEventListener('input', renderAllRecords); $('#friendsSearch').addEventListener('input', renderFriends);
  window.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('#recordModal').hidden) closeForm(); });

  const hashView = window.location.hash.slice(1); if (['receive', 'send', 'friends'].includes(hashView)) setView(hashView); else setView('home'); render(); hydratePersistentData();
})();
