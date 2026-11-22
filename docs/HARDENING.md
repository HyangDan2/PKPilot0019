# 오디오 엔진 하드닝 (2026-11-23)

`PKPilot0019`(Lýra) 오디오 엔진의 10개 결함을 고치고, 결함별 재현 테스트와 회귀 테스트를 함께 넣은 기록입니다.
기준 커밋 `2f0c5a1`.

## 결함 → 수정 → 테스트

| # | 결함 | 수정 | 테스트 |
| --- | --- | --- | --- |
| 1 (P0) | 비동기 녹음 확정이 `token`을 보지 않아, 먼저 끝난 테이크가 나중 테이크를 덮어쓸 수 있었다 | `RecSession.token`을 소유권 검사(`ownsTrack`)에 넣고, 트랙별 `commitChain`으로 확정을 FIFO 직렬화. 새 테이크는 이전 확정이 끝난 뒤 시작 | `tests/hardening.test.ts` — "serialises a quick re-record…", "drops a take whose buffer was replaced…", "never applies a take twice…" |
| 2 (P0) | `importFile`의 `decodeAudioData`가 끝난 뒤 프로젝트가 바뀌어도 결과를 그대로 적용했다 | 디코드 전에 generation·epoch·token을 잡아 두고, 디코드 후 소유권이 그대로일 때만 반영 | "discards a decode that finishes after the project was swapped", "…after a newer take claimed the track" |
| 3 (P1) | BPM/마디/박자 변경 시 `refitBuffers`가 PCM을 새 그리드 길이로 잘라 버렸다 | 저장 PCM은 그대로 두고, 재생·내보내기에서 `playbackRate = 버퍼 프레임 / 그리드 프레임`으로 맞춘다(테이프 방식, 음정 동반). 오버더브 시에만 `resizeLoop`로 길이를 맞춰 섞는다 | "leaves the PCM untouched…", "keeps the frames when a bar count change…", "hands a loop…to an export…" |
| 4 (P1) | 악기 버스가 마스터로 직접 나가면서 동시에 트랙 입력으로도 들어가 이중 출력·피드백 위험 | `instrumentBus → instrumentMonitor → master`로 모니터 경로를 분리하고, 트랙이 캡처하는 동안 모니터 게인을 0으로 내려 트랙 체인만 들리게 한다 | "mutes the direct monitor and feeds the track instead", "keeps the microphone and the instrument on separate feeds" |
| 5 (P1) | `AudioWorklet` `stopAsync`가 150ms 뒤 무조건 성공(빈 청크로 확정될 수 있음) | `flushed` ACK를 기다리고, 오지 않으면 `RecorderFlushTimeoutError`(받은 청크 포함)로 명시적 실패. 엔진은 부분 청크를 살리되 `recorder-flush` 오류를 UI에 알린다 | "waits for the worklet acknowledgement…", "raises an explicit error…", "ignores an acknowledgement that arrives after the timeout" |
| 6 (P1) | 음수 레이턴시가 `Math.max(0, …)`로 잘려 보정이 무시됐다 | 보정값을 ms 단위로 자르고 `-150~150ms` 그대로 캡처 시작점을 이동 | "negative latency calibration" (0 / +60 / −60ms 임펄스 위치 비교) |
| 7 (P1) | 마이크 전처리·채널 모드 변경이 기기에서 거부돼도 새 설정을 그대로 표시 | 실패 시 이전 `processing`/`channelMode`로 되돌리고 기존 스트림·장치 선택 유지. 스토어도 성공했을 때만 UI 갱신 | "a rejected input change keeps the working input" (2건) |
| 8 (P1) | 자동 저장이 메인 스레드에서 전 채널을 Base64로 직렬화(6트랙 2.1M 샘플에서 약 765ms 정지) | IndexedDB에 `Float32Array` 채널을 그대로 저장(구조화 복제). Base64는 `.lps.json` 저장과, IndexedDB가 없는 브라우저의 워커 폴백에만 남김 | `tests/studio.test.ts` 자동 저장 테스트, `tests/hardening.test.ts` "session snapshots are binary" |
| 9 (P2) | `TrackData.source`가 실제 입력과 무관하게 늘 `Mic`, Ogg/Opus인데 `.webm`으로 저장 | 엔진이 테이크/임포트마다 실제 입력(`Mic`/`Inst`/`File`)을 기록하고 스토어가 프로젝트에 반영. Opus 컨테이너가 Ogg면 `.ogg`로 저장 | "record: source reported as Inst"(E2E), "names an Ogg/Opus file .ogg…", 스토어 "labels a track File…" |
| 10 (QA) | 위 결함들의 재현·회귀 테스트 부재 | 단위 20건 + 스토어 2건 + E2E 24개 체크(연속 녹음, BPM 무결성, Worklet flush, WAV/MP3/Opus 디코딩, FX 반영, PC·모바일) | `tests/hardening.test.ts`, `tests/studio.test.ts`, `work/lyra-review/e2e-hardening.py` |

## 설계 메모

- **한 트랙의 오디오를 쓰는 주체는 하나다.** 테이크·임포트·클리어·프로젝트 교체는 모두 토큰을 발급하고 `ownerToken`을 갱신하며, 확정은 `generation`·`epoch`·`token`·`committedToken`을 모두 통과해야 반영된다.
- **템포 변경은 손실이 없고, 대신 음정이 따라간다.** 타임 스트레처가 없는 동안의 안전한 정책이다. 저장된 PCM 프레임 수는 어떤 경로에서도 그리드 길이로 잘리지 않는다.
- **모니터와 캡처를 분리한다.** 악기 버스는 직접 모니터 경로를 따로 갖고, 트랙이 캡처하는 동안만 꺼진다.
- **정지의 성공은 ACK로만 인정한다.** 워클릿이 응답하지 않으면 조용히 성공하지 않고 오류를 올린다.
- **자동 저장은 바이너리다.** 메인 스레드에서 샘플을 문자열로 바꾸지 않는다.

## 남은 한계

- 실제 음향 출력·마이크 하드웨어는 이 환경에서 검증할 수 없다(가상 입력과 오프라인 렌더로 대체).
- iOS Safari 실기기 미검증. 모바일은 Playwright iPhone 프로필로만 확인했다.
- 타임 스트레칭은 여전히 미구현이라 템포 변경 시 음정이 이동한다.
