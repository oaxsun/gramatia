const API_BASE = window.CORRECTOR_API_BASE || '';
const textInput = document.getElementById('textInput');
const highlights = document.getElementById('highlights');

let lastMatches = [];
let activeMatchKey = null;

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
  const onlyLetters = text.match(/[A-Za-zÁÉÍÓÚáéíóúÜüÑñ]/g);
  return onlyLetters ? onlyLetters.length : 0;
}

function syncScroll() {
  highlights.scrollTop = textInput.scrollTop;
  highlights.scrollLeft = textInput.scrollLeft;
}

function updateCounts(text, issueCount = null) {
  document.getElementById('wordCount').textContent = countWords(text);
  document.getElementById('letterCount').textContent = countLetters(text);
  document.getElementById('charCount').textContent = text.length;

  if (issueCount !== null) {
    document.getElementById('issueCount').textContent = issueCount;
  }
}

function getMatchKey(match) {
  return `${match.offset}-${match.length}`;
}

function renderHighlights(matches) {
  const text = textInput.value;

  if (!text) {
    highlights.innerHTML = '';
    return;
  }

  if (!matches.length) {
    highlights.innerHTML = escapeHtml(text) + (text.endsWith('\n') ? '\u200b' : '\n');
    syncScroll();
    return;
  }

  const ordered = [...matches].sort((a, b) => a.offset - b.offset);
  let result = '';
  let lastIndex = 0;

  ordered.forEach((match) => {
    const key = getMatchKey(match);
    const isActive = activeMatchKey === key ? ' active-error' : '';

    result += escapeHtml(text.slice(lastIndex, match.offset));
    result += `<mark class="error-mark${isActive}" data-offset="${match.offset}" data-length="${match.length}" data-key="${key}">${escapeHtml(
      text.slice(match.offset, match.offset + match.length)
    )}</mark>`;
    lastIndex = match.offset + match.length;
  });

  result += escapeHtml(text.slice(lastIndex));

  if (text.endsWith('\n')) {
    result += '\u200b';
  } else {
    result += '\n';
  }

  highlights.innerHTML = result;
  syncScroll();
}

function renderIdleState() {
  document.getElementById('grammarResult').innerHTML = `
    <div class="badge warn">Esperando análisis</div>
    <div class="score">Puntuación estimada: --/100</div>
    <div class="legend">Presiona <strong>Analizar</strong> para revisar faltas de ortografía, acentuación, gramática y puntuación.</div>
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
  const score = Math.max(0, 100 - (matches.length * 8));
  const resultBox = document.getElementById('grammarResult');

  if (!matches.length) {
    resultBox.innerHTML = `
      <div class="badge ok">Sin errores detectados</div>
      <div class="score">Puntuación estimada: ${score}/100</div>
      <div class="legend">No se detectaron faltas con el análisis actual.</div>
    `;
    return;
  }

  resultBox.innerHTML = `
    <div class="badge warn">Se encontraron observaciones</div>
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
    document.getElementById('grammarResult').innerHTML = `
      <div class="badge warn">No hay texto para analizar</div>
      <div class="score">Puntuación estimada: 0/100</div>
      <div class="legend">Pega o escribe contenido en el editor.</div>
    `;
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
  } catch (error) {
    lastMatches = [];
    activeMatchKey = null;
    renderHighlights([]);
    document.getElementById('grammarResult').innerHTML = `
      <div class="badge warn">Error de conexión</div>
      <div class="score">No se pudo consultar el corrector.</div>
      <div class="legend">${escapeHtml(error.message || 'Revisa config.js o tu backend en Render.')}</div>
    `;
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
    showToast('Todo el texto fue corregido.');
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
    showToast('Texto copiado al portapapeles.');
  } catch (_error) {
    const helper = document.createElement('textarea');
    helper.value = text;
    document.body.appendChild(helper);
    helper.select();
    document.execCommand('copy');
    helper.remove();
    showToast('Texto copiado al portapapeles.');
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
    issue.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function hideTooltip() {
  tooltip.classList.add('hidden');
  tooltip.innerHTML = '';
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
  const spanRect = span.getBoundingClientRect();

  const coordinates = {
    top: spanRect.top - div.getBoundingClientRect().top - textarea.scrollTop,
    left: spanRect.left - div.getBoundingClientRect().left - textarea.scrollLeft,
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
    <div class="tooltip-title">${escapeHtml(selectedText)}</div>
    <div class="tooltip-subtitle">${escapeHtml(match.message || 'Posible error detectado.')}</div>
    <div class="tooltip-actions">
      ${suggestions.slice(0, 6).map((suggestion, index) => `
        <button class="tooltip-suggestion" type="button" data-index="${index}">
          ${escapeHtml(suggestion)}
        </button>
      `).join('')}
    </div>
  `;

  tooltip.classList.remove('hidden');
  tooltip.style.top = `${top}px`;
  tooltip.style.left = `${left}px`;

  tooltip.querySelectorAll('.tooltip-suggestion').forEach((button, index) => {
    button.addEventListener('click', async () => {
      const replacement = suggestions[index];
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
  const left = coords.textareaRect.left + window.scrollX + coords.left;
  showTooltipAtPosition(match, top, left);
}

textInput.addEventListener('scroll', () => {
  syncScroll();
  hideTooltip();
});

textInput.addEventListener('input', () => {
  hideTooltip();
  activeMatchKey = null;
  renderHighlights([]);
  updateCounts(textInput.value, 0);
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

highlights.addEventListener('mousemove', (event) => {
  const mark = event.target.closest('mark');
  if (!mark) return;

  const match = findMatchByElement(mark);
  if (!match) return;

  setActiveMatch(match);
});

highlights.addEventListener('click', (event) => {
  const mark = event.target.closest('mark');
  if (!mark) return;

  const match = findMatchByElement(mark);
  if (!match) return;

  setActiveMatch(match);
  showTooltipForMatch(match, mark);
});

document.getElementById('grammarResult').addEventListener('mouseover', (event) => {
  const issue = event.target.closest('.issue-item');
  if (!issue) return;

  const key = issue.dataset.key;
  const match = lastMatches.find((item) => getMatchKey(item) === key);
  if (!match) return;

  setActiveMatch(match);
});

document.getElementById('grammarResult').addEventListener('click', (event) => {
  const issue = event.target.closest('.issue-item');
  if (!issue) return;

  const key = issue.dataset.key;
  const match = lastMatches.find((item) => getMatchKey(item) === key);
  if (!match) return;

  setActiveMatch(match);
  showTooltipFromTextareaClick(match);
});

document.addEventListener('click', (event) => {
  const clickedMark = event.target.closest('mark');
  const clickedTooltip = event.target.closest('#suggestionTooltip');
  const clickedIssue = event.target.closest('.issue-item');
  const clickedTextarea = event.target.closest('#textInput');

  if (!clickedMark && !clickedTooltip && !clickedIssue && !clickedTextarea) {
    hideTooltip();
  }
});

let toastTimer;

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
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
        ? 'Estamos despertando el servidor. Esto puede tardar unos segundos.'
        : `Conectando con el backend... intento ${attempts} de ${maxAttempts}.`;

      const response = await fetch(healthUrl, { method: 'GET', cache: 'no-store' });

      if (response.ok) {
        loader.style.display = 'none';
        appRoot.classList.remove('app-hidden');
        return;
      }
    } catch (_error) {}

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  message.textContent = 'No se pudo conectar con el backend en este momento. Recarga la página en unos segundos.';
}

renderHighlights([]);
updateCounts('', 0);
renderIdleState();
waitForBackend();
