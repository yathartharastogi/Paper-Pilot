const state = { paperId: null, localPaperId: null, analysis: null, graph: null, pdfUrl: null, activeView: 'overview', selectedNode: null, savedPapers: [], flashcardIndex: 0, flashcardFlipped: false };
let universePanel = null;

const viewContent = document.querySelector('#viewContent');
const sourceLabel = document.querySelector('#sourceLabel');
const sourceCitation = document.querySelector('#sourceCitation');
const pdfViewer = document.querySelector('#pdfViewer');
const toast = document.querySelector('#toast');
const loadingDialog = document.querySelector('#loadingDialog');
const tabs = [...document.querySelectorAll('.tab')];
const DB_NAME = 'paperpilot-workspace';
const DB_VERSION = 1;
const ACTIVE_PAPER_KEY = 'active-paper';
const ACTIVE_PAPER_STORAGE_KEY = 'paperpilot-active-paper-id';
let pdfNavigationTimer = null;

function openPaperStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('papers')) request.result.createObjectStore('papers', { keyPath: 'id' });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function savePaperLocally(file) {
  const record = {
    id: state.localPaperId || crypto.randomUUID(),
    file,
    analysis: state.analysis,
    graph: state.graph,
    savedAt: Date.now(),
  };
  state.localPaperId = record.id;
  const database = await openPaperStore();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('papers', 'readwrite');
    transaction.objectStore('papers').put(record);
    transaction.oncomplete = () => {
      localStorage.setItem(ACTIVE_PAPER_STORAGE_KEY, record.id);
      resolve(record);
    };
    transaction.onerror = () => reject(transaction.error);
  });
}

async function readSavedPaper(id) {
  const database = await openPaperStore();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('papers', 'readonly');
    const request = transaction.objectStore('papers').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function listSavedPapers() {
  const database = await openPaperStore();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('papers', 'readonly');
    const request = transaction.objectStore('papers').getAll();
    request.onsuccess = () => resolve((request.result || [])
      .filter(paper => paper?.file && paper?.analysis)
      .sort((first, second) => Number(second.savedAt || 0) - Number(first.savedAt || 0)));
    request.onerror = () => reject(request.error);
  });
}

async function deletePaperLocally(id) {
  const database = await openPaperStore();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('papers', 'readwrite');
    transaction.objectStore('papers').delete(id);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function fileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  window.setTimeout(() => toast.classList.remove('show'), 2800);
}

function citation(page, label) {
  return `<button class="citation-chip" data-page="${Number(page)}" data-label="${escapeHtml(label)}">p. ${Number(page)} ↗</button>`;
}

function activePdfUrl() {
  return state.paperId ? `/api/papers/${encodeURIComponent(state.paperId)}.pdf` : state.pdfUrl;
}

function showPdfPage(page) {
  const pdfUrl = activePdfUrl();
  if (!pdfUrl) return;
  const safePage = Number(page) || 1;
  window.clearTimeout(pdfNavigationTimer);
  pdfNavigationTimer = window.setTimeout(() => {
    pdfViewer.src = `${pdfUrl}#page=${safePage}`;
  }, 0);
}

function setSource(page, label) {
  const safePage = Number(page) || 1;
  sourceCitation.textContent = `p. ${safePage}`;
  sourceLabel.textContent = label || 'Source citation';
  showPdfPage(safePage);
  document.querySelector('#sourcePanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function wireCitations() {
  viewContent.querySelectorAll('.citation-chip').forEach(button => button.addEventListener('click', () => setSource(button.dataset.page, button.dataset.label)));
}

function displayPaper(analysis) {
  document.body.classList.remove('landing-active');
  document.querySelector('.sidebar').hidden = false;
  document.querySelector('#landingView').hidden = true;
  document.querySelector('#welcomeView').hidden = true;
  document.querySelector('#paperWorkspace').hidden = false;
  document.querySelector('#sidebarPaper').hidden = false;
  state.flashcardIndex = 0;
  state.flashcardFlipped = false;
  document.querySelector('#paperTitle').textContent = analysis.title || 'Untitled paper';
  document.querySelector('#sidebarPaperTitle').textContent = analysis.title || 'Untitled paper';
  const meta = [analysis.authors, analysis.year, analysis.pages].filter(Boolean).join(' · ');
  document.querySelector('#paperMeta').textContent = meta;
  document.querySelector('#sidebarPaperMeta').textContent = meta || 'Ready to explore';
  renderView('overview');
}

function savedPaperLabel(title) {
  const cleanTitle = String(title || 'Untitled paper').trim();
  return cleanTitle.length > 30 ? `${cleanTitle.slice(0, 27).trimEnd()}…` : cleanTitle;
}

function renderSavedPaperList(papers = state.savedPapers) {
  const library = document.querySelector('#paperLibrary');
  const list = document.querySelector('#savedPaperList');
  library.hidden = papers.length === 0;
  list.innerHTML = papers.map(paper => {
    const title = paper.analysis?.title || 'Untitled paper';
    return `
      <div class="saved-paper-row">
        <button class="saved-paper ${paper.id === state.localPaperId ? 'active' : ''}" data-paper-id="${escapeHtml(paper.id)}" title="Open ${escapeHtml(title)}" aria-label="Open ${escapeHtml(title)}">
          <strong>${escapeHtml(savedPaperLabel(title))}</strong>
        </button>
        <button class="delete-paper" data-delete-paper-id="${escapeHtml(paper.id)}" title="Delete ${escapeHtml(title)}" aria-label="Delete ${escapeHtml(title)}">×</button>
      </div>`;
  }).join('');
  list.querySelectorAll('[data-paper-id]').forEach(button => button.addEventListener('click', () => switchSavedPaper(button.dataset.paperId)));
  list.querySelectorAll('[data-delete-paper-id]').forEach(button => button.addEventListener('click', () => deleteSavedPaper(button.dataset.deletePaperId)));
}

function localId(prefix, value) {
  let hash = 2166136261;
  const text = String(value || 'untitled');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return prefix + '-' + (hash >>> 0).toString(36);
}

function localPosition(index, total, radius) {
  const angle = index * 2.399963229728653;
  const ring = radius * (0.55 + (index % 4) * 0.12);
  return {
    x: Math.cos(angle) * ring,
    y: Math.sin(angle) * ring * 0.62,
    z: ((index % 5) - 2) * Math.max(1.6, total * 0.08),
  };
}

function graphFromSavedAnalysis(analysis) {
  const sourceId = 'saved-paper';
  const paperNodeId = 'paper:saved-paper';
  const data = analysis || {};
  const nodes = [{
    id: paperNodeId,
    type: 'paper',
    label: data.title || 'Saved paper',
    description: data.overview?.oneLiner || 'Restored paper source.',
    confidence: 1,
    sourcePaperIds: [sourceId],
    citation: { paperId: sourceId, page: 1, label: 'Paper source' },
    evidenceQuality: 'source',
    uncertainty: 0,
    position: { x: 0, y: 0, z: 0 },
  }];
  const edges = [];
  const addNode = (type, item, index, label, description, page, evidenceQuality, uncertainty = 0) => {
    const id = localId(type, String(label || '') + '-' + String(index));
    nodes.push({
      id,
      type,
      label: label || 'Untitled research entity',
      description: description || '',
      confidence: type === 'question' ? 0.35 : 0.68,
      sourcePaperIds: [sourceId],
      citation: { paperId: sourceId, page: Number(page) || 1, label: item.label || item.labelSource || 'Source location' },
      evidenceQuality: evidenceQuality || 'extracted',
      uncertainty,
      position: localPosition(nodes.length, 24, type === 'claim' ? 13 : 9),
    });
    edges.push({
      id: localId('edge', paperNodeId + '-' + id),
      sourceId: paperNodeId,
      targetId: id,
      relationType: type === 'question' ? 'raises_question' : type === 'claim' ? 'supports' : 'investigates',
      label: type === 'question' ? 'open question in the paper' : 'source-linked entity',
      weight: 0.55,
      confidence: type === 'question' ? 0.45 : 0.68,
      supportingSourceIds: [sourceId],
      citation: { paperId: sourceId, page: Number(page) || 1, label: item.label || item.labelSource || 'Source location' },
      inference: false,
    });
  };
  (data.conceptMap?.nodes || []).forEach((item, index) => addNode('concept', item, index, item.label, item.summary, item.page, 'extracted concept'));
  (data.claims || []).forEach((item, index) => addNode('claim', item, index, item.claim, item.reason, item.page, item.evidence));
  (data.researchGaps || []).forEach((item, index) => addNode('question', item, index, item.gap, item.reason, item.page, item.type || 'open question', 0.85));
  return {
    version: 1,
    papers: [{ id: sourceId, title: data.title || 'Saved paper', authors: data.authors || '', year: data.year || '', ingestionStatus: 'restored' }],
    nodes,
    edges,
  };
}

function renderOverview() {
  const o = state.analysis.overview;
  return `
    <p class="lede">${escapeHtml(o.oneLiner)}</p>
    <div class="insight-grid">
      ${overviewCard('The problem', o.problem)}
      ${overviewCard('The contribution', o.contribution)}
      ${overviewCard('The method', o.method)}
      ${overviewCard('The result', o.result)}
    </div>
    <div class="summary-note"><span>✦</span><p><strong>Why this matters:</strong> ${escapeHtml(o.whyItMatters.text)} ${citation(o.whyItMatters.page, o.whyItMatters.label)}</p></div>`;
}

function overviewCard(label, item) {
  return `<article class="insight-card"><span class="card-label">${label}</span><p>${escapeHtml(item.text)}</p>${citation(item.page, item.label)}</article>`;
}

function renderEvidence() {
  const claims = state.analysis.claims || [];
  return `
    <p class="lede compact">These are the paper’s most consequential claims, evaluated only against evidence visible in this document.</p>
    <div class="claim-list">${claims.map(claim => `
      <article class="claim-row">
        <div><span class="strength ${strengthClass(claim.evidence)}">${escapeHtml(claim.evidence)}</span><h3>${escapeHtml(claim.claim)}</h3><p>${escapeHtml(claim.reason)}</p></div>
        ${citation(claim.page, claim.label)}
      </article>`).join('')}</div>`;
}

function renderNovelty() {
  const items = state.analysis.novelty || [];
  if (!items.length) return `<div class="empty-analysis"><p>Novelty analysis is unavailable for this older saved analysis. Re-upload the paper to generate it.</p></div>`;
  return `
    <p class="lede compact">This checks what the paper distinguishes from prior work it discusses. It is not a claim of global novelty across the literature.</p>
    <div class="assessment-list">${items.map(item => `
      <article class="assessment-card novelty-card">
        <span class="assessment-label">${escapeHtml(item.assessment)}</span>
        <h3>${escapeHtml(item.idea)}</h3><p>${escapeHtml(item.reason)}</p>
        ${citation(item.page, item.label)}
      </article>`).join('')}</div>`;
}

function renderGaps() {
  const items = state.analysis.researchGaps || [];
  if (!items.length) return `<div class="empty-analysis"><p>Research-gap analysis is unavailable for this older saved analysis. Re-upload the paper to generate it.</p></div>`;
  return `
    <p class="lede compact">These are unanswered questions or evidence boundaries the paper itself identifies or makes visible. They are not claims about every paper in the field.</p>
    <div class="assessment-list">${items.map(item => `
      <article class="assessment-card gap-card">
        <span class="assessment-label">${escapeHtml(item.type)}</span>
        <h3>${escapeHtml(item.gap)}</h3><p>${escapeHtml(item.reason)}</p><span class="relation-note">${escapeHtml(item.paperRelation)}</span>
        ${citation(item.page, item.label)}
      </article>`).join('')}</div>`;
}

function conciseFlashcardAnswer(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= 220) return text;
  const boundary = text.lastIndexOf(' ', 205);
  return `${text.slice(0, boundary > 120 ? boundary : 205).trimEnd()}…`;
}

function flashcardData() {
  const overview = state.analysis?.overview || {};
  const gap = (state.analysis?.researchGaps || [])[0];
  return [
    { label: 'Core problem', question: 'What problem does this paper set out to solve?', answer: conciseFlashcardAnswer(overview.problem?.text), source: overview.problem },
    { label: 'Key contribution', question: 'What is the paper’s central contribution?', answer: conciseFlashcardAnswer(overview.contribution?.text), source: overview.contribution },
    { label: 'Method', question: 'How does the paper approach the problem?', answer: conciseFlashcardAnswer(overview.method?.text), source: overview.method },
    { label: 'Finding', question: 'What result should you remember?', answer: conciseFlashcardAnswer(overview.result?.text), source: overview.result },
    gap ? { label: 'Open question', question: 'What remains open after this paper?', answer: conciseFlashcardAnswer(gap.gap || gap.reason), source: gap } : null,
  ].filter(card => card?.answer);
}

function renderFlashcards() {
  const cards = flashcardData();
  if (!cards.length) return '<div class="empty-analysis"><p>Flashcards will appear once Paper Pilot has extracted the paper’s core overview.</p></div>';
  state.flashcardIndex = ((state.flashcardIndex % cards.length) + cards.length) % cards.length;
  const card = cards[state.flashcardIndex];
  const source = card.source || {};
  return `
    <section class="flashcard-study" aria-label="Paper overview flashcards">
      <div class="flashcard-heading"><div><p class="card-label">Rapid recall</p><h3>Test the paper’s essentials.</h3></div><span>${state.flashcardIndex + 1} / ${cards.length}</span></div>
      <button class="flashcard ${state.flashcardFlipped ? 'flipped' : ''}" id="flashcardFlip" type="button" aria-pressed="${state.flashcardFlipped}" aria-label="Flip flashcard">
        <span class="flashcard-inner">
          <span class="flashcard-face flashcard-front"><small>${escapeHtml(card.label)}</small><strong>${escapeHtml(card.question)}</strong><em>Click to reveal <b>↗</b></em></span>
          <span class="flashcard-face flashcard-back"><small>Answer</small><strong>${escapeHtml(card.answer)}</strong><em>${source.page ? `Source: p. ${Number(source.page)}` : 'Source-grounded overview'}</em></span>
        </span>
      </button>
      <div class="flashcard-controls"><button type="button" id="flashcardPrevious" ${cards.length < 2 ? 'disabled' : ''}>← Previous</button><span>Flip it, then move on.</span><button type="button" id="flashcardNext" ${cards.length < 2 ? 'disabled' : ''}>Next →</button></div>
    </section>`;
}

function wireFlashcards() {
  const cards = flashcardData();
  const flip = document.querySelector('#flashcardFlip');
  if (!flip) return;
  flip.addEventListener('click', () => {
    state.flashcardFlipped = !state.flashcardFlipped;
    flip.classList.toggle('flipped', state.flashcardFlipped);
    flip.setAttribute('aria-pressed', String(state.flashcardFlipped));
  });
  document.querySelector('#flashcardPrevious')?.addEventListener('click', () => {
    state.flashcardIndex = (state.flashcardIndex - 1 + cards.length) % cards.length;
    state.flashcardFlipped = false;
    renderView('flashcards');
  });
  document.querySelector('#flashcardNext')?.addEventListener('click', () => {
    state.flashcardIndex = (state.flashcardIndex + 1) % cards.length;
    state.flashcardFlipped = false;
    renderView('flashcards');
  });
}

function strengthClass(value) {
  if (value === 'strong') return 'strong';
  if (value === 'limited') return 'limited';
  return 'not-established';
}

function renderConversation(mode) {
  const isDebate = mode === 'debate';
  const title = isDebate ? 'Challenge it. The paper answers.' : 'Ask the paper, not the internet.';
  const intro = isDebate
    ? 'Put a pressure-test to the paper. PaperPilot will make its strongest evidence-based defence — and will not invent support it cannot find.'
    : 'Ask a precise question. PaperPilot will answer only when the source supports it.';
  return `
    <div class="conversation-intro ${isDebate ? 'debate-intro' : ''}"><span>${isDebate ? '↔' : '◌'}</span><p>${intro}</p></div>
    <div class="chat-thread" id="chatThread"><div class="chat-message assistant"><span class="message-mark">P</span><p>${isDebate ? 'I will defend the paper’s argument from its own text. Where the evidence stops, I will say so.' : 'I am ready. I will refuse questions the paper does not cover.'}</p></div></div>
    <form class="chat-form" id="chatForm"><input id="chatInput" autocomplete="off" placeholder="${isDebate ? 'e.g. Why should I trust this evaluation?' : 'e.g. What data does the method need?'}" aria-label="Question about this paper" /><button type="submit">${isDebate ? 'Challenge' : 'Ask'} <span>↗</span></button></form>
    <p class="chat-disclaimer">${isDebate ? 'Defence is limited to evidence in this PDF.' : 'Unrelated or unsupported questions receive a clear refusal.'}</p>`;
}

function renderMap() {
  const map = state.analysis.conceptMap || { nodes: [], links: [] };
  const nodes = layoutMapNodes(map.nodes || []);
  const links = map.links || [];
  state.selectedNode = state.selectedNode || nodes[0]?.id || null;
  return `
    <p class="lede compact">A navigable map of the paper’s core problem, method, evidence, and results. Select any node to inspect its source-bound role.</p>
    <div class="map-field" id="mapField" role="group" aria-label="Interactive concept map">
      <svg class="map-links" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        ${links.map(link => mapLine(link, nodes)).join('')}
      </svg>
      ${nodes.map(node => `<button class="map-node ${node.type} ${node.id === state.selectedNode ? 'selected' : ''}" style="left:${clamp(node.x, 8, 92)}%;top:${clamp(node.y, 8, 88)}%" data-node="${escapeHtml(node.id)}"><span>${nodeIcon(node.type)}</span>${escapeHtml(node.label)}</button>`).join('')}
    </div>
    <div class="node-detail" id="nodeDetail"></div>`;
}

function renderUniverse() {
  if (!state.graph?.nodes?.length) {
    return '<div class="empty-analysis"><p>The neural universe is preparing its source-grounded regions. Switch away and back once processing completes.</p></div>';
  }
  return '<div id="universeRoot"></div>';
}

function mountUniverseView(attempt = 0) {
  if (state.activeView !== 'universe') return;
  const root = document.querySelector('#universeRoot');
  if (!root || !state.graph?.nodes?.length) return;
  if (!window.PaperPilotUniverse?.UniversePanel) {
    if (attempt < 20) window.setTimeout(() => mountUniverseView(attempt + 1), 80);
    return;
  }
  universePanel?.destroy();
  universePanel = new window.PaperPilotUniverse.UniversePanel({
    root,
    paperId: state.paperId,
    graph: state.graph,
    sourceReady: Boolean(state.paperId),
    onCitation: setSource,
  });
  universePanel.mount();
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, Number(value) || min)); }
function layoutMapNodes(nodes) {
  const occupied = new Set();
  return nodes.map((node, index) => {
    let x = Number(node.x);
    let y = Number(node.y);
    const usable = Number.isFinite(x) && Number.isFinite(y) && x >= 8 && x <= 92 && y >= 8 && y <= 88;
    const key = String(Math.round(x)) + ':' + String(Math.round(y));
    if (!usable || occupied.has(key)) {
      const angle = index * 2.399963229728653;
      const radius = 16 + (index % 4) * 8;
      x = 50 + Math.cos(angle) * radius * 1.32;
      y = 49 + Math.sin(angle) * radius * 0.88;
    }
    occupied.add(String(Math.round(x)) + ':' + String(Math.round(y)));
    return { ...node, x: clamp(x, 8, 92), y: clamp(y, 8, 88) };
  });
}
function nodeIcon(type) { return ({ problem: '!', method: '↳', result: '↗', evidence: '✓', limitation: '△' })[type] || '•'; }
function mapLine(link, nodes) {
  const source = nodes.find(node => node.id === link.source);
  const target = nodes.find(node => node.id === link.target);
  if (!source || !target) return '';
  return `<line x1="${clamp(source.x, 8, 92)}" y1="${clamp(source.y, 8, 88)}" x2="${clamp(target.x, 8, 92)}" y2="${clamp(target.y, 8, 88)}" />`;
}

function updateNodeDetail() {
  const node = state.analysis.conceptMap.nodes.find(item => item.id === state.selectedNode);
  const detail = document.querySelector('#nodeDetail');
  if (!node || !detail) return;
  detail.innerHTML = `<span class="node-type">${escapeHtml(node.type)}</span><p><strong>${escapeHtml(node.label)}</strong> ${escapeHtml(node.summary)}</p>${citation(node.page, node.labelSource)}`;
  detail.querySelector('.citation-chip').addEventListener('click', () => setSource(node.page, node.labelSource));
}

function wireMap() {
  viewContent.querySelectorAll('.map-node').forEach(button => button.addEventListener('click', () => {
    state.selectedNode = button.dataset.node;
    viewContent.querySelectorAll('.map-node').forEach(node => node.classList.toggle('selected', node === button));
    updateNodeDetail();
  }));
  updateNodeDetail();
}

function renderView(view) {
  if (!state.analysis) return;
  if (universePanel && view !== 'universe') {
    universePanel.destroy();
    universePanel = null;
  }
  state.activeView = view;
  document.querySelector('#paperWorkspace').classList.toggle('universe-active', view === 'universe');
  if (view === 'overview') viewContent.innerHTML = renderOverview();
  if (view === 'evidence') viewContent.innerHTML = renderEvidence();
  if (view === 'novelty') viewContent.innerHTML = renderNovelty();
  if (view === 'gaps') viewContent.innerHTML = renderGaps();
  if (view === 'debate' || view === 'ask') viewContent.innerHTML = renderConversation(view);
  if (view === 'universe') viewContent.innerHTML = renderUniverse();
  if (view === 'map') viewContent.innerHTML = renderMap();
  if (view === 'flashcards') viewContent.innerHTML = renderFlashcards();
  tabs.forEach(tab => { const active = tab.dataset.view === view; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active ? 'true' : 'false'); });
  wireCitations();
  if (view === 'map') wireMap();
  if (view === 'flashcards') wireFlashcards();
  if (view === 'universe') mountUniverseView();
  if (view === 'debate' || view === 'ask') document.querySelector('#chatForm').addEventListener('submit', submitQuestion);
}

async function submitQuestion(event) {
  event.preventDefault();
  const input = document.querySelector('#chatInput');
  const question = input.value.trim();
  if (!question) return;
  const thread = document.querySelector('#chatThread');
  const mode = state.activeView === 'debate' ? 'debate' : 'ask';
  input.disabled = true;
  thread.insertAdjacentHTML('beforeend', `<div class="chat-message user"><p>${escapeHtml(question)}</p></div><div class="chat-message assistant pending"><span class="message-mark">P</span><p>Checking the paper…</p></div>`);
  thread.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  try {
    const response = await fetch('/api/question', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paperId: state.paperId, question, mode }) });
    const answer = await response.json();
    if (!response.ok) throw new Error(answer.error || 'The question could not be answered.');
    const citations = (answer.citations || []).map(item => citation(item.page, item.label)).join(' ');
    const boundary = answer.boundary ? `<span class="answer-boundary">${escapeHtml(answer.boundary)}</span>` : '';
    thread.querySelector('.pending').innerHTML = `<span class="message-mark">P</span><p>${escapeHtml(answer.answer)} ${citations} ${boundary}</p>`;
    wireCitations();
  } catch (error) {
    thread.querySelector('.pending').innerHTML = `<span class="message-mark error">!</span><p>${escapeHtml(error.message)}</p>`;
  } finally {
    input.disabled = false;
    input.value = '';
    input.focus();
  }
}

async function analyseFile(file) {
  if (!file) return;
  if (file.type !== 'application/pdf') return showToast('PaperPilot currently accepts PDF files only.');
  if (file.size > 20 * 1024 * 1024) return showToast('Choose a PDF under 20 MB.');
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      loadingDialog.showModal();
      document.querySelector('#loadingTitle').textContent = 'Reading the paper';
      document.querySelector('#loadingDetail').textContent = 'Gemini is locating the contribution, evidence, and key concepts.';
      const response = await fetch('/api/analyze', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, mimeType: file.type, data: reader.result }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The paper could not be analysed.');
      if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
      state.paperId = result.paperId;
      state.localPaperId = crypto.randomUUID();
      state.analysis = result.analysis;
      state.graph = result.graph || null;
      state.pdfUrl = URL.createObjectURL(file);
      showPdfPage(1);
      displayPaper(result.analysis);
      await savePaperLocally(file);
      state.savedPapers = await listSavedPapers();
      renderSavedPaperList();
      showToast('Your paper is ready to explore.');
    } catch (error) {
      showToast(error.message || 'Something went wrong while analysing the paper.');
    } finally {
      loadingDialog.close();
    }
  };
  reader.readAsDataURL(file);
}

async function restorePaperSession(saved) {
  const data = await fileAsDataUrl(saved.file);
  const response = await fetch('/api/session', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: saved.file.name, mimeType: saved.file.type, data, analysis: saved.analysis }),
  });
  const session = await response.json();
  if (!response.ok) throw new Error(session.error || 'The source session could not be restored.');
  state.paperId = session.paperId;
  state.graph = session.graph || state.graph;
  showPdfPage(Number(sourceCitation.textContent.replace(/\D+/g, '')) || 1);
  if (state.activeView === 'universe') renderView('universe');
}

async function switchSavedPaper(id, { announce = true } = {}) {
  const saved = await readSavedPaper(id);
  if (!saved?.file || !saved?.analysis) return;
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  state.localPaperId = saved.id;
  state.analysis = saved.analysis;
  state.graph = saved.graph?.nodes?.length ? saved.graph : graphFromSavedAnalysis(saved.analysis);
  state.paperId = null;
  state.pdfUrl = URL.createObjectURL(saved.file);
  showPdfPage(1);
  localStorage.setItem(ACTIVE_PAPER_STORAGE_KEY, saved.id);
  displayPaper(saved.analysis);
  renderSavedPaperList();
  try {
    await restorePaperSession(saved);
    if (announce) showToast('Opened saved paper.');
  } catch (error) {
    if (announce) showToast('Paper opened. Re-upload it to use Q&A if the server was restarted.');
  }
}

function showLandingScreen() {
  document.body.classList.add('landing-active');
  document.querySelector('.sidebar').hidden = true;
  document.querySelector('#landingView').classList.remove('launching');
  universePanel?.destroy();
  universePanel = null;
  if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
  state.paperId = null;
  state.localPaperId = null;
  state.analysis = null;
  state.graph = null;
  state.pdfUrl = null;
  state.activeView = 'overview';
  state.selectedNode = null;
  state.flashcardIndex = 0;
  state.flashcardFlipped = false;
  pdfViewer.src = 'about:blank';
  document.querySelector('#landingView').hidden = false;
  document.querySelector('#welcomeView').hidden = true;
  document.querySelector('#paperWorkspace').hidden = true;
  document.querySelector('#sidebarPaper').hidden = true;
}

function showUploadScreen() {
  document.body.classList.remove('landing-active');
  document.querySelector('.sidebar').hidden = false;
  document.querySelector('#landingView').classList.remove('launching');
  document.querySelector('#landingView').hidden = true;
  document.querySelector('#welcomeView').hidden = false;
  document.querySelector('#paperWorkspace').hidden = true;
  const workspace = document.querySelector('.workspace');
  workspace.classList.remove('app-reveal');
  window.requestAnimationFrame(() => workspace.classList.add('app-reveal'));
}

async function launchApp() {
  const landing = document.querySelector('#landingView');
  if (landing.classList.contains('launching')) return;
  landing.classList.add('launching');
  document.querySelector('#landingStartButton').disabled = true;
  window.setTimeout(async () => {
    document.querySelector('#landingStartButton').disabled = false;
    try {
      if (!state.savedPapers.length) state.savedPapers = await listSavedPapers();
      const activeId = state.localPaperId || localStorage.getItem(ACTIVE_PAPER_STORAGE_KEY);
      const targetPaper = state.savedPapers.find(paper => paper.id === activeId) || state.savedPapers[0];
      if (targetPaper) {
        await switchSavedPaper(targetPaper.id, { announce: false });
        return;
      }
    } catch (error) {
      // A first-time visitor (or unavailable local storage) still reaches the upload flow.
    }
    showUploadScreen();
  }, 820);
}

async function deleteSavedPaper(id) {
  const saved = state.savedPapers.find(paper => paper.id === id);
  if (!saved) return;
  const title = saved.analysis?.title || 'this paper';
  if (!window.confirm(`Delete “${title}” from your saved papers?`)) return;
  const wasActive = id === state.localPaperId;
  await deletePaperLocally(id);
  state.savedPapers = state.savedPapers.filter(paper => paper.id !== id);
  if (localStorage.getItem(ACTIVE_PAPER_STORAGE_KEY) === id) localStorage.removeItem(ACTIVE_PAPER_STORAGE_KEY);
  renderSavedPaperList();
  if (!wasActive) {
    showToast('Saved paper deleted.');
    return;
  }
  const nextPaper = state.savedPapers[0];
  if (nextPaper) {
    await switchSavedPaper(nextPaper.id, { announce: false });
    showToast('Saved paper deleted.');
    return;
  }
  showLandingScreen();
  showToast('Saved paper deleted.');
}

async function restoreSavedPaper() {
  try {
    state.savedPapers = await listSavedPapers();
    renderSavedPaperList();
    const activeId = localStorage.getItem(ACTIVE_PAPER_STORAGE_KEY);
    const saved = state.savedPapers.find(paper => paper.id === activeId)
      || state.savedPapers.find(paper => paper.id === ACTIVE_PAPER_KEY)
      || state.savedPapers[0];
    if (!saved) {
      showLandingScreen();
      return;
    }
    await switchSavedPaper(saved.id, { announce: true });
  } catch (error) {
    showToast('Your paper is visible. Re-upload it to use Q&A if the server was restarted.');
  }
}

function openFilePicker() { const input = document.querySelector('#fileInput'); input.value = ''; input.click(); }

document.querySelector('#newPaperButton').addEventListener('click', openFilePicker);
document.querySelector('#replacePaperButton').addEventListener('click', openFilePicker);
document.querySelector('#landingStartButton').addEventListener('click', launchApp);
document.querySelector('#fileInput').addEventListener('change', event => analyseFile(event.target.files[0]));
document.querySelector('#welcomeFileInput').addEventListener('change', event => analyseFile(event.target.files[0]));
document.querySelector('#dropzone').addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('dragging'); });
document.querySelector('#dropzone').addEventListener('dragleave', event => event.currentTarget.classList.remove('dragging'));
document.querySelector('#dropzone').addEventListener('drop', event => { event.preventDefault(); event.currentTarget.classList.remove('dragging'); analyseFile(event.dataTransfer.files[0]); });
tabs.forEach(tab => tab.addEventListener('click', () => renderView(tab.dataset.view)));
document.querySelector('#sourceRail').addEventListener('click', () => { if (!state.analysis) return showToast('Upload a paper to view its source.'); document.querySelector('#sourcePanel').scrollIntoView({ behavior: 'smooth' }); });
document.querySelector('#overviewRail').addEventListener('click', () => { if (state.analysis) renderView('overview'); else showUploadScreen(); });
document.querySelector('#openPdfButton').addEventListener('click', () => { const pdfUrl = activePdfUrl(); if (pdfUrl) window.open(`${pdfUrl}#page=1`, '_blank', 'noopener'); });
localStorage.removeItem('paperpilot-theme');
document.body.dataset.theme = 'dark';
restoreSavedPaper();
