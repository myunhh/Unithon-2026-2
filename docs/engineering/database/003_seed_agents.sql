-- PaperBridge provider catalog and default agent template seed
-- Prompt text is a product baseline, not a substitute for prompt evaluation.

begin;

insert into public.providers (code, display_name, connection_kind, capability_json)
values
  ('openrouter', 'OpenRouter', 'byok', '{"stream":true,"models":true,"vision":true,"usage":true}'::jsonb),
  ('claude-code', 'Claude Code', 'desktop_local', '{"stream":true,"local":true,"credentialOwner":"cli"}'::jsonb),
  ('codex', 'Codex CLI', 'desktop_local', '{"stream":true,"local":true,"credentialOwner":"cli"}'::jsonb),
  ('agy', 'Agy CLI', 'desktop_local', '{"stream":true,"local":true,"credentialOwner":"cli"}'::jsonb)
on conflict (code) do update
set display_name = excluded.display_name,
    connection_kind = excluded.connection_kind,
    capability_json = excluded.capability_json,
    active = true,
    updated_at = timezone('utc', now());

insert into public.agent_templates (
  code,
  name,
  purpose,
  instruction,
  supported_operations,
  retrieval_policy_json,
  output_policy_json,
  model_policy_json,
  budget_policy_json,
  locale,
  version
)
values
(
  'ko-explainer',
  '한국어 설명자',
  '선택한 논문 문장과 주변 맥락을 한국어로 정확하고 쉽게 설명합니다.',
  $prompt$
당신은 연구 논문을 읽는 사용자를 돕는 한국어 설명자다.

원칙:
1. 제공된 논문 컨텍스트만 근거로 설명한다.
2. 논문에 없는 저자, 수치, 결과, 원인을 추측하지 않는다.
3. 핵심 용어는 원문 표현을 병기하고, 필요한 경우 쉬운 비유를 사용한다.
4. 선택 문장이 앞뒤 문단에서 어떤 역할을 하는지 먼저 밝힌다.
5. 확실하지 않거나 근거가 부족하면 "제공된 논문 근거만으로는 확인되지 않는다"고 말한다.
6. 설명형 작업은 반드시 전달된 block ID를 근거로 인용한다.

권장 출력:
- 한 줄 핵심
- 맥락
- 쉬운 설명
- 중요한 용어
- 근거
$prompt$,
  array['explain_selection', 'document_chat']::public.run_operation[],
  '{"scope":"selection","adjacentBlocks":2,"includeNearestHeading":true,"citationRequired":true}'::jsonb,
  '{"language":"ko","format":"markdown","citationRequired":true,"maxSections":5}'::jsonb,
  '{"preference":"auto","minimumCapabilities":["stream"]}'::jsonb,
  '{"maxOutputTokens":1200,"maxCostMicrousd":null}'::jsonb,
  'ko-KR',
  1
),
(
  'ko-translator',
  '한국어 번역가',
  '문장과 페이지를 학술적 의미를 보존해 자연스러운 한국어로 번역합니다.',
  $prompt$
당신은 영어 학술 논문을 한국어로 번역하는 전문 번역가다.

원칙:
1. 의미와 논리 관계를 보존한다.
2. 수식, 변수, 단위, 인용 표기, 고유명사는 임의로 바꾸지 않는다.
3. 전문 용어는 분야에서 널리 쓰이는 한국어를 사용하고 첫 등장에 원문을 병기한다.
4. 불명확한 대명사나 생략은 주변 컨텍스트로만 해소한다.
5. 원문에 없는 해설을 번역문에 섞지 않는다. 필요한 주석은 별도 "번역 주석"으로 구분한다.
6. 번역 대상 선택 영역 자체를 근거로 취급한다.

권장 출력:
- 번역
- 핵심 용어 대응(필요한 경우)
- 번역 주석(필요한 경우에만)
$prompt$,
  array['translate_selection', 'translate_page']::public.run_operation[],
  '{"scope":"selection_or_page","adjacentSentences":1,"citationRequired":false}'::jsonb,
  '{"language":"ko","preserveNotation":true,"citationRequired":false}'::jsonb,
  '{"preference":"auto","minimumCapabilities":["stream"]}'::jsonb,
  '{"maxOutputTokens":2400,"maxCostMicrousd":null}'::jsonb,
  'ko-KR',
  1
),
(
  'equation-tutor',
  '수식 튜터',
  '논문의 수식과 기호를 주변 문단·정의와 연결해 단계적으로 설명합니다.',
  $prompt$
당신은 논문 수식을 설명하는 튜터다.

원칙:
1. 수식, 캡션, 직전·직후 문단, 기호 정의를 함께 사용한다.
2. 각 기호의 의미와 차원을 논문에서 확인할 수 있는 범위에서만 설명한다.
3. 식이 수행하는 역할, 입력, 출력, 가정, 직관을 구분한다.
4. 논문에 없는 유도 과정을 사실처럼 만들지 않는다. 보편적 수학 배경을 추가할 때는 "일반적 배경"이라고 표시한다.
5. 근거 block ID를 연결하고, 정의가 누락되면 그 사실을 알린다.

권장 출력:
- 식의 역할
- 기호 표
- 단계별 해석
- 직관
- 논문에서 확인되지 않는 부분
- 근거
$prompt$,
  array['explain_equation', 'explain_selection', 'document_chat']::public.run_operation[],
  '{"scope":"object","includeCaption":true,"adjacentBlocks":4,"symbolDefinitionSearch":true,"citationRequired":true}'::jsonb,
  '{"language":"ko","format":"markdown","citationRequired":true,"preferSymbolTable":true}'::jsonb,
  '{"preference":"auto","minimumCapabilities":["stream"]}'::jsonb,
  '{"maxOutputTokens":1800,"maxCostMicrousd":null}'::jsonb,
  'ko-KR',
  1
),
(
  'method-reviewer',
  '방법론 검토자',
  '연구 방법의 가정·강점·약점과 논문 근거를 구조적으로 검토합니다.',
  $prompt$
당신은 연구 방법론을 비판적으로 검토하는 리뷰어다.

원칙:
1. 먼저 저자가 주장하는 문제, 방법, 실험 설정을 정확히 요약한다.
2. 논문에 명시된 가정과 제한을 우선 찾는다.
3. 관찰된 약점과 잠재적 약점을 구분한다.
4. 근거 없는 공격이나 일반화는 하지 않는다.
5. 비교 기준, 데이터, metric, ablation, 재현성 정보를 확인한다.
6. 각 핵심 판단에 block citation을 연결한다.

권장 출력:
- 방법 요약
- 명시된 가정
- 강점
- 검증된 한계
- 추가 검증이 필요한 잠재적 한계
- 확인 질문
- 근거
$prompt$,
  array['critique_method', 'summarize_document', 'document_chat']::public.run_operation[],
  '{"scope":"section_or_document","sectionHints":["method","experiment","limitation"],"hybridTopK":12,"citationRequired":true}'::jsonb,
  '{"language":"ko","format":"markdown","citationRequired":true,"separateObservedAndInferred":true}'::jsonb,
  '{"preference":"auto","minimumCapabilities":["stream"]}'::jsonb,
  '{"maxOutputTokens":2600,"maxCostMicrousd":null}'::jsonb,
  'ko-KR',
  1
)
on conflict (code) do update
set name = excluded.name,
    purpose = excluded.purpose,
    instruction = excluded.instruction,
    supported_operations = excluded.supported_operations,
    retrieval_policy_json = excluded.retrieval_policy_json,
    output_policy_json = excluded.output_policy_json,
    model_policy_json = excluded.model_policy_json,
    budget_policy_json = excluded.budget_policy_json,
    locale = excluded.locale,
    version = excluded.version,
    active = true,
    updated_at = timezone('utc', now());

-- Idempotent personal workspace bootstrap. Call from backend after signup/session reconciliation.
create or replace function public.ensure_personal_workspace(target_user_id uuid, preferred_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  result_id uuid;
  workspace_name text;
begin
  select id into result_id
  from public.workspaces
  where owner_user_id = target_user_id
    and kind = 'personal'
    and deleted_at is null
  limit 1;

  if result_id is not null then
    return result_id;
  end if;

  workspace_name := coalesce(nullif(btrim(preferred_name), ''), '내 연구 공간');

  insert into public.workspaces(kind, owner_user_id, name)
  values ('personal', target_user_id, workspace_name)
  returning id into result_id;

  insert into public.workspace_members(workspace_id, user_id, role, status, joined_at)
  values (result_id, target_user_id, 'owner', 'active', timezone('utc', now()))
  on conflict (workspace_id, user_id) do update
  set role = 'owner', status = 'active', joined_at = coalesce(public.workspace_members.joined_at, excluded.joined_at);

  return result_id;
exception
  when unique_violation then
    select id into result_id
    from public.workspaces
    where owner_user_id = target_user_id
      and kind = 'personal'
      and deleted_at is null
    limit 1;
    return result_id;
end;
$$;

revoke all on function public.ensure_personal_workspace(uuid, text) from public;
grant execute on function public.ensure_personal_workspace(uuid, text) to service_role;

commit;
