/* ═══════════════════════════════════════════
   축산길잡이 — 메인 애플리케이션 로직
   ═══════════════════════════════════════════ */

// ─── 초기 시드 데이터 ───
// data.js(전체 552개 농가)가 로드되어 있으면 기본 데이터로 사용
const DEFAULT_FARMS = (typeof SEED_FARMS_DATA !== 'undefined' && Array.isArray(SEED_FARMS_DATA) && SEED_FARMS_DATA.length > 0)
  ? SEED_FARMS_DATA
  : [
  {
    사업장명: '새말농장',
    축산인허가번호: '4060000-033-2004-0003',
    소재지도로: '경기도 파주시 탄현면 장릉로49번길 8',
    소재지지번주소: '경기도 파주시 탄현면 갈현리 814-8',
    위도: 37.7699610847,
    경도: 126.7151214339,
    면적: 1536.5,
    주사육업종: '종계/산란계',
    사육두수: 27000,
    허가일자: '2004-03-25',
    관리기관명: '경기도 파주시청',
    관리부서전화번호: '031-940-4914',
    데이터기준일자: '2026-05-20'
  }
];

const STORAGE_KEY = 'chuksan_farms_v2';
const CSV_COLUMNS = [
  '사업장명', '축산인허가번호', '소재지도로', '소재지지번주소',
  '위도', '경도', '면적', '주사육업종', '사육두수',
  '허가일자', '관리기관명', '관리부서전화번호', '데이터기준일자'
];

// ─── 상태 ───
let farms = [];
let currentTab = 'search';
let toastTimer = null;
let recognition = null;
let isListening = false;

// ═══ 초기화 ═══
document.addEventListener('DOMContentLoaded', () => {
  loadData();
  initSearch();
  initVoice();
  initCSVUpload();
  initForm();
  renderSearchList();
  renderManageList();
});

// ─── 데이터 관리 ═══
function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      farms = JSON.parse(stored);
      // 기존에 4개짜리 옛날 데이터가 캐싱되어 있다면 전체 552개 데이터로 자동 교체
      if (!Array.isArray(farms) || farms.length < 50) {
        farms = [...DEFAULT_FARMS];
        saveData();
      }
    } catch {
      farms = [...DEFAULT_FARMS];
      saveData();
    }
  } else {
    farms = [...DEFAULT_FARMS];
    saveData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(farms));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function ensureIds() {
  let changed = false;
  farms.forEach(f => {
    if (!f._id) {
      f._id = generateId();
      changed = true;
    }
  });
  if (changed) saveData();
}

// ═══ 탭 전환 ═══
function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.querySelectorAll('.tab-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  if (tab === 'register') {
    renderManageList();
  }
}
// 전역에서 접근 가능하도록
window.switchTab = switchTab;

// ═══ 검색 ═══
function initSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'block' : 'none';
    renderSearchList();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    input.focus();
    renderSearchList();
  });
}

function getFilteredFarms() {
  const query = document.getElementById('search-input').value.trim().toLowerCase();
  const validFarms = farms.filter(f => f.위도 && f.경도 && !isNaN(parseFloat(f.위도)) && !isNaN(parseFloat(f.경도)));

  if (!query) return validFarms;
  return validFarms.filter(f => f.사업장명 && f.사업장명.toLowerCase().includes(query));
}

function renderSearchList() {
  ensureIds();
  const list = document.getElementById('farm-list');
  const emptySearch = document.getElementById('empty-search');
  const noData = document.getElementById('no-data');
  const status = document.getElementById('search-status');
  const query = document.getElementById('search-input').value.trim();

  const validFarms = farms.filter(f => f.위도 && f.경도 && !isNaN(parseFloat(f.위도)) && !isNaN(parseFloat(f.경도)));

  if (validFarms.length === 0 && !query) {
    list.innerHTML = '';
    emptySearch.style.display = 'none';
    noData.style.display = 'flex';
    status.textContent = '';
    return;
  }

  noData.style.display = 'none';
  const filtered = getFilteredFarms();

  if (filtered.length === 0) {
    list.innerHTML = '';
    emptySearch.style.display = 'flex';
    status.textContent = '';
    return;
  }

  emptySearch.style.display = 'none';
  status.textContent = query
    ? `"${query}" 검색 결과 ${filtered.length}건`
    : `전체 ${filtered.length}건`;

  list.innerHTML = filtered.map(farm => {
    const breed = farm.주사육업종 || '기타';
    const tag = breed.charAt(0);
    const addr = farm.소재지도로 || farm.소재지지번주소 || '주소 없음';
    const count = farm.사육두수 ? Number(farm.사육두수).toLocaleString() : '-';
    const unit = getUnit(breed);

    return `
      <li class="farm-item">
        <div class="farm-item-main" onclick="onFarmClick('${farm._id}')">
          <div class="farm-item-top">
            <span class="breed-tag">${escapeHtml(tag)}</span>
            <span class="farm-name">${escapeHtml(farm.사업장명)}</span>
          </div>
          <span class="farm-address">${escapeHtml(addr)}</span>
          <span class="farm-meta">${escapeHtml(breed)} · ${count}${unit}</span>
        </div>
        <div class="farm-item-info" onclick="event.stopPropagation(); openBottomSheet('${farm._id}')" title="상세 정보">
          ⓘ
        </div>
      </li>`;
  }).join('');
}

// ═══ 농장 클릭 → TTS + 내비게이션 ═══
function onFarmClick(id) {
  const farm = farms.find(f => f._id === id);
  if (!farm) return;

  const msg = buildAnnouncementText(farm);
  showToast(msg, 6000);
  speakText(msg);
  openKakaoNavi(farm);
}
window.onFarmClick = onFarmClick;

function buildAnnouncementText(farm) {
  const name = farm.사업장명;
  const breed = farm.주사육업종 || '기타';
  const count = farm.사육두수 ? Number(farm.사육두수).toLocaleString() : '0';
  const unit = getUnit(breed);

  const nearby = findNearbyFarms(farm, 1);
  let nearbyText;

  if (nearby.length === 0) {
    nearbyText = '인근 1km 이내에 등록된 다른 농가는 없습니다.';
  } else {
    const largest = nearby.reduce((max, f) =>
      (Number(f.farm.사육두수) || 0) > (Number(max.farm.사육두수) || 0) ? f : max, nearby[0]);
    const lName = largest.farm.사업장명;
    const lBreed = largest.farm.주사육업종 || '기타';
    const lCount = largest.farm.사육두수 ? Number(largest.farm.사육두수).toLocaleString() : '0';
    const lUnit = getUnit(lBreed);

    nearbyText = `인근 1km 이내에는 ${nearby.length}개 농장이 있으며, 그중 가장 큰 농장은 ${lName} 농장이며 ${lBreed}을 ${lCount}${lUnit} 사육 중에 있습니다.`;
  }

  return `요청하신 ${name} 농장으로 안내해 드리겠습니다. ${name} 농장은 축종은 ${breed}이며 ${count}${unit}를 사육 중에 있습니다. ${nearbyText}`;
}

function getUnit(breed) {
  if (!breed) return '마리';
  const lower = breed.toLowerCase();
  if (lower.includes('소') || lower.includes('한우') || lower.includes('젖소') || lower.includes('육우')) return '두';
  if (lower.includes('돼지') || lower.includes('양돈')) return '두';
  if (lower.includes('사슴')) return '두';
  if (lower.includes('염소') || lower.includes('흑염소')) return '두';
  if (lower.includes('타조')) return '수';
  return '마리';
}

// ═══ Haversine 공식 ═══
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearbyFarms(farm, radiusKm) {
  const lat = parseFloat(farm.위도);
  const lng = parseFloat(farm.경도);
  if (isNaN(lat) || isNaN(lng)) return [];

  return farms
    .filter(f => f._id !== farm._id && f.위도 && f.경도 && !isNaN(parseFloat(f.위도)) && !isNaN(parseFloat(f.경도)))
    .map(f => ({
      farm: f,
      distance: haversineKm(lat, lng, parseFloat(f.위도), parseFloat(f.경도))
    }))
    .filter(r => r.distance <= radiusKm)
    .sort((a, b) => a.distance - b.distance);
}

// ═══ 카카오맵 내비 ═══
function openKakaoNavi(farm) {
  const name = encodeURIComponent(farm.사업장명);
  const lat = farm.위도;
  const lng = farm.경도;
  const url = `https://map.kakao.com/link/to/${name},${lat},${lng}`;
  window.open(url, '_blank');
}

// ═══ 음성 검색 (Web Speech API) ═══
function initVoice() {
  const btnMic = document.getElementById('btn-mic');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    btnMic.style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('result', (e) => {
    const transcript = e.results[0][0].transcript;
    const input = document.getElementById('search-input');
    input.value = transcript;
    document.getElementById('search-clear').style.display = 'block';
    renderSearchList();
  });

  recognition.addEventListener('end', () => {
    isListening = false;
    btnMic.classList.remove('listening');
  });

  recognition.addEventListener('error', (e) => {
    isListening = false;
    btnMic.classList.remove('listening');
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      showToast('음성 인식 오류: ' + e.error, 3000);
    }
  });

  btnMic.addEventListener('click', () => {
    if (isListening) {
      recognition.stop();
      return;
    }
    isListening = true;
    btnMic.classList.add('listening');
    try {
      recognition.start();
    } catch {
      isListening = false;
      btnMic.classList.remove('listening');
    }
  });
}

// ═══ TTS (Web Speech Synthesis) ═══
function speakText(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 1;
  window.speechSynthesis.speak(utterance);
}

// ═══ 바텀시트 ═══
function openBottomSheet(id) {
  const farm = farms.find(f => f._id === id);
  if (!farm) return;

  const breed = farm.주사육업종 || '기타';
  const tag = breed.charAt(0);
  const count = farm.사육두수 ? Number(farm.사육두수).toLocaleString() : '-';
  const unit = getUnit(breed);
  const addr = farm.소재지도로 || farm.소재지지번주소 || '주소 없음';
  const nearby = findNearbyFarms(farm, 1);
  const announcementText = buildAnnouncementText(farm);

  let nearbyHtml;
  if (nearby.length === 0) {
    nearbyHtml = '<p class="bs-nearby-empty">인근 1km 이내에 등록된 다른 농가는 없습니다.</p>';
  } else {
    nearbyHtml = '<ul class="bs-nearby-list">' + nearby.map(n => {
      const nBreed = n.farm.주사육업종 || '기타';
      const nCount = n.farm.사육두수 ? Number(n.farm.사육두수).toLocaleString() : '-';
      const nUnit = getUnit(nBreed);
      return `
        <li class="bs-nearby-item">
          <span class="breed-tag">${escapeHtml(nBreed.charAt(0))}</span>
          <span class="bs-nearby-name">${escapeHtml(n.farm.사업장명)}</span>
          <span class="bs-nearby-breed">${escapeHtml(nBreed)} ${nCount}${nUnit}</span>
          <span class="bs-nearby-dist">${n.distance.toFixed(2)}km</span>
        </li>`;
    }).join('') + '</ul>';
  }

  const content = document.getElementById('bottomsheet-content');
  content.innerHTML = `
    <div class="bs-farm-name">
      <span class="breed-tag">${escapeHtml(tag)}</span>
      ${escapeHtml(farm.사업장명)}
    </div>
    <div class="bs-info-grid">
      <span class="bs-info-label">주사육업종</span>
      <span class="bs-info-value">${escapeHtml(breed)}</span>
      <span class="bs-info-label">사육두수</span>
      <span class="bs-info-value tabular-nums">${count}${unit}</span>
      <span class="bs-info-label">소재지</span>
      <span class="bs-info-value">${escapeHtml(addr)}</span>
      ${farm.면적 ? `<span class="bs-info-label">면적</span><span class="bs-info-value tabular-nums">${Number(farm.면적).toLocaleString()}㎡</span>` : ''}
      ${farm.허가일자 ? `<span class="bs-info-label">허가일자</span><span class="bs-info-value">${escapeHtml(farm.허가일자)}</span>` : ''}
      ${farm.관리기관명 ? `<span class="bs-info-label">관리기관</span><span class="bs-info-value">${escapeHtml(farm.관리기관명)}</span>` : ''}
      ${farm.관리부서전화번호 ? `<span class="bs-info-label">연락처</span><span class="bs-info-value"><a href="tel:${farm.관리부서전화번호}" style="color:var(--green)">${escapeHtml(farm.관리부서전화번호)}</a></span>` : ''}
      ${farm.축산인허가번호 ? `<span class="bs-info-label">인허가번호</span><span class="bs-info-value">${escapeHtml(farm.축산인허가번호)}</span>` : ''}
      ${farm.데이터기준일자 ? `<span class="bs-info-label">데이터기준일</span><span class="bs-info-value">${escapeHtml(farm.데이터기준일자)}</span>` : ''}
    </div>

    <div class="bs-announce">${escapeHtml(announcementText)}</div>

    <div class="bs-actions">
      <button class="bs-btn" onclick="speakText(document.querySelector('.bs-announce').textContent)">
        🔊 음성으로 듣기
      </button>
      <button class="bs-btn bs-btn-nav" onclick="openKakaoNavi(farms.find(f=>f._id==='${farm._id}'))">
        🗺️ 카카오맵 길안내
      </button>
    </div>

    <h3 class="bs-nearby-title">반경 1km 이내 농가 (${nearby.length}건)</h3>
    ${nearbyHtml}
  `;

  document.getElementById('bottomsheet-overlay').classList.add('open');
  document.getElementById('bottomsheet').classList.add('open');
  document.body.style.overflow = 'hidden';
}
window.openBottomSheet = openBottomSheet;

function closeBottomSheet() {
  document.getElementById('bottomsheet-overlay').classList.remove('open');
  document.getElementById('bottomsheet').classList.remove('open');
  document.body.style.overflow = '';
}
window.closeBottomSheet = closeBottomSheet;

// ═══ 토스트 ═══
function showToast(msg, duration = 4000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// ═══ 확인 대화상자 ═══
function showConfirm(msg) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('confirm-overlay');
    document.getElementById('confirm-msg').textContent = msg;
    overlay.style.display = 'flex';

    const onOk = () => { cleanup(); resolve(true); };
    const onCancel = () => { cleanup(); resolve(false); };
    const cleanup = () => {
      overlay.style.display = 'none';
      document.getElementById('confirm-ok').removeEventListener('click', onOk);
      document.getElementById('confirm-cancel').removeEventListener('click', onCancel);
    };

    document.getElementById('confirm-ok').addEventListener('click', onOk);
    document.getElementById('confirm-cancel').addEventListener('click', onCancel);
  });
}

// ═══ CSV 업로드 ═══
function initCSVUpload() {
  const fileInput = document.getElementById('csv-file-input');
  const uploadArea = document.getElementById('csv-upload-area');

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleCSVFile(file);
    fileInput.value = '';
  });

  // 드래그 앤 드롭
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleCSVFile(file);
  });
}

async function handleCSVFile(file) {
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    showToast('CSV 파일만 업로드할 수 있습니다.', 3000);
    return;
  }

  let text;
  try {
    text = await file.text();
  } catch {
    showToast('파일을 읽을 수 없습니다.', 3000);
    return;
  }

  const parsed = parseCSV(text);
  if (!parsed || parsed.length === 0) {
    showToast('CSV 파일에서 유효한 데이터를 찾을 수 없습니다.', 3000);
    return;
  }

  const confirmed = await showConfirm(
    `기존 데이터 ${farms.length}건을 삭제하고 새 데이터 ${parsed.length}건으로 교체하시겠습니까?`
  );

  if (!confirmed) return;

  farms = parsed.map(f => ({ ...f, _id: generateId() }));
  saveData();
  renderSearchList();
  renderManageList();
  showToast(`${parsed.length}건의 농가 데이터가 등록되었습니다.`, 3000);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;

  // 헤더 파싱 및 유연한 컬럼 매핑 지원
  const headers = parseCSVLine(lines[0]);
  const colMap = {};
  
  const COLUMN_ALIASES = {
    '사업장명': ['사업장명', '농장명', '사업장', '농가명'],
    '축산인허가번호': ['축산인허가번호', '인허가번호'],
    '소재지도로': ['소재지도로', '소재지도로명주소', '도로명주소', '소재지 도로명주소'],
    '소재지지번주소': ['소재지지번주소', '지번주소', '소재지 지번주소'],
    '위도': ['위도', 'lat', 'latitude'],
    '경도': ['경도', 'lng', 'lon', 'longitude'],
    '면적': ['면적'],
    '주사육업종': ['주사육업종', '축종', '사육업종', '업종'],
    '사육두수': ['사육두수', '두수', '마릿수'],
    '허가일자': ['허가일자'],
    '관리기관명': ['관리기관명', '관리기관'],
    '관리부서전화번호': ['관리부서전화번호', '전화번호', '연락처'],
    '데이터기준일자': ['데이터기준일자', '기준일자']
  };

  CSV_COLUMNS.forEach(col => {
    const aliases = COLUMN_ALIASES[col] || [col];
    for (const alias of aliases) {
      const idx = headers.findIndex(h => h.trim().replace(/\s+/g, '') === alias.replace(/\s+/g, ''));
      if (idx !== -1) {
        colMap[col] = idx;
        break;
      }
    }
  });

  // 사업장명, 위도, 경도는 필수
  if (!('사업장명' in colMap)) {
    showToast('CSV 헤더에 "사업장명" 컬럼이 없습니다.', 3000);
    return null;
  }

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (!values || values.length === 0) continue;

    const row = {};
    CSV_COLUMNS.forEach(col => {
      if (col in colMap && colMap[col] < values.length) {
        row[col] = values[colMap[col]].trim();
      } else {
        row[col] = '';
      }
    });

    // 사업장명 필수
    if (!row.사업장명) continue;

    // 숫자 변환
    if (row.위도) row.위도 = parseFloat(row.위도) || '';
    if (row.경도) row.경도 = parseFloat(row.경도) || '';
    if (row.면적) row.면적 = parseFloat(row.면적) || '';
    if (row.사육두수) row.사육두수 = parseInt(row.사육두수, 10) || '';

    results.push(row);
  }

  return results.length > 0 ? results : null;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result;
}

// ═══ 개별 등록/수정 폼 ═══
function initForm() {
  const form = document.getElementById('farm-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveFarmForm();
  });
}

function saveFarmForm() {
  const editId = document.getElementById('form-edit-id').value;
  const data = {
    사업장명: document.getElementById('f-name').value.trim(),
    위도: parseFloat(document.getElementById('f-lat').value) || '',
    경도: parseFloat(document.getElementById('f-lng').value) || '',
    축산인허가번호: document.getElementById('f-license').value.trim(),
    소재지도로: document.getElementById('f-road-addr').value.trim(),
    소재지지번주소: document.getElementById('f-jibun-addr').value.trim(),
    면적: parseFloat(document.getElementById('f-area').value) || '',
    주사육업종: document.getElementById('f-type').value.trim(),
    사육두수: parseInt(document.getElementById('f-count').value, 10) || '',
    허가일자: document.getElementById('f-permit-date').value,
    관리기관명: document.getElementById('f-agency').value.trim(),
    관리부서전화번호: document.getElementById('f-phone').value.trim(),
    데이터기준일자: document.getElementById('f-data-date').value
  };

  if (!data.사업장명) {
    showToast('사업장명은 필수입니다.', 2000);
    return;
  }
  if (!data.위도 || !data.경도) {
    showToast('위도와 경도는 필수입니다.', 2000);
    return;
  }

  if (editId) {
    const idx = farms.findIndex(f => f._id === editId);
    if (idx !== -1) {
      farms[idx] = { ...data, _id: editId };
      showToast(`${data.사업장명} 정보가 수정되었습니다.`, 2000);
    }
  } else {
    data._id = generateId();
    farms.push(data);
    showToast(`${data.사업장명}이(가) 등록되었습니다.`, 2000);
  }

  saveData();
  resetForm();
  renderSearchList();
  renderManageList();
}

function resetForm() {
  document.getElementById('farm-form').reset();
  document.getElementById('form-edit-id').value = '';
  document.getElementById('form-title').textContent = '개별 농가 등록';
  document.getElementById('form-submit-btn').textContent = '등록';
  document.getElementById('form-cancel-btn').style.display = 'none';
}
window.resetForm = resetForm;

function editFarm(id) {
  const farm = farms.find(f => f._id === id);
  if (!farm) return;

  document.getElementById('form-edit-id').value = id;
  document.getElementById('f-name').value = farm.사업장명 || '';
  document.getElementById('f-lat').value = farm.위도 || '';
  document.getElementById('f-lng').value = farm.경도 || '';
  document.getElementById('f-license').value = farm.축산인허가번호 || '';
  document.getElementById('f-road-addr').value = farm.소재지도로 || '';
  document.getElementById('f-jibun-addr').value = farm.소재지지번주소 || '';
  document.getElementById('f-area').value = farm.면적 || '';
  document.getElementById('f-type').value = farm.주사육업종 || '';
  document.getElementById('f-count').value = farm.사육두수 || '';
  document.getElementById('f-permit-date').value = farm.허가일자 || '';
  document.getElementById('f-agency').value = farm.관리기관명 || '';
  document.getElementById('f-phone').value = farm.관리부서전화번호 || '';
  document.getElementById('f-data-date').value = farm.데이터기준일자 || '';

  document.getElementById('form-title').textContent = '농가 정보 수정';
  document.getElementById('form-submit-btn').textContent = '수정 저장';
  document.getElementById('form-cancel-btn').style.display = 'block';

  // 폼으로 스크롤
  document.getElementById('form-title').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.editFarm = editFarm;

async function deleteFarm(id) {
  const farm = farms.find(f => f._id === id);
  if (!farm) return;

  const confirmed = await showConfirm(`"${farm.사업장명}" 농가를 삭제하시겠습니까?`);
  if (!confirmed) return;

  farms = farms.filter(f => f._id !== id);
  saveData();

  // 수정 중이던 농가면 폼 초기화
  if (document.getElementById('form-edit-id').value === id) {
    resetForm();
  }

  renderSearchList();
  renderManageList();
  showToast(`${farm.사업장명}이(가) 삭제되었습니다.`, 2000);
}
window.deleteFarm = deleteFarm;

// ═══ 등록 농가 관리 목록 ═══
function renderManageList() {
  ensureIds();
  const list = document.getElementById('manage-list');
  const empty = document.getElementById('manage-empty');
  const countBadge = document.getElementById('manage-count');

  countBadge.textContent = farms.length;

  if (farms.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }

  empty.style.display = 'none';
  list.innerHTML = farms.map(farm => {
    const breed = farm.주사육업종 || '기타';
    const count = farm.사육두수 ? Number(farm.사육두수).toLocaleString() : '-';
    const unit = getUnit(breed);
    const hasCoords = farm.위도 && farm.경도;

    return `
      <li class="manage-item">
        <span class="breed-tag">${escapeHtml(breed.charAt(0))}</span>
        <div class="manage-item-info">
          <div class="manage-item-name">${escapeHtml(farm.사업장명)}${hasCoords ? '' : ' <span style="color:var(--red);font-size:0.7rem;">⚠ 좌표없음</span>'}</div>
          <div class="manage-item-sub">${escapeHtml(breed)} · ${count}${unit}</div>
        </div>
        <div class="manage-item-actions">
          <button class="manage-btn" onclick="editFarm('${farm._id}')" title="수정">✏️</button>
          <button class="manage-btn delete" onclick="deleteFarm('${farm._id}')" title="삭제">🗑️</button>
        </div>
      </li>`;
  }).join('');
}

// ═══ 유틸 ═══
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
