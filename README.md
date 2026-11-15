# RAPID·OBD — APK (Capacitor + Bluetooth Classic SPP)

1. **Podmień `www/index.html`** na swój oryginalny plik aplikacji (ten w repo to tylko placeholder).
2. Wypchnij na `main` (lub uruchom ręcznie: Actions → Build APK → Run workflow).
3. Pobierz `app-debug.apk` z Actions → ostatni przebieg → Artifacts.
4. Na telefonie sparuj ELM327 (PIN 1234 / 0000), uruchom aplikację → Logi → „SPP (CAPACITOR)".

Workflow sam uruchamia `tools/patch-index.py` (pulpit na 1 ekranie + poprawki SPP) —
możesz też uruchomić go lokalnie: `python3 tools/patch-index.py www/index.html`.
Skrypt jest idempotentny i przerwie build z komunikatem, jeśli index.html nie jest oryginałem.

Zmień `appId` w `capacitor.config.json` na własny.
