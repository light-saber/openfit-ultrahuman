# Guida completa: collegare Pulseboard a Google Health

Questa guida ripercorre, passo per passo, la configurazione eseguita per collegare Pulseboard ai dati di Fitbit tramite Google Health API. È aggiornata al 22 giugno 2026.

## Prima di iniziare

Servono:

- l’account Google utilizzato nell’app Fitbit;
- accesso a [Google Cloud Console](https://console.cloud.google.com/);
- Pulseboard avviato con `npm run dev` oppure tramite l’app desktop;
- Fitbit Air già associato e sincronizzato con l’app Fitbit sul telefono.

Il flusso dei dati è:

```text
Fitbit Air → app Fitbit sul telefono → Google Health API → Pulseboard
```

Pulseboard non effettua il primo pairing Bluetooth e non sostituisce la sincronizzazione tra il braccialetto e il telefono.

## 1. Creare un progetto Google Cloud

1. Apri [Crea progetto Google Cloud](https://console.cloud.google.com/projectcreate).
2. In **Nome progetto** inserisci `Pulseboard`.
3. Per un account personale lascia **Organizzazione** su `Nessuna organizzazione`.
4. Premi **Crea**.
5. Attendi il completamento e seleziona `Pulseboard` dal selettore dei progetti nella barra superiore.

Da questo momento verifica sempre che il progetto selezionato sia **Pulseboard**. API, consenso OAuth e client devono appartenere allo stesso progetto.

## 2. Abilitare Google Health API

1. Con il progetto Pulseboard selezionato, apri [Google Health API](https://console.cloud.google.com/apis/library/health.googleapis.com).
2. Premi **Abilita**.
3. Attendi finché compare **API abilitata** oppure il pulsante **Gestisci**.

Se compare già **Gestisci**, l’API è abilitata e puoi continuare.

## 3. Configurare Google Auth Platform

1. Apri [Google Auth Platform → Panoramica](https://console.cloud.google.com/auth/overview).
2. Controlla nuovamente che il progetto sia Pulseboard.
3. Premi **Inizia**.
4. Nelle informazioni dell’app inserisci:
   - **Nome applicazione:** `Pulseboard`;
   - **Email assistenza utenti:** il tuo indirizzo Google.
5. Come pubblico scegli **Esterno**.
6. In **Informazioni di contatto** inserisci la tua email.
7. Accetta la policy sui dati utente e completa il wizard con **Continua** o **Crea**.

### Perché scegliere “Esterno”

`Interno` è riservato agli utenti della stessa organizzazione Google Workspace. `Esterno` consente di autorizzare un normale account Google personale. Durante lo sviluppo l’app resta in modalità Testing e può essere usata soltanto dagli utenti di test aggiunti manualmente.

## 4. Aggiungere l’account Fitbit come utente di test

1. Apri [Google Auth Platform → Pubblico](https://console.cloud.google.com/auth/audience).
2. Nella sezione **Utenti di test** premi **Aggiungi utenti**.
3. Inserisci l’indirizzo Google utilizzato nell’app Fitbit.
4. Premi **Salva**.
5. Verifica che l’indirizzo compaia nell’elenco.

L’account scelto nel browser durante il collegamento deve essere lo stesso presente in questo elenco.

## 5. Abilitare gli scope in sola lettura

1. Apri [Google Auth Platform → Accesso ai dati](https://console.cloud.google.com/auth/scopes).
2. Premi **Aggiungi o rimuovi ambiti**.
3. Cerca `Google Health API`.
4. Seleziona gli scope di sola lettura riportati sotto.
5. Premi **Aggiorna**, quindi **Salva**.

```text
https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
https://www.googleapis.com/auth/googlehealth.ecg.readonly
https://www.googleapis.com/auth/googlehealth.irn.readonly
https://www.googleapis.com/auth/googlehealth.location.readonly
https://www.googleapis.com/auth/googlehealth.nutrition.readonly
https://www.googleapis.com/auth/googlehealth.profile.readonly
https://www.googleapis.com/auth/googlehealth.settings.readonly
https://www.googleapis.com/auth/googlehealth.sleep.readonly
```

Non selezionare gli scope di scrittura. Pulseboard richiede inoltre gli scope standard `openid` e `profile` per mostrare nome e avatar.

## 6. Creare il client OAuth

1. Apri [Google Auth Platform → Client](https://console.cloud.google.com/auth/clients).
2. Premi **Crea client**.
3. Come tipo di applicazione scegli **Applicazione web**.
4. Inserisci come nome `Pulseboard Desktop`.
5. Lascia vuote le **Origini JavaScript autorizzate**.
6. In **URI di reindirizzamento autorizzati** aggiungi esattamente:

   ```text
   http://127.0.0.1:42813/oauth/callback
   ```

7. Premi **Crea**.
8. Conserva il **Client ID** e il **Client Secret** mostrati da Google.

Non pubblicare, condividere o inserire queste credenziali nel repository. Client Secret, token e cache vengono salvati da Pulseboard tramite l’archivio cifrato del sistema operativo.

## 7. Perché la callback è locale

`127.0.0.1` identifica esclusivamente il computer sul quale è aperto Pulseboard. Non è un sito pubblico e non può essere raggiunto da Internet.

Durante il collegamento Pulseboard:

1. apre temporaneamente un server locale sulla porta `42813`;
2. apre il browser di sistema per il consenso Google;
3. riceve il codice OAuth sul percorso `/oauth/callback`;
4. verifica `state` e PKCE per proteggere la richiesta;
5. chiude il server locale al termine o dopo cinque minuti.

La callback deve corrispondere carattere per carattere a quella registrata su Google Cloud, inclusi protocollo, indirizzo IP, porta e percorso.

## 8. Collegare Pulseboard

1. Avvia Pulseboard:

   ```bash
   npm run dev
   ```

2. Premi **Collega Fitbit**.
3. Seleziona **Google Health**.
4. Incolla il Client ID.
5. Incolla il Client Secret.
6. Verifica che il Callback URL sia:

   ```text
   http://127.0.0.1:42813/oauth/callback
   ```

7. Premi **Salva e collega**.
8. Nel browser seleziona l’account Google aggiunto come utente di test.
9. Accetta gli accessi richiesti.
10. Dopo la conferma torna a Pulseboard: la prima sincronizzazione parte automaticamente.

## 9. Verifica finale

La configurazione è riuscita quando:

- Pulseboard mostra `Google Health` invece di `Modalità demo`;
- compare una data di ultima sincronizzazione;
- la pagina Dispositivi mostra Fitbit Air o il tracker associato;
- passi, frequenza cardiaca o sonno contengono dati reali;
- nella cartella dati dell’app credenziali e cache risultano cifrate tramite `safeStorage`.

La disponibilità delle singole metriche dipende dal dispositivo, dalla regione, dai consensi concessi e dalla sincronizzazione recente dell’app Fitbit.

## Risoluzione dei problemi

### Il pulsante “Salva e collega” è disabilitato

Controlla che:

- Client ID e Client Secret siano entrambi presenti;
- la callback inizi con `http://127.0.0.1:`;
- l’archivio sicuro del sistema operativo sia disponibile.

### `redirect_uri_mismatch`

Nel client OAuth registra esattamente:

```text
http://127.0.0.1:42813/oauth/callback
```

Non usare `localhost`, non omettere `/oauth/callback` e non aggiungere spazi o una barra finale.

### `Access blocked`, `access_denied` o utente non autorizzato

- Verifica che il pubblico sia **Esterno**.
- Aggiungi l’account Google corretto in **Pubblico → Utenti di test**.
- Durante il login seleziona lo stesso account usato nell’app Fitbit.

### `invalid_client`

- Ricopia Client ID e Client Secret dallo stesso client `Pulseboard Desktop`.
- Assicurati di non aver copiato spazi iniziali o finali.
- Non mescolare credenziali appartenenti a progetti differenti.

### Errore 403 o API non abilitata

Apri la pagina della Google Health API e verifica che compaia **Gestisci**. L’API deve essere abilitata nello stesso progetto che contiene il client OAuth.

### La porta 42813 è già in uso

Chiudi eventuali altre finestre o processi Pulseboard e riprova. Soltanto una procedura OAuth può usare quella porta alla volta.

### Il browser autorizza l’app ma Pulseboard non riceve la callback

- lascia Pulseboard aperto durante tutto il consenso;
- disattiva temporaneamente soltanto eventuali regole locali che bloccano `127.0.0.1`;
- verifica che VPN o proxy non intercettino gli indirizzi loopback;
- riprova senza modificare la callback.

### Mancano alcune metriche o sezioni

1. Apri l’app Fitbit sul telefono.
2. Attendi la sincronizzazione di Fitbit Air.
3. Torna a Pulseboard e premi **Sincronizza**.
4. Controlla nella pagina **Dati** la copertura effettiva delle sorgenti.

ECG, SpO₂, temperatura, HRV e notifiche di ritmo irregolare possono non essere disponibili per tutti i dispositivi, account o Paesi. Pulseboard nasconde automaticamente le sezioni senza dati.

### Il collegamento smette di funzionare dopo sette giorni

In modalità Google OAuth `Testing`, i refresh token scadono normalmente dopo sette giorni. Puoi ricollegare l’account oppure completare i requisiti Google per portare l’app in produzione.

## Checklist rapida

- [ ] Progetto `Pulseboard` creato e selezionato
- [ ] Google Health API abilitata
- [ ] Google Auth Platform configurata
- [ ] Pubblico impostato su `Esterno`
- [ ] Account Fitbit aggiunto come utente di test
- [ ] Scope Google Health `.readonly` aggiunti
- [ ] Client `Pulseboard Desktop` creato come applicazione web
- [ ] Callback locale registrata esattamente
- [ ] Client ID e Client Secret inseriti in Pulseboard
- [ ] Consenso completato con l’account corretto
- [ ] Prima sincronizzazione conclusa

## Riferimenti ufficiali

- [Google Health API: configurazione Cloud e OAuth](https://developers.google.com/health/setup)
- [Google Health API: scope](https://developers.google.com/health/scopes)
- [Google Health API: tipi di dati](https://developers.google.com/health/data-types)
- [Google OAuth per applicazioni web](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google OAuth per applicazioni desktop](https://developers.google.com/identity/protocols/oauth2/native-app)
