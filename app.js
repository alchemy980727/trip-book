// 全局資料儲存 Key
const STORAGE_KEY = 'my_travel_book_trips';
const PHOTO_DB_NAME = 'my_travel_book_photos';
const PHOTO_STORE_NAME = 'photos';
const SHARE_PREFIX = '#trip=';

// ---------- 共用安全／資料工具 ----------
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function createId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeSpot(spot = {}) {
  return {
    time: /^\d{1,2}:\d{2}$/.test(String(spot.time || '')) ? formatTime(String(spot.time)) : '09:00',
    name: cleanSpotName(String(spot.name || '').trim()),
    duration: formatDurationLabel(String(spot.duration || '02時00分'))
  };
}

function normalizeExpense(item = {}) {
  return {
    item: String(item.item || '').trim(),
    cost: Math.max(0, safeNumber(item.cost, 0)),
    category: String(item.category || '其他').trim() || '其他',
    payer: String(item.payer || '我').trim() || '我',
    participants: Array.isArray(item.participants) && item.participants.length ? item.participants.map(String) : []
  };
}

function normalizeDay(day = {}, index = 0) {
  return {
    name: String(day.name || `Day ${index + 1}: 行程安排`).trim(),
    spots: Array.isArray(day.spots) ? day.spots.map(normalizeSpot).filter(s => s.name) : [],
    memo: String(day.memo || ''),
    expenses: Array.isArray(day.expenses) ? day.expenses.map(normalizeExpense) : []
  };
}

function normalizeTrip(trip = {}, index = 0) {
  const members = Array.isArray(trip.members) ? trip.members.map(v => String(v).trim()).filter(Boolean) : ['我'];
  return {
    id: String(trip.id || createId('trip')),
    title: String(trip.title || `未命名行程 ${index + 1}`).trim(),
    members: members.length ? [...new Set(members)] : ['我'],
    days: Array.isArray(trip.days) && trip.days.length ? trip.days.map(normalizeDay) : [normalizeDay({}, 0)]
  };
}

function normalizeTrips(data) {
  if (!Array.isArray(data)) return null;
  return data.map(normalizeTrip);
}

function durationToMinutes(raw) {
  if (!raw) return 120;
  const m = String(raw).match(/(\d+(?:\.\d+)?)\s*(?:小時|hr|hrs|hour|hours)/i);
  if (m) return Math.max(0, Math.round(parseFloat(m[1]) * 60));
  const min = String(raw).match(/(\d+(?:\.\d+)?)\s*(?:min|mins|分鐘|分)/i);
  if (min) return Math.max(0, Math.round(parseFloat(min[1])));
  const hm = String(raw).match(/(\d{1,2})\s*時\s*(\d{1,2})\s*分/);
  if (hm) return Number(hm[1]) * 60 + Number(hm[2]);
  return 120;
}

function minutesToDuration(totalMin) {
  const min = Math.max(0, Math.round(totalMin));
  return `${String(Math.floor(min / 60)).padStart(2, '0')}時${String(min % 60).padStart(2, '0')}分`;
}

function getPhotoKey(tripId, dayIndex, spotIndex) {
  return `photo_${tripId}_${dayIndex}_${spotIndex}`;
}

function openPhotoDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB 不可用'));
    const request = indexedDB.open(PHOTO_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(PHOTO_STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB 開啟失敗'));
  });
}

async function savePhotoToDb(key, dataUrl) {
  const db = await openPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
    tx.objectStore(PHOTO_STORE_NAME).put(dataUrl, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('照片儲存失敗')); };
  });
}

async function getPhotoFromDb(key) {
  try {
    const db = await openPhotoDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE_NAME, 'readonly');
      const req = tx.objectStore(PHOTO_STORE_NAME).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  } catch (e) {
    return localStorage.getItem(key);
  }
}

async function deletePhotoFromDb(key) {
  try {
    const db = await openPhotoDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE_NAME, 'readwrite');
      tx.objectStore(PHOTO_STORE_NAME).delete(key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    localStorage.removeItem(key);
  }
}

function compressImage(file, maxSize = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/webp', quality));
      };
      img.onerror = reject;
      img.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function encodeShareTrip(trip) {
  const json = JSON.stringify(normalizeTrip(trip));
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach(b => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeShareTrip(encoded) {
  try {
    const padded = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    return normalizeTrip(JSON.parse(new TextDecoder().decode(bytes)));
  } catch (e) {
    return null;
  }
}

function getSharedTripFromUrl() {
  if (!window.location.hash.startsWith(SHARE_PREFIX)) return null;
  return decodeShareTrip(window.location.hash.slice(SHARE_PREFIX.length));
}

function makeShareUrl(trip) {
  return `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}view.html?shared=1${SHARE_PREFIX}${encodeShareTrip(trip)}`;
}


// 預設範例行程
const defaultTrips = [
  {
    id: 'demo_japan',
    title: '日本自由行',
    members: ['小明', '小華'],
    days: [
      {
        name: 'Day 1: 抵達大阪與心齋橋',
        spots: [
          { time: '12:00', name: '關西國際機場 (KIX)', duration: '01時30分' },
          { time: '14:30', name: '東橫INN 大阪難波西 (Check-in)', duration: '01時00分' },
          { time: '16:00', name: '心齋橋 & 道頓堀散策', duration: '03時30分' }
        ],
        memo: '飯店網路密碼：12345678\n記得在機場買 ICOCA 卡！',
        expenses: [
          { item: 'ICOCA 儲值', cost: 2000 },
          { item: '道頓堀拉麵晚餐', cost: 1200 }
        ]
      },
      {
        name: 'Day 2: 日本環球影城 USJ',
        spots: [
          { time: '08:00', name: '日本環球影城 (USJ)', duration: '09時00分' },
          { time: '18:30', name: '梅田藍天大廈空中庭園', duration: '02時00分' }
        ],
        memo: '瑪利歐園區整理券記得用 App 搶！',
        expenses: [
          { item: 'USJ 快速通關/餐飲', cost: 8500 }
        ]
      }
    ]
  }
];

function getSavedTrips() {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) {
    const initial = normalizeTrips(defaultTrips);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  }
  try {
    const trips = normalizeTrips(JSON.parse(data));
    if (!trips || !trips.length) throw new Error('行程資料格式錯誤');
    const normalizedJson = JSON.stringify(trips);
    if (normalizedJson !== data) localStorage.setItem(STORAGE_KEY, normalizedJson);
    return trips;
  } catch (e) {
    const fallback = normalizeTrips(defaultTrips);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
    return fallback;
  }
}
function saveTrips(trips) {
  const normalized = normalizeTrips(trips) || [];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch (e) {
    alert('行程資料儲存失敗，可能是瀏覽器儲存空間不足。請先移除大型舊資料或照片。');
    throw e;
  }
}

// 動態注入 PDF 匯出隱藏樣式
function injectPdfStyles() {
  if (document.getElementById('pdf-export-styles')) return;
  const style = document.createElement('style');
  style.id = 'pdf-export-styles';
  style.innerHTML = `
    @media print {
      body.pdf-export-mode .polaroid-box,
      body.pdf-export-mode #expenseBlock,
      body.pdf-export-mode .hide-on-export,
      body.pdf-export-mode header,
      body.pdf-export-mode footer,
      body.pdf-export-mode button {
        display: none !important;
      }
      body.pdf-export-mode .card {
        border: 1px solid #ddd !important;
        box-shadow: none !important;
        page-break-inside: avoid;
      }
    }
  `;
  document.head.appendChild(style);
}

// 頁面路由判斷
document.addEventListener('DOMContentLoaded', () => {
  injectPdfStyles();
  
  const path = window.location.pathname;
  if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) {
    renderIndexPage();
  } else if (path.endsWith('view.html')) {
    renderViewPage();
  } else if (path.endsWith('day.html')) {
    renderDayPage();
  }
});

// --- 1. 首頁 (index.html) ---
function renderIndexPage() {
  const listEl = document.getElementById('tripList');
  if (!listEl) return;

  const trips = getSavedTrips();
  listEl.innerHTML = '';

  trips.forEach(trip => {
    const card = document.createElement('div');
    card.className = 'trip-card';
    card.innerHTML = `
      <div style="font-size: 18px; font-weight: 800; color: var(--primary); margin-bottom: 6px;">${escapeHtml(trip.title)}</div>
      <div style="font-size: 13px; color: var(--sub-text);">📍 共 ${trip.days.length} 天行程</div>
      <div style="margin-top: 12px; display: flex; gap: 8px;">
        <a href="view.html?id=${trip.id}" class="action-btn" style="flex:1; text-align:center; text-decoration:none;">開啟行程 ➔</a>
        <button onclick="deleteTrip('${trip.id}')" style="background:#fce8e6; color:#c2593f; border:1px solid #edd0cd; border-radius:10px; padding:6px 12px; font-size:12px; cursor:pointer;">刪除</button>
      </div>
    `;
    listEl.appendChild(card);
  });

  const addBtn = document.getElementById('addTripBtn');
  if (addBtn) {
    addBtn.onclick = () => {
      const title = prompt('請輸入行程名稱（例如：北海道 5 日遊）：');
      if (!title) return;

      const daysInput = prompt('請問這趟行程預計幾天？（例如：3 或 5）', '3');
      let dayCount = parseInt(daysInput, 10);
      if (isNaN(dayCount) || dayCount <= 0) dayCount = 3;

      const newDays = [];
      for (let i = 1; i <= dayCount; i++) {
        newDays.push({
          name: `Day ${i}: 行程安排`,
          spots: [],
          memo: '',
          expenses: []
        });
      }

      const newTrip = {
        id: createId('trip'),
        title: title,
        members: ['我'],
        days: newDays
      };

      trips.push(newTrip);
      saveTrips(trips);
      renderIndexPage();

      if (confirm(`「${title}」已成功建立！是否立即進入進行景點編輯？`)) {
        window.location.href = `view.html?id=${newTrip.id}`;
      }
    };
  }

  const parseBtn = document.getElementById('parseTripBtn');
  const modal = document.getElementById('parseModal');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const submitParseBtn = document.getElementById('submitParseBtn');

  if (parseBtn && modal) {
    parseBtn.onclick = () => modal.style.display = 'flex';
    if (closeModalBtn) closeModalBtn.onclick = () => modal.style.display = 'none';

    if (submitParseBtn) {
      submitParseBtn.onclick = () => {
        const inputEl = document.getElementById('parseInput');
        if (!inputEl) return;
        const text = inputEl.value.trim();
        if (!text) {
          alert('請輸入文字內容！');
          return;
        }

        const parsedTrip = parseTextToTrip(text);
        if (parsedTrip) {
          trips.push(parsedTrip);
          saveTrips(trips);
          modal.style.display = 'none';
          inputEl.value = '';
          renderIndexPage();
        }
      };
    }
  }
}

function cleanSpotName(rawName) {
  if (!rawName) return '';
  return rawName
    .replace(/(\(|\（|\s|^)(\d+(?:\.\d+)?)\s*(小時|hr|hrs|min|分鐘|分)(\)|\）|\s|$)/gi, ' ')
    .replace(/停留\s*\d+.*$/gi, '')
    .replace(/^[-:\s()（）]+|[-:\s()（）]+$/g, '')
    .trim();
}

function parseTextToTrip(text) {
  const rawLines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!rawLines.length) return null;
  const tripTitle = rawLines[0].replace(/^[-*#\s]+/, '').trim();
  const contentLines = rawLines.slice(1);
  if (!contentLines.length) { alert('請在第一行標題下方輸入至少一天的行程細節！'); return null; }

  const days = [];
  let currentDay = null;
  let autoDayCount = 1;
  const ensureDay = () => {
    if (!currentDay) { currentDay = { name: `Day ${autoDayCount}: 行程`, spots: [], memo: '', expenses: [] }; autoDayCount++; }
    return currentDay;
  };

  contentLines.forEach(line => {
    const dayMatch = line.match(/^(?:day|d)\s*(\d+)(?:\s*[:：-]?\s*(.*))?$/i) || line.match(/^第([一二三四五六七八九十百\d]+)天\s*[:：-]?\s*(.*)$/);
    if (dayMatch) {
      if (currentDay) days.push(currentDay);
      const suffix = dayMatch[2] || '';
      currentDay = { name: suffix ? line : `Day ${dayMatch[1]}: 行程安排`, spots: [], memo: '', expenses: [] };
      return;
    }
    const day = ensureDay();
    const rawSpots = line.split(/\s*(?:→|->|➔|＞|＞＞)\s*/).map(s => s.trim()).filter(Boolean);
    rawSpots.forEach(spotStr => {
      let spotTime = '09:00';
      let duration = '02時00分';
      let spotName = spotStr;
      const range = spotStr.match(/(\d{1,2}:\d{2})\s*(?:[-~～至到])\s*(\d{1,2}:\d{2})/);
      if (range) {
        spotTime = formatTime(range[1]);
        let startMin = timeToMinutes(range[1]);
        let endMin = timeToMinutes(range[2]);
        if (endMin <= startMin) endMin += 24 * 60;
        duration = minutesToDuration(Math.min(24 * 60 - startMin, endMin - startMin));
        spotName = spotName.replace(range[0], '');
      } else {
        const timeMatch = spotStr.match(/\b(\d{1,2}:\d{2})\b/);
        if (timeMatch) { spotTime = formatTime(timeMatch[1]); spotName = spotName.replace(timeMatch[1], ''); }
        else spotTime = `${String(Math.min(23, 9 + day.spots.length * 2)).padStart(2, '0')}:00`;
      }
      const durationMatch = spotName.match(/(?:\(|\（|\s|^)\s*(\d+(?:\.\d+)?)\s*(小時|小时|hr|hrs|hour|hours|min|mins|分鐘|分钟|分)(?:\)|\）|\s|$)/i) || spotName.match(/停留\s*(\d+(?:\.\d+)?)\s*(小時|小时|hr|hrs|hour|hours|min|mins|分鐘|分钟|分)/i);
      if (durationMatch) {
        const num = parseFloat(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();
        duration = minutesToDuration(unit.includes('min') || unit.includes('分') ? num : num * 60);
        spotName = spotName.replace(durationMatch[0], '');
      }
      spotName = cleanSpotName(spotName);
      if (spotName) day.spots.push(normalizeSpot({ time: spotTime, name: spotName, duration }));
    });
  });
  if (currentDay) days.push(currentDay);
  if (!days.length) return null;
  return normalizeTrip({ id: createId('trip'), title: tripTitle, members: ['我'], days });
}

function formatTime(tStr) {
  const parts = String(tStr || '').split(':');
  let h = parseInt(parts[0], 10); let m = parseInt(parts[1], 10);
  if (!Number.isFinite(h)) h = 9; if (!Number.isFinite(m)) m = 0;
  h = Math.min(23, Math.max(0, h)); m = Math.min(59, Math.max(0, m));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(timeStr) {
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function deleteTrip(id) {
  if (confirm('確定要刪除這個行程嗎？')) {
    let trips = getSavedTrips();
    trips = trips.filter(t => t.id !== id);
    saveTrips(trips);
    renderIndexPage();
  }
}

// --- 2. 總覽頁 (view.html) ---
function renderViewPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tripId = urlParams.get('id');
  const sharedTrip = getSharedTripFromUrl();
  const history = getSavedTrips();
  const tripIndex = sharedTrip ? -1 : history.findIndex(t => t.id === tripId);
  const trip = sharedTrip || history[tripIndex];
  const isReadOnly = Boolean(sharedTrip);

  if (!trip) {
    alert('找不到行程資料！');
    window.location.href = 'index.html';
    return;
  }

  const bookTitleEl = document.getElementById('bookTitle');
  if (bookTitleEl) bookTitleEl.innerText = trip.title;

  // 渲染參與人員列：會議圓形風格、靠左、新增按鈕僅一個 + 號
  let membersContainer = document.getElementById('tripMembersContainer');
  if (!membersContainer) {
    membersContainer = document.createElement('div');
    membersContainer.id = 'tripMembersContainer';
    membersContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 20px 0 8px 0; justify-content: flex-start;';
    if (bookTitleEl && bookTitleEl.parentNode) {
      bookTitleEl.parentNode.insertBefore(membersContainer, bookTitleEl.nextSibling);
    }
  }

  const renderMembersList = () => {
    membersContainer.innerHTML = '';
    if (!trip.members) trip.members = [];

    trip.members.forEach((member, mIdx) => {
      const avatar = document.createElement('div');
      avatar.title = `${member} (點擊可刪除)`;
      avatar.style.cssText = 'width: 32px; height: 32px; border-radius: 50%; background: #eef4fb; color: #2b6cb0; border: 1px solid #90cdf4; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; cursor: pointer; position: relative;';
      // 取名字最後一個字或前兩個字做為圓形簡称
      const shortName = member.length > 2 ? member.slice(-2) : member;
      avatar.innerText = shortName;

      avatar.onclick = () => {
        if (isReadOnly) return;
        if (confirm(`確定要移除成員「${member}」嗎？`)) {
          trip.members.splice(mIdx, 1);
          saveTrips(history);
          renderMembersList();
        }
      };
      membersContainer.appendChild(avatar);
    });

    const addMemberBtn = document.createElement('button');
    addMemberBtn.style.cssText = 'width: 32px; height: 32px; border-radius: 50%; background: #fff; color: #2b6cb0; border: 1px dashed #2b6cb0; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: bold; cursor: pointer;';
    addMemberBtn.innerText = '+';
    addMemberBtn.title = '新增參與人員';
    addMemberBtn.onclick = () => {
      if (isReadOnly) return;
      const newName = prompt('請輸入參與人員名稱：');
      if (newName && newName.trim()) {
        trip.members.push(newName.trim());
        saveTrips(history);
        renderMembersList();
      }
    };
    membersContainer.appendChild(addMemberBtn);
  };

  renderMembersList();

  const container = document.getElementById('timelineList');
  if (!container) return;
  
  const lineHtml = '<div class="flow-line"></div><div id="vehicleRunner" class="vehicle-runner">✈️</div>';
  container.innerHTML = lineHtml;

  trip.days.forEach((day, index) => {
    const card = document.createElement('div');
    card.className = 'flow-card';
    card.style.position = 'relative'; // 讓右下角刪除按鈕可以絕對定位
    const spotNames = day.spots.length > 0 
      ? day.spots.map(s => cleanSpotName(s.name)).join(' → ') 
      : '尚無行程，點擊進行編輯';
    
    card.innerHTML = `
      <div class="flow-node-num" id="node_${index}">${index + 1}</div>
      <div class="card-title">
        <span>${escapeHtml(day.name)}</span>
        <span style="font-size:12px; color:var(--primary)">編輯細節 ➔</span>
      </div>
      <div class="card-preview" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; padding-right: 24px;">${escapeHtml(spotNames)}</div>
      <div class="badge" style="display:inline-block;">📍 共 ${day.spots.length} 個行程</div>
      ${isReadOnly ? '' : `<button onclick="event.stopPropagation(); deleteDay(${tripIndex}, ${index})" style="position: absolute; bottom: 10px; right: 10px; background: none; border: none; color: #c2593f; font-size: 16px; font-weight: bold; cursor: pointer; padding: 4px;" title="刪除這天行程">✕</button>`}
    `;

    card.onclick = () => {
      sessionStorage.setItem(`lastVisitedDay_${trip.id}`, index);
      moveVehicleToNode(index);
      setTimeout(() => { window.location.href = `day.html?id=${trip.id}&day=${index}`; }, 350);
    };

    container.appendChild(card);
  });

  let checkoutBtn = document.getElementById('checkoutBtn');
  if (!checkoutBtn) {
    checkoutBtn = document.createElement('button');
    checkoutBtn.id = 'checkoutBtn';
    checkoutBtn.className = 'action-btn';
    checkoutBtn.style.cssText = 'width: 100%; margin-top: 18px; background: #fff7ed; color: #c2593f; border: 1px solid #f0b38b; padding: 9px 10px; font-size: 13px; font-weight: bold; border-radius: 8px; cursor: pointer;';
    checkoutBtn.innerText = '🧾 結帳並產生分帳報告';
    container.after(checkoutBtn);
  }
  checkoutBtn.style.display = isReadOnly ? 'none' : '';
  checkoutBtn.onclick = () => generateTripSettlementReport(trip);

  let addDayBtn = document.getElementById('addDayBtn');
  if (!addDayBtn) {
    addDayBtn = document.createElement('button');
    addDayBtn.id = 'addDayBtn';
    addDayBtn.className = 'action-btn';
    addDayBtn.style.cssText = 'width: 100%; margin-top: 12px; background: #eef4fb; color: #2b6cb0; border: 1px dashed #90cdf4; padding: 6px 10px; font-size: 13px; font-weight: bold; border-radius: 8px; cursor: pointer;';
    addDayBtn.innerText = '➕ 為此行程新增天數 (Day)';
    checkoutBtn.after(addDayBtn);
  }

  addDayBtn.style.display = isReadOnly ? 'none' : '';
  addDayBtn.onclick = () => {
    if (isReadOnly) return;
    const nextDayNum = trip.days.length + 1;
    const dayTitle = prompt(`請輸入 Day ${nextDayNum} 的主題：`, `Day ${nextDayNum}: 自由行程`);
    if (dayTitle) {
      history[tripIndex].days.push({ name: dayTitle, spots: [], memo: '', expenses: [] });
      saveTrips(history);
      renderViewPage();
    }
  };

  const cards = container.querySelectorAll('.flow-card');
  cards.forEach((card, i) => {
    setTimeout(() => { card.classList.add('appear'); }, i * 120);
  });

  const savedIndex = sessionStorage.getItem(`lastVisitedDay_${trip.id}`);
  const targetIndex = (savedIndex !== null && savedIndex < trip.days.length) ? parseInt(savedIndex, 10) : 0;
  setTimeout(() => { moveVehicleToNode(targetIndex); }, 100);

  const shareBtn = document.getElementById('shareTripBtn');
  if (shareBtn) {
    shareBtn.onclick = async () => {
      const shareUrl = makeShareUrl(trip);
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('已複製真正可分享的行程連結！朋友開啟後即可看到這趟行程。');
      } catch (e) {
        prompt('請複製以下分享連結：', shareUrl);
      }
    };

    let exportFullPdfBtn = document.getElementById('exportFullPdfBtn');
    if (!exportFullPdfBtn) {
      exportFullPdfBtn = document.createElement('button');
      exportFullPdfBtn.id = 'exportFullPdfBtn';
      exportFullPdfBtn.className = 'action-btn';
      exportFullPdfBtn.style.cssText = 'background: #2b6cb0; color: #fff; border: none; padding: 8px 12px; font-size: 13px; font-weight: bold; border-radius: 8px; cursor: pointer; margin-left: 8px;';
      exportFullPdfBtn.innerText = '📄 匯出 PDF (整趟行程)';
      shareBtn.after(exportFullPdfBtn);
    }
    exportFullPdfBtn.onclick = () => exportFullTripPdf(trip);
  }
}

function deleteDay(tripIndex, dayIndex) {
  const history = getSavedTrips();
  const trip = history[tripIndex];
  if (trip.days.length <= 1) {
    alert('每趟行程至少需要保留一天喔！');
    return;
  }
  if (confirm(`確定要刪除「${trip.days[dayIndex].name}」這天行程嗎？`)) {
    trip.days.splice(dayIndex, 1);
    saveTrips(history);
    renderViewPage();
  }
}

function moveVehicleToNode(nodeIndex) {
  const vehicle = document.getElementById('vehicleRunner');
  const targetNode = document.getElementById(`node_${nodeIndex}`);
  if (!vehicle || !targetNode) return;

  const card = targetNode.closest('.flow-card');
  if (card) vehicle.style.top = `${card.offsetTop + 14}px`;

  document.querySelectorAll('.flow-node-num').forEach(node => { node.classList.remove('active-node'); });
  targetNode.classList.add('active-node');
}

// --- 3. 詳細頁 (day.html) ---
function renderDayPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tripId = urlParams.get('id');
  const dayIndex = parseInt(urlParams.get('day') || '0', 10);

  const sharedTrip = getSharedTripFromUrl();
  const history = getSavedTrips();
  const tripIndex = sharedTrip ? -1 : history.findIndex(t => t.id === tripId);
  const trip = sharedTrip || history[tripIndex];
  const isReadOnly = Boolean(sharedTrip);

  if (!trip || !trip.days || !trip.days[dayIndex]) {
    alert('找不到指定天數資料！');
    window.location.href = 'index.html';
    return;
  }

  const dayData = trip.days[dayIndex];

  const backBtn = document.querySelector('.back-btn');
  if (backBtn) backBtn.href = `view.html?id=${trip.id}`;

  const dayTitleEl = document.getElementById('dayPageTitle');
  if (dayTitleEl) dayTitleEl.innerText = `${trip.title} - ${dayData.name}`;

  const container = document.getElementById('dayScheduleContent');
  if (!container) return;
  container.innerHTML = '';

  if (dayData.spots.length === 0) {
    const emptyHint = document.createElement('div');
    emptyHint.style.cssText = 'text-align: center; color: var(--sub-text); padding: 30px 10px; font-size: 14px;';
    emptyHint.innerText = '📍 今天還沒有安排行程喔！請點擊下方按鈕開始新增。';
    container.appendChild(emptyHint);
  }

  const conflicts = findTimeConflicts(dayData.spots);
  dayData.spots.forEach((spot, idx) => {
    const cleanName = cleanSpotName(spot.name);
    const hasConflict = conflicts.has(idx);
    const block = document.createElement('div');
    block.className = `spot-block${hasConflict ? ' time-conflict' : ''}`;
    block.setAttribute('data-id', idx);
    
    let transitHtml = '';
    if (idx < dayData.spots.length - 1) {
      const nextSpot = dayData.spots[idx + 1];
      const transitUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(cleanName)}&destination=${encodeURIComponent(cleanSpotName(nextSpot.name))}&travelmode=transit`;
      transitHtml = `
        <div class="transit-box">
          <a href="${transitUrl}" target="_blank" class="transit-btn">
            🚌 前往「${escapeHtml(cleanSpotName(nextSpot.name))}」交通路線 ➔
          </a>
        </div>
      `;
    }

    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cleanName)}`;
    const photoKey = getPhotoKey(trip.id, dayIndex, idx);
    const savedPhoto = localStorage.getItem(photoKey);

    let photoContent = '';
    if (savedPhoto) {
      photoContent = `
        <div style="position: relative; display: inline-block; width: 100%;">
          <img src="${savedPhoto}" class="polaroid-img" style="object-fit:cover; width: 100%;">
          <button onclick="event.stopPropagation(); deletePhoto('${photoKey}', 'preview_${idx}')" style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.6); color: #fff; border: none; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; font-weight: bold;">✕</button>
        </div>
      `;
    } else {
      photoContent = `<div class="polaroid-img">📷 點擊上傳 / 紀錄旅行拍立得照片</div>`;
    }

    const formattedDuration = formatDurationLabel(spot.duration);

    block.innerHTML = `
      <div class="card">
        <div class="card-top" style="display: flex; justify-content: space-between; align-items: center;">
          <div id="timeBox_${idx}">
            <span onclick="${isReadOnly ? '' : `enableTimeSelect(${tripIndex}, ${dayIndex}, ${idx}, '${spot.time}')`}" style="cursor: pointer; font-size: 15px; font-weight: 800; color: #d35400; user-select: none;">
              ⏰ ${spot.time}
            </span>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <div id="durationBox_${idx}">
              <span onclick="${isReadOnly ? '' : `enableDurationSelect(${tripIndex}, ${dayIndex}, ${idx}, '${spot.duration}')`}" style="cursor: pointer; font-size: 12px; font-weight: 600; color: #555; background: #ebdcd0; padding: 4px 10px; border-radius: 12px; user-select: none; display: inline-flex; align-items: center; gap: 4px;">
                ⏱️ 預計停留：${formattedDuration}
              </span>
            </div>
            ${isReadOnly ? '' : `<button onclick="deleteSpot(${tripIndex}, ${dayIndex}, ${idx})" class="hide-on-export" style="background:none; border:none; color:#c2593f; cursor:pointer; font-weight:bold; font-size:14px; margin-left: 2px;">✕</button><span class="drag-handle hide-on-export" style="margin-left:2px; cursor:grab;">☰</span>`}
          </div>
        </div>

        <div class="spot-name" style="margin-top: 10px; font-size: 16px; font-weight: 700;">${escapeHtml(cleanName)}</div>
        ${hasConflict ? '<div style="margin-top:6px;color:#b54708;background:#fff3cd;border:1px solid #ffe08a;border-radius:7px;padding:5px 8px;font-size:12px;">⚠️ 此行程與其他行程時間重疊</div>' : ''}

        <div class="polaroid-box hide-on-export" onclick="triggerPhotoUpload('${photoKey}', 'input_${idx}')">
          <div id="preview_${idx}">${photoContent}</div>
          <div class="polaroid-caption">🖼️ ${escapeHtml(cleanName)} · 隨手拍</div>
          <input type="file" id="input_${idx}" class="file-input" accept="image/*" onchange="handlePhotoUpload(event, '${photoKey}', 'preview_${idx}')">
        </div>

        <a href="${mapUrl}" target="_blank" class="map-btn hide-on-export">📍 Google 地圖導航與評價</a>
      </div>
      ${transitHtml}
    `;
    container.appendChild(block);
    getPhotoFromDb(photoKey).then(dbPhoto => {
      const photo = dbPhoto || savedPhoto;
      const preview = document.getElementById(`preview_${idx}`);
      if (preview && photo) {
        preview.innerHTML = `<div style="position:relative;display:inline-block;width:100%;"><img src="${photo}" class="polaroid-img" style="object-fit:cover;width:100%;"><button onclick="event.stopPropagation(); deletePhoto('${escapeHtml(photoKey)}', 'preview_${idx}')" style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,.6);color:#fff;border:none;border-radius:50%;width:24px;height:24px;cursor:pointer;font-size:12px;font-weight:bold;">✕</button></div>`;
      }
    });
  });

  let addSpotBtn = document.getElementById('addSpotBtn');
  if (!addSpotBtn) {
    addSpotBtn = document.createElement('button');
    addSpotBtn.id = 'addSpotBtn';
    addSpotBtn.className = 'action-btn hide-on-export';
    addSpotBtn.style.cssText = 'width: 100%; margin: 8px 0 14px 0; background: #eef4fb; color: #2b6cb0; border: 1px dashed #90cdf4; padding: 6px 10px; font-size: 13px; font-weight: bold; border-radius: 8px; cursor: pointer;';
    addSpotBtn.innerText = '➕ 新增景點 / 行程項目';
    container.after(addSpotBtn);
  }

  addSpotBtn.style.display = isReadOnly ? 'none' : '';
  addSpotBtn.onclick = () => openSpotEditor(history, tripIndex, dayIndex);

  if (!isReadOnly && typeof Sortable !== 'undefined') {
    Sortable.create(container, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: function () {
        const newSpots = [];
        const blocks = container.querySelectorAll('.spot-block');
        blocks.forEach(block => {
          const originalIdx = parseInt(block.getAttribute('data-id'), 10);
          newSpots.push(dayData.spots[originalIdx]);
        });

        history[tripIndex].days[dayIndex].spots = newSpots;
        saveTrips(history);
        renderDayPage();
      }
    });
  }

  renderMemoBlock(history, tripIndex, dayIndex);
  renderExpenseBlock(history, tripIndex, dayIndex);
}

function openSpotEditor(history, tripIndex, dayIndex, spotIndex = -1) {
  if (tripIndex < 0) {
    alert('分享模式只能檢視，請先匯入行程後再編輯。');
    return;
  }
  const existing = spotIndex >= 0 ? history[tripIndex].days[dayIndex].spots[spotIndex] : { time: '10:00', name: '', duration: '02時00分' };
  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';
  modal.innerHTML = `
    <div style="background:#fff;border-radius:14px;padding:20px;width:min(460px,100%);box-shadow:0 10px 40px rgba(0,0,0,.2);">
      <h3 style="margin:0 0 16px;">${spotIndex >= 0 ? '編輯行程' : '新增行程'}</h3>
      <label style="display:block;margin-bottom:10px;">景點／項目<br><input id="spotEditorName" value="${escapeHtml(existing.name)}" style="width:100%;box-sizing:border-box;padding:9px;margin-top:4px;border:1px solid #ddd;border-radius:8px;"></label>
      <label style="display:block;margin-bottom:10px;">開始時間<br><input id="spotEditorTime" type="time" value="${escapeHtml(existing.time || '10:00')}" style="padding:9px;margin-top:4px;border:1px solid #ddd;border-radius:8px;"></label>
      <label style="display:block;margin-bottom:16px;">預計停留<br><select id="spotEditorDuration" style="padding:9px;margin-top:4px;border:1px solid #ddd;border-radius:8px;width:100%;">${Array.from({length:24},(_,i)=>i+1).map(i=>{const v=minutesToDuration(i*30);return `<option value="${v}" ${formatDurationLabel(existing.duration)===v?'selected':''}>${v}</option>`}).join('')}</select></label>
      <div style="display:flex;gap:8px;justify-content:flex-end;"><button id="spotEditorCancel" style="padding:9px 14px;border:1px solid #ddd;background:#fff;border-radius:8px;">取消</button><button id="spotEditorSave" style="padding:9px 14px;border:0;background:#2b6cb0;color:#fff;border-radius:8px;">儲存</button></div>
    </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#spotEditorCancel').onclick = () => modal.remove();
  modal.querySelector('#spotEditorSave').onclick = () => {
    const name = cleanSpotName(modal.querySelector('#spotEditorName').value);
    if (!name) { alert('請輸入景點／行程名稱。'); return; }
    const spot = { time: formatTime(modal.querySelector('#spotEditorTime').value || '10:00'), name, duration: modal.querySelector('#spotEditorDuration').value };
    if (spotIndex >= 0) history[tripIndex].days[dayIndex].spots[spotIndex] = spot;
    else history[tripIndex].days[dayIndex].spots.push(spot);
    saveTrips(history);
    modal.remove();
    renderDayPage();
  };
}

function enableTimeSelect(tripIndex, dayIndex, spotIndex, currentTime) {
  const box = document.getElementById(`timeBox_${spotIndex}`);
  if (!box) return;

  let options = '';
  for (let h = 0; h < 24; h++) {
    for (let m of ['00', '30']) {
      const hh = String(h).padStart(2, '0');
      const timeStr = `${hh}:${m}`;
      const selected = (timeStr === currentTime) ? 'selected' : '';
      options += `<option value="${timeStr}" ${selected}>${timeStr}</option>`;
    }
  }

  box.innerHTML = `
    <select onchange="updateSpotTime(${tripIndex}, ${dayIndex}, ${spotIndex}, this.value)" style="border: 1px solid #cca185; border-radius: 6px; padding: 2px 4px; font-size: 13px; font-weight: bold; background: #fff; color: #d35400; cursor: pointer;">
      ${options}
    </select>
  `;
}

function enableDurationSelect(tripIndex, dayIndex, spotIndex, currentDuration) {
  const box = document.getElementById(`durationBox_${spotIndex}`);
  if (!box) return;

  let options = '';
  for (let min = 30; min <= 12 * 60; min += 30) {
    const h = String(Math.floor(min / 60)).padStart(2, '0');
    const m = String(min % 60).padStart(2, '0');
    const val = `${h}時${m}分`;
    const selected = (val === formatDurationLabel(currentDuration)) ? 'selected' : '';
    options += `<option value="${val}" ${selected}>${val}</option>`;
  }

  box.innerHTML = `
    <select onchange="updateSpotDuration(${tripIndex}, ${dayIndex}, ${spotIndex}, this.value)" style="border: 1px solid #cca185; border-radius: 6px; padding: 2px 4px; font-size: 12px; font-weight: bold; background: #fff; color: #555; cursor: pointer;">
      ${options}
    </select>
  `;
}

function formatDurationLabel(raw) {
  if (!raw) return '02時00分';
  if (raw.includes('時') && raw.includes('分')) return raw;

  const hoursMatch = raw.match(/(\d+(?:\.\d+)?)\s*小時/);
  if (hoursMatch) {
    const num = parseFloat(hoursMatch[1]);
    const totalMin = Math.round(num * 60);
    const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
    const m = String(totalMin % 60).padStart(2, '0');
    return `${h}時${m}分`;
  }
  return raw;
}

function updateSpotTime(tripIndex, dayIndex, spotIndex, newTime) {
  const history = getSavedTrips();
  history[tripIndex].days[dayIndex].spots[spotIndex].time = newTime;
  saveTrips(history);
  renderDayPage();
}

function updateSpotDuration(tripIndex, dayIndex, spotIndex, newDuration) {
  const history = getSavedTrips();
  history[tripIndex].days[dayIndex].spots[spotIndex].duration = newDuration;
  saveTrips(history);
  renderDayPage();
}

function deleteSpot(tripIndex, dayIndex, spotIndex) {
  if (confirm('確定要刪除這個行程嗎？')) {
    const history = getSavedTrips();
    history[tripIndex].days[dayIndex].spots.splice(spotIndex, 1);
    saveTrips(history);
    renderDayPage();
  }
}

function findTimeConflicts(spots) {
  const conflicts = new Set();
  spots.forEach((a, i) => {
    const startA = timeToMinutes(a.time);
    const endA = Math.min(24 * 60, startA + durationToMinutes(a.duration));
    spots.forEach((b, j) => {
      if (i >= j) return;
      const startB = timeToMinutes(b.time);
      const endB = Math.min(24 * 60, startB + durationToMinutes(b.duration));
      if (startA < endB && startB < endA) { conflicts.add(i); conflicts.add(j); }
    });
  });
  return conflicts;
}

function renderMemoBlock(history, tripIndex, dayIndex) {
  const memoTextarea = document.getElementById('dayMemoInput');
  if (!memoTextarea) return;
  const isReadOnly = tripIndex < 0;
  const trip = isReadOnly ? getSharedTripFromUrl() : history[tripIndex];
  if (!trip || !trip.days[dayIndex]) return;
  const currentMemo = trip.days[dayIndex].memo || '';
  memoTextarea.value = currentMemo;
  memoTextarea.readOnly = isReadOnly;
  memoTextarea.oninput = () => {
    if (isReadOnly) return;
    history[tripIndex].days[dayIndex].memo = memoTextarea.value;
    saveTrips(history);
  };
}

function renderExpenseBlock(history, tripIndex, dayIndex) {
  const expenseListEl = document.getElementById('expenseList');
  const totalCostEl = document.getElementById('totalCost');
  if (!expenseListEl || !totalCostEl) return;

  const isReadOnly = tripIndex < 0;
  const sharedTrip = isReadOnly ? getSharedTripFromUrl() : null;
  const activeTrip = isReadOnly ? sharedTrip : history[tripIndex];
  if (!activeTrip || !activeTrip.days[dayIndex]) return;
  const dayData = activeTrip.days[dayIndex];
  if (!Array.isArray(dayData.expenses)) dayData.expenses = [];
  dayData.expenses = dayData.expenses.map(normalizeExpense);
  const members = activeTrip.members?.length ? activeTrip.members : ['我'];
  const categories = ['交通', '住宿', '飲食', '門票', '購物', '娛樂', '其他'];

  const avatarStyle = 'width:24px;height:24px;min-width:24px;border-radius:50%;background:#eef4fb;color:#2b6cb0;border:1px solid #90cdf4;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:bold;';
  const shortMember = name => String(name || '').length > 2 ? String(name).slice(-2) : String(name || '我');

  const updateExpenses = () => {
    expenseListEl.innerHTML = '';
    let total = 0;

    dayData.expenses.forEach((item, i) => {
      total += item.cost;
      const payer = members.includes(item.payer) ? item.payer : members[0];
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:9px;font-size:13px;padding:6px 0;';
      row.innerHTML = `<span style="display:flex;align-items:center;gap:7px;min-width:0;"><span style="${avatarStyle}" title="${escapeHtml(payer)} 付款">${escapeHtml(shortMember(payer))}</span><span style="min-width:0;"><strong>${escapeHtml(item.item)}</strong><small style="display:block;color:#888;margin-top:2px;">${escapeHtml(item.category)}・${item.participants?.length ? `分攤 ${item.participants.length} 人` : '全員分攤'}</small></span></span><span style="white-space:nowrap;"><strong>$${item.cost.toLocaleString()}</strong>${isReadOnly ? '' : `<button onclick="deleteExpense(${tripIndex}, ${dayIndex}, ${i})" class="hide-on-export" style="background:none;border:none;color:#c2593f;cursor:pointer;margin-left:8px;">✕</button>`}</span>`;
      expenseListEl.appendChild(row);
    });
    totalCostEl.innerText = `$${total.toLocaleString()}`;
  };

  updateExpenses();

  const addExpenseBtn = document.getElementById('addExpenseBtn');
  if (addExpenseBtn) {
    addExpenseBtn.style.display = isReadOnly ? 'none' : '';
    addExpenseBtn.onclick = () => {
      if (isReadOnly) return;
      const modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;';
      const payerOptions = members.map((v, i) => `<button type="button" class="payer-choice" data-payer="${escapeHtml(v)}" style="width:38px;height:38px;border-radius:50%;border:1px solid ${i===0?'#2b6cb0':'#cbd5e1'};background:${i===0?'#eaf3ff':'#fff'};color:#2b6cb0;font-size:11px;font-weight:bold;cursor:pointer;" title="${escapeHtml(v)}">${escapeHtml(shortMember(v))}</button>`).join('');
      modal.innerHTML = `<div style="background:#fff;border-radius:14px;padding:20px;width:min(460px,100%);max-height:85vh;overflow:auto;"><h3 style="margin:0 0 16px;">新增消費</h3><input id="expenseItem" placeholder="消費項目" style="width:100%;box-sizing:border-box;padding:9px;margin-bottom:8px;border:1px solid #ddd;border-radius:8px;"><input id="expenseCost" type="number" min="0" step="1" placeholder="金額" style="width:100%;box-sizing:border-box;padding:9px;margin-bottom:8px;border:1px solid #ddd;border-radius:8px;"><div style="font-size:12px;margin:4px 0 7px;font-weight:bold;">費用類別</div><select id="expenseCategory" style="width:100%;box-sizing:border-box;padding:9px;margin-bottom:12px;border:1px solid #ddd;border-radius:8px;">${categories.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}</select><div style="font-size:12px;margin:4px 0 7px;font-weight:bold;">誰付款？</div><div id="expensePayer" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;">${payerOptions}</div><div id="payerLabel" style="font-size:11px;color:#777;margin-top:-8px;margin-bottom:14px;">付款人：${escapeHtml(members[0])}</div><div style="font-size:12px;margin-bottom:8px;font-weight:bold;">分攤成員</div><div id="expenseParticipants" style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">${members.map((v,i)=>`<label style="font-size:12px;display:inline-flex;align-items:center;gap:3px;"><input type="checkbox" value="${escapeHtml(v)}" checked> ${escapeHtml(v)}</label>`).join('')}</div><div style="display:flex;gap:8px;justify-content:flex-end;"><button id="expenseCancel" style="padding:9px 14px;border:1px solid #ddd;background:#fff;border-radius:8px;">取消</button><button id="expenseSave" style="padding:9px 14px;border:0;background:#2b6cb0;color:#fff;border-radius:8px;">新增</button></div></div>`;
      document.body.appendChild(modal);

      let selectedPayer = members[0];
      const refreshPayerButtons = () => {
        modal.querySelectorAll('.payer-choice').forEach(btn => {
          const active = btn.dataset.payer === selectedPayer;
          btn.style.borderColor = active ? '#2b6cb0' : '#cbd5e1';
          btn.style.background = active ? '#eaf3ff' : '#fff';
          btn.style.boxShadow = active ? '0 0 0 2px rgba(43,108,176,.12)' : 'none';
        });
        modal.querySelector('#payerLabel').textContent = `付款人：${selectedPayer}`;
      };
      modal.querySelectorAll('.payer-choice').forEach(btn => {
        btn.onclick = () => { selectedPayer = btn.dataset.payer; refreshPayerButtons(); };
      });

      modal.querySelector('#expenseCancel').onclick = () => modal.remove();
      modal.querySelector('#expenseSave').onclick = () => {
        const item = modal.querySelector('#expenseItem').value.trim();
        const cost = safeNumber(modal.querySelector('#expenseCost').value, -1);
        if (!item || cost < 0) { alert('請輸入有效的項目與金額。'); return; }
        const category = modal.querySelector('#expenseCategory').value || '其他';
        const selected = [...modal.querySelectorAll('#expenseParticipants input:checked')].map(x => x.value);
        if (!selected.length) { alert('請至少選擇一位分攤成員。'); return; }
        dayData.expenses.push(normalizeExpense({ item, cost, category, payer: selectedPayer, participants: selected }));
        saveTrips(history); modal.remove(); updateExpenses();
      };
    };
  }
}

function generateTripSettlementReport(trip) {
  if (!trip || !Array.isArray(trip.days)) return;
  const members = Array.isArray(trip.members) && trip.members.length ? trip.members : ['我'];
  const paidBy = Object.fromEntries(members.map(m => [m, 0]));
  const owedBy = Object.fromEntries(members.map(m => [m, 0]));
  let grandTotal = 0;
  const dayRows = [];

  trip.days.forEach((day, dayIndex) => {
    const expenses = Array.isArray(day.expenses) ? day.expenses.map(normalizeExpense) : [];
    let dayTotal = 0;
    expenses.forEach(item => {
      const cost = Math.max(0, safeNumber(item.cost, 0));
      if (!cost) return;
      grandTotal += cost;
      dayTotal += cost;
      const payer = members.includes(item.payer) ? item.payer : members[0];
      paidBy[payer] += cost;
      const participants = Array.isArray(item.participants) && item.participants.length ? item.participants.filter(p => members.includes(p)) : members;
      const share = participants.length ? cost / participants.length : 0;
      participants.forEach(p => { owedBy[p] += share; });
    });
    if (dayTotal > 0) dayRows.push({ name: day.name || `Day ${dayIndex + 1}`, total: dayTotal });
  });

  const balances = members.map(name => ({ name, balance: (paidBy[name] || 0) - (owedBy[name] || 0) }));
  const creditors = balances.filter(x => x.balance > 0.005).map(x => ({ ...x }));
  const debtors = balances.filter(x => x.balance < -0.005).map(x => ({ ...x, balance: -x.balance }));
  const transfers = [];
  let di = 0, ci = 0;
  while (di < debtors.length && ci < creditors.length) {
    const amount = Math.min(debtors[di].balance, creditors[ci].balance);
    if (amount > 0.005) transfers.push({ from: debtors[di].name, to: creditors[ci].name, amount });
    debtors[di].balance -= amount;
    creditors[ci].balance -= amount;
    if (debtors[di].balance <= 0.005) di++;
    if (creditors[ci].balance <= 0.005) ci++;
  }

  const modal = document.createElement('div');
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000;padding:16px;';
  const dayHtml = dayRows.length ? dayRows.map(d => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #eee;"><span>${escapeHtml(d.name)}</span><strong>$${d.total.toLocaleString()}</strong></div>`).join('') : '<div style="color:#888">尚無任何記帳資料</div>';
  const balanceHtml = balances.map(x => `<div style="display:flex;justify-content:space-between;padding:5px 0;"><span>${escapeHtml(x.name)}</span><span>${x.balance >= 0 ? '<span style="color:#2b6cb0">應收</span>' : '<span style="color:#c2593f">應付</span>'} $${Math.abs(x.balance).toFixed(0)}</span></div>`).join('');
  const transferHtml = transfers.length ? transfers.map(x => `<div style="padding:8px 10px;margin:6px 0;background:#f7f9fc;border-radius:8px;"><strong>${escapeHtml(x.from)}</strong> → <strong>${escapeHtml(x.to)}</strong>　$${x.amount.toFixed(0)}</div>`).join('') : '<div style="color:#2b6cb0;font-weight:bold">🎉 所有人已經結清，不需要轉帳。</div>';
  modal.innerHTML = `<div style="background:#fff;border-radius:14px;padding:20px;width:min(520px,100%);max-height:85vh;overflow:auto;box-shadow:0 12px 40px rgba(0,0,0,.18);"><h3 style="margin:0 0 4px;color:#2b6cb0;">🧾 ${escapeHtml(trip.title)} 結帳報告</h3><div style="font-size:12px;color:#777;margin-bottom:16px;">共 ${trip.days.length} 天・總支出 $${grandTotal.toLocaleString()}</div><h4 style="margin:12px 0 6px;">每日支出</h4>${dayHtml}<h4 style="margin:16px 0 6px;">個人結算</h4><div style="background:#fafafa;padding:8px 10px;border-radius:8px;">${balanceHtml}</div><h4 style="margin:16px 0 6px;">建議轉帳</h4>${transferHtml}<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px;"><button id="settlementPrint" style="padding:9px 14px;border:1px solid #ddd;background:#fff;border-radius:8px;cursor:pointer;">🖨️ 列印</button><button id="settlementClose" style="padding:9px 14px;border:0;background:#2b6cb0;color:#fff;border-radius:8px;cursor:pointer;">關閉</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('#settlementClose').onclick = () => modal.remove();
  modal.querySelector('#settlementPrint').onclick = () => {
    const report = modal.querySelector('div > div');
    const w = window.open('', '_blank');
    if (!w) return alert('請允許開啟彈出視窗。');
    w.document.write(`<html><head><title>${escapeHtml(trip.title)} 結帳報告</title><style>body{font-family:sans-serif;padding:24px;color:#333}h1{color:#2b6cb0}h4{margin-top:20px}.box{padding:10px;background:#f7f9fc;border-radius:8px;margin:6px 0}</style></head><body><h1>🧾 ${escapeHtml(trip.title)} 結帳報告</h1><p>總支出：$${grandTotal.toLocaleString()}</p><h4>每日支出</h4>${dayHtml}<h4>個人結算</h4>${balanceHtml}<h4>建議轉帳</h4>${transferHtml}</body></html>`);
    w.document.close(); w.focus(); w.print();
  };
}

function deleteExpense(tripIndex, dayIndex, expenseIndex) {
  const history = getSavedTrips();
  history[tripIndex].days[dayIndex].expenses.splice(expenseIndex, 1);
  saveTrips(history);
  renderDayPage();
}

function triggerPhotoUpload(photoKey, inputId) {
  const input = document.getElementById(inputId);
  if (input) input.click();
}

async function handlePhotoUpload(event, photoKey, previewId) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) { alert('請選擇圖片檔案。'); return; }
  try {
    const compressed = await compressImage(file);
    await savePhotoToDb(photoKey, compressed);
    localStorage.removeItem(photoKey);
    renderDayPage();
  } catch (err) {
    alert('照片儲存失敗，請換一張較小的圖片再試一次。');
  }
}

async function deletePhoto(photoKey, previewId) {
  if (confirm('確定要刪除這張拍立得照片嗎？')) {
    await deletePhotoFromDb(photoKey);
    renderDayPage();
  }
}

function exportAsLongImage() {
  document.body.classList.add('pdf-export-mode');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('pdf-export-mode');
  }, 1000);
}

function exportFullTripPdf(trip) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('請允許開啟彈出視窗以下載 PDF！');
    return;
  }

  const membersText = trip.members && trip.members.length > 0 ? trip.members.join('、') : '無';

  let htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>${escapeHtml(trip.title)} - 完整行程總覽表</title>
      <style>
        body { font-family: sans-serif; padding: 20px; color: #333; line-height: 1.5; }
        h1 { text-align: center; color: #2b6cb0; border-bottom: 2px solid #2b6cb0; padding-bottom: 10px; margin-bottom: 5px; }
        .members-info { text-align: center; font-size: 13px; color: #666; margin-bottom: 20px; }
        .day-section { margin-bottom: 24px; page-break-inside: avoid; }
        .day-title { background: #eef4fb; color: #2b6cb0; padding: 8px 12px; font-weight: bold; border-radius: 6px; font-size: 16px; margin-bottom: 10px; }
        .spot-item { margin-left: 12px; padding: 6px 0; border-bottom: 1px dashed #eee; font-size: 14px; }
        .spot-time { font-weight: bold; color: #d35400; display: inline-block; width: 60px; }
        .spot-name { font-weight: bold; }
        .spot-dur { font-size: 12px; color: #666; margin-left: 10px; }
        .transit-info { font-size: 12px; color: #888; margin-left: 72px; margin-top: 2px; }
        .memo-box { background: #fffef0; border-left: 4px solid #f39c12; padding: 8px 12px; margin-top: 8px; margin-left: 12px; font-size: 13px; color: #555; white-space: pre-wrap; }
      </style>
    </head>
    <body>
      <h1>✈️ ${escapeHtml(trip.title)} - 行程總覽</h1>
      <div class="members-info">參與人員：${escapeHtml(membersText)}</div>
  `;

  trip.days.forEach((day, index) => {
    htmlContent += `
      <div class="day-section">
        <div class="day-title">${escapeHtml(day.name)}</div>
    `;

    if (day.spots.length === 0) {
      htmlContent += `<div style="margin-left:12px; color:#999; font-size:13px;">尚無安排景點</div>`;
    } else {
      day.spots.forEach((spot, sIdx) => {
        const cleanName = cleanSpotName(spot.name);
        htmlContent += `
          <div class="spot-item">
            <span class="spot-time">⏰ ${spot.time}</span>
            <span class="spot-name">${escapeHtml(cleanName)}</span>
            <span class="spot-dur">(預計停留: ${spot.duration || '2小時'})</span>
          </div>
        `;
        if (sIdx < day.spots.length - 1) {
          const nextName = cleanSpotName(day.spots[sIdx + 1].name);
          htmlContent += `<div class="transit-info">🚌 交通移動 ➔ 下個景點：${escapeHtml(nextName)}</div>`;
        }
      });
    }

    if (day.memo) {
      htmlContent += `<div class="memo-box"><strong>📌 備忘錄：</strong>\n${escapeHtml(day.memo)}</div>`;
    }

    htmlContent += `</div>`;
  });

  htmlContent += `
      <script>
        window.onload = function() {
          window.print();
        }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(htmlContent);
  printWindow.document.close();
}