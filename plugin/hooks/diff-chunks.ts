import type { ReportHunk } from '../types';

export type DiffPiece =
  | { kind: 'diff'; source: string }
  | { kind: 'watchpoint'; line: number; note: string };

// `Code`'s documented ceiling for `source`; a diff cut mid-hunk no longer parses, so pieces are
// cut on line boundaries and each gets a header of its own.
const MAX_SOURCE = 10_000;

const MARK = { ctx: ' ', add: '+', del: '-' } as const;

/**
 * Cuts a hunk into pieces `<Code format="diff">` can draw, ending a piece right after every line
 * that carries a watchpoint so its note can be drawn under that exact line. Each piece gets its
 * own `@@` header, recomputed from the hunk's start and the lines before it.
 */
export function toDiffPieces(hunk: ReportHunk): DiffPiece[] {
  const pieces: DiffPiece[] = [];
  let oldCursor = hunk.old_start;
  let newCursor = hunk.new_start;
  let body: string[] = [];
  let bodyLength = 0;
  let start = { old: oldCursor, new: newCursor };
  let counts = { old: 0, new: 0 };

  const flush = () => {
    if (body.length === 0) return;
    const header = `@@ -${rangeStart(start.old, counts.old)},${counts.old} +${rangeStart(start.new, counts.new)},${counts.new} @@`;
    pieces.push({ kind: 'diff', source: [header, ...body].join('\n') });
    body = [];
    bodyLength = 0;
    start = { old: oldCursor, new: newCursor };
    counts = { old: 0, new: 0 };
  };

  for (const line of hunk.lines) {
    const text = `${MARK[line.type]}${line.text}`.slice(0, MAX_SOURCE / 2);
    if (bodyLength + text.length + 1 > MAX_SOURCE - 64) flush();

    body.push(text);
    bodyLength += text.length + 1;
    if (line.type !== 'add') {
      oldCursor += 1;
      counts.old += 1;
    }
    if (line.type !== 'del') {
      newCursor += 1;
      counts.new += 1;
    }

    if (line.watchpoint) {
      flush();
      pieces.push({
        kind: 'watchpoint',
        line: line.newLine ?? line.oldLine ?? 0,
        note: line.watchpoint,
      });
    }
  }
  flush();
  return pieces;
}

// Unified diff convention: an empty range names the line *before* it.
function rangeStart(start: number, count: number): number {
  return count === 0 ? Math.max(0, start - 1) : start;
}
