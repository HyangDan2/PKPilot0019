# Lýra — HD2Lab Multi-Track Loop Station

네 개의 트랙, 하나의 루프. **Lýra**는 설치 없이 브라우저에서 바로 연주하고, 겹쳐 녹음하고,
마스터 믹스와 트랙 스템까지 내보내는 멀티트랙 루프스테이션입니다.

Four tracks, one loop. Lýra is a loop station that runs entirely in your browser — play, overdub,
mix with per-track FX and export a master or stems. No install, no upload, no server.

- 라이브: <https://hyangdan2.github.io/PKPilot0019/>
- 100% 순수 브라우저 (Vite + React + TypeScript + Web Audio API)

## 화면 구성

- **1단 앱 바** — `HD2Lab | Lýra` 락업(모바일에서도 유지), `KO|EN`, 테마, `⋮` 메뉴. 320px에서도 `⋮`가 화면 밖으로 나가지 않습니다.
- **2단 트랜스포트 바** — 재생·정지, `BPM`(±·Tap), 박자, 마디, 메트로놈, 카운트인, **`📁` 프로젝트 드로워**, Master 미터.
  모바일에서는 재생·정지·BPM·마디·박자·`📁`를 남기고 나머지를 **더보기**로 접습니다.
  상단은 이 두 줄이 전부이며, 그 아래 스테이지가 화면 높이를 그대로 씁니다.
- **프로젝트 드로워** — 트랜스포트 우측 `📁`(PC에서는 현재 프로젝트 이름 표시)를 누르면 열립니다.
  프로젝트 이름 편집, **샘플 프로젝트 3종 원클릭 로드**, **새 프로젝트 · 저장(.lps.json) · 불러오기**, 트랙 수(4~6)를 한곳에서 다룹니다.
- **스테이지** — 1024px 이상은 채널 스트립(6트랙은 가로 스크롤), 768~1023px 태블릿은 2열 스트립, 767px 이하는 단일 링 모바일 덱.
  트랙이 모두 비어 있으면 스테이지 빈 자리에 **샘플 3종 칩**이 한 줄로 놓이고, 샘플을 불러오거나 녹음해 트랙이 차면 사라져 루프 링이 최대 크기로 넓어집니다.
- **시트** — 가상악기·트랙 FX·I/O는 도구 시트, 내보내기·도움말은 중앙 다이얼로그. 모바일에서는 모두 하단 시트이며 닫기는 `✕` 하나입니다.

## 기능

### 트랜스포트
- `AudioContext.currentTime` 기반 룩어헤드 스케줄러와 마디 경계 퀀타이즈 녹음
- BPM 40–220 (Tap Tempo), 박자 `4/4 · 3/4 · 6/8`, 마디 `1/2/4/8`
- 1마디 Count-in, 메트로놈, 마스터 dB 미터, 레이턴시 보정 `-150ms ~ +150ms`
- 오버더빙 1단계 Undo

### 4~6 트랙 채널 스트립
- SVG 원형 루프 진행 링 + 실시간 파형, 상태 뱃지(`EMPTY/ARMED/COUNT-IN/REC/PLAY/OVERDUB/STOPPED`)
- `REC / PLAY / OVERDUB / STOP`, `Undo`, `CLEAR`, `Mute/Solo`, 볼륨 페이더, 팬
- 입력 소스 표시(`Mic`/`Inst`/`File`), 오디오 파일 드래그&드롭 임포트

### 가상악기 (마이크 없이 즉시 루핑)
- 폴리포닉 신스 4종: `Electric Piano`, `Warm Pad`, `Pluck Lead`, `Sub Bass`
  (ADSR · LP 필터 · 옥타브 · 서스테인)
- PC QWERTY 건반(`A W S E D T F G Y H U J K`), 터치 건반, 외부 **Web MIDI**
- 8패드 드럼 킷 3종(`808`, `Lo-Fi`, `Acoustic`) — 숫자키 `1~8`, 터치, MIDI 채널 10
- 악기 출력은 `instrumentBus`를 거쳐 녹음 중인 트랙의 루프 레코더로 직접 라우팅

### 오디오 엔진
- `AudioWorklet` + `Float32Array` 청크 전송(`MessagePort`) — `SharedArrayBuffer` 미사용
  → `COOP/COEP` 헤더가 없는 GitHub Pages에서도 그대로 동작
- AudioWorklet 미지원 환경용 `ScriptProcessorNode` 폴백
- 트랙별 HP/LP 필터, 딜레이(Time/Feedback/Mix), 컨볼루션 리버브 센드, 마스터 리미터
- 입력 장치 선택, 샘플레이트(44.1/48 kHz), Mono/Stereo, 원음 수음 전처리 OFF 기본,
  입력 게인 + 피크 미터, 출력 장치(`setSinkId`) 지원 시 선택

### 내보내기 · 프로젝트
- `OfflineAudioContext` 무결점 렌더링 — 마스터 믹스 또는 트랙별 스템
- **WAV** 16/24-bit · 44.1/48 kHz
- **MP3** 128/192/320 kbps (`@breezystack/lamejs` Vite ESM 번들)
- **WebM/Opus** (`MediaRecorder` 지원 코덱 자동 감지)
- `.lps.json` 프로젝트 저장/불러오기 + IndexedDB 자동 복구

### 내장 샘플 프로젝트 3종
외부 파일 없이 결정론적 DSP로 생성한 3개의 멀티트랙 루프입니다. 빈 프로젝트에서는 스테이지에
샘플 3종 칩이 바로 보이고, 작업 중에도 **`📁` 프로젝트 드로워**에서 언제든 다시 고를 수 있습니다.
불러온 뒤 `▶` 재생, Mute/Solo, 트랙 FX, 오버더빙, WAV/MP3 스템 내보내기까지 바로 체험할 수 있습니다.

| 샘플 | 템포 | 구성 |
| --- | --- | --- |
| Lo-Fi Chill Groove | 92 BPM · 4/4 · 2마디 | Lo-Fi Drums · Warm EP Chords · Sub Bass · Pluck Melody |
| Synthwave Pulse | 118 BPM · 4/4 · 2마디 | 808 Beat · Driving Synth Bass · Lush Pad · Lead Arp |
| Acoustic Waltz | 104 BPM · 3/4 · 2마디 | Acoustic Drums · Fingered Bass · Electric Keys |

## 개발

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest 63개
npx tsc --noEmit
npm run build
```

`npm run build`는 `tsc --noEmit`을 먼저 실행하고, GitHub Actions(`.github/workflows/deploy.yml`)가
같은 검사를 통과한 뒤 GitHub Pages로 배포합니다.

```
src/
  audio/    clock · dsp · wav · mp3 · recorder · synth · drums · engine · render · project · sampleProjects
  components/  Header · ProjectDrawer · SamplePrompt · ChannelStrip · MobileDeck · Dock · Sheet · sheets
  store/    studio state + IndexedDB autosave
  hooks/    media query · QWERTY performance keys
tests/      clock · dsp · wav · mp3 · project · i18n · samples · brand
```

## 브라우저 · 하드웨어 제약 (사실 그대로)

- **출력 장치 선택(`AudioContext.setSinkId`)**: Chromium 계열만 지원. Firefox/Safari에서는 OS 기본 출력을 쓰며 I/O 시트에 안내 배지가 표시됩니다.
- **Web MIDI**: Chromium 계열에서 지원. 미지원 브라우저에서는 건반·패드로 연주할 수 있습니다.
- **WebM/Opus 내보내기**: `MediaRecorder`가 지원하는 브라우저에서만 활성화되며, 이 경로는 실시간 캡처입니다(다른 포맷은 오프라인 렌더링).
- 마이크 권한은 사용자가 I/O 시트에서 직접 허용해야 하며, 거부되면 악기·파일 입력으로 계속 사용할 수 있습니다.
- 오디오는 첫 사용자 제스처(재생/녹음) 후에 시작됩니다(브라우저 자동재생 정책).

## 라이선스

MIT — 아래 `LICENSE` 참고. MP3 인코더는 `@breezystack/lamejs`(LGPL, `THIRD_PARTY_NOTICES.md`)를 사용합니다.
