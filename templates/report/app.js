(function () {
  const data = window.__EASY_DIFF__;
  const root = document.getElementById('app');

  if (!data) {
    root.innerHTML = '<p class="error">Aucune donnée de rapport trouvée.</p>';
    return;
  }

  const KIND_LABELS = {
    foundation: 'Fondation',
    core: 'Cœur logique',
    wiring: 'Câblage',
    delicate: 'Sensible',
    tests: 'Tests',
  };
  const CONFIDENCE_LABELS = {
    high: 'Confiance élevée',
    medium: 'Confiance moyenne',
    low: 'Confiance faible',
  };
  const CHANGE_LABELS = {
    added: 'Ajouté',
    modified: 'Modifié',
    deleted: 'Supprimé',
    renamed: 'Renommé',
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

  function renderHunk(hunk) {
    const header =
      `@@ -${hunk.old_start},${hunk.old_lines} +${hunk.new_start},${hunk.new_lines} @@` +
      (hunk.label ? ` ${hunk.label}` : '');
    const rows = hunk.lines
      .map((line) => {
        const marker = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
        const cls = `line ${line.type}${line.focus ? ' focus' : ''}`;
        return `<div class="${cls}">${escapeHtml(marker + line.text)}</div>`;
      })
      .join('');
    const note = hunk.note ? `<div class="hunk-note">${escapeHtml(hunk.note)}</div>` : '';
    return `
      <div class="hunk">
        <div class="hunk-header">${escapeHtml(header)}</div>
        <pre class="diff">${rows}</pre>
        ${note}
      </div>`;
  }

  function renderWatchpoints(points) {
    if (!points || !points.length) return '';
    return `
      <div class="watchpoints">
        <h3>À vérifier</h3>
        <ul>${points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
      </div>`;
  }

  function renderFile(file) {
    const hunksHtml = file.hunks.length
      ? file.hunks.map(renderHunk).join('')
      : '<div class="diff-empty">Aucun hunk disponible pour ce fichier.</div>';
    return `
      <div class="file">
        <div class="file-header">
          <span class="file-path">${escapeHtml(file.path)}</span>
          <span class="badges">
            <span class="badge change-${file.change_type}">${escapeHtml(CHANGE_LABELS[file.change_type] || file.change_type)}</span>
            <span class="badge confidence-${file.confidence}">${escapeHtml(CONFIDENCE_LABELS[file.confidence] || file.confidence)}</span>
          </span>
        </div>
        <p class="file-why">${escapeHtml(file.why)}</p>
        ${renderWatchpoints(file.watchpoints)}
        <div class="hunks">${hunksHtml}</div>
      </div>`;
  }

  function renderOverview() {
    const o = data.overview;
    const mr = data.merge_request;
    const n = data.steps.length;
    root.innerHTML = `
      <div class="screen overview">
        <p class="eyebrow">easy-diff · base : ${escapeHtml(data.base)}${mr.id ? ` · ${escapeHtml(mr.id)}` : ''}</p>
        <h1>${escapeHtml(mr.title)}</h1>
        <section>
          <h2>Pourquoi</h2>
          <p>${escapeHtml(o.why)}</p>
        </section>
        <section>
          <h2>Ce qui change</h2>
          <p>${escapeHtml(o.what)}</p>
        </section>
        <section>
          <h2>Risques</h2>
          <p>${escapeHtml(o.risks)}</p>
        </section>
        <section>
          <h2>Hors périmètre</h2>
          <p>${escapeHtml(o.out_of_scope)}</p>
        </section>
        <button class="primary" id="start">Commencer la review (${n} étape${n > 1 ? 's' : ''} · ~${o.estimated_reading_minutes} min) →</button>
      </div>`;
    document.getElementById('start').addEventListener('click', () => goTo(0));
  }

  function renderStep(index) {
    const step = data.steps[index];
    const filesHtml = step.files.map(renderFile).join('');

    const isFirst = index === 0;
    const isLast = index === data.steps.length - 1;

    root.innerHTML = `
      <div class="screen step">
        <p class="eyebrow">
          Étape ${index + 1} / ${data.steps.length} ·
          <span class="badge kind-${step.kind}">${escapeHtml(KIND_LABELS[step.kind] || step.kind)}</span> ·
          ${escapeHtml(step.role)}
        </p>
        <h1>${escapeHtml(step.title)}</h1>
        <p class="intro">${escapeHtml(step.intro)}</p>
        <p class="detail">${escapeHtml(step.detail)}</p>
        <div class="files">${filesHtml}</div>
        <div class="nav">
          <button id="prev">${isFirst ? "← Vue d'ensemble" : '← Étape précédente'}</button>
          <a class="overview-link" href="#" id="overview-link">Vue d'ensemble</a>
          <button id="next" ${isLast ? 'disabled' : ''}>${isLast ? 'Fin' : 'Étape suivante →'}</button>
        </div>
      </div>`;

    document.getElementById('prev').addEventListener('click', () => goTo(index - 1));
    document.getElementById('next').addEventListener('click', () => {
      if (!isLast) goTo(index + 1);
    });
    document.getElementById('overview-link').addEventListener('click', (e) => {
      e.preventDefault();
      goTo(-1);
    });
  }

  function goTo(index) {
    window.scrollTo(0, 0);
    if (index < 0) renderOverview();
    else renderStep(index);
  }

  goTo(-1);
})();
