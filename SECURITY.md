# Security notes

## Dependency advisories

The Expo/Metro toolchain currently resolves `image-size@1.2.1`. The npm
advisories `GHSA-w3rx-r6r6-pgpr` and `GHSA-5p2g-fcmc-qvqq` mark versions through
2.0.2 vulnerable to infinite-loop denial of service in ICNS, HEIF, and JXL
parsers, while the registry does not yet publish the referenced 2.0.3 fix.

This repository applies the reproducible pnpm patch in
`patches/image-size@1.2.1.patch`. It rejects zero/undersized ISO boxes and
non-progressing ICNS/JXL entries. Regression probes confirmed those malformed
inputs terminate with errors. `pnpm audit --prod` will continue to report the
version number because registry auditing cannot detect local source patches.

The probe is automated in CI and can be run locally with `pnpm security:test`.

When an Expo-compatible patched release is available:

1. Upgrade Expo/Metro (or override `image-size`) to the patched release.
2. Remove the local patch through pnpm and regenerate `pnpm-lock.yaml`.
3. Run `pnpm audit --prod`, `pnpm test`, and `pnpm build`.

## Reporting

Do not open a public issue containing credentials, personal data, precise
driver/passenger locations, or an exploitable vulnerability. Report it to the
project owner through the private contact configured for the deployment.
