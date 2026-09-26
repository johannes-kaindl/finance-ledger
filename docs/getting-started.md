# Getting started

This walks you from an empty vault to your first balance overview. You need Obsidian 1.8.7 or newer, the plugin installed (see the [README](https://github.com/johannes-kaindl/finance-ledger/blob/main/README.md#install)) and one or more bank CSV exports. The built-in import reads the bank export **Excel (CSV-CAMT V8)** and Visa transaction CSVs.

## 1. Enable the plugin and choose the finance folder

Enable **Finance Ledger** under **Settings → Community plugins**. Then open **Settings → Finance Ledger** and set **Finance project folder** to a vault-relative folder, for example `Finance`. Until you do, every view says *Configure your finance project folder in the Finance Ledger settings.*

## 2. Describe your accounts

Create `konten.yaml` in the finance folder (the file name is the **Accounts file** setting). One entry per bank account:

```yaml
konten:
  - id: checking
    iban: GB00ACME00000001
    ledger_account: "Aktiva:Bank:Everyday Checking"
    bank: Acme Bank
    konto_typ: giro
    konto_rolle: checking
    csv_schema: camt52
    inhaber: Jane Doe
    filename: "Account 01 – Everyday Checking.md"
```

`csv_schema` is `camt52` for the CAMT export and `sparkasse_visa` for a Visa CSV.

## 3. Drop the CSVs in

Copy the exports into the **Statements subfolder** of the finance folder (`Umsätze` by default).

## 4. Rebuild the journal

Open the command palette and run **Rebuild journal from CSVs (built-in)**. You see *Rebuilding journal…*, then a summary such as *18 transactions from 3 CSV(s) — 0 duplicate(s) skipped, 12 to classify*, followed by *3 account/contract note(s) updated*. The plugin has now written `journal.ledger`, `accounts.ledger` and `opening_balances.ledger` under `Ledger/` and created or updated one note per account. No Python is involved.

## 5. Set the opening balance

Open an account note and set two frontmatter fields to the balance your bank shows today and today's date:

```yaml
anfangssaldo_eur: 1234,56
anfangssaldo_stand_am: 2026-09-26
```

Run **Rebuild journal from CSVs (built-in)** again. Transactions before that date are no longer counted twice. Until you do this, the balance overview warns that it shows *only transaction movement, NOT the real bank balance*.

## 6. Look at the result

Click the pie-chart ribbon icon **Open finance hub**. The tabs are **Dashboard**, **Ledger**, **Categories**, **Balances** and **To classify**. **Balances** shows per account the opening balance with its as-of date, the movement since then and the current balance.

## 7. Classify what is left

Open **To classify**. Each row is a transaction without a category. Press **Classify**, pick a ledger account and press **Save rule** — the same counterparty is then sorted by itself on the next rebuild.

## Where to go next

The [README](https://github.com/johannes-kaindl/finance-ledger/blob/main/README.md) lists every setting and command. If a step failed, see [Troubleshooting](troubleshooting.md).
