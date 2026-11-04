# Android pilot releases

Production APK files are uploaded to this directory on the VPS and are not
committed to Git.

Use these stable filenames so the landing-page download links do not change:

- `move-apayao-passenger.apk`
- `move-apayao-driver.apk`

Keep `STORES_LIVE=false` for direct pilot APK downloads. Enable it only when
the links lead to published store listings. Set `RELEASE_DOWNLOADS_DIR` to the
shared absolute VPS download directory so changing source releases preserves
the APKs. Verify package IDs, signing certificates and public SHA-256 hashes
before atomically replacing the stable filenames; retain the previous files
in protected server backup storage.
