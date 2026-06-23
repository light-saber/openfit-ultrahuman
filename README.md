# Pulseboard

Pulseboard è un client desktop Electron in dark mode per i dati di Google Fitbit Air e degli altri dispositivi Fitbit. L’interfaccia è adattiva e a divulgazione progressiva: mette in primo piano poche informazioni utili e mostra viste, metriche e navigazione soltanto quando Google Health restituisce dati reali.

Il renderer usa React, shadcn/Radix, Tailwind CSS v4, assistant-ui, Inter Variable, JetBrains Mono e le icone ufficiali Nucleo Essential Outline.

> Stato del progetto: implementazione completa e buildabile. La modalità demo funziona subito; per i dati personali serve configurare un client OAuth nel proprio progetto Google Cloud.

## La connessione reale con Fitbit Air

Fitbit Air **non espone una sincronizzazione Bluetooth pubblica** alle app di terze parti. Il percorso supportato è:

```text
Fitbit Air → Bluetooth → app Google Health/Fitbit sul telefono
                         ↓ sincronizzazione cloud
                 Google Health API → Pulseboard
```

Pulseboard usa quindi la nuova **Google Health API v4** come provider predefinito. Il vecchio Fitbit Web API rimane disponibile solo come adapter di transizione: Google ne prevede la dismissione a settembre 2026.

L’app desktop può sostituire l’esperienza di consultazione e analisi, ma non il primo pairing hardware, gli aggiornamenti firmware o la sincronizzazione telefono-braccialetto.

## Avvio rapido

Requisiti: Node.js 22+ e npm 10+. Per la chat laterale servono anche Codex Desktop installato e un account Codex già collegato; Pulseboard riusa il login locale senza richiedere una API key.

```bash
npm install
npm run dev
```

Comandi utili:

```bash
npm run build       # type-check + bundle renderer
npm test            # test normalizzatori e adapter
npm run capture:ui  # QA visuale desktop/mobile tramite Chromium Electron
npm run dist        # pacchetti macOS, Windows o Linux
```

Il pacchetto locale generato in `release/` non è firmato se nel Keychain non è presente un certificato Apple Developer ID. Per una distribuzione pubblica segui la [checklist release](docs/RELEASE.md).

## Collegare Google Health

1. Abilita **Google Health API** nel tuo progetto Google Cloud.
2. Crea un OAuth Client ID di tipo **Web application**.
3. Registra esattamente questo redirect URI:

   ```text
   http://127.0.0.1:42813/oauth/callback
   ```

4. Aggiungi il tuo account Google fra i test user.
5. Aggiungi gli scope Google Health in sola lettura elencati in [docs/GOOGLE_HEALTH_SETUP.md](docs/GOOGLE_HEALTH_SETUP.md).
6. In Pulseboard scegli **Collega Fitbit**, incolla Client ID e Client Secret, poi completa il consenso nel browser di sistema.

Client Secret, token e cache salute sono gestiti nel processo main e cifrati con `safeStorage` (Keychain su macOS, Credential Manager su Windows, secret store disponibile su Linux). Nulla viene inserito nel renderer o nel repository.

## Struttura

```text
electron/
  main.cjs                    shell, OAuth loopback, IPC, storage cifrato
  preload.cjs                 bridge IPC minimale e tipizzato
  codex-service.cjs           client Codex app-server JSONL in sola lettura
  google-health-service.cjs   provider Google Health API v4
  fitbit-legacy-service.cjs   provider Fitbit Web API legacy + PKCE
src/
  components/                 viste, grafici e chat assistant-ui
  data/                       demo e normalizzazione provider-agnostic
  lib/                        formattazione e utility pure
  App.tsx                     orchestrazione UI e stato connessione
  types.ts                    contratti condivisi renderer/preload
scripts/
  capture-ui.cjs              smoke test visuale Electron
docs/
  ARCHITECTURE.md             decisioni e confini del sistema
  DATA_COVERAGE.md            copertura dati e limiti
  GOOGLE_HEALTH_SETUP.md      setup OAuth dettagliato
  RELEASE.md                  firma, notarizzazione e rilascio
```

L’architettura e le scelte di sicurezza sono descritte in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Principi dell’interfaccia

- una metrica primaria per schermata e dettagli secondari in ordine di importanza;
- nessuna card vuota: le sezioni non disponibili restano nascoste;
- un solo colore d’accento per stato, progresso e azioni;
- campioni intraday aggregati per mantenere grafici fluidi senza alterare minimo, massimo o valore più recente;
- componenti accessibili shadcn/Radix e layout responsive senza overflow orizzontale.

## Health assistant

Il pulsante chat nella top bar apre un pannello destro basato sui primitive di assistant-ui. Le risposte AI sono testo libero, senza bubble. Il bridge usa `codex app-server`, la stessa interfaccia locale dei client Codex, con sandbox read-only, approvazioni disabilitate e tool negati per default.

Quando invii un messaggio, Pulseboard prepara un contesto compatto con metriche normalizzate, date disponibili e dettaglio del giorno selezionato. Non include credenziali OAuth o file cifrati. Quel contesto viene inviato a Codex/OpenAI per generare la risposta; non viene inviato finché non usi la chat. Codex può anche aprire una vista o una data di Pulseboard, ma non può modificare i dati health.

## Fonti ufficiali

- [Google Health API: migrazione da Fitbit Web API](https://developers.google.com/health/migration)
- [Google Health API: tipi di dati](https://developers.google.com/health/data-types)
- [Google Health API: OAuth e Google Cloud](https://developers.google.com/health/setup)
- [Google Health API: endpoint](https://developers.google.com/health/endpoints)
- [Fitbit OAuth 2.0 + PKCE](https://dev.fitbit.com/build/reference/web-api/developer-guide/authorization/)

Icone: Nucleo Essential Outline © Nucleo, usate secondo i [termini Nucleo](https://nucleoapp.com/license/).

I dati mostrati non costituiscono diagnosi o consiglio medico.
