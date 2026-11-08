// A self-contained HTML page for eyeballing the extracted tokens next to the
// original screenshots. Opens straight from disk, no server needed.

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

const ROLE_LABELS = {
  canvas: 'Page frame',
  background: 'Background',
  surface: 'Surface',
  inverse: 'Inverse',
  foreground: 'Text',
  muted: 'Muted text',
  primary: 'Primary',
  primaryForeground: 'On primary',
  border: 'Border',
};

function section(title, body) {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function colorSection({ roles, palette, contrast }) {
  const roleCards = Object.entries(ROLE_LABELS)
    .filter(([key]) => roles[key])
    .map(
      ([key, label]) => `
      <div class="swatch">
        <div class="chip" style="background:${escapeHtml(roles[key])}"></div>
        <div class="meta"><strong>${escapeHtml(label)}</strong><code>${escapeHtml(roles[key])}</code></div>
      </div>`,
    )
    .join('');

  const strip = palette
    .map(
      (c) =>
        `<div class="band" style="background:${escapeHtml(c.hex)};flex:${Math.max(c.share, 2)}" title="${escapeHtml(c.hex)} · ${c.share}%"></div>`,
    )
    .join('');

  const rows = contrast
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(c.label)}</td>
        <td><span class="pair" style="background:${escapeHtml(c.background)};color:${escapeHtml(c.foreground)}">Aa</span></td>
        <td>${c.ratio}:1</td>
        <td class="${c.passesAA ? 'pass' : 'fail'}">${c.passesAA ? 'Passes AA' : 'Fails AA'}</td>
      </tr>`,
    )
    .join('');

  return section(
    'Colors',
    `<div class="swatches">${roleCards}</div>
     <h3>Palette by usage</h3><div class="strip">${strip}</div>
     <h3>Contrast</h3><table><tbody>${rows}</tbody></table>`,
  );
}

function typeSection({ fonts, type }) {
  const families = [
    fonts.heading && `<p><strong>Headings</strong> <code>${escapeHtml(fonts.heading.stack)}</code> weights ${fonts.heading.weights.join(', ')}</p>`,
    fonts.body && `<p><strong>Body</strong> <code>${escapeHtml(fonts.body.stack)}</code> weights ${fonts.body.weights.join(', ')}</p>`,
  ]
    .filter(Boolean)
    .join('');

  const rows = [...type.scale]
    .reverse()
    .map((step) => {
      const fallback = step.size > (type.base ?? 16) * 1.4 ? fonts.heading : fonts.body;
      const font = step.fontFamily ? { stack: step.fontFamily } : fallback;
      const style = [
        `font-size:${step.size}px`,
        `font-weight:${step.weight}`,
        step.lineHeight ? `line-height:${step.lineHeight}` : '',
        step.letterSpacing ? `letter-spacing:${step.letterSpacing}` : '',
        font ? `font-family:${font.stack}` : '',
      ]
        .filter(Boolean)
        .join(';');
      const sizes = step.mobile !== step.size ? `${step.size}px / ${step.mobile}px mobile` : `${step.size}px`;
      return `
      <div class="type-row">
        <div class="type-meta"><strong>text-${escapeHtml(step.name)}</strong><span>${sizes}</span></div>
        <div class="type-sample" style="${escapeHtml(style)}">${escapeHtml(step.sample || 'The quick brown fox')}</div>
      </div>`;
    })
    .join('');

  return section('Typography', `${families}<div class="type-scale">${rows}</div>`);
}

function layoutSection({ spacing, radii, shadows, container }) {
  const bars = spacing.scale
    .map((v) => `<div class="space"><span style="width:${Math.min(v, 256)}px"></span><code>${v}px</code></div>`)
    .join('');
  const spacingNote = spacing.base
    ? `<p>${spacing.base}px grid, ${spacing.consistency}% of spacing values fit it.</p>`
    : '<p>No consistent spacing grid detected.</p>';

  const radiusBoxes = radii.values
    .map((r) => `<div class="box" style="border-radius:${r.value}px"><code>${escapeHtml(r.name)} · ${r.value}px</code></div>`)
    .join('');
  const fullBox = radii.full ? '<div class="box" style="border-radius:9999px"><code>full</code></div>' : '';

  const shadowBoxes = shadows
    .map((s) => `<div class="box shadow" style="box-shadow:${escapeHtml(s.value)}"><code>${escapeHtml(s.name)}</code></div>`)
    .join('');

  return [
    section('Spacing', spacingNote + bars),
    radii.values.length || radii.full ? section('Radii', `<div class="boxes">${radiusBoxes}${fullBox}</div>`) : '',
    shadows.length ? section('Shadows', `<div class="boxes">${shadowBoxes}</div>`) : '',
    container.width ? section('Content width', `<p><code>${container.width}px</code> max width for page content.</p>`) : '',
  ].join('');
}

export function buildPreviewHtml(tokens) {
  const notes = tokens.notes.length
    ? section('Notes', `<ul>${tokens.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`)
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design tokens · ${escapeHtml(tokens.source ?? 'Siteshift')}</title>
<style>
  :root { --ink: #16181d; --soft: #5b6170; --line: #e4e6eb; --page: #f6f7f9; --card: #ffffff; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--page); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 1040px; margin: 0 auto; padding: 40px 20px 80px; }
  header h1 { font-size: 22px; margin: 0 0 4px; }
  header p { margin: 0; color: var(--soft); }
  section { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 24px; margin-top: 20px; }
  h2 { font-size: 16px; margin: 0 0 16px; }
  h3 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--soft); margin: 24px 0 10px; }
  code { font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--soft); }
  .swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 12px; }
  .swatch { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .chip { height: 64px; border-bottom: 1px solid var(--line); }
  .meta { padding: 8px 10px; display: flex; flex-direction: column; }
  .strip { display: flex; height: 40px; border-radius: 8px; overflow: hidden; border: 1px solid var(--line); }
  table { border-collapse: collapse; width: 100%; }
  td { padding: 8px 0; border-top: 1px solid var(--line); }
  .pair { display: inline-block; padding: 2px 10px; border-radius: 6px; font-weight: 600; border: 1px solid var(--line); }
  .pass { color: #1a7f37; } .fail { color: #c62828; }
  .type-row { display: grid; grid-template-columns: 170px 1fr; gap: 16px; align-items: baseline; padding: 14px 0; border-top: 1px solid var(--line); }
  .type-meta { display: flex; flex-direction: column; font-size: 13px; color: var(--soft); }
  .type-meta strong { color: var(--ink); }
  .type-sample { overflow-wrap: anywhere; }
  .space { display: flex; align-items: center; gap: 12px; margin: 6px 0; }
  .space span { display: block; height: 12px; background: #6b7cff; border-radius: 3px; }
  .boxes { display: flex; flex-wrap: wrap; gap: 16px; }
  .box { width: 120px; height: 80px; border: 1px solid var(--line); background: var(--page); display: grid; place-items: center; }
  .box.shadow { background: var(--card); border-color: transparent; }
  @media (max-width: 640px) { .type-row { grid-template-columns: 1fr; gap: 4px; } }
</style>
</head>
<body>
<main>
  <header>
    <h1>Design tokens</h1>
    <p>${escapeHtml(tokens.source ?? '')} · extracted by Siteshift</p>
  </header>
  ${colorSection(tokens.colors)}
  ${typeSection(tokens)}
  ${layoutSection(tokens)}
  ${notes}
</main>
</body>
</html>
`;
}
