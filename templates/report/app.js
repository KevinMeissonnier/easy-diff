(function () {
  const data = window.__EASY_DIFF__;
  const root = document.getElementById('app');

  if (!data) {
    root.innerHTML = '<p class="p-10 text-diff-del-sign">No report data found.</p>';
    return;
  }

  const t = window.EASY_DIFF_I18N[data.reportLanguage] || window.EASY_DIFF_I18N.en;
  document.documentElement.lang = data.reportLanguage === 'fr' ? 'fr' : 'en';
  document.title = t.title;

  // One-off multi-track grid layouts, kept as plain CSS to avoid Tailwind's arbitrary-value
  // bracket escaping for values that mix commas (minmax(...)) and spaces.
  const GRID = {
    overviewRow: '28px minmax(0,1fr) 190px 92px',
    walkColumns: '196px minmax(280px,0.9fr) minmax(0,1.35fr)',
    navRow: '14px minmax(0,1fr)',
    fileRow: '14px minmax(0,1fr) auto',
    hunkLine: '40px 12px minmax(0,1fr)',
    rawRow: '14px minmax(0,1fr) auto auto',
    watchRow: 'auto minmax(0,1fr)',
  };

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function paragraphs(text, classes) {
    return String(text)
      .split(/\n\s*\n/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => `<p class="m-0 ${classes}">${escapeHtml(para)}</p>`)
      .join('');
  }

  function basename(p) {
    const parts = String(p).split('/');
    return parts[parts.length - 1];
  }

  function churnLabel(churn) {
    const parts = [];
    if (churn && churn.add) parts.push(`+${churn.add}`);
    if (churn && churn.del) parts.push(`−${churn.del}`);
    return parts.length ? parts.join(' ') : '±0';
  }

  // ── Derived, static structure ──────────────────────────────────────────
  // A file may appear in more than one step (by intent, not by path) — see
  // easy-diff-design/README.md. Every "seen"/coverage notion keys off the (step, file)
  // pair, never the path alone.

  const pairs = [];
  data.steps.forEach((step, si) => {
    step.files.forEach((file, fi) => pairs.push({ si, fi, path: file.path }));
  });

  const fileGroups = (() => {
    const order = [];
    const byPath = new Map();
    for (const p of pairs) {
      if (!byPath.has(p.path)) {
        byPath.set(p.path, []);
        order.push(p.path);
      }
      byPath.get(p.path).push(p);
    }
    return order.map((path) => ({ path, occurrences: byPath.get(path) }));
  })();

  function pairIndex(si, fi) {
    return pairs.findIndex((p) => p.si === si && p.fi === fi);
  }

  // ── Seen-state persistence (per reviewer, per MR) ──────────────────────

  function storageKey() {
    const mr = data.merge_request;
    const id = mr.id || `${mr.source_branch}>${mr.target_branch}:${mr.base_sha}:${mr.head_sha}`;
    return `easy-diff:seen:${id}`;
  }

  function loadSeen() {
    try {
      const raw = localStorage.getItem(storageKey());
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch {
      return new Set();
    }
  }

  function saveSeen() {
    try {
      localStorage.setItem(storageKey(), JSON.stringify([...seen]));
    } catch {
      // Private browsing / quota exceeded — coverage just won't survive a reload.
    }
  }

  const seen = loadSeen();

  function pairKey(si, fi) {
    return `${si}:${fi}`;
  }
  function isSeen(si, fi) {
    return seen.has(pairKey(si, fi));
  }
  function pathFullySeen(occurrences) {
    return occurrences.every((o) => isSeen(o.si, o.fi));
  }

  function stepStatus(si) {
    const step = data.steps[si];
    const doneCount = step.files.filter((_, fi) => isSeen(si, fi)).length;
    if (doneCount === 0) return 'todo';
    if (doneCount === step.files.length) return 'done';
    return 'progress';
  }

  function coverage() {
    const seenPairs = pairs.filter((p) => isSeen(p.si, p.fi)).length;
    const seenPaths = fileGroups.filter((g) => pathFullySeen(g.occurrences)).length;
    return {
      totalPairs: pairs.length,
      seenPairs,
      totalPaths: fileGroups.length,
      seenPaths,
      // Coverage advances on every (step, file) validated, not on unique paths — see README.
      pct: pairs.length ? Math.round((seenPairs / pairs.length) * 100) : 0,
    };
  }

  // ── State + URL sync ────────────────────────────────────────────────────

  const state = { view: 'overview', si: 0, fi: 0, raw: false };

  (function initStateFromUrl() {
    const url = new URL(location.href);
    if (!url.searchParams.has('step') || !url.searchParams.has('file')) return;
    const si = Number(url.searchParams.get('step'));
    const fi = Number(url.searchParams.get('file'));
    if (Number.isInteger(si) && data.steps[si] && Number.isInteger(fi) && data.steps[si].files[fi]) {
      state.view = 'walk';
      state.si = si;
      state.fi = fi;
    }
  })();

  function syncUrl() {
    const url = new URL(location.href);
    if (state.view === 'walk') {
      url.searchParams.set('step', String(state.si));
      url.searchParams.set('file', String(state.fi));
    } else {
      url.searchParams.delete('step');
      url.searchParams.delete('file');
    }
    history.replaceState(null, '', url);
  }

  // ── Actions ─────────────────────────────────────────────────────────────

  function gotoOverview() {
    state.view = 'overview';
    render();
  }

  function openStep(si) {
    state.view = 'walk';
    state.si = si;
    state.fi = 0;
    render();
  }

  function startWalk() {
    const target = pairs.find((p) => !isSeen(p.si, p.fi)) || pairs[0];
    if (!target) return;
    state.view = 'walk';
    state.si = target.si;
    state.fi = target.fi;
    render();
  }

  function openRawFile(path) {
    const group = fileGroups.find((g) => g.path === path);
    if (!group) return;
    const target = group.occurrences.find((o) => !isSeen(o.si, o.fi)) || group.occurrences[0];
    state.raw = false;
    state.view = 'walk';
    state.si = target.si;
    state.fi = target.fi;
    render();
  }

  // Marking seen and advancing is a single action everywhere it's triggered from (the
  // step's primary button, or the file's own secondary button) — see README.
  function markSeenAndAdvance() {
    seen.add(pairKey(state.si, state.fi));
    saveSeen();
    const step = data.steps[state.si];
    if (state.fi + 1 < step.files.length) {
      state.fi += 1;
    } else if (state.si + 1 < data.steps.length) {
      state.si += 1;
      state.fi = 0;
    } else {
      state.view = 'overview';
    }
    render();
  }

  function stepBack() {
    if (state.si === 0) return;
    state.si -= 1;
    state.fi = 0;
    render();
  }

  // File ◂ ▸ crosses step boundaries but never marks anything as seen — the difference
  // from the primary action above.
  function stepFile(delta) {
    const idx = pairIndex(state.si, state.fi);
    const next = pairs[idx + delta];
    if (!next) return;
    state.si = next.si;
    state.fi = next.fi;
    render();
  }

  function toggleRaw(open) {
    state.raw = open;
    render();
  }

  // ── Rendering ───────────────────────────────────────────────────────────

  function renderHeader() {
    const mr = data.merge_request;
    const cov = coverage();
    return `
      <header class="flex items-center gap-6 py-4 px-8 border-b border-divider">
        ${mr.id ? `<span class="font-mono text-[12px] text-neutral-600">${escapeHtml(mr.id)}</span>` : ''}
        <span class="text-[13px] text-neutral-400 truncate min-w-0">${escapeHtml(mr.title)}</span>
        <div class="flex-1"></div>
        <div class="flex items-center gap-3 text-[12px] text-neutral-500">
          <span>${t.filesSeen(cov.seenPaths, cov.totalPaths)}</span>
          <div class="w-[84px] h-[3px] rounded-full bg-neutral-900 overflow-hidden">
            <div class="h-full bg-accent transition-[width] duration-300 ease-out" style="width:${cov.pct}%"></div>
          </div>
        </div>
        <button class="btn btn-ghost text-[12.5px]" data-action="open-raw">${t.rawDiff}</button>
      </header>`;
  }

  function renderOverview() {
    const mr = data.merge_request;
    const o = data.overview;
    const m = data.meta;
    const anySeen = seen.size > 0;

    const stepsHtml = data.steps
      .map((step, si) => {
        const status = stepStatus(si);
        const marker = status === 'done' ? '✓' : String(si + 1).padStart(2, '0');
        const stateLabel = status === 'done' ? t.status.done : status === 'progress' ? t.status.progress : t.status.todo;
        const stateColor =
          status === 'done' ? 'text-neutral-500' : status === 'progress' ? 'text-accent-400' : 'text-neutral-600';
        const n = step.files.length;
        return `
          <li class="grid gap-6 items-baseline px-4 py-5 rounded-lg border border-transparent border-b border-b-divider cursor-pointer hover:bg-neutral-900 hover:border-neutral-800" style="grid-template-columns:${GRID.overviewRow}" data-action="open-step" data-si="${si}">
            <span class="font-mono text-[12px] ${status === 'done' ? 'text-accent-400' : 'text-neutral-600'}">${marker}</span>
            <span class="min-w-0 text-neutral-100 text-[15.5px] text-pretty">${escapeHtml(step.title)}</span>
            <span class="font-mono text-[12.5px] text-neutral-600">${t.filesCount(n)}</span>
            <span class="text-[12px] text-right ${stateColor}">${stateLabel}</span>
          </li>`;
      })
      .join('');

    return `
      <main class="flex-1 overflow-auto">
        <div class="max-w-[1080px] mx-auto pt-18 px-12 pb-24 animate-rise">
          <h1 class="text-[38px] font-medium leading-[1.14] tracking-[-0.02em] mb-4 max-w-[20ch] text-pretty">${escapeHtml(mr.title)}</h1>
          <div class="font-mono text-[12px] text-neutral-600 mb-12">${escapeHtml(mr.source_branch)} → ${escapeHtml(mr.target_branch)} · ${m.commits} commit${m.commits === 1 ? '' : 's'} · ${t.filesCount(m.files_changed)} · +${m.insertions} −${m.deletions}</div>

          <div class="grid gap-6 mb-16" style="grid-template-columns:repeat(auto-fit,minmax(240px,1fr))">
            <div class="card">
              <div class="text-[11px] tracking-[0.12em] uppercase text-neutral-600 mb-4">${t.whatItDoes}</div>
              <p class="m-0 text-neutral-200 text-[14.5px] text-pretty">${escapeHtml(o.what)}</p>
            </div>
            <div class="card border-l-2 border-accent">
              <div class="text-[11px] tracking-[0.12em] uppercase text-accent-400 mb-4">${t.why}</div>
              <p class="m-0 text-neutral-200 text-[14.5px] text-pretty">${escapeHtml(o.why)}</p>
            </div>
            <div class="card">
              <div class="text-[11px] tracking-[0.12em] uppercase text-neutral-600 mb-4">${t.risks}</div>
              <p class="m-0 text-neutral-200 text-[14.5px] text-pretty">${escapeHtml(o.risks)}</p>
            </div>
          </div>

          <section class="mb-16 max-w-[72ch]">
            <h2 class="text-[17px] font-medium tracking-[0.1em] uppercase text-neutral-400 mb-6">${t.mentalModel}</h2>
            <div class="flex flex-col gap-4">${paragraphs(o.mental_model, 'text-neutral-200 text-[15px] text-pretty')}</div>
          </section>

          ${renderDecisions(o.decisions)}

          <h2 class="text-[17px] font-medium tracking-[0.1em] uppercase text-neutral-400 mb-8">${t.reviewPath}</h2>
          <ol class="list-none m-0 mb-16 p-0 flex flex-col gap-[2px]">${stepsHtml}</ol>

          <div class="flex gap-4 items-center flex-wrap">
            <button class="btn btn-primary text-[14px] px-5 py-3" data-action="start-walk">${anySeen ? t.resumeReview : t.startReview}</button>
            <button class="btn btn-ghost text-[13px]" data-action="open-raw">${t.openRawDiff}</button>
            <span class="text-neutral-600 text-[12.5px]">${t.readingTime(o.estimated_reading_minutes)}</span>
          </div>
        </div>
      </main>`;
  }

  function renderDecisions(decisions) {
    if (!decisions || !decisions.length) return '';
    const items = decisions
      .map(
        (d) => `
        <li class="border-l-2 border-neutral-800 pl-5">
          <p class="m-0 text-neutral-100 text-[14.5px] text-pretty">${escapeHtml(d.choice)}</p>
          <p class="m-0 mt-1 text-neutral-500 text-[13.5px] text-pretty">${escapeHtml(d.reason)}</p>
        </li>`
      )
      .join('');
    return `
      <section class="mb-16 max-w-[72ch]">
        <h2 class="text-[17px] font-medium tracking-[0.1em] uppercase text-neutral-400 mb-6">${t.decisions}</h2>
        <ul class="list-none m-0 p-0 flex flex-col gap-5">${items}</ul>
      </section>`;
  }

  function renderWatchpoints(points) {
    if (!points || !points.length) return '';
    const items = points
      .map(
        (w) => `
        <li class="grid gap-3 items-start cursor-pointer hover:text-accent-200" style="grid-template-columns:${GRID.watchRow}" data-action="goto-watchpoint" data-hunk="${w.hunkIndex}" data-line="${w.line}">
          <span class="w-[5px] h-[5px] rounded-full bg-accent-500 mt-[7px]"></span>
          <span class="text-neutral-300 text-[13.5px] text-pretty">${escapeHtml(w.note)}</span>
        </li>`
      )
      .join('');
    return `
      <div class="card">
        <div class="text-[11px] tracking-[0.12em] uppercase text-neutral-500 mb-3">${t.watchpointsTitle}</div>
        <ul class="m-0 p-0 list-none flex flex-col gap-3">${items}</ul>
      </div>`;
  }

  // hunkIndex is this hunk's position within the file's own rendered hunks — it's how a
  // watchpoint list item (see renderWatchpoints) finds its way back to the right line via
  // the `wp-<hunkIndex>-<line>` id below.
  function renderHunk(hunk, hunkIndex) {
    const header =
      `@@ -${hunk.old_start},${hunk.old_lines} +${hunk.new_start},${hunk.new_lines} @@` +
      (hunk.label ? ` ${hunk.label}` : '');
    const rows = hunk.lines
      .map((line) => {
        const rowBg = line.type === 'add' ? 'bg-diff-add-bg' : line.type === 'del' ? 'bg-diff-del-bg' : '';
        const sign = line.type === 'add' ? '+' : line.type === 'del' ? '−' : '&nbsp;';
        const signColor =
          line.type === 'add' ? 'text-diff-add-sign' : line.type === 'del' ? 'text-diff-del-sign' : '';
        const codeColor = line.type === 'ctx' ? 'text-neutral-500' : 'text-neutral-200';
        const gutter = line.type === 'del' ? '' : line.newLine ?? '';
        const mark = line.watchpoint ? "shadow-[inset_3px_0_0_var(--color-accent)] font-semibold" : '';
        const idAttr = line.watchpoint ? ` id="wp-${hunkIndex}-${line.newLine ?? line.oldLine}"` : '';
        return `
          <div${idAttr} class="grid gap-3 px-4 py-[1px] ${rowBg} ${mark}" style="grid-template-columns:${GRID.hunkLine}">
            <span class="font-mono text-[11px] text-neutral-700 text-right">${gutter}</span>
            <span class="font-mono text-[12px] ${signColor}">${sign}</span>
            <span class="font-mono text-[12.5px] ${codeColor} whitespace-pre-wrap break-words">${escapeHtml(line.text)}</span>
          </div>`;
      })
      .join('');
    const note = hunk.note
      ? `<div class="px-4 py-3 text-[13px] text-neutral-500 border-t border-neutral-800">${escapeHtml(hunk.note)}</div>`
      : '';
    return `
      <div class="rounded-md border border-neutral-800 overflow-hidden">
        <div class="px-4 py-2 bg-neutral-900 font-mono text-[11px] text-neutral-500 border-b border-neutral-800">${escapeHtml(header)}</div>
        <div class="py-3 bg-code-bg">${rows}</div>
        ${note}
      </div>`;
  }

  function renderWalk() {
    const step = data.steps[state.si];
    const file = step.files[state.fi];
    const idx = pairIndex(state.si, state.fi);
    const isFirstStep = state.si === 0;
    const isLastFileOfStep = state.fi === step.files.length - 1;
    const isLastStep = state.si === data.steps.length - 1;
    const primaryLabel = !isLastFileOfStep
      ? t.seenNextFile
      : !isLastStep
        ? t.seenNextStep
        : t.seenFinish;
    const filesHeading = t.stepFilesHeading(step.files.length);

    const navHtml = data.steps
      .map((s, si) => {
        const status = stepStatus(si);
        const isCurrent = si === state.si;
        const marker = status === 'done' ? '✓' : String(si + 1).padStart(2, '0');
        const rowBg = isCurrent ? 'bg-accent-900' : '';
        const rowFg = isCurrent ? 'text-accent-200' : status === 'done' ? 'text-neutral-500' : 'text-neutral-300';
        const markColor = isCurrent ? 'text-accent-300' : status === 'done' ? 'text-accent-400' : 'text-neutral-600';
        return `
          <button class="grid gap-3 items-start text-left rounded-[6px] px-4 py-3 text-[13px] leading-[1.35] ${rowBg} ${rowFg} hover:bg-neutral-900" style="grid-template-columns:${GRID.navRow}" data-action="open-step" data-si="${si}">
            <span class="font-mono text-[10.5px] pt-0.5 ${markColor}">${marker}</span>
            <span class="min-w-0 text-pretty">${escapeHtml(s.title)}</span>
          </button>`;
      })
      .join('');

    const filesHtml = step.files
      .map((f, fi) => {
        const selected = fi === state.fi;
        const fileSeen = isSeen(state.si, fi);
        const border = selected ? 'border-accent-700' : 'border-neutral-800';
        const rowBg = selected ? 'bg-accent-900' : '';
        const rowFg = selected ? 'text-accent-200' : 'text-neutral-300';
        const markColor = selected ? 'text-accent-300' : fileSeen ? 'text-accent-400' : 'text-neutral-600';
        return `
          <button class="grid gap-3 items-center text-left cursor-pointer px-4 py-[9px] rounded-md border ${border} ${rowBg} hover:border-neutral-700" style="grid-template-columns:${GRID.fileRow}" data-action="open-file" data-fi="${fi}">
            <span class="text-[12px] ${markColor}">${fileSeen ? '✓' : '○'}</span>
            <span class="font-mono text-[12px] ${rowFg} truncate">${escapeHtml(basename(f.path))}</span>
            <span class="font-mono text-[11px] text-neutral-600">${churnLabel(f.churn)}</span>
          </button>`;
      })
      .join('');

    return `
      <div class="flex-1 grid min-h-0" style="grid-template-columns:${GRID.walkColumns}">
        <nav class="border-r border-divider py-6 px-4 flex flex-col gap-[2px] overflow-auto">
          <button class="flex items-center gap-3 text-left rounded-md px-4 py-3 text-[13px] text-neutral-400 mb-4 hover:bg-neutral-900 hover:text-accent-200" data-action="go-overview">
            <svg width="15" height="15" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z"></path></svg>
            <span>${t.back}</span>
          </button>
          <div class="text-[11px] tracking-[0.1em] uppercase text-neutral-600 px-4 pb-4">${t.steps}</div>
          ${navHtml}
        </nav>

        <section class="border-r border-divider py-10 px-8 overflow-auto flex flex-col gap-6 min-w-0">
          <div class="flex flex-col gap-6 flex-1 animate-rise">
            <div class="flex items-center gap-3">
              <span class="font-mono text-[11.5px] text-accent-400">${t.stepCounter(String(state.si + 1).padStart(2, '0'), String(data.steps.length).padStart(2, '0'))}</span>
              <span class="tag tag-outline">${escapeHtml(t.kind[step.kind] || step.kind)}</span>
            </div>
            <h2 class="text-[24px] font-medium leading-[1.2] tracking-[-0.01em] m-0 text-pretty">${escapeHtml(step.title)}</h2>
            <div class="flex flex-col gap-4">${paragraphs(step.narrative, 'text-neutral-300 text-[14.5px] text-pretty')}</div>

            <div class="text-[11px] tracking-[0.1em] uppercase text-neutral-600 mt-2">${filesHeading}</div>
            <div class="flex flex-col gap-2">${filesHtml}</div>

            <div class="flex-1"></div>
            <div class="flex gap-3 items-center flex-wrap pt-4 border-t border-divider">
              <button class="btn btn-primary text-[13px]" data-action="mark-seen">${primaryLabel}</button>
              <button class="btn btn-ghost text-[13px]" data-action="prev-step" ${isFirstStep ? 'disabled' : ''}>${t.prevStep}</button>
            </div>
          </div>
        </section>

        <section class="overflow-auto flex flex-col min-w-0">
          <div class="flex items-center gap-4 px-8 py-4 border-b border-divider sticky top-0 bg-bg z-10">
            <span class="font-mono text-[12.5px] text-neutral-200 truncate min-w-0">${escapeHtml(file.path)}</span>
            <span class="font-mono text-[11.5px] text-neutral-600 whitespace-nowrap">${churnLabel(file.churn)}</span>
            <div class="flex-1"></div>
            <button class="btn btn-ghost text-[12px]" data-action="prev-file" ${idx <= 0 ? 'disabled' : ''}>◂</button>
            <span class="text-[12px] text-neutral-600 whitespace-nowrap">${idx + 1} / ${pairs.length}</span>
            <button class="btn btn-ghost text-[12px]" data-action="next-file" ${idx >= pairs.length - 1 ? 'disabled' : ''}>▸</button>
          </div>

          <div class="p-8 flex flex-col gap-6 animate-rise">
            ${
              file.why
                ? `<div class="card border-l-2 border-accent">
              <div class="text-[11px] tracking-[0.12em] uppercase text-accent-400 mb-3">${t.whyThisChange}</div>
              <p class="m-0 text-neutral-200 text-[14.5px] text-pretty">${escapeHtml(file.why)}</p>
            </div>`
                : ''
            }

            ${renderWatchpoints(file.watchpoints)}

            ${
              file.hunks.length
                ? file.hunks.map((hunk, hi) => renderHunk(hunk, hi)).join('')
                : `<div class="text-neutral-600 text-[13px]">${t.noHunkAvailable}</div>`
            }

            <div class="flex gap-3 items-center">
              <button class="btn btn-secondary text-[12.5px]" data-action="mark-seen">${t.markFileSeen}</button>
            </div>
          </div>
        </section>
      </div>`;
  }

  function renderRawPanel() {
    if (!state.raw) return '';
    const cov = coverage();
    const rows = fileGroups
      .map((g) => {
        const fullySeen = pathFullySeen(g.occurrences);
        const first = g.occurrences[0];
        const file = data.steps[first.si].files[first.fi];
        const stepsLabel = g.occurrences.map((o) => String(o.si + 1).padStart(2, '0')).join(', ');
        return `
          <div class="grid gap-4 items-center py-4 border-b border-divider cursor-pointer" style="grid-template-columns:${GRID.rawRow}" data-action="open-raw-file" data-path="${escapeHtml(g.path)}">
            <span class="text-[12px] ${fullySeen ? 'text-accent-400' : 'text-neutral-600'}">${fullySeen ? '✓' : '○'}</span>
            <span class="font-mono text-[12.5px] text-neutral-300 truncate">${escapeHtml(g.path)}</span>
            <span class="font-mono text-[11.5px] text-neutral-600 whitespace-nowrap">${churnLabel(file.churn)}</span>
            <span class="text-[11.5px] text-neutral-600 whitespace-nowrap">${t.stepsLabel(stepsLabel, g.occurrences.length)}</span>
          </div>`;
      })
      .join('');

    return `
      <div class="fixed inset-0 bg-[rgba(10,11,18,0.62)] flex justify-end z-40" data-action="close-raw-veil">
        <div class="w-[min(720px,92vw)] h-full bg-bg border-l border-neutral-800 shadow-lg flex flex-col animate-rise" data-raw-panel>
          <div class="flex items-center gap-4 px-8 py-6 border-b border-divider">
            <span class="font-heading text-[16px]">${t.rawPanelTitle}</span>
            <span class="text-[12.5px] text-neutral-600">${t.rawPanelSubtitle(fileGroups.length)}</span>
            <span class="tag tag-outline">${cov.seenPaths} / ${cov.totalPaths}</span>
            <div class="flex-1"></div>
            <button class="btn btn-ghost text-[12.5px]" data-action="close-raw">${t.close}</button>
          </div>
          <div class="overflow-auto px-8 pt-4 pb-12">${rows}</div>
        </div>
      </div>`;
  }

  function render() {
    syncUrl();
    root.innerHTML =
      renderHeader() + (state.view === 'overview' ? renderOverview() : renderWalk()) + renderRawPanel();
  }

  // ── Event delegation — the whole tree is rebuilt on every render, so listeners are
  //    attached once on the persistent #app root rather than re-bound each time. ──

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="close-raw-veil"]') && !e.target.closest('[data-raw-panel]')) {
      toggleRaw(false);
      return;
    }
    const action = e.target.closest('[data-action]');
    if (!action) return;
    switch (action.dataset.action) {
      case 'open-raw':
        toggleRaw(true);
        break;
      case 'open-raw-file':
        openRawFile(action.dataset.path);
        break;
      case 'close-raw':
        toggleRaw(false);
        break;
      case 'open-step':
        openStep(Number(action.dataset.si));
        break;
      case 'open-file':
        state.fi = Number(action.dataset.fi);
        render();
        break;
      case 'go-overview':
        gotoOverview();
        break;
      case 'start-walk':
        startWalk();
        break;
      case 'mark-seen':
        markSeenAndAdvance();
        break;
      case 'prev-step':
        stepBack();
        break;
      case 'prev-file':
        stepFile(-1);
        break;
      case 'next-file':
        stepFile(1);
        break;
      case 'goto-watchpoint': {
        const target = document.getElementById(`wp-${action.dataset.hunk}-${action.dataset.line}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  });

  render();
})();
