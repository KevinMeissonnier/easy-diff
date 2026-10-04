import type { On } from 'claude-code'
import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { Report } from '../types'

const SAMPLE: Report = {
  version: '1.0',
  merge_request: { title: 'Cache tokens', source_branch: 'feat', target_branch: 'main' },
  overview: {
    what: 'Adds a cache.',
    why: 'Too many queries.',
    mental_model: 'First paragraph.\n\nSecond paragraph.',
    decisions: [{ choice: 'A Protocol', reason: 'Easier to fake.' }],
    risks: '',
    estimated_reading_minutes: 3,
  },
  base: 'main',
  meta: { commits: 2, files_changed: 1, insertions: 1, deletions: 1 },
  language: 'en',
  steps: [
    {
      id: 'only',
      kind: 'delicate',
      title: 'Revocation',
      narrative: 'Deletes the entry.',
      files: [
        {
          path: 'src/revoke.py',
          change_type: 'modified',
          confidence: 'high',
          churn: { add: 1, del: 1 },
          watchpoints: [{ hunkIndex: 0, line: 2, note: 'Order matters.' }],
          hunks: [
            {
              old_start: 1,
              old_lines: 2,
              new_start: 1,
              new_lines: 2,
              lines: [
                { type: 'ctx', text: 'def revoke():', oldLine: 1, newLine: 1 },
                { type: 'del', text: '    db()', oldLine: 2 },
                { type: 'add', text: '    db(); cache()', newLine: 2, watchpoint: 'Order matters.' },
              ],
            },
          ],
        },
      ],
    },
  ],
}

const PANE = {
  component: 'Pane',
  requestId: 'easy-diff',
  props: {
    title: 'easy-diff',
    isFocused: true,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

async function loadSample($: Engine, on: On): Promise<void> {
  on('process.run', () => ({
    value: { exitCode: 0, stdout: '/repo\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('fs.read', { path: '/repo/easy-diff/data/report.json' }, () => ({ value: JSON.stringify(SAMPLE) }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  await $.command.run({
    command: 'easy-diff',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })
}

describe('easy-diff pane', () => {
  test('asks for /easy-diff while no report is loaded', async $ => {
    const ui = await $.ui.mount({ plugin: 'easy-diff', surface: 'terminal', ...PANE })
    expect(await ui.find({ text: /Run \/easy-diff/ })).toBeDefined()
    await ui.unmount()
  })

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    test(`walks from the overview to a watched line on ${surface}`, async ($, on) => {
      await loadSample($, on)
      const ui = await $.ui.mount({ plugin: 'easy-diff', surface, ...PANE })

      expect(await ui.find({ type: 'Text', text: 'Second paragraph.' })).toBeDefined()
      expect(await ui.find({ text: 'Risks' })).toBeUndefined()

      await ui.press({ key: 'go-wp-1-0-0-2' })
      expect(await ui.find({ type: 'Text', text: /Revocation/ })).toBeDefined()
      const code = await ui.find({ type: 'Code' })
      expect(code?.props).toMatchObject({ format: 'diff', source: '@@ -1,2 +1,2 @@\n def revoke():\n-    db()\n+    db(); cache()' })
      expect(await ui.find({ key: 'wp-1-0-0-2' })).toBeDefined()

      await ui.press({ key: 'overview' })
      expect(await ui.find({ key: 'start' })).toBeDefined()
      await ui.unmount()
    })
  }
})
