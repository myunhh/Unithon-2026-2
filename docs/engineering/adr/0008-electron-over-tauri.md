# ADR-0008: MVP Desktop은 Electron을 유지한다

- 상태: Proposed/Accepted pending team sign-off
- 날짜: 2026-08-26

## Context

현재 프로젝트는 React/Vite UI, Electron main/preload, local CLI 탐지·실행·취소 자산을 이미 보유한다. 저장소 분리와 signed macOS 배포가 우선이며, Tauri 전환은 process bridge·updater·보안·QA를 동시에 재작성한다.

## Decision

MVP~Stable 1차 배포는 Electron을 유지하고 backend source import를 제거한다. React renderer와 typed preload/local bridge/local CLI adapter는 frontend repo가 소유한다. Tauri는 실제 bundle/memory 지표와 Rust owner가 확보된 뒤 P2 spike로 재평가한다.

## Consequences

- 출시 속도와 기존 테스트 재사용성이 높다.
- bundle size와 idle memory는 Tauri보다 불리할 수 있다.
- signing/notarization/updater와 Electron security hardening이 release gate가 된다.
