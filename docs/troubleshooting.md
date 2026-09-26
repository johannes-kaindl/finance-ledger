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

## CSV import and re-import (desktop only)

> CSV import is available on desktop only.

**Cause:** the import dialog and the Python re-import need a subprocess, which mobile does not have. **Rebuild journal from CSVs (built-in)** works on mobile.

> Importer folder not found: … — check the "Importer repo path" setting.

> Path not found or does not contain pyproject.toml: …

**Cause:** the optional re-import needs a checkout of the companion Python importer, and **Importer repo path** does not point to one.

**Fix:** set the path to the folder that contains `pyproject.toml`. You do not need the importer for the built-in rebuild.

> Could not find uv binary: …

**Fix:** enter the absolute path under **Path to uv binary**, or leave it empty to search `PATH` and the usual install folders.

> Re-import failed

**Cause:** the importer ended with an error. The **TBC triage** tab shows its output.

**Fix:** read the output, press **Try again**, or use **Copy terminal command** and run it in a terminal to see the full trace.

## Getting help

Open an issue at [github.com/johannes-kaindl/finance-ledger/issues](https://github.com/johannes-kaindl/finance-ledger/issues). Include the exact message, the Obsidian version and — if it is about a number — the relevant lines of `journal.ledger` with account names and amounts anonymised.
