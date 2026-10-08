/**
 * Shared color-picker logic for colors-compare.html
 */

(function () {
  const PAPER_TOKENS = window.RefiPaper?.PAPER_TOKENS || [
    '--paper-50', '--paper-100', '--paper-200', '--paper-700', '--paper-900',
  ];

  const PILLAR_TOKENS = window.RefiPillar?.PILLAR_TOKENS || [];

  function isPaperToken(token) {
    return PAPER_TOKENS.includes(token);
  }

  function isPillarToken(token) {
    return /^--pillar-(neural|tissue|flow)-[1-4]$/.test(token);
  }

  function isLibToken(token) {
    return token.startsWith('--lib-');
  }

  function syncSwatchUi(input, hex) {
    const hexEl = input.closest('.swatch-edit, .pillar-swatch-bar, .lib-scale__cell')?.querySelector('[data-hex]');
    if (hexEl) hexEl.textContent = hex.toUpperCase();
    const chip = input.closest('.swatch-edit')?.querySelector('.swatch-edit__chip');
    if (chip) chip.style.background = hex;
    const bar = input.closest('.pillar-swatch-bar');
    if (bar) bar.style.background = hex;
    const cell = input.closest('.lib-scale__cell--editable');
    if (cell) {
      cell.style.background = hex;
      cell.style.color = libTextColor(hex);
    }
  }

  function libTextColor(hex) {
    const h = hex.replace('#', '');
    if (h.length < 6) return '#fff';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.55 ? 'var(--paper-900)' : '#fff';
  }

  /** Re-apply localStorage pillar hexes to :root + inputs */
  function applyStoredPillarHexesToDom() {
    try {
      const raw = JSON.parse(localStorage.getItem('refi-pillar-hex-v1') || '{}');
      const legacy = {
        '--pillar-neural-light': '--pillar-neural-1',
        '--pillar-neural-mid': '--pillar-neural-3',
        '--pillar-neural-dark': '--pillar-neural-4',
        '--pillar-tissue-light': '--pillar-tissue-1',
        '--pillar-tissue-mid': '--pillar-tissue-3',
        '--pillar-tissue-dark': '--pillar-tissue-4',
        '--pillar-flow-light': '--pillar-flow-1',
        '--pillar-flow-mid': '--pillar-flow-3',
        '--pillar-flow-dark': '--pillar-flow-4',
      };
      Object.entries(raw).forEach(([token, hex]) => {
        const key = legacy[token] || token;
        document.documentElement.style.setProperty(key, hex);
        const input = document.querySelector(`input[data-token="${key}"]`);
        if (input) {
          input.value = hex;
          syncSwatchUi(input, hex);
        }
      });
      document.dispatchEvent(new CustomEvent('refi-colors-updated'));
    } catch {
      /* ignore */
    }
  }

  function bindPicker(input) {
    const token = input.dataset.token;
    if (!token) return;

    const sync = () => {
      const hex = input.value;
      document.documentElement.style.setProperty(token, hex);
      if (isPaperToken(token) && window.RefiPaper) {
        window.RefiPaper.save(token, hex);
      } else if (isPillarToken(token) && window.RefiPillar) {
        window.RefiPillar.save(token, hex);
      }
      syncSwatchUi(input, hex);
      document.dispatchEvent(new CustomEvent('refi-colors-updated'));
    };

    input.addEventListener('input', sync);
    sync();
  }

  function buildTokensSnippet() {
    const root = getComputedStyle(document.documentElement);
    const lines = [':root {'];
    PAPER_TOKENS.forEach((name) => {
      const val = root.getPropertyValue(name).trim();
      if (val) lines.push(`  ${name}: ${val};`);
    });
    PILLAR_TOKENS.forEach((name) => {
      const val = root.getPropertyValue(name).trim();
      if (val) lines.push(`  ${name}: ${val};`);
    });
    document.querySelectorAll('input[data-token]').forEach((input) => {
      const t = input.dataset.token;
      if (!isPaperToken(t) && !isPillarToken(t) && isLibToken(t)) {
        lines.push(`  ${t}: ${input.value};`);
      }
    });
    lines.push('}');
    return lines.join('\n');
  }

  function buildLockedJson() {
    const root = getComputedStyle(document.documentElement);
    const paper = {};
    PAPER_TOKENS.forEach((name) => {
      const val = root.getPropertyValue(name).trim();
      if (val) paper[name] = val;
    });
    const pillar = {};
    PILLAR_TOKENS.forEach((name) => {
      const val = root.getPropertyValue(name).trim();
      if (val) pillar[name] = val;
    });
    const library = {};
    document.querySelectorAll('.lib-scale__cell--editable input[data-token]').forEach((input) => {
      const token = input.dataset.token;
      if (!token?.startsWith('--lib-')) return;
      library[token] = input.value;
    });
    return {
      _note: 'Export from colors-compare.html — run: node scripts/apply-preview-colors.mjs',
      updated: new Date().toISOString().slice(0, 10),
      paper,
      pillar,
      library,
    };
  }

  function initExportButton() {
    const btn = document.getElementById('export-tokens');
    if (!btn) return;
    btn.addEventListener('click', () => {
      navigator.clipboard?.writeText(buildTokensSnippet());
      btn.textContent = 'Copied to clipboard';
      setTimeout(() => { btn.textContent = 'Copy tokens.css snippet'; }, 2000);
    });
  }

  function initDownloadLockedButton() {
    const btn = document.getElementById('download-locked-json');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const json = JSON.stringify(buildLockedJson(), null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'colors-locked.json';
      a.click();
      URL.revokeObjectURL(a.href);
      btn.textContent = 'Downloaded — move to preview/ and run apply script';
      setTimeout(() => { btn.textContent = 'Download colors-locked.json'; }, 4000);
    });
  }

  function initSavePaperButton() {
    const btn = document.getElementById('save-paper');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = getComputedStyle(document.documentElement);
      const lines = PAPER_TOKENS.map((name) => {
        const val = root.getPropertyValue(name).trim();
        return `  ${name}: ${val};`;
      });
      const snippet = `  /* Andrea paper neutrals */\n${lines.join('\n')}`;
      navigator.clipboard?.writeText(snippet);
      btn.textContent = 'Paper block copied — paste into tokens.css';
      setTimeout(() => { btn.textContent = 'Copy paper block for tokens.css'; }, 3000);
    });
  }

  function initSavePillarButton() {
    const btn = document.getElementById('save-pillar');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const root = getComputedStyle(document.documentElement);
      const lines = PILLAR_TOKENS.map((name) => {
        const val = root.getPropertyValue(name).trim();
        return `  ${name}: ${val};`;
      });
      const snippet = `  /* Andrea pillar ranges (4 editable steps per pillar) */\n${lines.join('\n')}`;
      navigator.clipboard?.writeText(snippet);
      btn.textContent = 'Pillar block copied — paste into tokens.css';
      setTimeout(() => { btn.textContent = 'Copy pillar block for tokens.css'; }, 3000);
    });
  }

  function initPickers() {
    document.querySelectorAll('input[type="color"][data-token]').forEach(bindPicker);
    applyStoredPillarHexesToDom();
  }

  function init() {
    initExportButton();
    initDownloadLockedButton();
    initSavePaperButton();
    initSavePillarButton();
  }

  init();

  window.RefiColors = {
    bindPicker,
    initPickers,
    applyStoredPillarHexesToDom,
    libTextColor,
  };
})();
