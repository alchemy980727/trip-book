document.addEventListener('DOMContentLoaded', () => {

  // 通用功能：取得所有歷史紀錄
  function getStoredBooks() {
    try {
      return JSON.parse(localStorage.getItem('all_chitrip_books')) || [];
    } catch (e) {
      return [];
    }
  }

  // ==========================================
  // 1. 首頁 index.html 邏輯
  // ==========================================
  const bulkInput = document.getElementById('bulkInput');
  const parseBtn = document.getElementById('parseBtn');
  const savedTripsList = document.getElementById('savedTripsList');

  function renderSavedList() {
    if (!savedTripsList) return;

    const books = getStoredBooks();
    savedTripsList.innerHTML = '';

    if (books.length === 0) {
      savedTripsList.innerHTML = '<p style="text-align:center; color:#8e8e93; font-size:13px; margin: 20px 0;">目前沒有儲存的行程。</p>';
      return;
    }

    books.forEach((book, index) => {
      const item = document.createElement('div');
      item.className = 'saved-item';
      item.innerHTML = `
        <div class="saved-title">✈️ ${book.title}</div>
        <button class="delete-btn">刪除</button>
      `;

      item.querySelector('.saved-title').addEventListener('click', () => {
        localStorage.setItem('current_chitrip_book', JSON.stringify(book));
        window.location.href = 'view.html';
      });

      item.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`確定刪除「${book.title}」？`)) {
          const currentBooks = getStoredBooks();
          currentBooks.splice(index, 1);
          localStorage.setItem('all_chitrip_books', JSON.stringify(currentBooks));
          renderSavedList();
        }
      });

      savedTripsList.appendChild(item);
    });
  }

  if (bulkInput && parseBtn) {
    renderSavedList();

    parseBtn.addEventListener('click', () => {
      try {
        const rawText = bulkInput.value.trim();
        if (!rawText) {
          alert('請先貼上行程文字！');
          return;
        }

        const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length === 0) return;

        let tripTitle = lines[0].replace('行程名稱：', '').trim();
        const itinerary = [];
        let currentDay = "第一天";

        for (let i = 1; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith('第') || line.toLowerCase().startsWith('day')) {
            currentDay = line;
          } else {
            const timeMatch = line.match(/^(\d{1,2}:\d{2})\s*(.*)/);
            if (timeMatch) {
              const time = timeMatch[1];
              let restStr = timeMatch[2];
              let duration = "";
              const durationMatch = restStr.match(/\(停留\s*([^)]+)\)/);
              if (durationMatch) {
                duration = durationMatch[1];
                restStr = restStr.replace(/\(停留\s*[^)]+\)/, '').trim();
              }
              const spotName = restStr || "景點";
              const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(spotName)}`;

              itinerary.push({
                day: currentDay,
                time: time,
                spotName: spotName,
                duration: duration,
                mapUrl: mapUrl
              });
            }
          }
        }

        const newBookData = {
          id: Date.now(),
          title: tripTitle,
          items: itinerary
        };

        const allBooks = getStoredBooks();
        allBooks.unshift(newBookData);
        localStorage.setItem('all_chitrip_books', JSON.stringify(allBooks));
        localStorage.setItem('current_chitrip_book', JSON.stringify(newBookData));

        window.location.href = 'view.html';
      } catch (error) {
        alert('解析發生錯誤：' + error.message);
      }
    });
  }

  // ==========================================
  // 2. 總覽頁 view.html 邏輯
  // ==========================================
  const bookTitle = document.getElementById('bookTitle');
  const timelineList = document.getElementById('timelineList');

  if (bookTitle && timelineList) {
    try {
      const rawData = localStorage.getItem('current_chitrip_book');
      if (!rawData) {
        bookTitle.innerText = "尚未選擇行程";
        timelineList.innerHTML = '<p style="text-align:center; color:#888;">請回首頁選擇行程。</p>';
      } else {
        const savedData = JSON.parse(rawData);
        bookTitle.innerText = savedData.title || "我的旅遊小書";

        const days = [...new Set(savedData.items.map(item => item.day))];
        timelineList.innerHTML = '';

        days.forEach((dayName, index) => {
          const dayItems = savedData.items.filter(item => item.day === dayName);
          const spotCount = dayItems.length;
          const previewSpots = dayItems.slice(0, 2).map(i => i.spotName).join(' ➔ ');

          const card = document.createElement('div');
          card.className = 'flow-card';
          card.innerHTML = `
            <div class="flow-node-num">${index + 1}</div>
            <div class="card-title">
              <span>${dayName}</span>
              <span style="color:#007aff; font-size:13px; font-weight:bold;">查看 ➔</span>
            </div>
            <div class="card-preview">
              ${previewSpots ? `📍 ${previewSpots}${spotCount > 2 ? ' ...' : ''}` : '尚無景點'}
            </div>
            <span class="badge">📌 共 ${spotCount} 個地點</span>
          `;

          card.addEventListener('click', () => {
            window.location.href = `day.html?day=${encodeURIComponent(dayName)}`;
          });

          timelineList.appendChild(card);
        });
      }
    } catch (error) {
      console.error(error);
    }
  }

  // ==========================================
  // 3. 詳細頁 day.html 邏輯
  // ==========================================
  const dayPageTitle = document.getElementById('dayPageTitle');
  const dayScheduleContent = document.getElementById('dayScheduleContent');

  if (dayPageTitle && dayScheduleContent) {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const selectedDay = urlParams.get('day');
      const rawData = localStorage.getItem('current_chitrip_book');

      if (!rawData || !selectedDay) {
        dayPageTitle.innerText = "找不到行程";
      } else {
        const savedData = JSON.parse(rawData);
        dayPageTitle.innerText = selectedDay;

        const filteredItems = savedData.items.filter(item => item.day === selectedDay);
        dayScheduleContent.innerHTML = '';

        filteredItems.forEach((item, index) => {
          const block = document.createElement('div');
          block.className = 'spot-block';
          block.innerHTML = `
            <div class="card">
              <div class="card-top">
                <span class="time">⏰ ${item.time}</span>
                ${item.duration ? `<span class="duration">停留 ${item.duration}</span>` : ''}
              </div>
              <div class="spot-name">${item.spotName}</div>
              <div>
                <a href="${item.mapUrl}" target="_blank" class="map-btn">📍 Google 地圖定位</a>
              </div>
            </div>
          `;
          dayScheduleContent.appendChild(block);

          if (index < filteredItems.length - 1) {
            const nextItem = filteredItems[index + 1];
            const dirUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(item.spotName)}&destination=${encodeURIComponent(nextItem.spotName)}&travelmode=transit`;

            const transitBox = document.createElement('div');
            transitBox.className = 'transit-box';
            transitBox.innerHTML = `
              <a href="${dirUrl}" target="_blank" class="transit-btn">
                🚌 前往「${nextItem.spotName}」交通建議 ➔
              </a>
            `;
            dayScheduleContent.appendChild(transitBox);
          }
        });
      }
    } catch (error) {
      console.error(error);
    }
  }

});