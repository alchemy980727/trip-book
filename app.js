// 全局資料儲存 Key
const STORAGE_KEY = 'TRIP_BOOK_DATA';

// 判斷當前頁面
document.addEventListener('DOMContentLoaded', () => {
  const path = window.location.pathname;
  if (path.endsWith('index.html') || path.endsWith('/') || path === '') {
    initIndexPage();
  } else if (path.endsWith('view.html')) {
    renderViewPage();
  } else if (path.endsWith('day.html')) {
    renderDayPage();
  }
});

// --- 1. 首頁 (index.html) ---
function initIndexPage() {
  const parseBtn = document.getElementById('parseBtn');
  const bulkInput = document.getElementById('bulkInput');

  if (parseBtn) {
    parseBtn.addEventListener('click', () => {
      const text = bulkInput.value.trim();
      if (!text) {
        alert('請先貼上行程文字！');
        return;
      }
      const tripData = parseTripText(text);
      saveTripData(tripData);
      window.location.href = `view.html?id=${tripData.id}`;
    });
  }

  renderSavedTrips();
}

// 行程文字解析器
function parseTripText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l);
  let title = "我的隨身旅遊小書";
  let days = [];
  let currentDay = null;

  lines.forEach(line => {
    if (line.startsWith("行程名稱：") || line.startsWith("行程：")) {
      title = line.replace(/行程名稱：|行程：/, '').trim();
    } else if (/^第[一二三四五六七八九十0-9]+天/.test(line) || /^Day\s*\d+/i.test(line)) {
      if (currentDay) days.push(currentDay);
      currentDay = { name: line, spots: [] };
    } else if (currentDay) {
      const spotMatch = line.match(/^(\d{1,2}:\d{2})\s*(.+?)(?:\s*\(停留\s*(.+?)\))?$/);
      if (spotMatch) {
        currentDay.spots.push({
          time: spotMatch[1],
          name: spotMatch[2],
          duration: spotMatch[3] || "1小時"
        });
      } else {
        currentDay.spots.push({
          time: "彈性",
          name: line,
          duration: "1小時"
        });
      }
    }
  });

  if (currentDay) days.push(currentDay);

  if (days.length === 0) {
    days = [{
      name: "第一天",
      spots: [{ time: "09:00", name: text.slice(0, 15) + "...", duration: "全天" }]
    }];
  }

  return {
    id: 'trip_' + Date.now(),
    title: title,
    days: days
  };
}

// 儲存與讀取 LocalStorage
function saveTripData(tripData) {
  const history = getSavedTrips();
  history.unshift(tripData);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

function getSavedTrips() {
  const data = localStorage.getItem(STORAGE_KEY);
  return data ? JSON.parse(data) : [];
}

function renderSavedTrips() {
  const container = document.getElementById('savedTripsList');
  if (!container) return;
  const history = getSavedTrips();

  if (history.length === 0) {
    container.innerHTML = '<p style="color:var(--sub-text); font-size:13px; text-align:center;">尚無歷史行程，請上方貼上建立！</p>';
    return;
  }

  container.innerHTML = history.map(trip => `
    <div class="saved-item" onclick="window.location.href='view.html?id=${trip.id}'">
      <span class="saved-title">📖 ${trip.title} (${trip.days.length} 天)</span>
      <button class="delete-btn" onclick="event.stopPropagation(); deleteTrip('${trip.id}')">刪除</button>
    </div>
  `).join('');
}

function deleteTrip(id) {
  let history = getSavedTrips();
  history = history.filter(t => t.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  renderSavedTrips();
}


// --- 2. 總覽頁 (view.html) ---
function renderViewPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tripId = urlParams.get('id');
  const history = getSavedTrips();
  const trip = history.find(t => t.id === tripId) || history[0];

  if (!trip) {
    alert('找不到行程資料！');
    window.location.href = 'index.html';
    return;
  }

  document.getElementById('bookTitle').innerText = trip.title;
  const container = document.getElementById('timelineList');
  
  // 保留導線與小飛機載具
  const lineHtml = '<div class="flow-line"></div><div id="vehicleRunner" class="vehicle-runner">✈️</div>';
  container.innerHTML = lineHtml;

  trip.days.forEach((day, index) => {
    const card = document.createElement('div');
    card.className = 'flow-card';
    
    const spotNames = day.spots.map(s => s.name).join(' → ');
    
    card.innerHTML = `
      <div class="flow-node-num" id="node_${index}">${index + 1}</div>
      <div class="card-title">
        <span>${day.name}</span>
        <span style="font-size:12px; color:var(--primary)">查看細節 ➔</span>
      </div>
      <div class="card-preview">${spotNames}</div>
      <div class="badge">📍 ${day.spots.length} 個景點/行程</div>
    `;

    // 點擊事件：記憶最後瀏覽的天數索引，並順暢跳轉
    card.onclick = () => {
      sessionStorage.setItem('lastVisitedDayIndex', index);
      moveVehicleToNode(index);
      setTimeout(() => {
        window.location.href = `day.html?id=${trip.id}&day=${index}`;
      }, 350);
    };

    container.appendChild(card);
  });

  // 卡片依序登場
  const cards = container.querySelectorAll('.flow-card');
  cards.forEach((card, i) => {
    setTimeout(() => {
      card.classList.add('appear');
    }, i * 120);
  });

  // 讀取最後存取的紀錄，若無紀錄則預設為第 1 天 (Index 0)
  const savedIndex = sessionStorage.getItem('lastVisitedDayIndex');
  const targetIndex = (savedIndex !== null && savedIndex < trip.days.length) ? parseInt(savedIndex, 10) : 0;

  setTimeout(() => {
    moveVehicleToNode(targetIndex);
  }, 100);

  // 分享功能
  const shareBtn = document.getElementById('shareTripBtn');
  if (shareBtn) {
    shareBtn.onclick = () => {
      navigator.clipboard.writeText(window.location.href);
      alert('已複製行程連結，快分享給朋友吧！');
    };
  }
}

// 切換小飛機位置與波紋擴散 focus
function moveVehicleToNode(nodeIndex) {
  const vehicle = document.getElementById('vehicleRunner');
  const targetNode = document.getElementById(`node_${nodeIndex}`);
  
  if (!vehicle || !targetNode) return;

  // 移動小飛機到目標卡片節點左側
  const card = targetNode.closest('.flow-card');
  if (card) {
    vehicle.style.top = `${card.offsetTop + 14}px`;
  }

  // 移除所有節點的波紋效果
  document.querySelectorAll('.flow-node-num').forEach(node => {
    node.classList.remove('active-node');
  });

  // 給當前停留的節點加上波紋效果 (頻率 2 秒一次)
  targetNode.classList.add('active-node');
}

// 切換小飛機位置與波紋擴散 focus
function moveVehicleToNode(nodeIndex) {
  const vehicle = document.getElementById('vehicleRunner');
  const targetNode = document.getElementById(`node_${nodeIndex}`);
  
  if (!vehicle || !targetNode) return;

  // 移動小飛機到目標卡片節點
  const card = targetNode.closest('.flow-card');
  if (card) {
    vehicle.style.top = `${card.offsetTop + 14}px`;
  }

  // 移除所有節點的波紋效果
  document.querySelectorAll('.flow-node-num').forEach(node => {
    node.classList.remove('active-node');
  });

  // 僅給小飛機當前停留的節點加上波紋效果 (頻率 2 秒一次)
  targetNode.classList.add('active-node');
}


// --- 3. 詳細頁 (day.html) ---
function renderDayPage() {
  const urlParams = new URLSearchParams(window.location.search);
  const tripId = urlParams.get('id');
  const dayIndex = parseInt(urlParams.get('day') || '0', 10);

  const history = getSavedTrips();
  const trip = history.find(t => t.id === tripId) || history[0];

  if (!trip || !trip.days[dayIndex]) {
    alert('找不到指定天數資料！');
    window.location.href = 'index.html';
    return;
  }

  const dayData = trip.days[dayIndex];
  document.getElementById('dayPageTitle').innerText = `${trip.title} - ${dayData.name}`;
  document.getElementById('pdfHeaderTitle').innerText = `${trip.title} - ${dayData.name} 詳細行程單`;

  const container = document.getElementById('dayScheduleContent');
  const pdfTableBody = document.getElementById('pdfTableBody');
  
  container.innerHTML = '';
  if (pdfTableBody) pdfTableBody.innerHTML = '';

  dayData.spots.forEach((spot, idx) => {
    const block = document.createElement('div');
    block.className = 'spot-block';
    
    // 交通導航按鈕
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

    // 拍立得照片 HTML 結構
    const photoContent = savedPhoto 
      ? `<img src="${savedPhoto}" class="polaroid-img" style="object-fit:cover;">`
      : `<div class="polaroid-img">📷 點擊上傳 / 紀錄旅行拍立得照片</div>`;

    block.innerHTML = `
      <div class="card">
        <div class="card-top">
          <span class="time">⏰ ${spot.time}</span>
          <span class="duration">⏱️ 預計停留: ${spot.duration}</span>
        </div>
        <div class="spot-name">${spot.name}</div>

        <!-- 拍立得相片區域 -->
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

    // PDF 列印表格渲染
    if (pdfTableBody) {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${spot.time}</td>
        <td><strong>${spot.name}</strong></td>
        <td>${spot.duration}</td>
      `;
      pdfTableBody.appendChild(tr);
    }
  });
}

// 觸發照片選擇
function triggerPhotoUpload(photoKey, inputId) {
  const input = document.getElementById(inputId);
  if (input) input.click();
}

// 處理相片上傳與 LocalStorage 存取
function handlePhotoUpload(event, photoKey, previewId) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const base64Img = e.target.result;
    try {
      localStorage.setItem(photoKey, base64Img);
      const previewEl = document.getElementById(previewId);
      if (previewEl) {
        previewEl.innerHTML = `<img src="${base64Img}" class="polaroid-img" style="object-fit:cover;">`;
      }
    } catch (err) {
      alert('照片檔案較大，建議選擇較小張照片上傳喔！');
    }
  };
  reader.readAsDataURL(file);
}