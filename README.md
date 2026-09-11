# easy-diff

Avec les LLM et les agents de code, une part croissante du travail de dev consiste à **relire**
du code plutôt qu'à l'écrire. Les outils de review actuels (diff brut GitHub/GitLab) montrent des
lignes `+`/`-` mais n'expliquent jamais le raisonnement derrière un changement.

`easy-diff` transforme un diff en une présentation narrée, comme si un agent expliquait son propre
travail : d'abord le **pourquoi** (intention, contexte, résumé), puis le **comment**, étape par
étape, dans un ordre logique — pas alphabétique — avec un commentaire à chaque étape.

## Installation dans un projet

```bash
npx easy-diff init
```

Cela scaffolde, dans le repo courant :

- `.claude/commands/easy-diff-report.md` — la commande Claude Code qui produit l'analyse.
- `.claude/easy-diff/` — settings et hook de garde **isolés**, utilisés uniquement par
  `easy-diff generate` (jamais injectés dans vos sessions Claude Code interactives normales).
  Voir `.claude/easy-diff/README.md` une fois généré.
- `.gitignore` — ajoute `easy-diff/`, le dossier des rapports générés (jamais commité).

## Générer un rapport

```bash
easy-diff generate            # diff entre la branche courante et sa base (auto-détectée)
easy-diff generate main       # ...contre une base explicite
```

Ouvrez `easy-diff/report/index.html` dans un navigateur.

## Architecture

```
easy-diff generate
  → claude -p "/easy-diff-report <base>"     (headless, lecture seule, sortie JSON validée par schéma)
  → easy-diff/data/analysis.json             (le raisonnement structuré du modèle : overview + steps)
  → easy-diff (Node) recalcule les diffs exacts par fichier via `git diff`
  → easy-diff/report/index.html              (rendu déterministe, pas généré par le LLM)
```

Deux principes structurants :

1. **Le LLM ne planifie pas le rendu, il planifie le récit.** Il ne produit qu'un JSON structuré
   (intention/contexte/résumé + étapes ordonnées avec commentaire) — jamais de HTML, jamais de
   diff recopié à la main. Le rendu HTML est un template déterministe que l'on maîtrise, et les
   hunks affichés viennent d'un `git diff` exécuté par notre code, garantis fidèles au diff réel.
2. **Le garde-fou est scopé à l'invocation, jamais au repo.** `.claude/easy-diff/settings.json`
   n'est chargé que via `claude --settings` lors d'un `easy-diff generate` — jamais comme
   configuration par défaut du repo. Vos sessions Claude Code interactives ne sont jamais
   restreintes par ce hook.

## Prérequis

- Le CLI `claude` (Claude Code) installé, sur le `PATH`, et authentifié — `easy-diff generate`
  l'invoque en sous-processus headless.

## Développement

```bash
npm install
npm run typecheck
npm run build
npm run dev -- init      # exécute le CLI depuis les sources (tsx), sans build
```

## État du projet

`init` et `generate` sont tous les deux testés de bout en bout. `generate` a été validé contre une
vraie invocation `claude -p --json-schema` (voir `test/fixtures/claude-envelope.*.json`), y
compris un cas où le modèle détecte une tentative d'injection de prompt dans le diff analysé et la
signale sans l'exécuter.
