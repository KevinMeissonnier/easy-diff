# Handoff : Prologue — relecture de MR guidée par l'IA

## Overview

Prologue reprend une merge request (diff entre une branche et sa base), la fait analyser par un LLM, et la restitue au relecteur comme si l'agent lui présentait son propre travail. Deux niveaux :

1. **Vue d'ensemble** — quoi / pourquoi / risques, puis le chemin de relecture. Aucun code à ce stade.
2. **Parcours étape par étape** — les modifications sont regroupées par intention (pas par ordre alphabétique de fichier), et chaque fichier est accompagné d'un « pourquoi ce changement » et de points d'attention.

Le diff brut reste accessible en permanence, et une jauge de couverture suit ce qui a été vu.

## À propos des fichiers de design

Les fichiers de `design/` sont des **références visuelles écrites en HTML** — des prototypes qui montrent l'apparence et le comportement attendus, **pas du code de production à copier**. Le travail consiste à les **recréer dans l'environnement du codebase cible** (React + Tailwind, Vue, autre) avec ses conventions, sa librairie de composants et son routeur.

Ils utilisent un runtime maison (`support.js`, balises `<x-dc>`, `<sc-for>`, `<sc-if>`) qui n'a aucune valeur hors de l'outil de design : ne cherchez pas à le porter. Ce qui compte, ce sont la structure, les tokens, la copie et la logique d'état, tous documentés ci-dessous.

Pour les visualiser : ouvrir `design/Prologue - revue guidée.dc.html` directement dans un navigateur.

## Fidélité

- `design/Prologue - revue guidée.dc.html` — **haute fidélité**. Couleurs, typographie, espacements et interactions sont définitifs. À reproduire fidèlement.
- `design/Revue guidée - wireframes.dc.html` — **basse fidélité**. Wireframes d'exploration conservés pour l'intention de structure uniquement ; leur style papier/crayon n'est pas à reprendre.

## Le contrat de données (lire en premier)

`contract/review-narrative.schema.json` et son instance remplie `contract/review-narrative.example.json` définissent ce que le LLM produit. C'est la pièce centrale de l'intégration : l'UI est une projection directe de ce JSON.

Points structurants :

- **Le JSON ne contient aucune ligne de code.** Le modèle référence les hunks par leurs coordonnées (`new_start`, `new_lines`, `old_start`, `old_lines`) dans le diff que le backend possède déjà. Cela évite les hallucinations de contenu et réduit fortement la taille de la sortie. Le rendu du code vient donc de votre parseur de diff, pas du LLM.
- **`focus_lines`** désigne les deux ou trois lignes qui portent la décision dans un hunk long — à utiliser pour cadrer ou surligner.
- **Un même fichier peut apparaître dans plusieurs étapes** (dans l'exemple, `src/cache/redis_store.py` est dans l'étape 2 et l'étape 4). Le découpage suit l'intention, pas l'arborescence. Toute structure de données côté client doit le permettre : la clé d'un élément est `(step_index, file_index)`, jamais le chemin du fichier seul.
- `step.kind` pilote le badge d'étape. Valeurs : `foundation`, `implementation`, `wiring`, `delicate`, `configuration`, `tests`, `cleanup`.
- `watchpoints` peut être vide, et l'est souvent. Ne pas afficher le bloc « À vérifier » dans ce cas.

## Écrans

### 1. Vue d'ensemble

**Objectif** : donner le pourquoi avant le comment. Le relecteur doit pouvoir décider s'il est le bon relecteur sans avoir vu une ligne de code.

**Layout** : colonne centrée, `max-width: 1080px`, padding `50px 34px 67px`.

De haut en bas :

1. **Titre de la MR** — `font-size: 38px`, `font-weight: 500`, `line-height: 1.14`, `letter-spacing: -0.02em`, `max-width: 20ch`, marge basse 11px. Source : `merge_request.title`.
2. **Ligne de méta** — monospace 12px, couleur `--color-neutral-600`, marge basse 34px. Format : `feat/session-cache → main · 11 commits · 9 fichiers · +284 −96`.
3. **Trois cartes** — grille `repeat(auto-fit, minmax(240px, 1fr))`, gap 17px, marge basse 45px.
   - Carte « Ce que ça fait » ← `overview.what`
   - Carte « Pourquoi » ← `overview.why` — **bordure gauche 2px `--color-accent`**, kicker en `--color-accent-400`
   - Carte « Risques » ← `overview.risks`
   - Kicker de carte : 11px, `letter-spacing: 0.12em`, majuscules, marge basse 11px. Corps : 14.5px, `--color-neutral-200`, `text-wrap: pretty`.
4. **Titre « CHEMIN DE RELECTURE »** — 17px, `font-weight: 500`, `letter-spacing: 0.1em`, majuscules, `--color-neutral-400`, marge basse 22px.
5. **Liste des étapes** — une ligne par étape, grille `28px minmax(0,1fr) 190px 92px`, gap 17px, padding `14px 11px`, `border-radius: 8px`, filet bas 1px `--color-divider`.
   - Col. 1 : numéro monospace 12px, ou `✓` si l'étape est entièrement vue.
   - Col. 2 : `step.title` (15.5px, `--color-neutral-100`) puis `step.role` (13px, `--color-neutral-500`).
   - Col. 3 : « 2 fichiers » (monospace 12.5px).
   - Col. 4 : état — `vu` / `en cours` / `à lire`, aligné à droite, 12px.
   - Survol : fond `--color-neutral-900`, bordure `--color-neutral-800`. Clic : ouvre l'étape sur son premier fichier.
6. **Actions** — bouton primaire (« Commencer la relecture ▸ », ou « Reprendre la relecture ▸ » si au moins un fichier a été vu), bouton ghost « Ouvrir le diff brut », puis « ≈ 7 min de lecture guidée » en `--color-neutral-600`.

### 2. Parcours étape par étape

**Layout** : trois colonnes pleine hauteur, `196px | minmax(280px, 0.9fr) | minmax(0, 1.35fr)`, séparées par des filets 1px `--color-divider`. Chaque colonne défile indépendamment.

**Colonne 1 — étapes**
- Bouton « Retour » en haut : flèche Phosphor `arrow-left` 15px + libellé, 13px, `--color-neutral-400`, marge basse 11px. Ramène à la vue d'ensemble.
- Label « ÉTAPES » (11px, majuscules, `--color-neutral-600`).
- Une ligne par étape : grille `14px minmax(0,1fr)`, padding `8px 11px`, radius 6px. Marqueur = numéro, ou `✓` si toutes ses lignes de fichiers sont vues. Étape courante : fond `--color-accent-900`, texte `--color-accent-200`. Étape terminée : texte `--color-neutral-500`.

**Colonne 2 — le récit de l'étape**
Padding `28px 22px`, gap 17px. Rejouer l'animation d'entrée (`translateY(8px)` + fondu, 240 ms) à chaque changement d'étape.
- `Étape 03 / 06` en monospace 11.5px `--color-accent-400`, suivi d'un `.tag.tag-outline` portant le libellé du `kind`.
- Titre : 24px, `font-weight: 500`, `line-height: 1.2`.
- `step.intro` : 14.5px, `--color-neutral-300`.
- `step.detail` : 13.5px, `--color-neutral-500`.
- Label « LES 3 FICHIERS DE L'ÉTAPE » (singulier si un seul fichier).
- Liste des fichiers de l'étape : grille `14px minmax(0,1fr) auto`, padding `9px 11px`, radius 8px, bordure 1px. Marqueur `✓` / `○`, nom de fichier (basename, monospace 12px, ellipsis), volumétrie (`+18 −6`, monospace 11px). Fichier sélectionné : fond `--color-accent-900`, bordure `--color-accent-700`, texte `--color-accent-200`. **Le clic change le fichier affiché en colonne 3, sans changer d'étape.**
- Pied de colonne, séparé par un filet haut : bouton primaire (« Vu, fichier suivant ▸ » / « Vu, étape suivante ▸ » / « Vu, terminer ▸ » selon la position) et bouton ghost « ◂ Étape précédente ».

**Colonne 3 — le fichier**
- En-tête collant (`position: sticky; top: 0`) sur fond `--color-bg` : chemin complet du fichier (monospace 12.5px, `--color-neutral-200`), volumétrie, puis à droite `◂`, `2 / 3`, `▸`.
- Carte « POURQUOI CE CHANGEMENT » ← `file.why`. Bordure gauche 2px `--color-accent`, kicker `--color-accent-400`, corps 14.5px `--color-neutral-200`.
- Carte « À VÉRIFIER » ← `file.watchpoints`, **masquée si le tableau est vide**. Liste à puces : pastille ronde 5px `--color-accent-500`, texte 13.5px `--color-neutral-300`.
- Un bloc par hunk : conteneur `border: 1px solid --color-neutral-800`, radius 8px. En-tête de hunk sur `--color-neutral-900`, monospace 11px `--color-neutral-500`, contenant le libellé (`@@ 38,7 +38,12 @@  def verify`). Corps sur `#1b1d2b`, padding vertical 8px.
  - Ligne de code : grille `40px 12px minmax(0,1fr)`, gap 8px, padding `1px 11px`.
  - Gouttière : numéro de ligne monospace 11px `--color-neutral-700`, aligné à droite. **Vide sur une ligne supprimée.**
  - Signe : `+` en `#8fc9a4`, `−` en `#d29aa6`, transparent sur une ligne de contexte.
  - Code : monospace 12.5px. Ajout/suppression en `--color-neutral-200`, contexte en `--color-neutral-500`.
  - Fond de ligne : ajout `rgba(120,190,145,.10)`, suppression `rgba(200,120,140,.10)`, contexte transparent.
- Bouton secondaire « Marquer ce fichier comme vu » en bas.
- Animation d'entrée rejouée à chaque changement de fichier (220 ms).

### 3. Diff brut (panneau latéral)

Ouvert par « Diff brut » dans l'en-tête global ; accessible depuis n'importe quel écran.

- Voile plein écran `rgba(10,11,18,.62)`, panneau ancré à droite, largeur `min(720px, 92vw)`, pleine hauteur, bordure gauche 1px `--color-neutral-800`, `--shadow-lg`.
- En-tête : titre « Diff brut » (16px), sous-titre « 9 fichiers, ordre du dépôt — aucun commentaire », un `.tag.tag-outline` avec la couverture, bouton ghost « Fermer ».
- Liste : **un fichier unique par ligne**, même s'il apparaît dans plusieurs étapes. Grille `14px minmax(0,1fr) auto auto`, filet bas. Marqueur vu/non-vu, chemin complet, volumétries jointes par ` · `, et le rappel des étapes (« étapes 02, 04 »).
- Clic sur une ligne : ouvre le parcours sur la **première occurrence non encore vue** de ce fichier.
- Fermeture au clic sur le voile ; `stopPropagation` sur le panneau.

### En-tête global (présent partout)

`display: flex`, gap 17px, padding `11px 22px`, filet bas 1px. Contenu : identifiant de MR (monospace 12px `--color-neutral-600`), titre (13px `--color-neutral-400`, ellipsis), espace flexible, jauge de couverture, bouton ghost « Diff brut ». **Aucune marque ni logo produit.**

Jauge de couverture : libellé « 4 / 9 fichiers vus » (12px `--color-neutral-500`) + barre 84×3px, radius 3px, fond `--color-neutral-900`, remplissage `--color-accent`, `transition: width 300ms ease`.

## Interactions & comportement

- **Marquer comme vu / avancer** — une seule action fait les deux. Elle marque `(étape, fichier)` comme vu, puis : fichier suivant de l'étape s'il en reste ; sinon première ligne de l'étape suivante ; sinon retour à la vue d'ensemble.
- **Navigation fichier `◂ ▸`** — traverse les frontières d'étapes (le `▸` sur le dernier fichier d'une étape ouvre le premier fichier de la suivante) **sans** marquer quoi que ce soit comme vu. C'est la différence avec le bouton primaire.
- **Une étape est « vue »** quand tous ses fichiers le sont. **Un chemin de fichier est « vu »** quand toutes ses occurrences, dans toutes les étapes, le sont — c'est cette définition qui alimente le compteur « n / 9 fichiers ».
- **Le pourcentage de la barre** se calcule sur les paires `(étape, fichier)`, pas sur les chemins uniques : la progression avance à chaque validation.
- Transitions : fondu + `translateY(8px)` sur 220–300 ms, `ease`. Rien de plus.
- États de survol et focus : voir le design system ci-dessous. Ne pas laisser l'anneau de focus par défaut du navigateur.

## État

```
view        : "overview" | "walk"
si          : index de l'étape courante
fi          : index du fichier courant dans cette étape
seen        : Set de clés "si:fi"
raw         : booléen, panneau diff brut ouvert
```

`seen` doit être persisté par relecteur et par MR (la couverture est le point qui rend l'outil crédible ; la perdre au rechargement le disqualifie). Le reste peut vivre dans l'URL : `/mr/:id/step/:si/file/:fi` rend chaque position partageable — un relecteur peut envoyer un lien vers une étape précise.

Données à charger : le narratif (`review-narrative.json`) et le diff parsé, jointes côté client par chemin de fichier + coordonnées de hunk.

## Design tokens

Le design system **Nocturne** est fourni dans `design/_ds/nocturne-.../styles.css` — toutes les variables y sont définies. À porter en thème Tailwind plutôt qu'à copier tel quel.

**Couleurs**
```
--color-bg        #161826   fond
--color-surface   #232532   surfaces de cartes
--color-text      #e9e9ed   texte
--color-accent    #9184d9   accent unique (blurple)
--color-divider             filets
```
Rampes 100→900 pour `neutral`, `accent` (et `accent-2`, alias de `accent` — schéma monochrome). Sur ce fond sombre : 700–900 pour les fonds teintés et bordures, 500 comme base, 100–300 pour le texte posé sur ces teintes.

Valeurs hors rampe utilisées dans le rendu de diff, à porter telles quelles :
```
fond de bloc de code   #1b1d2b
signe +                #8fc9a4
signe −                #d29aa6
fond ligne ajoutée     rgba(120,190,145,.10)
fond ligne supprimée   rgba(200,120,140,.10)
```

**Typographie**
- Interface : Inter (`--font-heading` / `--font-body`), poids 400/500/600. **Ne jamais dépasser 500 sur un titre** — la hiérarchie passe par la taille et l'espace.
- Code et identifiants : JetBrains Mono 400/500.
- Échelle utilisée : 38 / 24 / 17 / 15.5 / 14.5 / 13.5 / 13 / 12.5 / 12 / 11 px.

**Espacements** — échelle `--space-*` à densité 0.70×. Les valeurs du design (5.6 / 8.4 / 11.2 / 16.8 / 22.4 / 28 / 33.6 / 44.8 / 50.4 / 67.2) sont les pas de cette échelle. En Tailwind, définir une échelle personnalisée plutôt que d'arrondir aux valeurs par défaut.

**Radius** — 5 / 6 / 8px. `--radius-*`, base 8px.

**Ombres** — `--shadow-sm / md / lg` uniquement. Sur fond sombre, l'élévation est un bord plus une obscurité ambiante, jamais un empilement d'ombres.

**Règles Nocturne à respecter**
- Boutons primaires **en contour accent sur fond transparent**, jamais en aplat.
- Ne jamais inonder une grande surface d'accent : il vit en ligne, en marque courte et en lueur.
- Le couple accent/fond tient 3:1 — suffisant pour la chrome et les grands textes, pas pour du corps de texte. Pour du texte de paragraphe en accent, utiliser `--color-accent-300`.
- Icônes : Phosphor (https://phosphoricons.com).
- Mise en page fer à gauche, asymétrique, dense.

## Assets

Aucune image. La seule icône est la flèche `arrow-left` de Phosphor, inlinée en SVG dans le bouton Retour.

## Fichiers du bundle

```
contract/review-narrative.schema.json    le contrat de sortie du LLM, consignes de rédaction dans les "description"
contract/review-narrative.example.json   une instance complète (3 étapes sur 6)
design/Prologue - revue guidée.dc.html   le prototype haute fidélité — ouvrir dans un navigateur
design/Revue guidée - wireframes.dc.html les wireframes d'exploration (basse fidélité)
design/support.js                        runtime du prototype — à ignorer, ne pas porter
design/_ds/nocturne-.../styles.css       les tokens du design system, à porter en thème
design/_ds/nocturne-.../_ds_bundle.js    les composants du design system (React)
```

## Ce que le handoff ne couvre pas

La génération du narratif elle-même : prompt du LLM, découpage en étapes, gestion des MR trop volumineuses pour une fenêtre de contexte, et cache du narratif entre deux pushs (un push invalide-t-il tout le narratif, ou seulement les étapes touchées ?). Le schéma fixe la forme de la sortie, pas la manière de l'obtenir.

Le contenu de l'exemple (cache Redis des jetons de session) est fictif, écrit pour rendre la narration jugeable.
