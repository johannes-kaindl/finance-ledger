# Troubleshooting

Each entry starts with what you see — the wording is the plugin's own English text — then the cause and what to do. If yours is not here, see [Getting help](#getting-help).

## The views ask for a finance folder

> Configure your finance project folder in the Finance Ledger settings.

**Cause:** **Finance project folder** is empty.

**Fix:** open **Settings → Finance Ledger** and enter the vault-relative folder that holds your journal and notes.

## Could not find journal.ledger

> Could not find journal.ledger: Finance/Ledger/journal.ledger

**Cause:** the journal does not exist at that path. Either it was never built, or **Finance project folder**, **Ledger subfolder** or **Journal file** under **Advanced paths** point somewhere else.

**Fix:** run **Rebuild journal from CSVs (built-in)** from the command palette, and compare the path in the message with your folders.

## No CSVs found

> No CSVs found in Finance/Umsätze.

**Cause:** the **Statements subfolder** is empty or named differently.

**Fix:** copy the bank exports into that folder, or change the setting.

## The rebuild fails

> Rebuild failed: …

**Cause:** the text after the colon names the reason. The messages come from the configuration checks and are in German:

| Message | Meaning |
|---|---|
| `konten.yaml ist fehlerhaft:` followed by a list | An entry in `konten.yaml` is incomplete or malformed; each bullet names the problem. |
| `konten.yaml enthält kein einziges Konto.` | The file exists but has no entries under `konten:`. |

**Fix:** correct the file named in the message and run the command again. The command is safe to repeat: a second run leaves account notes byte-identical.

> 2 rule note(s) skipped — a required field is empty: …

**Cause:** a note in the categorizer-rules folder lacks a pattern or a ledger account. The other rules still apply.

**Fix:** fill the field in the named note.

## Balances are wrong or show a warning

> Note: opening balances in opening_balances.ledger are missing — balances show only transaction movement, NOT the real bank balance. Set anfangssaldo_eur + anfangssaldo_stand_am in the account notes.

**Cause:** no account note carries an opening balance.

**Fix:** set `anfangssaldo_eur` and `anfangssaldo_stand_am` in the account note's frontmatter and rebuild the journal. A single account shows *Opening balance TBC for …* until you do this for that account.

> Journal issues — 1 unbalanced transaction. Some figures may be wrong; check the journal.

**Cause:** the journal contains lines the plugin ignored, transactions that do not sum to zero or suspicious amounts.

**Fix:** open `journal.ledger`, find the transaction and correct the source CSV or rule.

## The classify dialog complains

> Pattern and ledger account are required fields.

**Fix:** fill both **Pattern** and **Ledger account** before **Save rule**.

> Rule saved — conflicts: …

**Cause:** the new pattern also matches an existing rule. The rule was saved anyway.

**Fix:** open the conflicting rule note and narrow one of the patterns.

## CSV import and re-import

> Accounts could not be loaded: Account configuration not found: …

**Cause:** the import dialog reads the account list from `konten.yaml` in your vault, and the file is not at the configured path.

**Fix:** put a `konten.yaml` under your finance folder (setting: **Accounts file**) or point the setting at the file you already have. No Python and no importer checkout are needed for this — the dialog runs entirely inside the plugin.

> Preview failed for <file>: Header unknown / unexpected columns

**Cause:** the file is not one of the two supported exports. The preview reads the file itself, so a wrong column layout shows up here rather than at import time.

**Fix:** export again as **Excel (CSV-CAMT V8)** for a checking account, or use the Visa transaction CSV. If you picked the right file but the wrong account in the dropdown, the preview says so as a warning — the account decides which parser runs.

> Re-import failed

**Cause:** the import ended with an error. The **TBC triage** tab shows the message.

**Fix:** read the message and press **Try again**. **Copy terminal command** gives you the full importer command, including the `FINANCE_VAULT` variables — useful for the reports (see below), not needed for the import itself.

## Reports and dimension notes are missing

**Cause:** monthly, quarterly and yearly reports plus the category, payee, transaction-type and mandate notes do not come from the plugin. It writes the journal, the chart of accounts, the opening balances and the account and contract notes; the rest is produced by the companion Python importer.

**Fix:** press **Copy terminal command** in the import-error dialog or the TBC triage tab and run it in a terminal. The command already contains the report flags and the vault variables. Set **Importer repo path** first so the command points at your checkout.

## Snapshots before a rule is written

Each time you save a categorizer rule, the plugin first stores the previous state of the rule folder as a JSON file under `<finance folder>/.fl-snapshots/`.

Retention follows grandfather-father-son: the six newest of today, plus the oldest snapshot of each of the last seven days, four weeks and six months — at most 23 files. Files whose names do not carry a timestamp are never deleted.

To go back to an earlier state, open the snapshot file: it lists every rule note with its full text at the time of the snapshot.

## Getting help

Open an issue at [github.com/johannes-kaindl/finance-ledger/issues](https://github.com/johannes-kaindl/finance-ledger/issues). Include the exact message, the Obsidian version and — if it is about a number — the relevant lines of `journal.ledger` with account names and amounts anonymised.
