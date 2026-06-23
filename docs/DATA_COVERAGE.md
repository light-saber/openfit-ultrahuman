# Copertura dati

## Google Health API v4

| Dominio | Dati letti | Vista |
|---|---|---|
| Account | identità, profilo, timezone, data iscrizione | header / impostazioni |
| Dispositivo | modello, tipo, batteria, ultimo sync, feature hardware | Dispositivi |
| Attività | passi, distanza, piani, calorie, minuti attivi, sedentari, Active Zone Minutes | Oggi / Attività |
| Intraday | passi e battito dettagliati | Oggi / Attività / Salute |
| Allenamenti | tipo, durata, distanza, calorie, FC media, zone | Attività |
| Cuore | frequenza, resting HR, HRV, zone, ECG dove supportato | Salute |
| Respirazione | frequenza respiratoria notturna | Salute |
| Ossigeno | SpO₂ giornaliera e campioni supportati | Salute |
| Temperatura | derivazioni cutanee notturne e temperatura corporea | Salute |
| Ritmo irregolare | profilo IRN e notifiche | Salute / export |
| Metabolico | glicemia registrata | Salute / export |
| Cardio fitness | VO₂ max giornaliero e da corsa | Salute |
| Sonno | sessioni, fasi, riepilogo ed efficienza | Sonno |
| Corpo | peso e percentuale di grasso | Corpo |
| Nutrizione | calorie registrate e idratazione | Corpo |

La sync Google esegue letture indipendenti e conserva nel JSON esportato anche payload utili non ancora visualizzati in una vista dedicata. L’interfaccia mostra soltanto metriche effettivamente presenti e adatta automaticamente la navigazione.

## Fitbit Air

Fitbit Air supporta, in funzione di disponibilità regionale e account: frequenza cardiaca 24/7, passi, calorie, distanza, Active Zone Minutes, sonno e fasi, SpO₂, HRV, frequenza respiratoria, temperatura cutanea, resting HR e notifiche di ritmo irregolare. Non produce un ECG on-demand: la relativa sezione non viene mostrata se il dato non è disponibile.

## Limiti non aggirabili

- I dati appaiono solo dopo la sincronizzazione con l’app mobile; non esiste streaming BLE pubblico verso app desktop.
- Readiness Score, Cardio Load, Sleep Score, Stress Score e coaching proprietario non sono tutti esposti come valori Google/Fitbit. Pulseboard mostra misure di base e insight locali, non finge di replicare punteggi non disponibili.
- La posizione GPS viene richiesta soltanto per arricchire allenamenti compatibili; non è ancora renderizzata su mappa.
- Disponibilità e granularità dipendono da modello, regione, firmware, piano e consenso OAuth.

Fonti: [accesso di terze parti e disponibilità](https://developers.google.com/health/data-types), [endpoint](https://developers.google.com/health/endpoints), [paired devices](https://developers.google.com/health/reference/rest/v4/users.pairedDevices).
