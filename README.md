# 축산길잡이 (Livestock Farm Guide)

공공데이터포털 축산 농가 위치 데이터를 활용한 축산 농가 검색 및 카카오맵 내비게이션 안내 모바일 웹앱입니다.

## 주요 기능
- **사업장명 검색**: 실시간 부분 일치 필터링
- **음성 검색**: Web Speech API 기반 음성 인식 (한국어 ko-KR)
- **원터치 내비게이션 & 음성 안내**: 터치 시 카카오맵 길안내 자동 실행 및 반경 1km 농가 현황 TTS 음성 안내
- **상세 정보 바텀시트**: 농가 세부 정보 확인 및 반경 1km 내 인접 농가 목록과 거리 표시
- **데이터 관리**: CSV 파일 전체 업로드 교체 및 개별 농가 등록/수정/삭제 (localStorage 영속화)

## 기술 스택
- HTML5 / CSS3 / JavaScript (Vanilla)
- 카카오맵 링크 스킴 연동
- Web Speech API (SpeechRecognition / SpeechSynthesis)

## 실행 방법
정적 웹 서버(예: Live Server, http-server 등)를 통해 실행하거나 `index.html`을 브라우저에서 직접 열 수 있습니다.
GitHub Pages를 활성화하면 웹 호스팅으로 바로 서비스할 수 있습니다.
