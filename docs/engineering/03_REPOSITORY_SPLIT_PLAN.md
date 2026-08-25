# 03. 저장소 분리 계획

## 목표 저장소

### `paperbridge-frontend`

```text
src/{app,pages,features,entities,shared,generated}
electron/{main,preload,local-bridge,agent-runtime}
public/
tests/
docs/
forge.config.ts
vite.config.ts
package.json
AGENTS.md
```

### `paperbridge-backend`

```text
apps/{api,worker}
packages/{contracts,domain,db,storage,queue,pdf,providers,observability}
openapi/openapi.yaml
supabase/{migrations,seed.sql,tests}
tests/
Dockerfile
package.json
AGENTS.md
```

## 현재 경로 소유권

| 현재 | 목표 | 처리 |
|---|---|---|
| `src/**` | frontend | feature 구조로 단계 이동 |
| `electron/**` | frontend | `server` import 제거 |
| `public/**`, `index.html`, Vite config | frontend | 유지 |
| `server/**` | backend | module 구조로 이동 |
| `src/domain/types.ts` | 분해 | API 타입 generated, UI 타입만 FE |
| `src/domain/pdf*` | FE + contract | renderer는 FE, object schema는 contract |
| `REPORT.md`, `DESIGN.md` | 양쪽/FE | 감사·디자인 문서로 정리 |
| root package/tsconfig/test | 양쪽 | 각 repo 최소 dependency로 재작성 |

## 계약 소유

세 번째 repo는 당장 만들지 않는다.

- backend repo가 OpenAPI/JSON Schema 원본 소유
- CI가 TypeScript types/runtime validators/client를 package로 publish
- frontend가 exact package version 사용
- DB entity와 provider SDK 타입은 package에 포함하지 않음

## 분리 단계

### 0. 기준점

- 원본 test/typecheck/lint/build
- `split-base-YYYYMMDD` tag
- API/IPC/env inventory
- GitHub 조직에 두 repo 생성
- branch protection/CODEOWNERS/secrets 설정

### 1. 이력 보존 분리

`scripts/split-history.sh`로 `git filter-repo` 수행.

- FE: `src`, `electron`, `public`, frontend root files
- BE: `server`, backend root files
- docs는 필요한 만큼 양쪽에 복사 후 정리

### 2. 계약 추출

- backend OpenAPI/Schema 추가
- current `/api` compatibility adapter
- `/v1` 병행
- generated client와 MSW를 frontend에 연결

### 3. Desktop decoupling

- Electron의 `../server/app` import 제거
- static/local bridge 추가
- remote API/token broker 연결
- local CLI IPC 유지
- backend source 없이 desktop build 확인

### 4. DB 정규화

- migration
- legacy dual-read/backfill/dual-write
- parity verification
- read cutover
- retention 후 JSON state 제거

### 5. 독립 배포

- backend staging + contract release
- frontend staging integration
- unsigned desktop QA
- signed/notarized beta
- production cutover

## Branch/PR

- `main` always deployable
- `feat/FE-###-*`, `feat/BE-###-*`
- `contract/C-###-*`
- schema change는 하나의 migration 목적
- 장기 develop branch 없음

### FE PR gate

- lint/typecheck/unit/component
- contract mock
- web build
- Reader change PDF fixture
- Electron change IPC test

### BE PR gate

- lint/typecheck/unit/integration
- OpenAPI lint/breaking diff
- migration up/RLS test
- provider fake contract

## 병렬 에이전트

Frontend는 generated mock/examples로 backend 없이 개발한다. Backend는 OpenAPI examples/conformance를 consumer로 사용한다. 미구현 기능은 capability flag로 숨긴다.

## 호환 정책

| 변경 | version |
|---|---|
| optional field/endpoint/event 추가 | minor |
| field 제거/required/type 변경 | major |
| detail 문구 변경 | patch; stable `code` 유지 |
| enum 추가 | exhaustive consumer면 major 취급 |

## 완료 조건

- FE clone만으로 web/desktop build
- BE clone만으로 API/worker/test
- FE에 service/provider secret 없음
- Electron이 backend source import하지 않음
- 동일 contract version staging E2E
- legacy document/highlight/provider migration parity
