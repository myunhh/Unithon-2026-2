# 15. Observability·SLO

## 목적

운영자는 “느리다/안 된다”를 API, Storage, parse queue, remote provider, local desktop 중 어디에서 발생했는지 식별해야 한다. 동시에 논문·질문·AI 답변 원문을 수집하지 않는다.

## Correlation ID

- `request_id`: HTTP 요청 단위, client에 response header/problem으로 반환.
- `trace_id`: 내부 span 연결.
- `run_id`: AI 실행 전 과정.
- `job_id`: parse/cleanup/import 작업.
- `document_id`, `workspace_id`: 접근 제한된 구조화 ID; 외부 analytics에서는 pseudonymize.
- Desktop diagnostic은 `installation_id`를 opt-in 정책으로 사용하고 device token과 분리한다.

## 구조화 로그

공통 field:

```json
{
  "timestamp": "RFC3339",
  "level": "info",
  "service": "api|worker|desktop-main",
  "environment": "staging",
  "event": "run.completed",
  "request_id": "req_...",
  "run_id": "...",
  "code": "ok",
  "duration_ms": 1234
}
```

필수 redaction은 `14_SECURITY_AND_PRIVACY.md`를 따른다. stack trace는 server-side에서만 접근하고 response에는 공개하지 않는다.

## Metrics

### API

- request count/latency/error by route template/status/code.
- active requests, body rejected, auth failure, rate limit.
- DB pool wait/query duration/transaction retry.
- signed URL/create upload complete mismatch.

### Document pipeline

- upload initiated/completed/abandoned.
- parse queue depth/oldest age.
- job duration by stage/parser version/page bucket.
- success/failure/retry/dead-letter by stable code.
- object graph size/pages/blocks/textless ratio.

### AI

- run accepted/started/terminal.
- time-to-first-delta, total duration.
- provider/model/error/circuit state.
- input/output tokens and microusd actual/estimated.
- reservation/release leak, budget denial.
- citation present/missing/invalid count.
- active runs and cancel rate.

### Frontend/Desktop

- route load/Web Vitals without content.
- PDF first-page/selection action latency.
- renderer crash, preload/IPC rejection.
- local provider health/run terminal code.
- update check/download/install outcome.
- app version/OS/architecture; no local path/CLI args.

## Tracing

권장 span:

```text
HTTP POST /v1/runs
  auth.policy
  document.context
  budget.reserve
  run.persist
  provider.connect
  provider.first_delta
  citation.validate
  usage.settle
```

Worker는 queue message trace context를 전달하고, provider에는 필요한 표준 header만 전달한다. prompt/output은 span attribute나 event에 넣지 않는다.

## 초기 SLI/SLO 제안

| 기능 | SLI | 월 목표 |
|---|---|---:|
| Authenticated API | 유효 요청 중 5xx가 아닌 비율 | 99.9% |
| Document upload complete | 유효 PDF commit 성공 | 99.5% |
| Reader file access | 권한 있는 요청 성공 | 99.9% |
| Parse | 지원 PDF가 10분 내 ready/명시적 terminal | 99.0% |
| Remote run start | accepted가 10초 내 started/명시적 failure | 99.0% |
| Run terminal integrity | terminal 정확히 하나 | 100% |
| Budget enforcement | hard limit 초과 provider 호출 없음 | 100% |
| Signed desktop launch | 지원 Mac clean install launch | release gate 100% |

provider 자체 outage는 dependency SLI로 따로 보여 주되 사용자 기능 SLO에서도 숨기지 않는다. Beta 실측 후 목표와 error budget을 확정한다.

## Alert

### Page immediately

- cross-tenant/RLS canary 실패.
- BYOK decrypt/log leak detector.
- budget overspend 또는 terminal invariant 위반.
- production migration failure.
- signed update/feed integrity 실패.

### Urgent business hours

- API 5xx/error budget burn.
- parse oldest queue age 임계 초과.
- provider circuit 다수 open.
- upload abandoned/mismatch 급증.
- auth/login failure 급증.

### Ticket

- 특정 parser version 실패율 상승.
- slow query/bundle/memory regression.
- event retention/reconciliation backlog.

모든 alert는 owner, dashboard, runbook, suppression 조건을 가진다.

## Dashboard

1. **User journey**: login→upload→Reader→selection→run→annotation funnel.
2. **API health**: route p50/p95/p99, 4xx/5xx, DB pool.
3. **Document**: queue depth, stage latency, parser error, page distribution.
4. **AI/Cost**: provider latency/error, TTFT, tokens, microusd, budget denial.
5. **Desktop release**: version adoption, crash, update outcome, architecture.
6. **Security**: auth/rate/IPC/RLS canary/audit anomalies.

## Synthetic/Canary

- staging synthetic user가 작은 fixture PDF를 upload→parse→run fake provider→citation까지 실행한다.
- production은 content-free minimal PDF와 fake/internal provider 경로로 외부 비용 없이 핵심 contract를 검증한다.
- RLS canary는 서로 다른 두 tenant resource의 negative query를 수행한다.
- macOS RC는 clean VM에서 install/launch/update/uninstall을 자동·수동 혼합으로 확인한다.

## Privacy

Analytics event에는 document title, filename, text, prompt, output, annotation body를 포함하지 않는다. 사용자 행동 연구가 필요하면 별도 명시 동의와 제한된 연구 dataset/retention을 사용한다.
