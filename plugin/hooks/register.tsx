import { atom, read, update } from 'claude-code'
import type { ElementTable, EngineInterface, Register, RenderElement } from 'claude-code'

import type { Report, ReportFile, ReportHunk, ReportStep } from '../types'
import { toDiffPieces } from './diff-chunks'
import { labelsFor, type Labels } from './i18n'

const PANE = 'easy-diff'
const REPORT_FILE = 'easy-diff/data/report.json'

const report = atom({ plugin: 'easy-diff', key: 'report' } as const, null)
const page = atom({ plugin: 'easy-diff', key: 'page' } as const, 0)

type Ui = ElementTable
type Nav = { goTo: (page: number, key?: string) => Promise<void> }

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'easy-diff',
      description: 'Open the easy-diff review of this branch in a pane',
    })

    return next(e)
  })

  on('command.run', { command: 'easy-diff' }, async $ => {
    const loaded = await loadReport($)
    if (!loaded) {
      return { text: `No easy-diff report found at ${REPORT_FILE}. Run \`easy-diff generate\` first.` }
    }
    await update($, report, () => loaded)
    await update($, page, () => 0)
    await $.ui.open({ id: PANE, title: 'easy-diff', focus: true })

    return { text: `easy-diff: ${loaded.merge_request.title}` }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    const { Box, Text } = ui
    const data = await read($, report)
    if (!data) {
      return <Text dimColor>Run /easy-diff to load {REPORT_FILE}.</Text>
    }

    const t = labelsFor(data.language)
    const current = Math.min(await read($, page), data.steps.length)
    const nav: Nav = {
      goTo: async (target, key) => {
        await update($, page, () => target)
        // Scrolling is a convenience: a site that cannot resolve it (the test kit's mounts
        // have no window) must not fail the press once the page has changed.
        await $.ui
          .scroll(key ? { in: PANE, to: { key }, block: 'center' } : { in: PANE, to: 'start' })
          .catch(() => undefined)
      },
    }

    return (
      <Box flexDirection="column" width={e.props.bodyColumns}>
        {current === 0
          ? overviewPage(ui, t, data, nav)
          : stepPage(ui, t, data, current, nav)}
      </Box>
    )
  })
}

async function loadReport($: EngineInterface): Promise<Report | null> {
  const top = await $.process.run(['git', 'rev-parse', '--show-toplevel'])
  const root = top.exitCode === 0 ? top.stdout.trim() : await $.session.cwd()
  try {
    return JSON.parse(await $.fs.read(`${root}/${REPORT_FILE}`)) as Report
  } catch {
    return null
  }
}

function overviewPage(ui: Ui, t: Labels, data: Report, nav: Nav): RenderElement {
  const { Box, Text, Button } = ui
  const { overview } = data

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text bold>{data.merge_request.title}</Text>
        <Text dimColor>
          {t.stats(data.meta)} · {t.readingTime(overview.estimated_reading_minutes)}
        </Text>
      </Box>
      {section(ui, t.whatItDoes, overview.what)}
      {section(ui, t.why, overview.why)}
      {section(ui, t.mentalModel, overview.mental_model)}
      {overview.decisions.length > 0 && (
        <Box flexDirection="column">
          <Text bold color="cyan">{t.decisions}</Text>
          {overview.decisions.map(decision => (
            <Box flexDirection="column" marginTop={1}>
              <Text>• {decision.choice}</Text>
              <Text dimColor>  {decision.reason}</Text>
            </Box>
          ))}
        </Box>
      )}
      {overview.risks.trim() !== '' && section(ui, t.risks, overview.risks)}
      {watchpointsCard(ui, t, data, nav)}
      <Box flexDirection="column">
        <Text bold color="cyan">{t.reviewPath}</Text>
        {data.steps.map((step, i) => (
          <Button
            key={`path-${i + 1}`}
            plain
            label={`${i + 1}. ${step.title} (${t.kind[step.kind]})`}
            onPress={() => nav.goTo(i + 1)}
          />
        ))}
      </Box>
      <Box>
        <Button key="start" variant="primary" hotkey="n" label={t.startReview} onPress={() => nav.goTo(1)} />
      </Box>
    </Box>
  )
}

function watchpointsCard(ui: Ui, t: Labels, data: Report, nav: Nav): RenderElement | null {
  const { Box, Text, Button } = ui
  const entries = data.steps.flatMap((step, s) =>
    step.files.flatMap((file, f) =>
      file.watchpoints.map(wp => ({ step: s + 1, file, wp, key: watchpointKey(s + 1, f, wp.hunkIndex, wp.line) })),
    ),
  )
  if (entries.length === 0) return null

  return (
    <Box flexDirection="column">
      <Text bold color="magenta">{t.watchpointsTitle}</Text>
      {entries.map(entry => (
        <Box flexDirection="column" marginTop={1}>
          <Button
            key={`go-${entry.key}`}
            plain
            label={`${entry.step} · ${entry.file.path}:${entry.wp.line}`}
            onPress={() => nav.goTo(entry.step, entry.key)}
          />
          <Text>  {entry.wp.note}</Text>
        </Box>
      ))}
    </Box>
  )
}

function stepPage(ui: Ui, t: Labels, data: Report, n: number, nav: Nav): RenderElement {
  const { Box, Text, Button } = ui
  const step = data.steps[n - 1] as ReportStep

  return (
    <Box flexDirection="column" gap={1}>
      <Box flexDirection="column">
        <Text dimColor>
          {t.stepCounter(n, data.steps.length)} · {t.kind[step.kind]}
        </Text>
        <Text bold color={step.kind === 'delicate' ? 'yellow' : undefined}>{step.title}</Text>
      </Box>
      {paragraphs(ui, step.narrative)}
      {step.files.map((file, f) => fileBlock(ui, t, file, n, f))}
      <Box gap={2}>
        {n > 1 && <Button key="prev" hotkey="p" label={`‹ ${t.prevStep}`} onPress={() => nav.goTo(n - 1)} />}
        <Button key="overview" hotkey="o" label={t.overview} onPress={() => nav.goTo(0)} />
        {n < data.steps.length && (
          <Button key="next" variant="primary" hotkey="n" label={`${t.nextStep} ›`} onPress={() => nav.goTo(n + 1)} />
        )}
      </Box>
    </Box>
  )
}

function fileBlock(ui: Ui, t: Labels, file: ReportFile, step: number, f: number): RenderElement {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column" borderStyle="round" borderDimColor paddingX={1}>
      <Text>
        <Text bold>{file.path}</Text>
        <Text dimColor>  +{file.churn.add} −{file.churn.del}</Text>
      </Text>
      {file.why && (
        <Box flexDirection="column" marginTop={1}>
          <Text dimColor>{t.whyThisChange}</Text>
          <Text>{file.why}</Text>
        </Box>
      )}
      {file.hunks.length === 0 && <Text dimColor>{t.noHunkAvailable}</Text>}
      {file.hunks.map((hunk, hunkIndex) => hunkBlock(ui, file.path, hunk, step, f, hunkIndex))}
    </Box>
  )
}

function hunkBlock(ui: Ui, path: string, hunk: ReportHunk, step: number, f: number, hunkIndex: number): RenderElement {
  const { Box, Text, Code } = ui

  return (
    <Box flexDirection="column" marginTop={1}>
      {hunk.label && <Text dimColor>{hunk.label}</Text>}
      {toDiffPieces(hunk).map(piece =>
        piece.kind === 'diff' ? (
          <Code source={piece.source} format="diff" path={path} />
        ) : (
          <Box key={watchpointKey(step, f, hunkIndex, piece.line)} paddingLeft={2}>
            <Text color="magenta">⚑ {piece.note}</Text>
          </Box>
        ),
      )}
      {hunk.note && <Text dimColor italic>{hunk.note}</Text>}
    </Box>
  )
}

function section(ui: Ui, heading: string, text: string): RenderElement {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{heading}</Text>
      {paragraphs(ui, text)}
    </Box>
  )
}

// The prose is plain text whose only structure is blank-line-separated paragraphs, as in the
// HTML viewer.
function paragraphs(ui: Ui, text: string): RenderElement {
  const { Box, Text } = ui

  return (
    <Box flexDirection="column" gap={1}>
      {text.split(/\n\s*\n/).map(paragraph => (
        <Text>{paragraph.trim()}</Text>
      ))}
    </Box>
  )
}

function watchpointKey(step: number, file: number, hunk: number, line: number): string {
  return `wp-${step}-${file}-${hunk}-${line}`
}
