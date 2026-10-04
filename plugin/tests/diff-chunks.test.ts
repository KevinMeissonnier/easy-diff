import { describe, expect, test } from 'claude-code/testing'

import type { ReportHunk } from '../types'
import { toDiffPieces } from '../hooks/diff-chunks'

const hunk: ReportHunk = {
  old_start: 10,
  old_lines: 3,
  new_start: 10,
  new_lines: 4,
  lines: [
    { type: 'ctx', text: 'a', oldLine: 10, newLine: 10 },
    { type: 'del', text: 'b', oldLine: 11 },
    { type: 'add', text: 'B', newLine: 11, watchpoint: 'check B' },
    { type: 'add', text: 'C', newLine: 12 },
    { type: 'ctx', text: 'd', oldLine: 12, newLine: 13 },
  ],
}

describe('toDiffPieces', () => {
  test('a hunk without watchpoints stays one piece with its own header', async () => {
    const plain = { ...hunk, lines: hunk.lines.map(({ watchpoint, ...line }) => line) }
    expect(toDiffPieces(plain)).toEqual([
      { kind: 'diff', source: '@@ -10,3 +10,4 @@\n a\n-b\n+B\n+C\n d' },
    ])
  })

  test('cuts right after a watched line and renumbers the rest', async () => {
    expect(toDiffPieces(hunk)).toEqual([
      { kind: 'diff', source: '@@ -10,2 +10,2 @@\n a\n-b\n+B' },
      { kind: 'watchpoint', line: 11, note: 'check B' },
      { kind: 'diff', source: '@@ -12,1 +12,2 @@\n+C\n d' },
    ])
  })

  test('an empty side names the line before it, as git does', async () => {
    const added: ReportHunk = {
      old_start: 0,
      old_lines: 0,
      new_start: 1,
      new_lines: 2,
      lines: [
        { type: 'add', text: 'x', newLine: 1, watchpoint: 'new' },
        { type: 'add', text: 'y', newLine: 2 },
      ],
    }
    expect(toDiffPieces(added)).toEqual([
      { kind: 'diff', source: '@@ -0,0 +1,1 @@\n+x' },
      { kind: 'watchpoint', line: 1, note: 'new' },
      { kind: 'diff', source: '@@ -0,0 +2,1 @@\n+y' },
    ])
  })

  test('a hunk too large for one Code element is split on line boundaries', async () => {
    const lines = Array.from({ length: 400 }, (_, i) => ({
      type: 'add' as const,
      text: 'x'.repeat(60),
      newLine: i + 1,
    }))
    const pieces = toDiffPieces({ old_start: 0, old_lines: 0, new_start: 1, new_lines: 400, lines })
    expect(pieces.length).toBeGreaterThan(1)
    for (const piece of pieces) {
      if (piece.kind === 'diff') expect(piece.source.length).toBeLessThanOrEqual(10_000)
    }
    expect(pieces[1]).toMatchObject({ kind: 'diff', source: expect.stringMatching(/^@@ -0,0 \+\d+,\d+ @@\n/) })
  })
})
