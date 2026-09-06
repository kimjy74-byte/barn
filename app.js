/* ═══════════════════════════════════════════
   축산길잡이 — 메인 애플리케이션 로직
   (카카오 지도 & 축종별 색상 점 & 카카오내비 연동)
   ═══════════════════════════════════════════ */

// ─── 초기 시드 데이터 ───
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
const KAKAO_KEY_STORAGE = 'chuksan_kakao_js_key';

const CSV_COLUMNS = [
  '사업장명', '축산인허가번호', '소재지도로', '소재지지번주소',
  '위도', '경도', '면적', '주사육업종', '사육두수',
  '허가일자', '관리기관명', '관리부서전화번호', '데이터기준일자'
];

// ─── 축종별 색상 매핑 ───
const BREED_COLORS = {
  한우: '#E65100',       // 짙은 주황
  젖소: '#0288D1',       // 파랑
  육계: '#F57F17',       // 노랑
  돼지: '#D81B60',       // 핑크/로즈
  육우: '#00897B',       // 청록
  '종계/산란계': '#FB8C00', // 오렌지
  기타: '#7B1FA2'        // 퍼플
};

// ─── 상태 ───
let farms = [];
let currentTab = 'map';  // 기본 첫 화면: 카카오 지도
let toastTimer = null;
let recognition = null;
let isListening = false;
let userCoords = null;

// 카카오 지도 관련 상태
let kakaoMap = null;
let kakaoOverlays = [];
let currentBreedFilter = 'ALL';
let currentSearchQuery = '';
let selectedFarmId = null;
let myLocationMarker = null;

// ═══ 초기화 ═══
document.addEventListener('DOMContentLoaded', () => {
  initInAppBrowserNotice();
  loadData();
  initGeolocation();
  initKakaoSDK();
  initMapSearch();
  initListSearch();
  initVoice();
  initCSVUpload();
  initForm();
  updateBreedChipCounts();
  renderSearchList();
  renderManageList();
});

// ═══ 카카오 SDK & 지도 로드 ═══
function getStoredKakaoKey() {
  return localStorage.getItem(KAKAO_KEY_STORAGE) || '';
}

function initKakaoSDK() {
  const userKey = getStoredKakaoKey();
  
  if (!userKey) {
    // 키가 없으면 키 안내 오버레이 표시
    const keyPrompt = document.getElementById('map-key-prompt');
    if (keyPrompt) keyPrompt.style.display = 'flex';
    return;
  }

  // autoload=false + kakao.maps.load() 방식 동적 로드
  loadKakaoMapSdkFallback(userKey);
}

function loadKakaoMapSdkFallback(appKey) {
  // 기존 스크립트가 있다면 제거 후 다시 로드
  const oldScript = document.getElementById('kakao-maps-sdk');
  if (oldScript) oldScript.remove();

  const script = document.createElement('script');
  script.id = 'kakao-maps-sdk';
  script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(appKey)}&libraries=services,clusterer&autoload=false`;
  
  script.onload = () => {
    if (window.kakao && window.kakao.maps) {
      kakao.maps.load(() => {
        console.log('[축산길잡이] 카카오 Maps SDK 동적 로드 완료 — 지도 초기화');
        const keyPrompt = document.getElementById('map-key-prompt');
        if (keyPrompt) keyPrompt.style.display = 'none';
        initMap();
      });
      initKakaoNaviSDK(appKey);
    }
  };

  script.onerror = () => {
    let errorMsg = '카카오 지도 SDK 로드 실패: ';
    if (window.location.protocol === 'file:') {
      errorMsg += '파일을 직접 열면(file://) 카카오 지도가 차단됩니다. Live Server 등 로컬 서버(http://localhost)로 열어주세요.';
    } else {
      errorMsg += `카카오 콘솔 [플랫폼 > Web]에 현재 접속 주소(${window.location.origin})가 등록되어 있는지 확인해 주세요.`;
    }
    showToast(errorMsg, 6000);
    const keyPrompt = document.getElementById('map-key-prompt');
    if (keyPrompt) {
      keyPrompt.style.display = 'flex';
    }
  };

  document.head.appendChild(script);
}

function initKakaoNaviSDK(appKey) {
  if (window.Kakao) {
    try {
      if (!Kakao.isInitialized()) {
        Kakao.init(appKey);
      }
    } catch (err) {
      console.warn('Kakao Navi SDK 초기화 경고:', err);
    }
  }
}

// ═══ 카카오 API 키 모달 제어 ═══
function openKeyModal() {
  const currentKey = getStoredKakaoKey();
  const input = document.getElementById('kakao-key-input');
  if (input) input.value = currentKey;
  const modal = document.getElementById('key-modal-overlay');
  if (modal) modal.style.display = 'flex';
}
window.openKeyModal = openKeyModal;

function closeKeyModal(event) {
  if (event && event.target && event.target.id !== 'key-modal-overlay') return;
  const modal = document.getElementById('key-modal-overlay');
  if (modal) modal.style.display = 'none';
}
window.closeKeyModal = closeKeyModal;

function saveKakaoKey() {
  const input = document.getElementById('kakao-key-input');
  const key = input ? input.value.trim() : '';

  if (!key) {
    showToast('카카오 JavaScript 키를 입력해 주세요.', 2500);
    return;
  }

  localStorage.setItem(KAKAO_KEY_STORAGE, key);
  showToast('카카오 API 키가 저장되었습니다. 페이지를 새로고침합니다.', 1500);
  closeKeyModal();

  // 동기 로딩을 위해 페이지 새로고침 (head의 인라인 스크립트가 키를 읽어 SDK를 로드)
  setTimeout(() => location.reload(), 800);
}
window.saveKakaoKey = saveKakaoKey;

// ═══ 카카오 지도 초기화 ═══
function initMap() {
  const container = document.getElementById('kakao-map');
  if (!container || !window.kakao || !kakao.maps) {
    console.error('[축산길잡이] initMap 중단 — container:', !!container, 'kakao:', !!window.kakao, 'maps:', !!(window.kakao && kakao.maps));
    return;
  }

  console.log('[축산길잡이] initMap() 시작 — 컨테이너:', container.offsetWidth, 'x', container.offsetHeight);

  // 파주시 중심 기본 좌표
  const defaultCenter = new kakao.maps.LatLng(37.84, 126.82);
  const options = {
    center: defaultCenter,
    level: 9 // 파주시 전체가 잘 보이는 축척
  };

  kakaoMap = new kakao.maps.Map(container, options);
  console.log('[축산길잡이] ✅ 카카오 지도 객체 생성 완료');

  // 컨테이너 크기 반영을 위한 단계적 리레이아웃
  const relayoutMap = () => {
    if (kakaoMap) {
      kakaoMap.relayout();
      kakaoMap.setCenter(defaultCenter);
      console.log('[축산길잡이] relayout 실행 — 컨테이너:', container.offsetWidth, 'x', container.offsetHeight);
    }
  };
  
  // 다단계 relayout으로 CSS 렌더링 안정화 보장
  setTimeout(relayoutMap, 100);
  setTimeout(relayoutMap, 500);
  setTimeout(relayoutMap, 1500);

  // 일반 지도와 스카이뷰 컨트롤 추가 (선택사항)
  const mapTypeControl = new kakao.maps.MapTypeControl();
  kakaoMap.addControl(mapTypeControl, kakao.maps.ControlPosition.TOPRIGHT);

  // 지도 빈 곳 클릭 시 선택 해제
  kakao.maps.event.addListener(kakaoMap, 'click', () => {
    clearMarkerSelection();
  });

  // ★ 줌 변경 시 마커 가시성 업데이트
  kakao.maps.event.addListener(kakaoMap, 'zoom_changed', () => {
    updateOverlayVisibility();
  });

  // ★ 지도 이동(드래그) 완료 시에도 가시성 업데이트 (화면 밖 마커 숨김)
  kakao.maps.event.addListener(kakaoMap, 'dragend', () => {
    updateOverlayVisibility();
  });

  // 농가 커스텀 오버레이 마커 렌더링
  renderMapMarkers();
}

// ─── 축종 분류 및 색상 함수 ───
function getBreedCategory(breed) {
  if (!breed) return '기타';
  const b = breed.trim();
  if (b.includes('한우')) return '한우';
  if (b.includes('젖소')) return '젖소';
  if (b.includes('육우')) return '육우';
  if (b.includes('육계') || b.includes('닭')) return '육계';
  if (b.includes('종계') || b.includes('산란계')) return '종계/산란계';
  if (b.includes('돼지') || b.includes('양돈')) return '돼지';
  return '기타';
}

function getBreedColor(breed) {
  const category = getBreedCategory(breed);
  return BREED_COLORS[category] || BREED_COLORS['기타'];
}

// ─── 줌 레벨별 표시 전략 ───
// 카카오맵 level: 숫자가 클수록 축소, 작을수록 확대
// level 1~4: 매우 확대 → 화면 내 전체 표시 (이름 O)
// level 5~6: 중간 확대 → 화면 내 상위 50개 (이름 O)
// level 7~8: 축소      → 화면 내 상위 25개 (이름 숨김, 점만)
// level 9+:  매우 축소  → 화면 내 상위 15개 (이름 숨김, 점만)
function getZoomConfig(level) {
  if (level <= 4) return { maxShow: Infinity, showName: true };
  if (level <= 6) return { maxShow: 50, showName: true };
  if (level <= 8) return { maxShow: 25, showName: false };
  return { maxShow: 15, showName: false };
}

// ─── 지도 커스텀 오버레이 마커 렌더링 ───
function renderMapMarkers() {
  if (!kakaoMap || !window.kakao || !kakao.maps) return;

  // 기존 오버레이 모두 제거
  kakaoOverlays.forEach(item => {
    if (item.overlay) item.overlay.setMap(null);
  });
  kakaoOverlays = [];

  const validFarms = getFilteredFarmsForMap();
  const bounds = new kakao.maps.LatLngBounds();
  let hasValidCoords = false;

  validFarms.forEach(farm => {
    const lat = parseFloat(farm.위도);
    const lng = parseFloat(farm.경도);
    if (isNaN(lat) || isNaN(lng)) return;

    const latLng = new kakao.maps.LatLng(lat, lng);
    bounds.extend(latLng);
    hasValidCoords = true;

    const breed = farm.주사육업종 || '기타';
    const color = getBreedColor(breed);
    const headCount = parseInt(farm.사육두수) || 0;

    // 커스텀 오버레이 DOM 생성: 동그라미 색상 점 + 농가명 텍스트
    const content = document.createElement('div');
    content.className = 'farm-overlay';
    content.id = `farm-overlay-${farm._id}`;
    content.title = `${farm.사업장명} (${breed}) — ${headCount.toLocaleString()}두`;

    if (selectedFarmId === farm._id) {
      content.classList.add('selected');
    }

    content.innerHTML = `
      <span class="farm-overlay-dot" style="background:${color};"></span>
      <span class="farm-overlay-name">${escapeHtml(farm.사업장명)}</span>
    `;

    // 점 클릭 시 농가 선택 및 정보 출력
    content.addEventListener('click', (e) => {
      e.stopPropagation();
      selectFarmOnMap(farm._id);
    });

    const overlay = new kakao.maps.CustomOverlay({
      position: latLng,
      content: content,
      clickable: true,
      zIndex: 10
    });

    // ★ 지도에 바로 올리지 않음 — updateOverlayVisibility()가 제어
    kakaoOverlays.push({
      id: farm._id,
      overlay: overlay,
      latLng: latLng,
      farm: farm,
      headCount: headCount,
      contentEl: content,
      visible: false
    });
  });

  // 상태 배너 업데이트
  updateMapStatusBanner(validFarms.length);

  // 검색어가 있거나 특정 필터일 때 바운드 자동 맞춤
  if ((currentSearchQuery || currentBreedFilter !== 'ALL') && hasValidCoords && validFarms.length > 0) {
    kakaoMap.setBounds(bounds);
  }

  // ★ 현재 줌 레벨에 맞춰 마커 표시
  updateOverlayVisibility();
}

// ─── 줌 레벨에 따른 마커 가시성 업데이트 ───
function updateOverlayVisibility() {
  if (!kakaoMap || kakaoOverlays.length === 0) return;

  const level = kakaoMap.getLevel();
  const config = getZoomConfig(level);
  const mapBounds = kakaoMap.getBounds();

  // 1) 현재 화면(bounds) 안에 있는 오버레이만 필터
  const inBounds = [];
  const outBounds = [];

  kakaoOverlays.forEach(item => {
    if (mapBounds.contain(item.latLng)) {
      inBounds.push(item);
    } else {
      outBounds.push(item);
    }
  });

  // 2) 화면 밖 오버레이는 모두 숨김
  outBounds.forEach(item => {
    if (item.visible) {
      item.overlay.setMap(null);
      item.visible = false;
    }
  });

  // 3) 화면 안 오버레이를 사육두수 내림차순 정렬
  inBounds.sort((a, b) => b.headCount - a.headCount);

  // 4) 상위 N개만 표시, 나머지 숨김
  inBounds.forEach((item, index) => {
    const shouldShow = index < config.maxShow || item.id === selectedFarmId;

    if (shouldShow) {
      // 이름 표시/숨김 제어
      const nameEl = item.contentEl.querySelector('.farm-overlay-name');
      if (nameEl) {
        nameEl.style.display = config.showName ? '' : 'none';
      }

      // 이름 숨길 때 점 크기 약간 키움
      const dotEl = item.contentEl.querySelector('.farm-overlay-dot');
      if (dotEl) {
        if (!config.showName) {
          dotEl.style.width = '14px';
          dotEl.style.height = '14px';
          item.contentEl.style.padding = '4px';
        } else {
          dotEl.style.width = '';
          dotEl.style.height = '';
          item.contentEl.style.padding = '';
        }
      }

      if (!item.visible) {
        item.overlay.setMap(kakaoMap);
        item.visible = true;
      }
    } else {
      if (item.visible) {
        item.overlay.setMap(null);
        item.visible = false;
      }
    }
  });
}

function clearMarkerSelection() {
  selectedFarmId = null;
  document.querySelectorAll('.farm-overlay.selected').forEach(el => el.classList.remove('selected'));
}

// ─── 지도에서 농가 선택 (클릭) ───
function selectFarmOnMap(farmId) {
  clearMarkerSelection();
  selectedFarmId = farmId;

  const farm = farms.find(f => f._id === farmId);
  if (!farm) return;

  // 줌 레벨 6으로 해당 농가 위치로 이동
  goToFarmOnMap(farm);

  // 농가 상세 정보 바텀시트 오픈 (현황 + 카카오내비)
  openBottomSheet(farmId);
}
window.selectFarmOnMap = selectFarmOnMap;

// ─── 농가 위치로 줌 이동 ───
function goToFarmOnMap(farm) {
  if (!kakaoMap || !farm.위도 || !farm.경도) return;

  const pos = new kakao.maps.LatLng(parseFloat(farm.위도), parseFloat(farm.경도));
  kakaoMap.setLevel(6);
  kakaoMap.setCenter(pos);

  // 이전 📍 표시 제거
  document.querySelectorAll('.farm-overlay-pin').forEach(pin => pin.remove());
  document.querySelectorAll('.farm-overlay.selected').forEach(el => el.classList.remove('selected'));

  // 이동 후 해당 마커를 선택 상태로 하이라이트 + 📍 표시
  selectedFarmId = farm._id;
  setTimeout(() => {
    updateOverlayVisibility();
    const el = document.getElementById(`farm-overlay-${farm._id}`);
    if (el) {
      el.classList.add('selected');
      // 이름 앞에 📍 아이콘 추가
      const nameEl = el.querySelector('.farm-overlay-name');
      if (nameEl && !el.querySelector('.farm-overlay-pin')) {
        const pin = document.createElement('span');
        pin.className = 'farm-overlay-pin';
        pin.textContent = '📍';
        nameEl.style.display = '';  // 이름이 숨겨져 있으면 보이게
        nameEl.parentElement.insertBefore(pin, nameEl);
      }
    }
  }, 200);
}
window.goToFarmOnMap = goToFarmOnMap;

// ─── 필터링 로직 (지도용) ───
function getFilteredFarmsForMap() {
  return farms.filter(f => {
    // 유효한 좌표 확인
    if (!f.위도 || !f.경도 || isNaN(parseFloat(f.위도)) || isNaN(parseFloat(f.경도))) {
      return false;
    }
    // 검색어 필터
    if (currentSearchQuery) {
      const q = currentSearchQuery.toLowerCase();
      const matchName = f.사업장명 && f.사업장명.toLowerCase().includes(q);
      const matchAddr = (f.소재지도로 && f.소재지도로.toLowerCase().includes(q)) || (f.소재지지번주소 && f.소재지지번주소.toLowerCase().includes(q));
      if (!matchName && !matchAddr) return false;
    }
    // 축종 필터
    if (currentBreedFilter !== 'ALL') {
      const cat = getBreedCategory(f.주사육업종);
      if (cat !== currentBreedFilter) return false;
    }
    return true;
  });
}

function setBreedFilter(breed) {
  currentBreedFilter = breed;

  // 칩 활성화 상태 갱신
  document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.breed === breed);
  });

  renderMapMarkers();
}
window.setBreedFilter = setBreedFilter;

function updateBreedChipCounts() {
  const counts = {
    ALL: 0,
    한우: 0,
    젖소: 0,
    육계: 0,
    돼지: 0,
    육우: 0,
    '종계/산란계': 0,
    기타: 0
  };

  farms.forEach(f => {
    if (!f.위도 || !f.경도 || isNaN(parseFloat(f.위도)) || isNaN(parseFloat(f.경도))) return;
    counts.ALL++;
    const cat = getBreedCategory(f.주사육업종);
    if (counts[cat] !== undefined) counts[cat]++;
    else counts.기타++;
  });

  const setEl = (id, count) => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  };

  setEl('chip-count-all', counts.ALL);
  setEl('chip-count-hanwoo', counts.한우);
  setEl('chip-count-dairy', counts.젖소);
  setEl('chip-count-broiler', counts.육계);
  setEl('chip-count-pig', counts.돼지);
  setEl('chip-count-beef', counts.육우);
  setEl('chip-count-layer', counts['종계/산란계']);
  setEl('chip-count-etc', counts.기타);
}

function updateMapStatusBanner(count) {
  const banner = document.getElementById('map-status-banner');
  if (!banner) return;

  if (currentSearchQuery || currentBreedFilter !== 'ALL') {
    let text = '';
    if (currentSearchQuery && currentBreedFilter !== 'ALL') {
      text = `[${currentBreedFilter}] "${currentSearchQuery}" 검색 결과 ${count}곳`;
    } else if (currentSearchQuery) {
      text = `"${currentSearchQuery}" 검색 결과 ${count}곳`;
    } else {
      text = `${currentBreedFilter} 축산 농가 ${count}곳 표시`;
    }
    banner.textContent = text;
    banner.style.display = 'block';
  } else {
    banner.style.display = 'none';
  }
}

// ─── 지도 버튼 기능들 ───
function fitAllMarkers() {
  if (!kakaoMap || !window.kakao || !kakao.maps) return;
  const validFarms = getFilteredFarmsForMap();
  if (validFarms.length === 0) {
    showToast('표시할 농가가 없습니다.', 2000);
    return;
  }

  const bounds = new kakao.maps.LatLngBounds();
  validFarms.forEach(f => {
    bounds.extend(new kakao.maps.LatLng(parseFloat(f.위도), parseFloat(f.경도)));
  });
  kakaoMap.setBounds(bounds);
}
window.fitAllMarkers = fitAllMarkers;

function moveToMyLocation() {
  if (!('geolocation' in navigator)) {
    showToast('GPS 위치 기능을 지원하지 않는 기기입니다.', 2500);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userCoords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (!kakaoMap || !window.kakao || !kakao.maps) return;

      const userLatLng = new kakao.maps.LatLng(userCoords.lat, userCoords.lng);
      kakaoMap.setCenter(userLatLng);
      kakaoMap.setLevel(5);

      // 내 위치 마커 표시
      if (myLocationMarker) {
        myLocationMarker.setMap(null);
      }

      const myMarkerContent = document.createElement('div');
      myMarkerContent.style.cssText = `
        width: 18px;
        height: 18px;
        background: #2563EB;
        border: 3px solid #FFFFFF;
        border-radius: 50%;
        box-shadow: 0 0 8px rgba(37,99,235,0.8);
      `;

      myLocationMarker = new kakao.maps.CustomOverlay({
        position: userLatLng,
        content: myMarkerContent,
        zIndex: 50
      });
      myLocationMarker.setMap(kakaoMap);

      showToast('현재 내 위치로 이동했습니다.', 2000);
    },
    (err) => {
      showToast('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해 주세요.', 3000);
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}
window.moveToMyLocation = moveToMyLocation;

function toggleLegend(forceState) {
  const legend = document.getElementById('map-legend');
  if (!legend) return;
  if (forceState !== undefined) {
    legend.classList.toggle('show', !!forceState);
  } else {
    legend.classList.toggle('show');
  }
}
window.toggleLegend = toggleLegend;

// ─── 지도 상단 검색바 제어 ───
function initMapSearch() {
  const input = document.getElementById('map-search-input');
  const clearBtn = document.getElementById('map-search-clear');
  const resultsBox = document.getElementById('map-search-results');
  if (!input || !clearBtn) return;

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearBtn.style.display = input.value ? 'block' : 'none';
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const query = input.value.trim();
      currentSearchQuery = query;
      if (query.length > 0) {
        showMapSearchResults(query);
      } else {
        hideMapSearchResults();
        renderMapMarkers();
      }
    }, 200);
  });

  // Enter키로 첫 번째 결과 선택
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && resultsBox) {
      const firstItem = resultsBox.querySelector('.map-search-result-item');
      if (firstItem) firstItem.click();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    clearBtn.style.display = 'none';
    currentSearchQuery = '';
    hideMapSearchResults();
    renderMapMarkers();
    input.focus();
  });

  // 지도 클릭 시 검색 결과 닫기
  document.getElementById('kakao-map')?.addEventListener('click', () => {
    hideMapSearchResults();
  });
}

// ─── 지도 검색 결과 드롭다운 표시 ───
function showMapSearchResults(query) {
  const resultsBox = document.getElementById('map-search-results');
  if (!resultsBox) return;

  const q = query.toLowerCase();
  const matched = farms.filter(f => {
    if (!f.위도 || !f.경도 || isNaN(parseFloat(f.위도)) || isNaN(parseFloat(f.경도))) return false;
    const matchName = f.사업장명 && f.사업장명.toLowerCase().includes(q);
    const matchAddr = (f.소재지도로 && f.소재지도로.toLowerCase().includes(q)) ||
                      (f.소재지지번주소 && f.소재지지번주소.toLowerCase().includes(q));
    const matchBreed = f.주사육업종 && f.주사육업종.toLowerCase().includes(q);
    return matchName || matchAddr || matchBreed;
  }).slice(0, 20); // 최대 20개

  if (matched.length === 0) {
    resultsBox.innerHTML = '<div class="map-search-no-result">검색 결과가 없습니다</div>';
  } else {
    resultsBox.innerHTML = matched.map(farm => {
      const breed = farm.주사육업종 || '기타';
      const color = getBreedColor(breed);
      const headCount = parseInt(farm.사육두수) || 0;
      const addr = farm.소재지도로 || farm.소재지지번주소 || '';
      // 주소에서 동/리 단위까지만 간략히
      const shortAddr = addr.split(' ').slice(0, 4).join(' ');
      return `
        <div class="map-search-result-item" data-farm-id="${farm._id}">
          <span class="map-result-dot" style="background:${color};"></span>
          <div class="map-result-info">
            <div class="map-result-name">${escapeHtml(farm.사업장명)}</div>
            <div class="map-result-meta">${escapeHtml(breed)} · ${headCount.toLocaleString()}두 · ${escapeHtml(shortAddr)}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  resultsBox.style.display = 'block';

  // 결과 항목 클릭 이벤트
  resultsBox.querySelectorAll('.map-search-result-item').forEach(item => {
    item.addEventListener('click', () => {
      const farmId = item.dataset.farmId;
      const farm = farms.find(f => f._id === farmId);
      if (farm) {
        goToFarmOnMap(farm);
        hideMapSearchResults();
        // 검색어는 유지하되 입력 포커스 해제
        document.getElementById('map-search-input')?.blur();
      }
    });
  });
}

function hideMapSearchResults() {
  const resultsBox = document.getElementById('map-search-results');
  if (resultsBox) {
    resultsBox.style.display = 'none';
    resultsBox.innerHTML = '';
  }
}

// ─── 데이터 관리 ═══
function loadData() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      farms = JSON.parse(stored);
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
  const target = document.getElementById(`tab-${tab}`);
  if (target) target.classList.add('active');

  document.querySelectorAll('.tab-item').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });

  if (tab === 'map') {
    // 지도가 가려져 있다가 나타날 때 relayout 필수
    setTimeout(() => {
      if (kakaoMap && window.kakao && kakao.maps) {
        kakaoMap.relayout();
      }
    }, 50);
  } else if (tab === 'search') {
    renderSearchList();
  } else if (tab === 'register') {
    renderManageList();
  }
}
window.switchTab = switchTab;

// ═══ 목록 탭 검색 ═══
function initListSearch() {
  const input = document.getElementById('search-input');
  const clearBtn = document.getElementById('search-clear');
  if (!input || !clearBtn) return;

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

function getFilteredFarmsForList() {
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
  if (!list || !status) return;

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
  const filtered = getFilteredFarmsForList();

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
    const color = getBreedColor(breed);
    const addr = farm.소재지도로 || farm.소재지지번주소 || '주소 없음';
    const count = farm.사육두수 ? Number(farm.사육두수).toLocaleString() : '-';
    const unit = getUnit(breed);

    return `
      <li class="farm-item">
        <div class="farm-item-main" onclick="onFarmListItemClick('${farm._id}')">
          <div class="farm-item-top">
            <span class="breed-tag" style="background:${color}20; color:${color}; border:1px solid ${color}40;">${escapeHtml(tag)}</span>
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

// 목록에서 농가 터치 시 지도 탭으로 전환 후 농가 위치로 이동 (상세 바텀시트 미표시)
function onFarmListItemClick(id) {
  closeBottomSheet();
  switchTab('map');
  setTimeout(() => {
    const farm = farms.find(f => f._id === id);
    if (farm) {
      goToFarmOnMap(farm);
    }
  }, 100);
}
window.onFarmListItemClick = onFarmListItemClick;

// ═══ 농장 안내 음성 텍스트 생성 ═══
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

  return `요청하신 ${name} 농장으로 안내해 드리겠습니다. ${name} 농장의 축종은 ${breed}이며 ${count}${unit}를 사육 중에 있습니다. ${nearbyText}`;
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

// ═══ 위치 정보 (GPS) ═══
function initGeolocation() {
  if ('geolocation' in navigator) {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
      },
      (err) => {
        console.warn('GPS 위치 정보 획득 실패:', err.message);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  }
}

// ═══ 핵심: 카카오내비 연동 (Kakao Navi) ═══
function openKakaoNavi(farm) {
  if (!farm) return;
  const name = farm.사업장명;
  const lat = parseFloat(farm.위도);
  const lng = parseFloat(farm.경도);

  if (isNaN(lat) || isNaN(lng)) {
    showToast('해당 농가의 위치 좌표가 없어 내비를 실행할 수 없습니다.', 3000);
    return;
  }

  showToast(`카카오내비로 ${name} 길안내를 실행합니다.`, 3000);

  // 1. Kakao Javascript SDK의 공식 Kakao.Navi.start 기능 우선 시도
  if (window.Kakao && typeof Kakao.isInitialized === 'function' && Kakao.isInitialized() && Kakao.Navi) {
    try {
      Kakao.Navi.start({
        name: name,
        x: lng,
        y: lat,
        coordType: 'wgs84'
      });
      return;
    } catch (e) {
      console.warn('Kakao.Navi.start 실행 예외, URL 스킴으로 대체:', e);
    }
  }

  // 2. 모바일 기기: 카카오내비 URL 스킴 (딥링크) 직접 호출
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const naviAppScheme = `kakaonavi://navigate?name=${encodeURIComponent(name)}&x=${lng}&y=${lat}&coord_type=wgs84`;
  const webNaviUrl = `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;

  if (isMobile) {
    const clickTime = Date.now();
    window.location.href = naviAppScheme;

    // 카카오내비 앱 미설치 시 1.5초 후 카카오맵 길찾기 웹 페이지로 안내
    setTimeout(() => {
      if (Date.now() - clickTime < 2000) {
        window.open(webNaviUrl, '_blank');
      }
    }, 1500);
  } else {
    // PC 브라우저 환경에서는 카카오맵 길찾기 웹 페이지 열기
    window.open(webNaviUrl, '_blank');
  }
}
window.openKakaoNavi = openKakaoNavi;

// ═══ 음성 검색 (Web Speech API) ═══
function initVoice() {
  const mapBtnMic = document.getElementById('map-btn-mic');
  const listBtnMic = document.getElementById('btn-mic');
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    if (mapBtnMic) mapBtnMic.style.display = 'none';
    if (listBtnMic) listBtnMic.style.display = 'none';
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = 'ko-KR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.addEventListener('result', (e) => {
    const transcript = e.results[0][0].transcript;
    if (currentTab === 'map') {
      const mapInput = document.getElementById('map-search-input');
      if (mapInput) {
        mapInput.value = transcript;
        document.getElementById('map-search-clear').style.display = 'block';
        currentSearchQuery = transcript.trim();
        renderMapMarkers();
      }
    } else {
      const listInput = document.getElementById('search-input');
      if (listInput) {
        listInput.value = transcript;
        document.getElementById('search-clear').style.display = 'block';
        renderSearchList();
      }
    }
  });

  const stopListeningUI = () => {
    isListening = false;
    if (mapBtnMic) mapBtnMic.classList.remove('listening');
    if (listBtnMic) listBtnMic.classList.remove('listening');
  };

  recognition.addEventListener('end', stopListeningUI);
  recognition.addEventListener('error', (e) => {
    stopListeningUI();
    if (e.error !== 'aborted' && e.error !== 'no-speech') {
      showToast('음성 인식 오류: ' + e.error, 3000);
    }
  });

  const handleMicClick = () => {
    if (isListening) {
      recognition.stop();
      return;
    }
    isListening = true;
    if (mapBtnMic) mapBtnMic.classList.add('listening');
    if (listBtnMic) listBtnMic.classList.add('listening');
    try {
      recognition.start();
    } catch {
      stopListeningUI();
    }
  };

  if (mapBtnMic) mapBtnMic.addEventListener('click', handleMicClick);
  if (listBtnMic) listBtnMic.addEventListener('click', handleMicClick);
}

// ═══ 모바일 및 카카오톡 인앱 브라우저 감지 ═══
const isKakaoTalk = /KAKAOTALK/i.test(navigator.userAgent);
const isInAppBrowser = /KAKAOTALK|NAVER|Line|Instagram|FB_IAB|FB4A|FBAN/i.test(navigator.userAgent);
const isMobileDevice = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// 카카오톡 등 인앱 브라우저에서 외부 브라우저(Chrome/Safari)로 열기
function openInExternalBrowser(targetUrl) {
  const url = targetUrl || window.location.href;
  if (/Android/i.test(navigator.userAgent)) {
    // 안드로이드: 크롬 인텐트 우선 시도 후 카카오 스킴 백업
    const schemeUrl = url.replace(/^https?:\/\//i, '');
    window.location.href = `intent://${schemeUrl}#Intent;scheme=https;package=com.android.chrome;end`;
    setTimeout(() => {
      window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
    }, 400);
  } else {
    // iOS (아이폰/아이패드)
    window.location.href = `kakaotalk://web/openExternal?url=${encodeURIComponent(url)}`;
  }
}
window.openInExternalBrowser = openInExternalBrowser;

function initInAppBrowserNotice() {
  const notice = document.getElementById('inapp-notice');
  if (isKakaoTalk || isInAppBrowser) {
    if (notice) notice.style.display = 'flex';
  }
}
window.initInAppBrowserNotice = initInAppBrowserNotice;

// ═══ TTS 엔진 (Web Speech Synthesis + 모바일 Audio Fallback 하이브리드) ═══
let currentUtterance = null;
let currentAudioPlayer = null;
let koreanVoice = null;
let isSpeakingAnnouncement = false;
let currentAnnouncementText = '';

function loadVoices() {
  if (!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return;

  // 한국어 음성 우선 매칭 (ko-KR, ko_KR, ko, 또는 Korean)
  koreanVoice = voices.find(v => v.lang === 'ko-KR' || v.lang === 'ko_KR') ||
                voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ko')) ||
                voices.find(v => v.name && (v.name.includes('Korean') || v.name.includes('한국어'))) ||
                null;
}

if ('speechSynthesis' in window) {
  loadVoices();
  if (typeof window.speechSynthesis.onvoiceschanged !== 'undefined') {
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }
}

function updateSpeechButtonUI(isSpeaking) {
  const btn = document.getElementById('btn-speak-announcement');
  if (!btn) return;
  if (isSpeaking) {
    btn.classList.add('speaking');
    btn.innerHTML = '⏹ 음성 멈추기';
    btn.setAttribute('title', '음성 안내 중지');
  } else {
    btn.classList.remove('speaking');
    btn.innerHTML = '🔊 음성으로 듣기';
    btn.setAttribute('title', '농장 상세 안내 음성 듣기');
  }
}

// 음성 전체 정지 (Web Speech API 및 모바일 Audio 둘 다 중지)
function stopSpeaking() {
  // 1. Web Speech API 중지
  if ('speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      console.warn('speechSynthesis.cancel 에러:', e);
    }
  }

  // 2. Audio Fallback 플레이어 중지
  if (currentAudioPlayer) {
    try {
      currentAudioPlayer.pause();
      currentAudioPlayer.currentTime = 0;
      currentAudioPlayer.src = '';
    } catch (e) {}
    currentAudioPlayer = null;
  }

  isSpeakingAnnouncement = false;
  currentUtterance = null;
  window._currentUtterance = null;
  updateSpeechButtonUI(false);
}
window.stopSpeaking = stopSpeaking;

function toggleAnnouncementSpeech(text) {
  const targetText = (text || currentAnnouncementText || '').trim();

  // 이미 음성이 재생 중이면 정지
  if (isSpeakingAnnouncement || (window.speechSynthesis && window.speechSynthesis.speaking)) {
    stopSpeaking();
    showToast('음성 안내를 멈췄습니다.', 2000);
    return;
  }

  speakText(targetText);
}
window.toggleAnnouncementSpeech = toggleAnnouncementSpeech;

// 텍스트를 오디오 재생에 알맞게 문장/쉼표 단위(최대 70자)로 분할
function splitTextIntoChunks(text, maxLen = 70) {
  const rawParts = text.replace(/([.?!])\s+/g, '$1|').split('|');
  const chunks = [];
  for (let part of rawParts) {
    part = part.trim();
    if (!part) continue;
    if (part.length <= maxLen) {
      chunks.push(part);
    } else {
      const subParts = part.split(/,\s*/);
      let temp = '';
      for (let sub of subParts) {
        if ((temp + ', ' + sub).length <= maxLen) {
          temp = temp ? temp + ', ' + sub : sub;
        } else {
          if (temp) chunks.push(temp);
          temp = sub;
        }
      }
      if (temp) chunks.push(temp);
    }
  }
  return chunks.length ? chunks : [text.substring(0, maxLen)];
}

// 모바일 웹뷰(카카오톡 등) 및 Web Speech 미지원 환경용 Audio Fallback 스트리밍 재생
function playAudioFallback(text) {
  stopSpeaking();

  const chunks = splitTextIntoChunks(text);
  if (!chunks.length) return;

  isSpeakingAnnouncement = true;
  updateSpeechButtonUI(true);
  showToast('🔊 모바일 오디오로 안내 음성을 재생합니다.', 2500);

  let chunkIndex = 0;

  function playNextChunk() {
    if (!isSpeakingAnnouncement || chunkIndex >= chunks.length) {
      stopSpeaking();
      return;
    }

    const currentChunk = chunks[chunkIndex];
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=ko&client=tw-ob&q=${encodeURIComponent(currentChunk)}`;

    currentAudioPlayer = new Audio(ttsUrl);

    currentAudioPlayer.onended = () => {
      chunkIndex++;
      playNextChunk();
    };

    currentAudioPlayer.onerror = (e) => {
      console.warn('Audio fallback 에러:', e);
      chunkIndex++;
      if (chunkIndex < chunks.length) {
        playNextChunk();
      } else {
        stopSpeaking();
        if (isInAppBrowser) {
          showToast('인앱 브라우저에서 오디오가 제한되었습니다. 상단 [기본 브라우저로 열기]를 눌러주세요.', 4000);
        }
      }
    };

    const playPromise = currentAudioPlayer.play();
    if (playPromise !== undefined) {
      playPromise.catch(err => {
        console.warn('Audio play catch:', err);
        stopSpeaking();
        if (isInAppBrowser) {
          showToast('인앱 브라우저 오디오 제한: 상단 [기본 브라우저로 열기]를 이용해 주세요.', 4500);
        } else {
          showToast('음성을 재생하려면 화면을 터치해 주세요.', 3000);
        }
      });
    }
  }

  playNextChunk();
}

// 메인 TTS 발화 함수: Web Speech API 우선 사용, 불가 시 Audio Fallback으로 100% 재생 보장
function speakText(text) {
  const cleanText = (text || '').trim();
  if (!cleanText) {
    showToast('안내할 텍스트 내용이 없습니다.', 2000);
    return;
  }

  const hasWebSpeech = ('speechSynthesis' in window) && (typeof SpeechSynthesisUtterance !== 'undefined');

  // 카카오톡/인앱 브라우저 환경이거나 Web Speech API가 없으면 Audio Fallback 즉시 실행!
  if (!hasWebSpeech || isInAppBrowser) {
    playAudioFallback(cleanText);
    return;
  }

  // 기존 음성 합성 취소
  try {
    window.speechSynthesis.cancel();
  } catch (e) {
    console.warn('cancel 에러:', e);
  }

  const runWebSpeech = () => {
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      if (!koreanVoice) {
        loadVoices();
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      if (koreanVoice) {
        utterance.voice = koreanVoice;
      }

      utterance.onstart = () => {
        isSpeakingAnnouncement = true;
        updateSpeechButtonUI(true);
        showToast('🔊 농장 안내 음성을 재생합니다.', 2500);
      };

      utterance.onend = () => {
        isSpeakingAnnouncement = false;
        currentUtterance = null;
        window._currentUtterance = null;
        updateSpeechButtonUI(false);
      };

      utterance.onerror = (e) => {
        if (e.error === 'interrupted' || e.error === 'canceled') {
          isSpeakingAnnouncement = false;
          currentUtterance = null;
          window._currentUtterance = null;
          updateSpeechButtonUI(false);
          return;
        }

        console.warn('Web Speech 오류 발생, Audio 폴백으로 자동 전환:', e);
        playAudioFallback(cleanText);
      };

      currentUtterance = utterance;
      window._currentUtterance = utterance;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn('Web Speech 실행 예외, Audio 폴백 전환:', err);
      playAudioFallback(cleanText);
    }
  };

  // 모바일 일반 브라우저에서는 사용자 제스처 유지를 위해 동기 즉시 실행
  if (isMobileDevice) {
    runWebSpeech();
  } else {
    // PC Chromium 계열 버그 방지용 짧은 비동기 지연
    setTimeout(runWebSpeech, 70);
  }
}
window.speakText = speakText;

// ═══ 바텀시트 ═══
function openBottomSheet(id) {
  const farm = farms.find(f => f._id === id);
  if (!farm) return;

  // 이전 재생 중이던 음성이 있다면 정지
  stopSpeaking();

  const breed = farm.주사육업종 || '기타';
  const tag = breed.charAt(0);
  const color = getBreedColor(breed);
  const count = farm.사육두수 ? Number(farm.사육두수).toLocaleString() : '-';
  const unit = getUnit(breed);
  const addr = farm.소재지도로 || farm.소재지지번주소 || '주소 없음';
  const nearby = findNearbyFarms(farm, 1);
  const announcementText = buildAnnouncementText(farm);
  currentAnnouncementText = announcementText;

  let nearbyHtml;
  if (nearby.length === 0) {
    nearbyHtml = '<p class="bs-nearby-empty">인근 1km 이내에 등록된 다른 농가는 없습니다.</p>';
  } else {
    nearbyHtml = '<ul class="bs-nearby-list">' + nearby.map(n => {
      const nBreed = n.farm.주사육업종 || '기타';
      const nCount = n.farm.사육두수 ? Number(n.farm.사육두수).toLocaleString() : '-';
      const nUnit = getUnit(nBreed);
      const nColor = getBreedColor(nBreed);
      return `
        <li class="bs-nearby-item" onclick="selectFarmOnMap('${n.farm._id}')">
          <span class="breed-tag" style="background:${nColor}20; color:${nColor}; border:1px solid ${nColor}40;">${escapeHtml(nBreed.charAt(0))}</span>
          <span class="bs-nearby-name">${escapeHtml(n.farm.사업장명)}</span>
          <span class="bs-nearby-breed">${escapeHtml(nBreed)} ${nCount}${nUnit}</span>
          <span class="bs-nearby-dist">${n.distance.toFixed(2)}km</span>
        </li>`;
    }).join('') + '</ul>';
  }

  const content = document.getElementById('bottomsheet-content');
  content.innerHTML = `
    <div class="bs-farm-name">
      <span class="breed-tag" style="background:${color}20; color:${color}; border:1px solid ${color}40;">${escapeHtml(tag)}</span>
      ${escapeHtml(farm.사업장명)}
    </div>
    <div class="bs-info-grid">
      <span class="bs-info-label">주사육업종</span>
      <span class="bs-info-value" style="font-weight:600; color:${color};">${escapeHtml(breed)}</span>
      <span class="bs-info-label">사육두수</span>
      <span class="bs-info-value tabular-nums">${count}${unit}</span>
      <span class="bs-info-label">소재지</span>
      <span class="bs-info-value">${escapeHtml(addr)}</span>
      ${farm.면적 ? `<span class="bs-info-label">면적</span><span class="bs-info-value tabular-nums">${Number(farm.면적).toLocaleString()}㎡</span>` : ''}
      ${farm.허가일자 ? `<span class="bs-info-label">허가일자</span><span class="bs-info-value">${escapeHtml(farm.허가일자)}</span>` : ''}
      ${farm.축산인허가번호 ? `<span class="bs-info-label">인허가번호</span><span class="bs-info-value">${escapeHtml(farm.축산인허가번호)}</span>` : ''}
      ${farm.데이터기준일자 ? `<span class="bs-info-label">데이터기준일</span><span class="bs-info-value">${escapeHtml(farm.데이터기준일자)}</span>` : ''}
    </div>

    <div class="bs-announce">${escapeHtml(announcementText)}</div>

    <div class="bs-actions">
      <button id="btn-speak-announcement" class="bs-btn" onclick="toggleAnnouncementSpeech()">
        🔊 음성으로 듣기
      </button>
      <button class="bs-btn bs-btn-navi" onclick="openKakaoNavi(farms.find(f=>f._id==='${farm._id}'))">
        🚗 카카오내비 길안내
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
  stopSpeaking();
  document.getElementById('bottomsheet-overlay').classList.remove('open');
  document.getElementById('bottomsheet').classList.remove('open');
  document.body.style.overflow = '';
}
window.closeBottomSheet = closeBottomSheet;

// ═══ 토스트 ═══
function showToast(msg, duration = 4000) {
  const toast = document.getElementById('toast');
  if (!toast) return;
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
  if (!fileInput || !uploadArea) return;

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleCSVFile(file);
    fileInput.value = '';
  });

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
  updateBreedChipCounts();
  renderMapMarkers();
  renderSearchList();
  renderManageList();
  showToast(`${parsed.length}건의 농가 데이터가 등록되었습니다.`, 3000);
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;

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

    if (!row.사업장명) continue;

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
  if (!form) return;
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
  updateBreedChipCounts();
  renderMapMarkers();
  renderSearchList();
  renderManageList();
}

function resetForm() {
  const form = document.getElementById('farm-form');
  if (!form) return;
  form.reset();
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

  if (document.getElementById('form-edit-id').value === id) {
    resetForm();
  }

  updateBreedChipCounts();
  renderMapMarkers();
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
  if (!list || !empty || !countBadge) return;

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
    const color = getBreedColor(breed);
    const hasCoords = farm.위도 && farm.경도;

    return `
      <li class="manage-item">
        <span class="breed-tag" style="background:${color}20; color:${color}; border:1px solid ${color}40;">${escapeHtml(breed.charAt(0))}</span>
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
