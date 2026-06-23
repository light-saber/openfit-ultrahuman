# Release desktop

## Stato del pacchetto locale

`npm run dist` produce DMG e ZIP macOS pronti per test locale. Se non è installata un’identità **Developer ID Application**, electron-builder genera intenzionalmente un artefatto non firmato: è adatto a sviluppo e uso personale, non alla distribuzione pubblica.

## Checklist macOS pubblica

1. Iscriversi all’Apple Developer Program e installare un certificato Developer ID Application nel Keychain della macchina CI.
2. Configurare electron-builder/CI con il certificato e la password tramite secret, mai nel repository.
3. Configurare la notarizzazione Apple con credenziali App Store Connect conservate nei secret CI.
4. Eseguire `npm run check`, `npm audit --omit=dev` e `npm run dist` su un runner macOS pulito.
5. Verificare firma, hardened runtime, notarizzazione e Gatekeeper sul DMG finale.
6. Pubblicare checksum SHA-256 e conservare gli artefatti di build immutabili.

## Altre piattaforme

- Windows: firmare l’installer NSIS con un certificato code-signing e validare SmartScreen.
- Linux: pubblicare AppImage/DEB con checksum e, se distribuiti tramite repository, firmare il repository.

La firma del codice non può essere simulata nel sorgente: richiede identità e credenziali appartenenti al distributore.
