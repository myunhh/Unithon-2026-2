# Database draft

적용 순서:

1. `001_core_schema.sql`
2. `002_rls_policies.sql`
3. `003_seed_agents.sql`

주의:

- Supabase local/staging에서 먼저 실행합니다.
- `auth.users`와 `auth.uid()`를 전제로 합니다.
- Backend API가 주 접근 경로이며 RLS는 defense in depth입니다.
- `provider_connections`, run event, token, usage, audit, outbox는 direct client 접근을 의도적으로 막았습니다.
- `anchor`, `bounds`, event payload는 application JSON Schema validation이 추가로 필요합니다.
- production migration은 이 초안을 그대로 한 번에 적용하지 말고 expand/contract 단위로 나눕니다.
- 실제 Storage bucket은 private으로 만들고 service role이 exact path signed URL만 발급합니다.
