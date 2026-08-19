# Contributing

Danke fürs Mitwirken! Kurzfassung der Konventionen dieses Repos:

## Branch-Modell
- `main` ist immer grün. Feature-Arbeit in `feat/<name>`-Branches, Merge via `git merge --no-ff`.
- Direkt-Push auf `main` nur mit expliziter Autorisierung.

## Commits
- **Conventional Commits:** `feat|fix|docs|chore|refactor|test(scope): …` (Beschreibung darf Deutsch sein).
- Bei substanziellem AI-Beitrag `Co-Authored-By`-Trailer anfügen.
- **Nur berührte Dateien stagen — nie `git add -A`.**

## Tags & Remotes
- SemVer **ohne** v-Präfix (`1.2.3`), Tag = Version in `manifest.json`.
- Primär-Remote ist Forgejo (`origin`); GitHub nur Mirror.

## Qualität vor dem Commit
- Tests grün (`npm test`), Typecheck sauber (`npm run typecheck`), Linter sauber (`npm run lint`).
- `main.js` ist committed: nach Quelltext-Änderungen `npm run build` und das Bundle mitcommitten.

## Lizenz der Beiträge
- Code unter **AGPL-3.0** (siehe `LICENSE`).
- Dokumentation/Texte unter **CC BY-SA 4.0** (siehe `LICENSE-DOCS`).
