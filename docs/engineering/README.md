# PaperBridge Engineering Docs

이 디렉터리는 현재 monorepo를 `paperbridge-frontend`와 `paperbridge-backend`로 분리하고, 두 에이전트가 계약 기반으로 병렬 개발하기 위한 권위 있는 설계 묶음이다.

## 읽는 순서

1. `00_PRODUCT_SCOPE_AND_ASSUMPTIONS.md` — 사업계획서 기반 제품 범위
2. `01_CURRENT_STATE_AUDIT.md` — 공개 저장소 현행 감사
3. `02_TARGET_ARCHITECTURE.md` — 목표 Web/API/Worker/Desktop 구조
4. `03_REPOSITORY_SPLIT_PLAN.md` — Git 이력 보존 분리와 소유권
5. `04_DOMAIN_MODEL_AND_ERD.md`, `database/` — ERD·SQL·RLS
6. `05_API_STANDARDS.md`, `06_API_ENDPOINT_CATALOG.md`, `api/openapi.yaml`
7. `07_DOCUMENT_PIPELINE.md`, `contracts/pdf-object-graph.schema.json`
8. `08_AGENT_RUNTIME.md`, `contracts/agent-runtime-event.schema.json`
9. `09_FRONTEND_SPEC.md`, `10_BACKEND_SPEC.md`
10. `11_FRONTEND_TODO.md`, `12_BACKEND_TODO.md`, `todo/*.csv`
11. `13_TEST_STRATEGY.md`~`18_MIGRATION_RUNBOOK.md`
12. `19_AGENT_WORKING_AGREEMENT.md`, `prompts/`
13. `20_PUSH_AND_CODEX_RUNBOOK.md`
14. `21_OPEN_QUESTIONS_AND_ADRS.md`~`24_DEFINITION_OF_DONE.md`

## 권위 순서

충돌 시 다음 순서로 판단한다.

1. `api/openapi.yaml`, `contracts/*.schema.json`
2. 실제 적용된 DB migration
3. 승인된 `adr/*.md`
4. 본문 구현 명세
5. TODO/roadmap

문서와 구현이 다르면 조용히 한쪽을 맞추지 말고 contract 또는 ADR 변경 PR을 만든다.

## 상태 표기

- **CURRENT**: 현재 저장소에서 확인됨
- **DECISION**: 이 설계의 기본 결정
- **PROPOSED**: 구현 전 staging 검증 필요
- **LATER**: MVP 이후
- **OPEN**: 팀 결정 필요

## 검증

Bundle 내부:

```bash
./docs/scripts/verify-docs.sh
```

원본 저장소에 적용된 뒤:

```bash
./docs/engineering/scripts/verify-docs.sh
```
