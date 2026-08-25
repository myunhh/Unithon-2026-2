# Container SBOM command specification

This file specifies the release-pipeline commands; it is not an image build,
registry, or publishing workflow. The commands are intentionally not executed
by the repository contract check. `IMAGE_REF` must be an immutable image
reference supplied by the authorized pipeline, and `SBOM_FILE` is a temporary
pipeline workspace path.

```sh
case "${IMAGE_REF:?IMAGE_REF is required}" in
  *@sha256:*) ;;
  *) echo "IMAGE_REF must include an immutable digest" >&2; exit 2 ;;
esac

syft "$IMAGE_REF" --output "cyclonedx-json=${SBOM_FILE:?SBOM_FILE is required}"
test -s "$SBOM_FILE"
jq -e '.bomFormat == "CycloneDX" and (.components | length > 0)' "$SBOM_FILE" >/dev/null
grype "sbom:$SBOM_FILE" --fail-on high --only-fixed=false
```

The pipeline must retain the generated file and scanner result with the
commit/build provenance. No credential, private key, PDF, prompt, or provider
response belongs in this specification or in an SBOM command's output log.
