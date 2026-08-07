// 全局資料儲存 Key
const STORAGE_KEY = 'my_travel_book_trips';

// 預設範例行程
const defaultTrips = [
  {
    id: 'demo_kansai',
    title: '阪京 5 日自由行',
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultTrips));
    return defaultTrips;
  }
  try {
    return JSON.parse(data);
  } catch (e) {
    return defaultTrips;
  }
}

function saveTrips(trips) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(trips));
}

// 頁面路由判斷
document.addEventListener('DOMContentLoaded', () => {
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
      <div style="font-size: 18px; font-weight: 800; color: var(--primary); margin-bottom: 6px;">${trip.title}</div>
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
        id: 'trip_' + Date.now(),
        title: title,
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

// 增強版文字解析函數
function parseTextToTrip(text) {
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (rawLines.length === 0) return null;

  // 第一行為行程標題
  const tripTitle = rawLines[0];
  const contentLines = rawLines.slice(1);

  if (contentLines.length === 0) {
    alert('請在第一行標題下方輸入至少一天的行程細節！');
    return null;
  }

  const days = [];
  let currentDay = null;
  let autoDayCount = 1;

  contentLines.forEach(line => {
    const isDayHeader = line.match(/^(day|d)\s*\d+/i) || line.match(/^第[一二三四五六七八九十\d]+天/);

    if (isDayHeader) {
      if (currentDay) days.push(currentDay);
      currentDay = { name: line, spots: [], memo: '', expenses: [] };
    } else {
      if (!currentDay) {
        currentDay = { name: `Day ${autoDayCount}: 行程`, spots: [], memo: '', expenses: [] };
        autoDayCount++;
      }

      const rawSpots = line.split(/→|->|➔/).map(s => s.trim()).filter(Boolean);

      rawSpots.forEach((spotStr) => {
        let spotTime = '09:00';
        let duration = '02時00分';
        let spotName = spotStr;

        const timeRangeMatch = spotStr.match(/(\d{1,2}:\d{2})\s*[-~～至]\s*(\d{1,2}:\d{2})/);
        if (timeRangeMatch) {
          spotTime = formatTime(timeRangeMatch[1]);
          const startMin = timeToMinutes(timeRangeMatch[1]);
          const endMin = timeToMinutes(timeRangeMatch[2]);
          if (endMin > startMin) {
            const diffMin = endMin - startMin;
            const h = String(Math.floor(diffMin / 60)).padStart(2, '0');
            const m = String(diffMin % 60).padStart(2, '0');
            duration = `${h}時${m}分`;
          }
          spotName = spotName.replace(timeRangeMatch[0], '');
        } else {
          const singleTimeMatch = spotStr.match(/(\d{1,2}:\d{2})/);
          if (singleTimeMatch) {
            spotTime = formatTime(singleTimeMatch[1]);
            spotName = spotName.replace(singleTimeMatch[1], '');
          } else {
            const baseHour = 9 + currentDay.spots.length * 2;
            const h = baseHour < 24 ? baseHour : 23;
            spotTime = `${String(h).padStart(2, '0')}:00`;
          }
        }

        const durationMatch = spotName.match(/(\(|\（|\s|^)(\d+(?:\.\d+)?)\s*(小時|hr|hrs|min|分鐘)(\)|\）|\s|$)/i);
        if (durationMatch) {
          const num = parseFloat(durationMatch[2]);
          const unit = durationMatch[3].toLowerCase();
          if (unit.includes('min') || unit.includes('分')) {
            const h = String(Math.floor(num / 60)).padStart(2, '0');
            const m = String(Math.round(num % 60)).padStart(2, '0');
            duration = `${h}時${m}分`;
          } else {
            const totalMin = Math.round(num * 60);
            const h = String(Math.floor(totalMin / 60)).padStart(2, '0');
            const m = String(totalMin % 60).padStart(2, '0');
            duration = `${h}時${m}分`;
          }
          spotName = spotName.replace(durationMatch[0], ' ');
        }

        spotName = spotName.replace(/^[-:\s()（）]+|[-:\s()（）]+$/g, '').trim();

        if (spotName) {
          currentDay.spots.push({ time: spotTime, name: spotName, duration: duration });
        }
      });
    }
  });

  if (currentDay) days.push(currentDay);
  if (days.length === 0) return null;

  return { id: 'trip_' + Date.now(), title: tripTitle, days: days };
}

function formatTime(tStr) {
  const parts = tStr.split(':');
  const h = String(parts[0]).padStart(2, '0');
  const m = String(parts[1]).padStart(2, '0');
  return `${h}:${m}`;
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
  const history = getSavedTrips();
  const tripIndex = history.findIndex(t => t.id === tripId);
  const trip = history[tripIndex] || history[0];

  if (!trip) {
    alert('找不到行程資料！');
    window.location.href = 'index.html';
    return;
  }

  const bookTitleEl = document.getElementById('bookTitle');
  if (bookTitleEl) bookTitleEl.innerText = trip.title;

  const container = document.getElementById('timelineList');
  if (!container) return;
  
  const lineHtml = '<div class="flow-line"></div><div id="vehicleRunner" class="vehicle-runner">✈️</div>';
  container.innerHTML = lineHtml;

  trip.days.forEach((day, index) => {
    const card = document.createElement('div');
    card.className = 'flow-card';
    const spotNames = day.spots.length > 0 
      ? day.spots.map(s => s.name).join(' → ') 
      : '尚無行程，點擊進行編輯';
    
    // 限制預覽為單行文字 (ellipsis)
    card.innerHTML = `
      <div class="flow-node-num" id="node_${index}">${index + 1}</div>
      <div class="card-title">
        <span>${day.name}</span>
        <span style="font-size:12px; color:var(--primary)">編輯細節 ➔</span>
      </div>
      <div class="card-preview" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block;">${spotNames}</div>
      <div class="badge">📍 共 ${day.spots.length} 個行程</div>
    `;

    card.onclick = () => {
      sessionStorage.setItem(`lastVisitedDay_${trip.id}`, index);
      moveVehicleToNode(index);
      setTimeout(() => { window.location.href = `day.html?id=${trip.id}&day=${index}`; }, 350);
    };

    container.appendChild(card);
  });

  let addDayBtn = document.getElementById('addDayBtn');
  if (!addDayBtn) {
    addDayBtn = document.createElement('button');
    addDayBtn.id = 'addDayBtn';
    addDayBtn.className = 'action-btn';
    addDayBtn.style.cssText = 'width: 100%; margin-top: 16px; background: #e8f4ec; color: #2e7d32; border: 1px dashed #81c784; padding: 10px; font-size: 13px; font-weight: bold; border-radius: 10px; cursor: pointer;';
    addDayBtn.innerText = '➕ 為此行程新增天數 (Day)';
    container.after(addDayBtn);
  }

  addDayBtn.onclick = () => {
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
    shareBtn.onclick = () => {
      navigator.clipboard.writeText(window.location.href);
      alert('已複製行程連結，快分享給朋友吧！');
    };
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

  const history = getSavedTrips();
  const tripIndex = history.findIndex(t => t.id === tripId);
  const trip = history[tripIndex] || history[0];

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

  dayData.spots.forEach((spot, idx) => {
    const block = document.createElement('div');
    block.className = 'spot-block';
    block.setAttribute('data-id', idx);
    
    let transitHtml = '';
    if (idx < dayData.spots.length - 1) {
      const nextSpot = dayData.spots[idx + 1];
      const transitUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(spot.name)}&destination=${encodeURIComponent(nextSpot.name)}&travelmode=transit`;
      transitHtml = `
        <div class="transit-box">
          <a href="${transitUrl}" target="_blank" class="transit-btn">
            🚌 前往「${nextSpot.name}」交通路線 ➔
          </a>
        </div>
      `;
    }

    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spot.name)}`;
    const photoKey = `photo_${trip.id}_${dayIndex}_${idx}`;
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

    // 格式化停留時間顯示 (預估停留：XX時XX分)
    const formattedDuration = formatDurationLabel(spot.duration);

    block.innerHTML = `
      <div class="card">
        <div class="card-top" style="display: flex; justify-content: space-between; align-items: center;">
          
          <!-- 左側：行程時間（點擊後開啟下拉選單） -->
          <div id="timeBox_${idx}">
            <span onclick="enableTimeSelect(${tripIndex}, ${dayIndex}, ${idx}, '${spot.time}')" style="cursor: pointer; font-size: 15px; font-weight: 800; color: #d35400; user-select: none;">
              ⏰ ${spot.time}
            </span>
          </div>

          <!-- 右側：停留時間（點擊後開啟下拉選單） + 刪除 + 拖曳按鈕 -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <div id="durationBox_${idx}">
              <span onclick="enableDurationSelect(${tripIndex}, ${dayIndex}, ${idx}, '${spot.duration}')" style="cursor: pointer; font-size: 12px; font-weight: 600; color: #555; background: #ebdcd0; padding: 4px 10px; border-radius: 12px; user-select: none; display: inline-flex; align-items: center; gap: 4px;">
                ⏱️ 預計停留：${formattedDuration}
              </span>
            </div>
            <button onclick="deleteSpot(${tripIndex}, ${dayIndex}, ${idx})" style="background:none; border:none; color:#c2593f; cursor:pointer; font-weight:bold; font-size:14px; margin-left: 2px;">✕</button>
            <span class="drag-handle" style="margin-left:2px; cursor:grab;">☰</span>
          </div>

        </div>
        <div class="spot-name" style="margin-top: 10px; font-size: 16px; font-weight: 700;">${spot.name}</div>

        <div class="polaroid-box" onclick="triggerPhotoUpload('${photoKey}', 'input_${idx}')">
          <div id="preview_${idx}">${photoContent}</div>
          <div class="polaroid-caption">🖼️ ${spot.name} · 隨手拍</div>
          <input type="file" id="input_${idx}" class="file-input" accept="image/*" onchange="handlePhotoUpload(event, '${photoKey}', 'preview_${idx}')">
        </div>

        <a href="${mapUrl}" target="_blank" class="map-btn">📍 Google 地圖導航與評價</a>
      </div>
      ${transitHtml}
    `;
    container.appendChild(block);
  });

  // 新增景點按鈕
  let addSpotBtn = document.getElementById('addSpotBtn');
  if (!addSpotBtn) {
    addSpotBtn = document.createElement('button');
    addSpotBtn.id = 'addSpotBtn';
    addSpotBtn.className = 'action-btn';
    addSpotBtn.style.cssText = 'width: 100%; margin: 10px 0 16px 0; background: #eef4fb; color: #2b6cb0; border: 1px dashed #90cdf4; padding: 9px; font-size: 13px; font-weight: bold; border-radius: 10px; cursor: pointer;';
    addSpotBtn.innerText = '➕ 新增景點 / 行程項目';
    container.after(addSpotBtn);
  }

  addSpotBtn.onclick = () => {
    const spotName = prompt('請輸入景點或行程名稱（例如：東京鐵塔）：');
    if (!spotName) return;

    history[tripIndex].days[dayIndex].spots.push({
      time: '10:00',
      name: spotName,
      duration: '02時00分'
    });

    saveTrips(history);
    renderDayPage();
  };

  if (typeof Sortable !== 'undefined') {
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

// 點擊後切換為 24小時制 行程時間下拉選單
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

// 點擊後切換為 停留時間下拉選單 (00時30分 ~ 12時00分)
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

// 格式化停留時間顯示 (確保如 03時00分)
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

// 更新行程時間
function updateSpotTime(tripIndex, dayIndex, spotIndex, newTime) {
  const history = getSavedTrips();
  history[tripIndex].days[dayIndex].spots[spotIndex].time = newTime;
  saveTrips(history);
  renderDayPage();
}

// 更新停留時間
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

function renderMemoBlock(history, tripIndex, dayIndex) {
  const memoTextarea = document.getElementById('dayMemoInput');
  if (!memoTextarea) return;

  const currentMemo = history[tripIndex].days[dayIndex].memo || '';
  memoTextarea.value = currentMemo;

  memoTextarea.oninput = () => {
    history[tripIndex].days[dayIndex].memo = memoTextarea.value;
    saveTrips(history);
  };
}

function renderExpenseBlock(history, tripIndex, dayIndex) {
  const expenseListEl = document.getElementById('expenseList');
  const totalCostEl = document.getElementById('totalCost');
  if (!expenseListEl || !totalCostEl) return;

  const dayData = history[tripIndex].days[dayIndex];
  if (!dayData.expenses) dayData.expenses = [];

  const updateExpenses = () => {
    expenseListEl.innerHTML = '';
    let total = 0;

    dayData.expenses.forEach((item, i) => {
      total += Number(item.cost || 0);
      const row = document.createElement('div');
      row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:13px;';
      row.innerHTML = `
        <span>💸 ${item.item}</span>
        <span>
          <strong>$${item.cost}</strong>
          <button onclick="deleteExpense(${tripIndex}, ${dayIndex}, ${i})" style="background:none; border:none; color:#c2593f; cursor:pointer; margin-left:8px;">✕</button>
        </span>
      `;
      expenseListEl.appendChild(row);
    });

    totalCostEl.innerText = `$${total}`;
  };

  updateExpenses();

  const addExpenseBtn = document.getElementById('addExpenseBtn');
  if (addExpenseBtn) {
    addExpenseBtn.onclick = () => {
      const itemName = prompt('請輸入消費項目（例如：午餐、車票）：');
      if (!itemName) return;
      const itemCost = prompt('請輸入金額：');
      if (itemCost && !isNaN(itemCost)) {
        dayData.expenses.push({ item: itemName, cost: Number(itemCost) });
        saveTrips(history);
        renderExpenseBlock(history, tripIndex, dayIndex);
      }
    };
  }
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

function handlePhotoUpload(event, photoKey, previewId) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Img = e.target.result;
    try {
      localStorage.setItem(photoKey, base64Img);
      renderDayPage();
    } catch (err) {
      alert('照片檔案較大，建議選擇較小張照片上傳喔！');
    }
  };
  reader.readAsDataURL(file);
}

function deletePhoto(photoKey, previewId) {
  if (confirm('確定要刪除這張拍立得照片嗎？')) {
    localStorage.removeItem(photoKey);
    renderDayPage();
  }
}

function exportAsLongImage() {
  const area = document.getElementById('captureArea');
  if (!area || typeof html2canvas === 'undefined') return;

  alert('正在繪製拍立得長圖，請稍等約 1~2 秒...');

  html2canvas(area, {
    scale: 2,
    backgroundColor: '#f5eedc',
    useCORS: true
  }).then(canvas => {
    const link = document.createElement('a');
    link.download = `travel_book_day_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }).catch(err => {
    alert('長圖繪製失敗，請重新再試一次！');
  });
}