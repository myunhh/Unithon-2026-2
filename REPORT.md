# PaperBridge handoff report

작성 시점: 2026-08-25

## 현재 상태

- 프로젝트명: PaperBridge
- 저장소: `myunhh/Unithon-2026-2`
- 브랜치: `main`
- 이번 구현은 아직 커밋하거나 푸시하지 않았다. 기존 초기 커밋 위의 working tree 변경으로 남아 있다.
- 랜딩부터 계정·보관함·리더·설정까지 사용자 노출 UI, 접근성 이름, 로딩·빈 상태·오류 상태를 한국어로 통일했다.
- 공유 Figma 시안의 밝은 오프화이트 작업 공간, 검정·딥네이비 CTA, 얇은 구분선, 여백 있는 카드, 노랑 하이라이트, Reader 우측 보조 패널 방향을 반영했다.
- Figma node `111:2`와의 픽셀 수준 시각 정합성은 [TASKS.md](./TASKS.md)의 별도 활성 작업으로 남아 있다.

## 구현된 범위

- Light theme 기반 Web UI와 Electron 셸
- 랜딩, 로그인/회원가입, 계정, Library, Reader, Settings 라우트
- Supabase 이메일/비밀번호 인증을 서버 API로 감싼 세션 관리
  - access/refresh token 분리 HttpOnly 쿠키
  - SameSite=Strict, production Secure
  - 인증 사용자의 HMAC 기반 고정 저장 namespace
  - 로그인 전 익명 session 유지, 자동 데이터 병합은 하지 않음
- Supabase private PDF storage, 문서 목록/업로드/다운로드, 수동 highlight
- pdfjs 기반 canvas + selectable TextLayer, 회전/확대/축소, 좌표 정규화, 다단 텍스트 순서 보정
- OpenRouter 키 암호화 저장, 명시적 1-token 연결 테스트, SSE 실행/취소 서버 API
- Desktop Claude Code, Codex, Agy CLI 탐지/실행/취소 및 정규화된 IPC event
- Electron 보안 보강
  - Codex prompt 앞 `--` option boundary
  - preload event strict validation
  - symlink/no-follow 기반 설치 key/session secret/workspace 방어
  - 외부 링크 실패 처리
- Settings에서 Web/Desktop provider 가용성 표시 및 Agy 지원
- 저장된 OpenRouter key와 편집 중인 model ID를 서버에서 결합해, key를 renderer에 노출하지 않고 연결 테스트 가능
- Reader 텍스트 선택 후 Explain/Translate의 스트리밍 결과, 취소, 실패 후 재시도 UX
- 웹·데스크톱 AI 요청의 비신뢰 문서 경계와 한국어 응답 지침

## 검증 결과

모두 통과했다.

```text
npm test         20 files, 113 tests passed
npm run typecheck
npm run lint
npm run build
git diff --check
```

Vite build에는 renderer chunk가 약 726 kB라는 code-splitting 경고가 있지만 build 실패는 아니다.

## Agent Gateway·프롬프트 보안 검증

이전 독립 검증에서 확인한 6개 회귀 항목은 모두 수정하고 테스트로 고정했다.

1. 중첩 프롬프트 구분자 이스케이프와 비신뢰 문서 경계
2. 자격증명·로컬 경로·제공자 옵션 제거
3. 서버·렌더러 OpenRouter 출력 한도 정합성
4. Desktop 실행 승인 전 이벤트 버퍼 상한과 종료 보장
5. 사전 취소된 Desktop 실행의 IPC 차단
6. 선택 텍스트·범위 일치 및 문서 전체 블록 ID 고유성

실제 OpenRouter 서버 요청에도 서버 소유의 고정 시스템 지침을 적용해 `TRUSTED TASK`만 수행하고, 모든 `UNTRUSTED` 구간과 문서 맥락을 지시가 아닌 참고 데이터로 다루도록 했다. HTTP/SSE/IPC/렌더러 오류는 원시 제공자 메시지·경로·비밀값 대신 고정된 한국어 계약만 노출한다.

## 현재 연결 범위

- Reader 선택 영역 설명·번역은 OpenRouter Agent Gateway에 연결되어 스트리밍, 취소, 오류, 재시도를 지원한다.
- 수동 하이라이트 저장·이동·삭제를 지원한다.
- 문서 질문 입력, 문서 요약, 페이지 전체 번역 실행 UI는 아직 연결 범위가 아니다.

## 남은 작업

- 최우선: [TASKS.md](./TASKS.md)의 Figma 픽셀 수준 시각 정합성 개선
- renderer/PDF worker 번들 코드 분할 검토
- 실제 계정을 사용하는 외부 서비스·설치 CLI·패키지 앱 수동 스모크 테스트

## 실행하지 않은 실제 외부 검증

비용 또는 외부 상태 변경을 피하기 위해 아래는 실행하지 않았다.

- 실제 Supabase 계정 생성/로그인 및 이메일 확인
- 실제 OpenRouter model 호출
- 실제 Claude Code/Codex/Agy prompt 실행
- packaged Electron 앱의 수동 UI/종료 lifecycle smoke test
- 브라우저에서 모바일/데스크톱 전체 화면 시각 회귀 확인

## 환경과 실행

실제 값은 `.env.local`에 있고 gitignore 상태다. secret을 renderer의 `VITE_*` 환경변수로 옮기면 안 된다.

필수/주요 서버 환경변수는 `.env.example` 참고:

- `APP_ORIGIN`
- `PAPERBRIDGE_SESSION_SECRET`
- `PAPERBRIDGE_ENCRYPTION_KEY`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`

```bash
npm install
npm run dev
# 별도 확인 시
npm run dev:desktop
```

## 추천 재개 순서

1. 위 Gateway/프롬프트 6개 finding 수정 및 회귀 테스트
2. Reader Explain/Translate/Chat/Summary를 prompt builder + unified gateway에 연결
3. 실제 Supabase 테스트 계정으로 auth/storage smoke test 후 테스트 데이터 정리
4. OpenRouter는 사용자가 명시적으로 눌렀을 때만 최소 호출 검증
5. 설치된 CLI별 desktop smoke test 및 Electron 종료/취소 확인
6. 브라우저 밝은 테마, 320px/데스크톱 접근성·시각 확인
7. secret 포함 여부를 다시 검사한 후 commit/push
