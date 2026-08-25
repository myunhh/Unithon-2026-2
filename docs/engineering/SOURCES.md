# 조사 자료

확인일: 2026-08-26

## 내부 자료

- 업로드된 UNITHON 사업계획서
  - 제품 정의·문제·장점: p.4-7
  - 구현 범위·핵심 기술: p.8
  - 사업화 단계: p.11-15
  - Desktop/Cloud plan 방향: p.13
- GitHub: `https://github.com/myunhh/Unithon-2026-2`
- 조사 파일: `package.json`, `REPORT.md`, `DESIGN.md`, `TASKS.md`, `docs/IMPLEMENTATION_PLAN.md`, `server/**`, `src/pages/**`, `src/domain/**`, `electron/**`

## 공식 자료

- Electron Security: https://www.electronjs.org/docs/latest/tutorial/security
- Electron Code Signing: https://www.electronjs.org/docs/latest/tutorial/code-signing
- Electron Updates: https://www.electronjs.org/docs/latest/tutorial/updates
- Electron Forge macOS signing: https://www.electronforge.io/guides/code-signing/code-signing-macos
- Electron Forge DMG: https://www.electronforge.io/config/makers/dmg
- Electron Forge ZIP: https://www.electronforge.io/config/makers/zip
- Electron Forge Fuses: https://www.electronforge.io/config/plugins/fuses
- Apple Notarization: https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution
- Apple Developer ID: https://developer.apple.com/developer-id/
- GitHub Actions code signing: https://docs.github.com/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access: https://supabase.com/docs/guides/storage/security/access-control
- Supabase Queues: https://supabase.com/docs/guides/queues
- RFC 8252 Native Apps: https://www.rfc-editor.org/info/rfc8252/
- RFC 7636 PKCE: https://www.rfc-editor.org/info/rfc7636/
- RFC 9457 Problem Details: https://www.rfc-editor.org/info/rfc9457/

## 한계

Container DNS로 실제 clone/build/test/push는 못 했다. 공개 Raw source와 저장소 자체 보고서로 정적 감사했다. SQL/OpenAPI는 staging 적용·검증이 필요한 설계 초안이다.
