# 22. 인증·권한 Matrix

## 1. 역할

| Role | 설명 |
|---|---|
| `owner` | workspace 소유권, 결제, 삭제, owner 이전 |
| `admin` | 멤버·공용 agent·budget·문서 관리 |
| `member` | 문서 업로드, annotation, agent 실행, 개인 agent |
| `viewer` | 문서/공용 annotation/허용된 AI 결과 읽기 |

Personal workspace는 owner 한 명으로 시작한다. Lab workspace는 최소 한 owner를 항상 유지한다.

## 2. 공통 규칙

- 모든 resource는 `workspace_id`를 권한 루트로 가진다.
- `created_by`는 권한을 보조하지만 workspace membership을 대체하지 않는다.
- suspended/removed membership은 read/write 모두 거부한다.
- soft-deleted resource는 일반 API에서 404 취급한다.
- 다른 workspace의 ID가 들어오면 resource existence를 노출하지 않게 404를 권장한다.
- service-role DB client는 worker/admin job에서만 사용하고 audit한다.

## 3. Workspace

| Action | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| read workspace | ✓ | ✓ | ✓ | ✓ |
| rename/settings | ✓ | ✓ |  |  |
| invite member | ✓ | ✓ |  |  |
| change member role | ✓ | ✓* |  |  |
| remove member | ✓ | ✓* |  |  |
| set billing/plan | ✓ |  |  |  |
| transfer ownership | ✓ |  |  |  |
| delete workspace | ✓ |  |  |  |

`*` admin은 owner를 강등/제거하거나 자신을 owner로 승격할 수 없다.

## 4. Documents

| Action | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| list/read/file access | ✓ | ✓ | ✓ | ✓ |
| upload | ✓ | ✓ | ✓ |  |
| rename | ✓ | ✓ | creator 또는 정책 |  |
| retry parse | ✓ | ✓ | creator 또는 정책 |  |
| delete | ✓ | ✓ | creator + grace policy |  |
| permanent purge | ✓ | 승인 필요 |  |  |

## 5. Annotations

| Action | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| read visible annotation | ✓ | ✓ | ✓ | ✓ |
| create personal annotation | ✓ | ✓ | ✓ |  |
| create shared annotation | ✓ | ✓ | ✓* |  |
| edit/delete own | ✓ | ✓ | ✓ |  |
| moderate others | ✓ | ✓ |  |  |

`*` Lab policy로 shared annotation 권한을 제한할 수 있다.

## 6. Agents

| Action | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| read active shared agent | ✓ | ✓ | ✓ | ✓ |
| execute allowed agent | ✓ | ✓ | ✓ | plan/policy |
| create personal agent | ✓ | ✓ | ✓ |  |
| publish shared agent | ✓ | ✓ | policy |  |
| update own personal agent | ✓ | ✓ | ✓ |  |
| archive shared agent | ✓ | ✓ |  |  |
| set workspace default | ✓ | ✓ |  |  |

Agent 수정은 immutable version을 만들고 기존 run의 version 참조는 유지한다.

## 7. Provider connections

| Connection | Read public status | Use | Update/Delete |
|---|---|---|---|
| personal BYOK | owner user | owner user | owner user |
| workspace BYOK | members with execution permission | allowed members | owner/admin |
| platform provider | plan capability | plan/budget permission | platform admin only |
| desktop local | current device/user only | current device/user | current device/user |

Secret 값은 어떤 역할에도 API로 반환하지 않는다.

## 8. Runs/Usage/Budget

| Action | Owner | Admin | Member | Viewer |
|---|:---:|:---:|:---:|:---:|
| create run | ✓ | ✓ | ✓ | policy |
| read own run | ✓ | ✓ | ✓ | policy |
| read workspace aggregate usage | ✓ | ✓ |  |  |
| read own usage | ✓ | ✓ | ✓ | policy |
| cancel own run | ✓ | ✓ | ✓ | policy |
| cancel any workspace run | ✓ | ✓ |  |  |
| set workspace budget | ✓ | ✓ |  |  |
| set own lower cap | ✓ | ✓ | ✓ | policy |

Budget check는 role 이후, provider call 이전에 transaction으로 수행한다.

## 9. Desktop device

- 사용자만 자신의 device list를 본다.
- revoke는 사용자 본인 또는 security admin만 수행한다.
- revoked credential은 refresh와 API 요청에 사용할 수 없다.
- device public ID만 UI에 노출하고 credential hash는 server-only다.

## 10. Backend policy test template

각 use-case마다 다음을 표 기반 parameterized test로 구현한다.

```text
(actor role/status, resource workspace, ownership, plan capability, expected decision, expected HTTP)
```

Policy 함수는 boolean만 반환하지 않고 `allowed | hidden | forbidden | plan_required`와 stable code를 반환하도록 권장한다.
