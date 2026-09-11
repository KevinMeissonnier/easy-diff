(function () {
  const data = window.__EASY_DIFF__;
  const root = document.getElementById('app');

  if (!data) {
    root.innerHTML = '<p class="error">Aucune donnée de rapport trouvée.</p>';
    return;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function renderDiff(diffText) {
    if (!diffText || !diffText.trim()) {
      return '<div class="diff-empty">Aucun diff disponible pour ce fichier.</div>';
    }
    const rows = diffText
      .split('\n')
      .filter((line) => !line.startsWith('diff --git') && !line.startsWith('index '))
      .map((line) => {
        let cls = 'ctx';
        if (line.startsWith('+++') || line.startsWith('---')) cls = 'meta';
        else if (line.startsWith('@@')) cls = 'hunk';
        else if (line.startsWith('+')) cls = 'add';
        else if (line.startsWith('-')) cls = 'del';
        return `<div class="line ${cls}">${escapeHtml(line) || '&nbsp;'}</div>`;
      });
    return `<pre class="diff">${rows.join('')}</pre>`;
  }

  function renderAttentionPoints(points) {
    if (!points || !points.length) return '';
    return `
      <div class="attention">
        <h3>Points d'attention</h3>
        <ul>${points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
      </div>`;
  }

  function renderOverview() {
    const o = data.overview;
    const n = data.steps.length;
    root.innerHTML = `
      <div class="screen overview">
        <p class="eyebrow">easy-diff · base : ${escapeHtml(data.base)}</p>
        <h1>${escapeHtml(o.title)}</h1>
        <section>
          <h2>Pourquoi</h2>
          <p>${escapeHtml(o.intent)}</p>
        </section>
        <section>
          <h2>Contexte</h2>
          <p>${escapeHtml(o.context)}</p>
        </section>
        <section>
          <h2>Ce qui change</h2>
          <p>${escapeHtml(o.summary)}</p>
        </section>
        ${renderAttentionPoints(o.attention_points)}
        <button class="primary" id="start">Commencer la review (${n} étape${n > 1 ? 's' : ''}) →</button>
      </div>`;
    document.getElementById('start').addEventListener('click', () => goTo(0));
  }

  function renderStep(index) {
    const step = data.steps[index];
    const filesHtml = step.files
      .map(
        (f) => `
        <div class="file">
          <div class="file-header">
            <span class="file-path">${escapeHtml(f.path)}</span>
            ${f.note ? `<span class="file-note">${escapeHtml(f.note)}</span>` : ''}
          </div>
          ${renderDiff(f.diff)}
        </div>`
      )
      .join('');

    const isFirst = index === 0;
    const isLast = index === data.steps.length - 1;

    root.innerHTML = `
      <div class="screen step">
        <p class="eyebrow">Étape ${index + 1} / ${data.steps.length} · ${escapeHtml(step.role)}</p>
        <h1>${escapeHtml(step.title)}</h1>
        <p class="explanation">${escapeHtml(step.explanation)}</p>
        ${renderAttentionPoints(step.attention_points)}
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
