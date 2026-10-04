import type { Report } from '../types';

const LABELS = {
  en: {
    kind: {
      foundation: 'Foundation',
      core: 'Core logic',
      wiring: 'Wiring',
      delicate: 'Delicate',
      tests: 'Tests',
    },
    overview: 'Overview',
    whatItDoes: 'What it does',
    why: 'Why',
    mentalModel: 'How it fits together',
    decisions: 'Key decisions',
    risks: 'Risks',
    watchpointsTitle: 'Watch for',
    reviewPath: 'Review path',
    startReview: 'Start review',
    prevStep: 'Previous',
    nextStep: 'Next',
    whyThisChange: 'Why this change',
    noHunkAvailable: 'No hunk available for this file.',
    readingTime: (min: number) => `≈ ${min} min guided reading`,
    stepCounter: (i: number, total: number) => `Step ${i} / ${total}`,
    stats: (m: Report['meta']) =>
      `${m.commits} commit${m.commits > 1 ? 's' : ''} · ${m.files_changed} file${m.files_changed > 1 ? 's' : ''} · +${m.insertions} −${m.deletions}`,
  },
  fr: {
    kind: {
      foundation: 'Fondation',
      core: 'Cœur logique',
      wiring: 'Câblage',
      delicate: 'Sensible',
      tests: 'Tests',
    },
    overview: "Vue d'ensemble",
    whatItDoes: 'Ce que ça fait',
    why: 'Pourquoi',
    mentalModel: "Comment ça s'articule",
    decisions: 'Décisions',
    risks: 'Risques',
    watchpointsTitle: 'À vérifier',
    reviewPath: 'Chemin de relecture',
    startReview: 'Commencer la relecture',
    prevStep: 'Précédent',
    nextStep: 'Suivant',
    whyThisChange: 'Pourquoi ce changement',
    noHunkAvailable: 'Aucun hunk disponible pour ce fichier.',
    readingTime: (min: number) => `≈ ${min} min de lecture guidée`,
    stepCounter: (i: number, total: number) => `Étape ${i} / ${total}`,
    stats: (m: Report['meta']) =>
      `${m.commits} commit${m.commits > 1 ? 's' : ''} · ${m.files_changed} fichier${m.files_changed > 1 ? 's' : ''} · +${m.insertions} −${m.deletions}`,
  },
};

export type Labels = (typeof LABELS)['en'];

export function labelsFor(language: Report['language']): Labels {
  return LABELS[language] ?? LABELS.en;
}
