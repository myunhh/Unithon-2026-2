# 00. 제품 범위와 전제

## 제품 정의

PaperBridge는 사용자가 논문 읽기 화면을 떠나지 않고 문장·그림·표·수식을 선택해 설명, 번역, 질문을 실행하며, 목적에 맞는 AI 에이전트와 모델·비용 한도를 고르는 연구 워크스페이스다.

핵심 가치는 다음과 같다.

1. **읽기 흐름 유지**: 원문 위치와 AI 답변을 같은 화면에 둔다.
2. **맥락 보존**: 선택 텍스트뿐 아니라 주변 블록·캡션·페이지 좌표를 함께 전달한다.
3. **선택권과 경제성**: 원격 API, BYOK, 데스크톱 CLI를 공통 실행 계약으로 다루고 예산을 강제한다.

## 1차 사용자

- 영어 논문을 자주 읽는 이공계 대학생·대학원생
- 학부 연구생과 논문 스터디 참가자
- 번역·쉬운 설명·수식 설명·방법론 검토가 반복적으로 필요한 사용자

## 핵심 사용자 흐름

1. PDF 업로드
2. 파싱 완료 전에도 Reader 즉시 진입
3. 문장 선택
4. `쉽게 설명`, `한국어 번역`, `질문` 실행
5. 답변 stream과 원문 위치·근거 표시
6. 하이라이트/메모/AI 결과 저장
7. Library 재진입과 위치 복원

## 릴리스 범위

### P0 - MVP

- 이메일 인증·세션
- private PDF 업로드/목록/열기/삭제
- PDF.js 렌더링, 페이지 이동, 확대/축소, text selection
- 정규화 좌표 기반 selection/highlight
- 선택 설명·번역 stream, 취소, 재시도
- OpenRouter BYOK 연결·테스트·삭제
- Electron Claude Code/Codex/Agy 탐지·로컬 실행
- 기본 보안·사용량·실패 로그

### P1 - Beta

- 서버 문서 구조화와 page/block API
- 근거 기반 요약·문서 Chat
- 그림·표·수식 설명
- 사용자 정의 에이전트
- 모델 카탈로그·예상 비용·월 예산
- 파싱 재시도·복구
- signed/notarized DMG/ZIP와 자동 업데이트

### P2 - 정식/연구실

- Lab workspace, 초대, 역할
- 공용 논문함·공용 에이전트
- 조직 사용량·예산·결제
- DOI/Zotero import
- OCR·embedding retrieval·다국어

## 명시적 비범위

- Google Docs 수준 실시간 공동 편집
- 임의 서버 코드 실행형 plugin marketplace
- 연구 데이터 공개 검색 인덱싱
- 완전 오프라인 클라우드 기능 복제
- Mac App Store 우선 배포
- 초기 SAML/SCIM

## 기본 제품 결정

| 항목 | 결정 | 이유 |
|---|---|---|
| 사용자 데이터 루트 | 가입 시 personal workspace 자동 생성 | Lab 모델과 통일 |
| PDF 저장 | private Supabase Storage | 기존 인프라·공개 URL 방지 |
| 즉시 읽기 | upload complete 후 파싱과 무관하게 허용 | 첫 진입 지연 감소 |
| 전체 요약/Chat | 서버 구조화 완료 후 | 근거·검색 품질 |
| 선택 설명/번역 | local selection context로 먼저 허용 | MVP 핵심 가치 |
| 원격 AI | backend gateway | 비밀·비용·감사·취소 통합 |
| local CLI | Electron main | renderer 권한 차단 |
| 계약 원본 | backend OpenAPI | 단일 권위 |
| Desktop UI | Web과 React 공유 | 기능·디자인 일관성 |

## 성공 지표 제안

- 정상 PDF 업로드 성공률 99% 이상
- 20 MiB 이하 PDF 첫 page 표시 p95 3초 이내
- provider 정상 시 선택 실행 시작 p95 1.5초 이내
- citation 요구 작업은 `근거 있음/없음` 상태 100% 표시
- hard budget 초과 원격 실행 0건

## OPEN

- 익명 PDF 허용·보존 기간
- Desktop의 cloud sync 기본값
- local CLI 결과 server sync 정책
- 무료 plan 제한
- Lab의 개인 BYOK/공용 키 정책
