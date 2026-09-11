# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

Source: [andrej-karpathy-skills](https://github.com/multica-ai/andrej-karpathy-skills/blob/main/CLAUDE.md)

---

# easy-diff

CLI qui transforme un diff git en review narrée (vue d'ensemble + étapes commentées), au lieu
d'un diff brut à reverse-engineer. Voir `README.md` pour le concept et l'architecture complète.

## Structure

- `src/cli.ts` — entrée CLI (commander), sous-commandes `init` et `generate`.
- `src/commands/init.ts` — scaffolde `.claude/commands/`, `.claude/easy-diff/` (settings isolés +
  hook + schéma) et l'entrée `.gitignore` dans le repo cible. Pur I/O fichiers, pas de réseau.
- `src/commands/generate.ts` — orchestre l'analyse : détecte la base, invoque Claude Code headless,
  valide la sortie, écrit `easy-diff/data/analysis.json`, déclenche le rendu HTML.
- `src/lib/claude-runner.ts` — invocation `claude -p` headless. `ALLOWED_TOOLS`/`DISALLOWED_TOOLS`
  ici doivent rester synchronisés avec `templates/commands/easy-diff-report.md` (`allowed-tools`
  frontmatter) — l'un pré-approuve sans prompt, l'autre est la vraie barrière.
- `src/lib/schema.ts` — schéma zod de l'analyse + `extractAnalysis`, qui essaie plusieurs points
  d'extraction dans la sortie `--output-format json`/`--json-schema` de Claude Code (le format
  exact de l'enveloppe n'est pas encore confirmé en conditions réelles — voir README, section
  "État du projet").
- `src/render/report.ts` — construit les données du rapport (le JSON du LLM + les diffs exacts par
  fichier, recalculés via `git diff`, jamais fournis par le LLM) et écrit le HTML/CSS/JS statique.
- `templates/` — tout ce qui est scaffoldé tel quel dans un repo cible par `init`, plus le viewer
  HTML/CSS/JS copié par `render/report.ts`. Ce ne sont pas des sources TypeScript.

## Décisions de conception à ne pas re-discuter sans raison

- **Le LLM ne produit jamais de HTML ni de diff recopié.** Il ne sort qu'un JSON structuré
  (overview + steps, validé par `templates/analysis.schema.json`). Le rendu et les hunks affichés
  sont calculés déterministiquement par notre code (`git diff` direct), pas par le modèle — évite
  les incohérences de mise en page et les hallucinations de diff.
- **`.claude/easy-diff/settings.json` n'est jamais la config par défaut du repo.** Il n'est chargé
  que via `claude --settings <ce fichier>` lors d'un `easy-diff generate`. Ne jamais le fusionner
  dans `.claude/settings.json` du repo cible — ça casserait les sessions Claude Code interactives
  normales (Write/Edit/Bash y seraient bloqués en permanence).
- **`templates/hooks/guard.cjs` est de la défense en profondeur**, pas la seule barrière — les
  flags `--allowedTools`/`--disallowedTools`/`--permission-mode plan` dans `claude-runner.ts` sont
  la première ligne. Le hook doit rester fail-closed (deny par défaut) sur tout ce qu'il ne
  reconnaît pas explicitement.
- **Chemins et bundling** : pas de bundler (tsup/esbuild) pour l'instant — build via `tsc` brut qui
  préserve l'arborescence `src/` → `dist/`, dont dépend `src/lib/paths.ts` (calcul de
  `PACKAGE_ROOT` relatif à sa propre position sur disque). Introduire un bundler nécessiterait de
  revoir ce calcul (voir commentaire dans `paths.ts`).

## Commandes

```bash
npm install
npm run typecheck   # tsc --noEmit
npm run build        # tsc + chmod +x dist/cli.js
npm run dev -- init   # exécute depuis les sources via tsx, sans build
```

## Prochaine évolution du format d'analyse

`templates/analysis.example.json` contient un exemple cible bien plus riche que le schéma actuel
(`templates/analysis.schema.json`) : métadonnées de MR, `hunks` avec numéros de ligne exacts et
`focus_lines`, `confidence`, `watchpoints`, `kind` par étape, `change_type` par fichier. Le
schéma JSON, le prompt (`templates/commands/easy-diff-report.md`), `src/lib/schema.ts` (zod) et le
rendu (`src/render/report.ts`, viewer `templates/report/`) devront être mis à jour pour matcher
cette forme — pas encore fait, à traiter avec l'écriture du prompt définitif et la génération HTML.

## Non testé en conditions réelles

`generate` invoque `claude -p` headless avec `--json-schema` — le format exact de l'enveloppe de
sortie combinée à `--output-format json` n'a pas été validé contre une vraie invocation (pas de
`claude` authentifié disponible pendant l'implémentation initiale). Si `extractAnalysis` échoue à
l'usage, inspecter la sortie brute (elle est incluse dans le message d'erreur) et ajuster
`collectJsonCandidates` dans `src/lib/schema.ts` en conséquence.
