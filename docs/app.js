const API_BASE = window.CORRECTOR_API_BASE || '';

const textInput = document.getElementById('textInput');
const highlights = document.getElementById('highlights');

let lastMatches = [];
let activeMatchKey = null;
let toastTimer = null;

const tooltip = document.createElement('div');
tooltip.id = 'suggestionTooltip';
tooltip.className = 'suggestion-tooltip hidden';
document.body.appendChild(tooltip);

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function countWords(text) {
  const words = text.trim().match(/\S+/g);
  return words ? words.length : 0;
}

function countLetters(text) {
  const letters = text.match(/[A-Za-zÁÉÍÓÚáéíóúÜüÑñ]/g);
  return letters ? letters.length : 0;
}

function syncScroll() {
  highlights.scrollTop = textInput.scrollTop;
  highlights.scrollLeft = textInput.scrollLeft;
}

function updateCounts(text, issues = 0) {
  const wordCount = document.getElementById('wordCount');
  const letterCount = document.getElementById('letterCount');
  const charCount = document.getElementById('charCount');
  const issueCount = document.getElementById('issueCount');

  if (wordCount) wordCount.textContent = countWords(text);
  if (letterCount) letterCount.textContent = countLetters(text);
  if (charCount) charCount.textContent = text.length;
  if (issueCount) issueCount.textContent = issues;
}

function getMatchKey(match) {
  return `${match.offset}-${match.length}`;
}

function renderHighlights(matches) {
  const text = textInput.value;

  if (!text) {
    highlights.innerHTML = '';
    syncScroll();
    return;
  }

  if (!matches.length) {
    highlights.innerHTML = escapeHtml(text) + (text.endsWith('\n') ? '\u200b' : '');
    syncScroll();
    return;
  }

  const ordered = [...matches].sort((a, b) => a.offset - b.offset);
  let html = '';
  let lastIndex = 0;

  ordered.forEach((match) => {
    const key = getMatchKey(match);
    const activeClass = activeMatchKey === key ? ' active-error' : '';
    const before = text.slice(lastIndex, match.offset);
    const word = text.slice(match.offset, match.offset + match.length);

    html += escapeHtml(before);
    html += `<mark class="error-mark${activeClass}" data-offset="${match.offset}" data-length="${match.length}" data-key="${key}">${escapeHtml(word)}</mark>`;

    lastIndex = match.offset + match.length;
  });

  html += escapeHtml(text.slice(lastIndex));

  if (text.endsWith('\n')) {
    html += '\u200b';
  }

  highlights.innerHTML = html;
  syncScroll();
}

function renderIdleState() {
  const grammarResult = document.getElementById('grammarResult');
  if (!grammarResult) return;

  grammarResult.innerHTML = `
    <div class="badge warn">Esperando análisis</div>
    <div class="score">Puntuación estimada: --/100</div>
    <div class="legend">
      Presiona <strong>Analizar</strong> para revisar ortografía, gramática, acentuación y puntuación.
    </div>
  `;
}

function buildIssuesList(matches) {
  if (!matches.length) return '';

  return `
    <ul class="issues">
      ${matches.slice(0, 12).map((item) => {
        const key = getMatchKey(item);
        const activeClass = activeMatchKey === key ? ' active-issue' : '';
        const selectedText = textInput.value.slice(item.offset, item.offset + item.length);

        return `
          <li class="issue-item${activeClass}" data-key="${key}">
            <span class="issue-word">${escapeHtml(selectedText)}</span>
            <span class="issue-separator">—</span>
            <span class="issue-message">${escapeHtml(item.message || 'Posible error detectado.')}</span>
          </li>
        `;
      }).join('')}
    </ul>
  `;
}

function renderAnalysisPanel(matches) {
  const box = document.getElementById('grammarResult');
  if (!box) return;

  const score = Math.max(0, 100 - (matches.length * 8));

  if (!matches.length) {
    box.innerHTML = `
      <div class="badge ok">Sin errores detectados</div>
      <div class="score">Puntuación estimada: ${score}/100</div>
      <div class="legend">El texto no presenta errores gramaticales evidentes.</div>
    `;
    return;
  }

  box.innerHTML = `
    <div class="badge warn">Observaciones encontradas</div>
    <div class="score">Puntuación estimada: ${score}/100</div>
    ${buildIssuesList(matches)}
    <div class="legend">Haz clic sobre una palabra subrayada para ver y aplicar una corrección.</div>
  `;
}

async function analyzeText() {
  const text = textInput.value;
  updateCounts(text, 0);
  hideTooltip();

  if (!text.trim()) {
    lastMatches = [];
    activeMatchKey = null;
    renderHighlights([]);
    renderIdleState();
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: 'es' })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo analizar el texto.');
    }

    lastMatches = Array.isArray(data.matches) ? data.matches : [];
    activeMatchKey = null;

    renderHighlights(lastMatches);
    updateCounts(text, lastMatches.length);
    renderAnalysisPanel(lastMatches);
  } catch (_error) {
    lastMatches = [];
    activeMatchKey = null;
    renderHighlights([]);

    const grammarResult = document.getElementById('grammarResult');
    if (grammarResult) {
      grammarResult.innerHTML = `
        <div class="badge warn">Error de conexión</div>
        <div class="score">No se pudo consultar el motor de corrección.</div>
        <div class="legend">Verifica la configuración del servicio de análisis.</div>
      `;
    }
  }
}

async function correctText() {
  const text = textInput.value;
  hideTooltip();

  if (!text.trim()) {
    showToast('No hay texto para corregir.');
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/correct`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, language: 'es' })
    });

    const data = await response.json();

    if (!response.ok || !data.ok) {
      throw new Error(data.error || 'No se pudo corregir el texto.');
    }

    textInput.value = data.correctedText || text;
    await analyzeText();
    showToast('Corrección aplicada.');
  } catch (error) {
    showToast(error.message || 'No se pudo corregir el texto.');
  }
}

async function copyText() {
  const text = textInput.value;

  if (!text.trim()) {
    showToast('No hay texto para copiar.');
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('Texto copiado.');
  } catch (_error) {
    const helper = document.createElement('textarea');
    helper.value = text;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
    showToast('Texto copiado.');
  }
}

function clearText() {
  textInput.value = '';
  lastMatches = [];
  activeMatchKey = null;
  hideTooltip();
  renderHighlights([]);
  updateCounts('', 0);
  renderIdleState();
}

function setActiveMatch(match) {
  activeMatchKey = getMatchKey(match);
  renderHighlights(lastMatches);

  document.querySelectorAll('.issue-item').forEach((item) => {
    item.classList.remove('active-issue');
  });

  const issue = document.querySelector(`.issue-item[data-key="${activeMatchKey}"]`);
  if (issue) {
    issue.classList.add('active-issue');
  }
}

function hideTooltip() {
  tooltip.classList.add('hidden');
  tooltip.innerHTML = '';
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function findMatchByElement(mark) {
  const offset = Number(mark.dataset.offset);
  const length = Number(mark.dataset.length);
  return lastMatches.find((item) => item.offset === offset && item.length === length);
}

function findMatchAtPosition(position) {
  return lastMatches.find((match) => {
    const start = match.offset;
    const end = match.offset + match.length;
    return position >= start && position <= end;
  });
}

function getCaretCoordinates(textarea, position) {
  const div = document.createElement('div');
  const style = window.getComputedStyle(textarea);

  const properties = [
    'boxSizing',
    'width',
    'height',
    'overflowX',
    'overflowY',
    'borderTopWidth',
    'borderRightWidth',
    'borderBottomWidth',
    'borderLeftWidth',
    'paddingTop',
    'paddingRight',
    'paddingBottom',
    'paddingLeft',
    'fontStyle',
    'fontVariant',
    'fontWeight',
    'fontStretch',
    'fontSize',
    'fontSizeAdjust',
    'lineHeight',
    'fontFamily',
    'textAlign',
    'textTransform',
    'textIndent',
    'textDecoration',
    'letterSpacing',
    'wordSpacing',
    'tabSize',
    'MozTabSize'
  ];

  div.style.position = 'absolute';
  div.style.visibility = 'hidden';
  div.style.whiteSpace = 'pre-wrap';
  div.style.wordWrap = 'break-word';
  div.style.overflowWrap = 'break-word';
  div.style.left = '-9999px';
  div.style.top = '0';

  properties.forEach((prop) => {
    div.style[prop] = style[prop];
  });

  div.textContent = textarea.value.slice(0, position);

  const span = document.createElement('span');
  span.textContent = textarea.value.slice(position, position + 1) || '\u200b';
  div.appendChild(span);

  document.body.appendChild(div);

  const textareaRect = textarea.getBoundingClientRect();
  const divRect = div.getBoundingClientRect();
  const spanRect = span.getBoundingClientRect();

  const coordinates = {
    top: spanRect.top - divRect.top - textarea.scrollTop,
    left: spanRect.left - divRect.left - textarea.scrollLeft,
    lineHeight: parseFloat(style.lineHeight) || 24,
    textareaRect
  };

  document.body.removeChild(div);
  return coordinates;
}

function showTooltipAtPosition(match, top, left) {
  const suggestions = Array.isArray(match.replacements) ? match.replacements : [];
  const selectedText = textInput.value.slice(match.offset, match.offset + match.length);

  if (!suggestions.length) {
    hideTooltip();
    return;
  }

  tooltip.innerHTML = `
    <div class="tooltip-header">
      <div class="tooltip-title">${escapeHtml(selectedText)}</div>
      <div class="tooltip-subtitle">${escapeHtml(match.message || 'Posible error detectado.')}</div>
    </div>
    <div class="tooltip-actions">
      ${suggestions.slice(0, 6).map((suggestion, index) => `
        <button class="tooltip-suggestion" type="button" data-index="${index}">
          <span>${escapeHtml(typeof suggestion === 'string' ? suggestion : suggestion.value || '')}</span>
        </button>
      `).join('')}
      <button class="tooltip-ignore" type="button" data-ignore="1">
        <span>Ignorar</span>
      </button>
    </div>
  `;

  tooltip.classList.remove('hidden');
  tooltip.style.top = '0px';
  tooltip.style.left = '0px';

  const viewportPadding = 8;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const tooltipRect = tooltip.getBoundingClientRect();
  const tooltipWidth = tooltipRect.width;
  const tooltipHeight = tooltipRect.height;

  let finalLeft = left - (tooltipWidth / 2);
  let finalTop = top;

  if (finalLeft < viewportPadding + window.scrollX) {
    finalLeft = viewportPadding + window.scrollX;
  }

  const maxLeft = window.scrollX + viewportWidth - tooltipWidth - viewportPadding;
  if (finalLeft > maxLeft) {
    finalLeft = maxLeft;
  }

  const bottomOverflow = (finalTop - window.scrollY) + tooltipHeight > viewportHeight - viewportPadding;
  if (bottomOverflow) {
    finalTop = top - tooltipHeight - 14;
  }

  if (finalTop < window.scrollY + viewportPadding) {
    finalTop = window.scrollY + viewportPadding;
  }

  tooltip.style.left = `${finalLeft}px`;
  tooltip.style.top = `${finalTop}px`;

  tooltip.querySelectorAll('.tooltip-suggestion').forEach((button, index) => {
    button.addEventListener('click', async () => {
      const rawSuggestion = suggestions[index];
      const replacement = typeof rawSuggestion === 'string' ? rawSuggestion : rawSuggestion.value || '';

      if (!replacement) return;

      const current = textInput.value;
      textInput.value =
        current.slice(0, match.offset) +
        replacement +
        current.slice(match.offset + match.length);

      hideTooltip();
      await analyzeText();
      showToast('Corrección aplicada.');
      textInput.focus();
    });
  });

  const ignoreButton = tooltip.querySelector('[data-ignore="1"]');
  if (ignoreButton) {
    ignoreButton.addEventListener('click', () => {
      hideTooltip();
      textInput.focus();
    });
  }
}

function showTooltipForMatch(match, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const top = rect.bottom + window.scrollY + 10;
  const left = rect.left + window.scrollX + (rect.width / 2);
  showTooltipAtPosition(match, top, left);
}

function showTooltipFromTextareaClick(match) {
  const coords = getCaretCoordinates(textInput, match.offset + match.length);
  const top = coords.textareaRect.top + window.scrollY + coords.top + coords.lineHeight + 8;
  const left = coords.textareaRect.left + window.scrollX + coords.left + 12;
  showTooltipAtPosition(match, top, left);
}

async function waitForBackend() {
  const loader = document.getElementById('bootLoader');
  const message = document.getElementById('bootMessage');
  const appRoot = document.getElementById('appRoot');
  const healthUrl = `${API_BASE}/health`;

  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      message.textContent = attempts === 1
        ? 'Estamos preparando el motor de corrección...'
        : `Conectando con GRAMATIA... intento ${attempts} de ${maxAttempts}.`;

      const response = await fetch(healthUrl, { method: 'GET', cache: 'no-store' });

      if (response.ok) {
        loader.style.display = 'none';
        appRoot.classList.remove('app-hidden');
        return;
      }
    } catch (_error) {}

    await new Promise((resolve) => setTimeout(resolve, 3000));
  }

  message.textContent = 'No se pudo conectar con el motor de corrección. Recarga la página en unos segundos.';
}

textInput.addEventListener('scroll', () => {
  syncScroll();
  hideTooltip();
});

textInput.addEventListener('input', () => {
  hideTooltip();
  activeMatchKey = null;
  lastMatches = [];
  renderHighlights([]);
  updateCounts(textInput.value, 0);
  renderIdleState();
});

textInput.addEventListener('click', () => {
  if (!lastMatches.length) return;

  const position = textInput.selectionStart;
  const match = findMatchAtPosition(position);

  if (!match) {
    hideTooltip();
    activeMatchKey = null;
    renderHighlights(lastMatches);
    return;
  }

  setActiveMatch(match);
  showTooltipFromTextareaClick(match);
});

highlights.addEventListener('mouseover', (event) => {
  const mark = event.target.closest('mark');
  if (!mark) return;

  const match = findMatchByElement(mark);
  if (!match) return;

  setActiveMatch(match);
});

const grammarResult = document.getElementById('grammarResult');

if (grammarResult) {
  grammarResult.addEventListener('mouseover', (event) => {
    const issue = event.target.closest('.issue-item');
    if (!issue) return;

    const key = issue.dataset.key;
    const match = lastMatches.find((item) => getMatchKey(item) === key);
    if (!match) return;

    setActiveMatch(match);
  });

  grammarResult.addEventListener('click', (event) => {
    const issue = event.target.closest('.issue-item');
    if (!issue) return;

    const key = issue.dataset.key;
    const match = lastMatches.find((item) => getMatchKey(item) === key);
    if (!match) return;

    setActiveMatch(match);
    showTooltipFromTextareaClick(match);
  });
}

document.addEventListener('click', (event) => {
  const clickedTooltip = event.target.closest('#suggestionTooltip');
  const clickedIssue = event.target.closest('.issue-item');
  const clickedTextarea = event.target.closest('#textInput');

  if (!clickedTooltip && !clickedIssue && !clickedTextarea) {
    hideTooltip();
  }
});

renderHighlights([]);
updateCounts('', 0);
renderIdleState();
waitForBackend();
