# Security review checklist

- [ ] Trust boundary와 새 권한이 문서화되어 있다.
- [ ] 다른 user/workspace의 positive/negative authorization test가 있다.
- [ ] RLS policy와 API policy가 서로 우회되지 않는다.
- [ ] request/response/event/multipart runtime validation과 size limit이 있다.
- [ ] secret, cookie, PDF, prompt, output, signed URL, 절대 경로가 log에 없다.
- [ ] provider key는 encrypted-at-rest이고 response에서 write-only다.
- [ ] PDF/parser 또는 external output을 비신뢰 입력으로 처리한다.
- [ ] SSRF, arbitrary URL, shell interpolation, path traversal이 차단된다.
- [ ] Electron IPC sender/schema, navigation, loopback Host/Origin/nonce를 검증한다.
- [ ] budget reservation, run terminal, cancel race의 불변식 test가 있다.
- [ ] dependency/SBOM/vulnerability 결과와 예외 만료일이 있다.
- [ ] rollout, kill switch, rollback, incident owner가 있다.
