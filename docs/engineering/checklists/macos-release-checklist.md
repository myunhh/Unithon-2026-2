# macOS release checklist

## Before build

- [ ] version/tag/changelog
- [ ] contract/API compatibility
- [ ] supported macOS/architecture matrix
- [ ] main CI green, clean lockfile
- [ ] signing certificate/API key expiry 확인

## Build/sign/notarize

- [ ] arm64 DMG+ZIP
- [ ] x64 DMG+ZIP
- [ ] hardened runtime/entitlements 최소화
- [ ] Fuses 적용 검증
- [ ] Developer ID codesign
- [ ] Apple notarization success
- [ ] staple app/DMG as configured

## Verify

- [ ] `codesign --verify --deep --strict`
- [ ] `spctl --assess --type execute`
- [ ] `xcrun stapler validate`
- [ ] `hdiutil verify`
- [ ] SHA-256/SBOM
- [ ] clean macOS quarantine install
- [ ] login/upload/read/select/remote run/local run/cancel
- [ ] provider absent/unauthenticated
- [ ] update from previous stable/beta
- [ ] logout/Keychain cleanup

## Publish/rollback

- [ ] release notes/privacy/provider disclosure
- [ ] beta staged rollout
- [ ] update metadata signature/URL
- [ ] previous signed artifact retained
- [ ] kill switch/rollback owner
