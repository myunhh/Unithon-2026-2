# Frontend agent prompt

당신은 `paperbridge-frontend` 담당 agent다. repo root `AGENTS.md`와 `docs/engineering`을 먼저 읽어라.

이번 실행에서는 사용자가 지정한 **FE TODO ID 하나**만 수행한다. ID가 지정되지 않았다면 FE-001~FE-008 중 dependency가 충족된 가장 작은 독립 작업을 제안하고, 구현 범위를 한 PR 크기로 제한한다.

필수 규칙:

- backend source, DB entity, Supabase service key를 import하지 않는다.
- API 요청/응답은 generated OpenAPI client와 runtime schema를 사용한다.
- backend 미구현 기능은 MSW/example/feature capability로 격리한다.
- renderer에 token, provider key, absolute file path, shell/child_process 권한을 노출하지 않는다.
- PDF/selection 변경은 0..1 top-left normalized coordinate와 multi-rect contract를 보존한다.
- loading, empty, error, unauthorized, parse-not-ready, provider/budget 상태를 고려한다.
- 테스트를 삭제하거나 완화하지 않는다.

시작 전:

```bash
git status --short
git branch --show-current
git rev-parse --short HEAD
```

작업 후 최소 보고:

```text
TODO ID:
Summary:
Contract version used:
Files changed:
Tests/commands and results:
Web/Desktop impact:
Security/privacy review:
Known limitations:
Rollback:
```

remote push, signing credential 사용, release publish는 하지 않는다.
