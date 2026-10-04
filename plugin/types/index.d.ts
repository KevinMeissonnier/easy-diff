// Mirrors `ReportData` in src/render/report.ts: the plugin runs outside Node and cannot import
// it, and a state contract must be self-contained.

export type ReportLine = {
  type: 'ctx' | 'add' | 'del';
  text: string;
  oldLine?: number;
  newLine?: number;
  watchpoint?: string;
};

export type ReportHunk = {
  old_start: number;
  old_lines: number;
  new_start: number;
  new_lines: number;
  label?: string;
  note?: string;
  lines: ReportLine[];
};

export type ReportFile = {
  path: string;
  change_type: 'added' | 'modified' | 'deleted' | 'renamed';
  why?: string;
  confidence: 'high' | 'medium' | 'low';
  churn: { add: number; del: number };
  hunks: ReportHunk[];
  watchpoints: { hunkIndex: number; line: number; note: string }[];
};

export type ReportStep = {
  id: string;
  kind: 'foundation' | 'core' | 'wiring' | 'delicate' | 'tests';
  title: string;
  narrative: string;
  files: ReportFile[];
};

export type Report = {
  version: string;
  merge_request: { title: string; source_branch: string; target_branch: string };
  overview: {
    what: string;
    why: string;
    mental_model: string;
    decisions: { choice: string; reason: string }[];
    risks: string;
    estimated_reading_minutes: number;
  };
  base: string;
  meta: { commits: number; files_changed: number; insertions: number; deletions: number };
  steps: ReportStep[];
  language: 'en' | 'fr';
};

declare module 'claude-code' {
  interface PluginState {
    'easy-diff': {
      report: Report | null;
      /** 0 is the overview, n is step n. */
      page: number;
    };
  }
}
