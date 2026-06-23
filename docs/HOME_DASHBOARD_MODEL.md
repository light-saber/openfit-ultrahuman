# Modello informativo della home

La home non è un catalogo di metriche. Deve rispondere, in ordine, a quattro domande:

1. **Come sta andando il giorno selezionato?**
2. **Cosa è diverso dal mio solito o dal mio obiettivo?**
3. **Quali dati spiegano il quadro?**
4. **Dove trovo il dettaglio senza perdere il contesto?**

Pulseboard non genera un punteggio composito proprietario. Ogni sintesi deve essere riconducibile a una misura, a un obiettivo esplicito o a una baseline personale visibile.

## Gerarchia delle metriche

| Ruolo | Metriche | Motivo |
|---|---|---|
| Hero | passi rispetto all'obiettivo, durata sonno rispetto all'obiettivo, battito a riposo rispetto alla media personale | sono comprensibili, confrontabili e disponibili con continuità |
| Diagnostiche | distribuzione oraria dei passi, trend 14 giorni di passi/sonno/RHR, fasi del sonno, attività recenti | spiegano quando e perché il dato si è mosso |
| Segnali personali | HRV, SpO₂, respirazione e temperatura cutanea | acquistano significato soprattutto rispetto alla baseline dello stesso utente |
| Contesto secondario | peso, grasso corporeo, acqua e calorie registrate | sono utili nel tempo o dipendono dalla completezza del diario; non definiscono da soli la giornata |
| Dettaglio/alert | FC intraday, ECG, glicemia, ritmo irregolare, VO₂ max | richiedono timestamp, contesto o cautela interpretativa; emergono in home solo quando esiste un alert esplicito |
| Operativo | dispositivo, batteria, sincronizzazione ed errori | indicano affidabilità e disponibilità, non benessere |

## Contratto dei grafici

| Sezione | Domanda | Forma | Dati e benchmark | Palette |
|---|---|---|---|---|
| Movimento giornaliero | Quando mi sono mosso? | colonne orarie interattive | 24 bucket, valore esatto in hover/focus | activity, singola radice |
| Sonno | Quanto e come ho dormito? | durata + anello score/efficienza + barra stacked | obiettivo personale, fasi sul periodo registrato | sleep, scala monocromatica |
| Passi 14 giorni | Il volume di movimento sta cambiando? | colonne giornaliere | 14 giorni, linea obiettivo quando disponibile | activity |
| Sonno 14 giorni | La durata è consistente? | colonne giornaliere | 14 notti, linea obiettivo | sleep |
| RHR 14 giorni | Il battito a riposo si discosta dal mio solito? | linea | media personale dei 7 giorni precedenti | heart |
| Segnali notturni | Cosa è cambiato rispetto a me? | scorecard, non grafico se c'è una sola osservazione | media personale quando esistono almeno 3 giorni precedenti | recovery |

Il colore identifica una categoria e non uno stato clinico. Testo, icona, forma e unità devono mantenere il significato anche senza colore.

## Regole di interpretazione

- I goal configurati dall'utente hanno precedenza su soglie generiche. `10.000 passi` non viene trattato come soglia medica universale.
- HRV, RHR, respirazione, SpO₂ e temperatura sono confrontati prima di tutto con la baseline personale.
- Una singola lettura notturna viene descritta, non diagnosticata.
- La temperatura cutanea è uno scostamento dalla baseline del dispositivo, non una temperatura corporea.
- Le fasi del sonno sono stime da movimento e frequenza cardiaca; durata e andamento restano il contesto principale.
- Peso e grasso corporeo vanno letti come trend. La bioimpedenza è una stima sensibile alle condizioni della misurazione.
- Acqua e calorie in ingresso sono etichettate come “registrate”: l'assenza di log non equivale a zero.
- `successCount / endpointCount` descrive letture API completate, non completezza clinica dei dati.

## Fonti di riferimento

- [Fitbit: metriche di salute e range personali](https://support.google.com/fitbit/answer/14236917?hl=en)
- [Fitbit: frequenza cardiaca e HRV](https://support.google.com/fitbit/answer/14237938?hl=en)
- [Fitbit: punteggio del sonno](https://support.google.com/fitbit/answer/14236513?hl=en)
- [Fitbit: stima delle fasi del sonno](https://support.google.com/fitbit/answer/14236712?hl=en-CA)
- [Fitbit: minuti in zona attiva](https://support.google.com/fitbit/answer/14236509?hl=it)
- [Fitbit: temperatura cutanea e baseline](https://support.google.com/fitbit/answer/14237207?hl=en)
- [CDC: durata del sonno](https://www.cdc.gov/sleep/about/)
- [WHO: attività fisica](https://www.who.int/health-topics/noncommunicable-diseases/physical-activity)
