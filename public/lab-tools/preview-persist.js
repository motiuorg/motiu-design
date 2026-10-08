/**
 * Restores Andrea's saved preview state from localStorage on every preview page.
 * Paper: set on colors-compare.html → refi-paper-v1
 * Pillars: set on colors-compare.html → refi-pillar-hex-v1
 * Display font: set on fonts-compare.html → refi-display-font-v1 (applies --font-display + weight on landing + styles)
 */
(function () {
  const RESET_PARAM = 'reset-colors';
  if (new URLSearchParams(location.search).has(RESET_PARAM)) {
    try {
      localStorage.removeItem('refi-paper-v1');
      localStorage.removeItem('refi-pillar-hex-v1');
      localStorage.removeItem('refi-display-font-v1');
      const url = new URL(location.href);
      url.searchParams.delete(RESET_PARAM);
      location.replace(url.pathname + url.search + url.hash);
    } catch {
      /* ignore */
    }
    return;
  }

  const PAPER_TOKENS = [
    '--paper-50',
    '--paper-100',
    '--paper-200',
    '--paper-700',
    '--paper-900',
  ];

  const PILLARS = ['neural', 'tissue', 'flow'];
  const PILLAR_STEPS = [1, 2, 3, 4];

  const PILLAR_TOKENS = PILLARS.flatMap((p) =>
    PILLAR_STEPS.map((s) => `--pillar-${p}-${s}`)
  );

  /** Maps legacy light/mid/dark saves to 6-step tokens */
  const PILLAR_LEGACY = {
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

  const PAPER_KEY = 'refi-paper-v1';
  const PILLAR_KEY = 'refi-pillar-hex-v1';

  function normalizePillarSaved(raw) {
    const out = { ...raw };
    Object.entries(PILLAR_LEGACY).forEach(([legacy, next]) => {
      if (raw[legacy] != null && out[next] == null) {
        out[next] = raw[legacy];
      }
      delete out[legacy];
    });
    return out;
  }

  function loadPaper() {
    try {
      const saved = JSON.parse(localStorage.getItem(PAPER_KEY) || '{}');
      PAPER_TOKENS.forEach((token) => {
        if (saved[token]) {
          document.documentElement.style.setProperty(token, saved[token]);
        }
      });
    } catch {
      /* ignore */
    }
  }

  function loadPillarHexes() {
    try {
      const saved = normalizePillarSaved(
        JSON.parse(localStorage.getItem(PILLAR_KEY) || '{}')
      );
      PILLAR_TOKENS.forEach((token) => {
        if (saved[token]) {
          document.documentElement.style.setProperty(token, saved[token]);
        }
      });
    } catch {
      /* ignore */
    }
  }

  function savePaper(token, hex) {
    try {
      const saved = JSON.parse(localStorage.getItem(PAPER_KEY) || '{}');
      saved[token] = hex;
      localStorage.setItem(PAPER_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }

  function savePillar(token, hex) {
    try {
      const saved = normalizePillarSaved(
        JSON.parse(localStorage.getItem(PILLAR_KEY) || '{}')
      );
      const key = PILLAR_LEGACY[token] || token;
      saved[key] = hex;
      localStorage.setItem(PILLAR_KEY, JSON.stringify(saved));
    } catch {
      /* ignore */
    }
  }

  loadPaper();
  loadPillarHexes();

  window.RefiPaper = { load: loadPaper, save: savePaper, PAPER_TOKENS, STORAGE_KEY: PAPER_KEY };
  window.RefiPillar = {
    load: loadPillarHexes,
    save: savePillar,
    PILLAR_TOKENS,
    PILLARS,
    PILLAR_STEPS,
    STORAGE_KEY: PILLAR_KEY,
  };
})();

(function () {
  const DISPLAY_FONT_KEY = 'refi-display-font-v1';
  const DISPLAY_IDS = ['averia', 'caudex', 'labrada', 'earth'];

  const DISPLAY_PRESETS = {
    averia: { family: "'Averia Serif Libre', Georgia, serif", weight: '400' },
    caudex: { family: "'Caudex', Georgia, serif", weight: '400' },
    labrada: { family: "'Labrada', Georgia, serif", weight: '600' },
    earth: { family: "'Earth Tone', 'Geist', system-ui, sans-serif", weight: '400' },
  };

  function normalizeDisplayId(id) {
    if (id && DISPLAY_PRESETS[id]) return id;
    return 'averia';
  }

  function getDisplayFontId() {
    try {
      return normalizeDisplayId(localStorage.getItem(DISPLAY_FONT_KEY));
    } catch {
      return 'averia';
    }
  }

  function applyDisplayFont(id) {
    const preset = DISPLAY_PRESETS[normalizeDisplayId(id)];
    document.documentElement.style.setProperty('--font-display', preset.family);
    document.documentElement.style.setProperty('--font-display-weight', preset.weight);
  }

  function loadDisplayFont() {
    const id = getDisplayFontId();
    applyDisplayFont(id);
    return id;
  }

  function saveDisplayFont(id) {
    const next = normalizeDisplayId(id);
    try {
      localStorage.setItem(DISPLAY_FONT_KEY, next);
    } catch {
      /* ignore */
    }
    applyDisplayFont(next);
    return next;
  }

  loadDisplayFont();

  window.RefiDisplayFont = {
    getId: getDisplayFontId,
    load: loadDisplayFont,
    save: saveDisplayFont,
    apply: applyDisplayFont,
    STORAGE_KEY: DISPLAY_FONT_KEY,
    IDS: DISPLAY_IDS,
    PRESETS: DISPLAY_PRESETS,
  };
})();
