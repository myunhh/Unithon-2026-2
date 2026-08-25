# 20. 로컬 Codex 적용·GitHub Push Runbook

## 현재 제공 파일

- ZIP: 전체 설계·스키마·TODO·agent prompt·스크립트.
- patch: 원본 저장소에 `AGENTS.md`와 `docs/engineering/**`를 한 commit으로 추가.
- `scripts/apply-docs.sh`: patch 대신 파일 복사.
- `scripts/prepare-push.sh`: 안전한 branch/commit 준비; 기본은 push하지 않음.

## A. 가장 빠른 방법 — patch 적용 후 push

```bash
cd ~/path/to/Unithon-2026-2

git status --short
git switch master
git pull --ff-only

git switch -c docs/frontend-backend-split-spec
git am ~/Downloads/paperbridge-docs.patch

./docs/engineering/scripts/verify-docs.sh
npm run typecheck
npm test

git status --short
git log -1 --stat
git push -u origin docs/frontend-backend-split-spec
```

`git am`이 conflict 나면:

```bash
git am --abort
/path/to/PaperBridge-engineering-plan/scripts/apply-docs.sh "$PWD"
git add AGENTS.md docs/engineering
git commit -m "docs: add PaperBridge split architecture specifications"
```

## B. 안전 스크립트

```bash
unzip PaperBridge-engineering-plan.zip
cd PaperBridge-engineering-plan
./scripts/prepare-push.sh /path/to/Unithon-2026-2
```

이 명령은 branch와 commit까지만 만든다. 실제 push는 출력된 diff/log를 검토한 후:

```bash
cd /path/to/Unithon-2026-2
git push -u origin docs/frontend-backend-split-spec
```

명시적으로 `--push`를 줄 때만 스크립트가 push한다.

## GitHub 인증 확인

```bash
gh auth status
git remote -v
git ls-remote --heads origin
```

HTTPS credential 또는 SSH key가 준비되지 않았으면 `gh auth login`으로 로그인한다. 조직/저장소 write 권한과 branch protection을 확인한다.

## 로컬 Codex 설치·확인

```bash
npm install -g @openai/codex
codex --version
codex login
```

이미 `ready`라면 설치/로그인은 건너뛴다. repo root에서 `AGENTS.md`가 읽히는지 확인한다.

## Coordinator 실행

```bash
cd /path/to/Unithon-2026-2
codex exec --sandbox workspace-write - < docs/engineering/prompts/00_coordinator.md
```

목표는 즉시 구현이 아니라 현재 checkout 검증, docs와 실제 코드 차이 목록, FE/BE issue graph, 안전한 첫 PR을 만드는 것이다.

## Frontend Agent

분리 repo를 만든 뒤:

```bash
cd /path/to/paperbridge-frontend
codex exec --sandbox workspace-write - < docs/engineering/prompts/10_frontend_agent.md
```

첫 작업은 FE-001~008이며, backend source 제거와 generated contract/mock 기반을 넘어서 unrelated feature를 한꺼번에 구현하지 않는다.

## Backend Agent

```bash
cd /path/to/paperbridge-backend
codex exec --sandbox workspace-write - < docs/engineering/prompts/20_backend_agent.md
```

첫 작업은 BE-001~012와 C-001 계약 baseline이다. 실제 production migration/apply/push는 사람이 승인한다.

## Integration Reviewer

```bash
cd /path/to/integration-workspace
codex exec --sandbox workspace-write - < /path/to/docs/engineering/prompts/30_integration_reviewer.md
```

두 repo 경로와 staging contract version을 prompt 상단에 채운다.

## 두 저장소 생성

문서 PR이 merge된 후 원본에서:

```bash
/path/to/PaperBridge-engineering-plan/scripts/split-history.sh \
  /path/to/Unithon-2026-2 \
  /path/to/paperbridge-split-output
```

생성된 디렉터리를 검토한 뒤 GitHub 빈 repo를 만든다.

```bash
gh repo create myunhh/paperbridge-frontend --private
gh repo create myunhh/paperbridge-backend --private

cd /path/to/paperbridge-split-output/paperbridge-frontend
git remote add origin git@github.com:myunhh/paperbridge-frontend.git
git push -u origin --all
git push origin --tags

cd ../paperbridge-backend
git remote add origin git@github.com:myunhh/paperbridge-backend.git
git push -u origin --all
git push origin --tags
```

저장소 공개 여부는 사업/보안 정책에 맞춰 결정한다. push 전에 전체 history secret scan을 반드시 한다.

## Codex에게 전달할 “한 번에 너무 많이 하지 않는” 명령

```text
AGENTS.md와 docs/engineering을 먼저 읽어라.
현재 코드와 문서의 차이를 검증하고, 사실과 가정을 분리하라.
이번 실행에서는 [ID]만 수행하라.
OpenAPI/JSON Schema/DB migration을 임의로 바꾸지 마라.
변경 전에 git status와 baseline test를 기록하라.
변경 후 실제 실행한 명령과 결과, 미실행 항목, 위험, rollback을 보고하라.
remote push, production migration, release publish는 실행하지 마라.
```

## 첫 주 권장 순서

1. docs PR push/merge.
2. split-base tag와 baseline test.
3. 두 repo history split 및 secret scan.
4. Backend C-001 OpenAPI baseline/compat adapter.
5. Frontend generated client/MSW.
6. Electron backend import 제거 설계/테스트.
7. normalized DB expand migration은 그 다음 PR부터.

## Push 전 최종 확인

```bash
git diff --check
git status --short
./docs/engineering/scripts/verify-docs.sh
npm run typecheck
npm test
npm run lint
npm run build
```

원본 프로젝트에 현재 없는 script가 있으면 실제 `package.json`에 존재하는 명령만 실행하고, 미실행 사유를 commit/PR에 기록한다.
