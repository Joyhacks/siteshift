// Writes a runnable Vite + React + Tailwind CSS v4 project.

export const DEPENDENCIES = {
  react: '^19.3.1',
  'react-dom': '^19.3.1',
};

export const DEV_DEPENDENCIES = {
  '@tailwindcss/vite': '^4.3.5',
  '@types/react': '^19.3.0',
  '@types/react-dom': '^19.3.0',
  '@vitejs/plugin-react': '^6.2.1',
  tailwindcss: '^4.3.5',
  typescript: '^7.0.2',
  vite: '^8.3.6',
};

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export function packageJson(name) {
  return `${JSON.stringify(
    {
      name,
      private: true,
      version: '0.1.0',
      type: 'module',
      scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview', typecheck: 'tsc --noEmit' },
      dependencies: DEPENDENCIES,
      devDependencies: DEV_DEPENDENCIES,
    },
    null,
    2,
  )}\n`;
}

export const VITE_CONFIG = `import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
`;

export const TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      isolatedModules: true,
    },
    include: ['src'],
  },
  null,
  2,
)}\n`;

export const MAIN_TSX = `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

export function indexHtml(meta) {
  const tags = [
    `<meta charset="utf-8" />`,
    `<meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `<title>${escapeHtml(meta?.title || 'Website')}</title>`,
    meta?.description && `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    meta?.ogTitle && `<meta property="og:title" content="${escapeHtml(meta.ogTitle)}" />`,
    meta?.ogDescription && `<meta property="og:description" content="${escapeHtml(meta.ogDescription)}" />`,
    meta?.canonical && `<link rel="canonical" href="${escapeHtml(meta.canonical)}" />`,
  ].filter(Boolean);

  return `<!doctype html>
<html lang="${escapeHtml(meta?.lang || 'en')}">
  <head>
    ${tags.join('\n    ')}
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function indexCss({ themeCss, hasFonts, pageBackground }) {
  return [
    '@import "tailwindcss";',
    hasFonts ? '@import "./fonts.css";' : null,
    '',
    themeCss.trim(),
    '',
    pageBackground ? `body {\n  background-color: ${pageBackground};\n}` : null,
    '',
  ]
    .filter((line) => line !== null)
    .join('\n');
}

export function componentFile(name, jsx) {
  const body = jsx
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `export function ${name}() {\n  return (\n${body}\n  );\n}\n`;
}

export function appFile({ imports, jsx }) {
  const importLines = imports.map((name) => `import { ${name} } from './components/${name}';`).join('\n');
  const body = jsx
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
  return `${importLines}${importLines ? '\n\n' : ''}export function App() {\n  return (\n${body}\n  );\n}\n`;
}

export function readme({ source, components, notes }) {
  return `# ${source ? new URL(source).hostname : 'Website'}

Rebuilt with [Siteshift](https://github.com/Joyhacks/siteshift) from ${source ?? 'a capture'}.

## Run it

\`\`\`bash
npm install
npm run dev
\`\`\`

## Structure

- \`src/index.css\`: Tailwind CSS v4 theme with the site's design tokens
- \`src/fonts.css\`: the site's web fonts, served from \`public/assets\`
- \`src/components/\`: one component per page section (${components.join(', ') || 'none'})
- \`public/assets/\`: images, fonts and other files downloaded from the page

Styles use the theme tokens where values match (\`bg-primary\`, \`text-4xl\`, \`rounded-md\`) and exact values elsewhere. Mobile styles are the base; desktop differences use the \`lg:\` breakpoint.
${notes.length ? `\n## Notes\n\n${notes.map((n) => `- ${n}`).join('\n')}\n` : ''}`;
}
