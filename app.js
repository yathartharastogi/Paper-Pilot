const state = { paperId: null, analysis: null, graph: null, pdfUrl: null, activeView: 'overview', selectedNode: null };
let universePanel = null;

const viewContent = document.querySelector('#viewContent');
const sectionKicker = document.querySelector('#sectionKicker');
const sectionTitle = document.querySelector('#sectionTitle');
const sourceLabel = document.querySelector('#sourceLabel');
const sourceCitation = document.querySelector('#sourceCitation');
const pdfViewer = document.querySelector('#pdfViewer');
const toast = document.querySelector('#toast');
const loadingDialog = document.querySelector('#loadingDialog');
const tabs = [...document.querySelectorAll('.tab')];
const DB_NAME = 'paperpilot-workspace';
const DB_VERSION = 1;
const ACTIVE_PAPER_KEY = 'active-paper';

function openPaperStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => request.result.createObjectStore('papers', { keyPath: 'id' });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

async function savePaperLocally(file) {
  const database = await openPaperStore();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('papers', 'readwrite');
    transaction.objectStore('papers').put({ id: ACTIVE_PAPER_KEY, file, analysis: state.analysis, graph: state.graph, savedAt: Date.now() });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

async function readSavedPaper() {
  const database = await openPaperStore();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('papers', 'readonly');
    const request = transaction.objectStore('papers').get(ACTIVE_PAPER_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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

function applyTheme(theme) {
  const selected = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = selected;
  localStorage.setItem('paperpilot-theme', selected);
  document.querySelector('#themeButtonText').textContent = selected === 'dark' ? 'Light' : 'Dark';
  document.querySelector('#themeButtonIcon').textContent = selected === 'dark' ? '☼' : '☾';
  document.querySelector('#themeButton').setAttribute('aria-label', `Switch to ${selected === 'dark' ? 'light' : 'dark'} theme`);
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

function setSource(page, label) {
  const safePage = Number(page) || 1;
  sourceCitation.textContent = `p. ${safePage}`;
  sourceLabel.textContent = label || 'Source citation';
  if (state.pdfUrl) pdfViewer.src = `${state.pdfUrl}#page=${safePage}`;
  document.querySelector('#sourcePanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function wireCitations() {
  viewContent.querySelectorAll('.citation-chip').forEach(button => button.addEventListener('click', () => setSource(button.dataset.page, button.dataset.label)));
}

function displayPaper(analysis) {
  document.querySelector('#welcomeView').hidden = true;
  document.querySelector('#paperWorkspace').hidden = false;
  document.querySelector('#sidebarPaper').hidden = false;
  document.querySelector('#paperTitle').textContent = analysis.title || 'Untitled paper';
  document.querySelector('#sidebarPaperTitle').textContent = analysis.title || 'Untitled paper';
  const meta = [analysis.authors, analysis.year, analysis.pages].filter(Boolean).join(' · ');
  document.querySelector('#paperMeta').textContent = meta;
  document.querySelector('#sidebarPaperMeta').textContent = meta || 'Ready to explore';
  document.querySelector('#topbarStatus').textContent = 'Grounded paper workspace';
  renderView('overview');
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
  const headers = {
    overview: ['Paper overview', 'The essential read'],
    evidence: ['Claims & evidence', 'What the paper can support'],
    novelty: ['Novelty checker', 'What this paper differentiates'],
    gaps: ['Research-gap analyzer', 'What remains open'],
    debate: ['Evidence-based debate', 'Make the case'],
    universe: ['Neural research universe', 'Explore the paper as living evidence'],
    map: ['Interactive concept map', 'The paper, connected'],
    ask: ['Source-grounded Q&A', 'Ask about this paper'],
  };
  sectionKicker.textContent = headers[view][0];
  sectionTitle.textContent = headers[view][1];
  if (view === 'overview') viewContent.innerHTML = renderOverview();
  if (view === 'evidence') viewContent.innerHTML = renderEvidence();
  if (view === 'novelty') viewContent.innerHTML = renderNovelty();
  if (view === 'gaps') viewContent.innerHTML = renderGaps();
  if (view === 'debate' || view === 'ask') viewContent.innerHTML = renderConversation(view);
  if (view === 'universe') viewContent.innerHTML = renderUniverse();
  if (view === 'map') viewContent.innerHTML = renderMap();
  tabs.forEach(tab => { const active = tab.dataset.view === view; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', active ? 'true' : 'false'); });
  wireCitations();
  if (view === 'map') wireMap();
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
      state.analysis = result.analysis;
      state.graph = result.graph || null;
      state.pdfUrl = URL.createObjectURL(file);
      pdfViewer.src = `${state.pdfUrl}#page=1`;
      displayPaper(result.analysis);
      await savePaperLocally(file);
      showToast('Your paper is ready to explore.');
    } catch (error) {
      showToast(error.message || 'Something went wrong while analysing the paper.');
    } finally {
      loadingDialog.close();
    }
  };
  reader.readAsDataURL(file);
}

async function restoreSavedPaper() {
  try {
    const saved = await readSavedPaper();
    if (!saved?.file || !saved?.analysis) return;
    state.analysis = saved.analysis;
    state.graph = saved.graph?.nodes?.length ? saved.graph : graphFromSavedAnalysis(saved.analysis);
    state.paperId = null;
    state.pdfUrl = URL.createObjectURL(saved.file);
    pdfViewer.src = `${state.pdfUrl}#page=1`;
    displayPaper(saved.analysis);
    document.querySelector('#topbarStatus').textContent = 'Restoring saved workspace';
    const data = await fileAsDataUrl(saved.file);
    const response = await fetch('/api/session', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: saved.file.name, mimeType: saved.file.type, data, analysis: saved.analysis }),
    });
    const session = await response.json();
    if (!response.ok) throw new Error(session.error || 'The source session could not be restored.');
    state.paperId = session.paperId;
    state.graph = session.graph || null;
    document.querySelector('#topbarStatus').textContent = 'Restored paper workspace';
    if (state.activeView === 'universe') renderView('universe');
    showToast('Your saved paper is ready.');
  } catch (error) {
    document.querySelector('#topbarStatus').textContent = 'Saved paper source view';
    showToast('Your paper is visible. Re-upload it to use Q&A if the server was restarted.');
  }
}

function openFilePicker() { const input = document.querySelector('#fileInput'); input.value = ''; input.click(); }

document.querySelector('#newPaperButton').addEventListener('click', openFilePicker);
document.querySelector('#replacePaperButton').addEventListener('click', openFilePicker);
document.querySelector('#fileInput').addEventListener('change', event => analyseFile(event.target.files[0]));
document.querySelector('#welcomeFileInput').addEventListener('change', event => analyseFile(event.target.files[0]));
document.querySelector('#dropzone').addEventListener('dragover', event => { event.preventDefault(); event.currentTarget.classList.add('dragging'); });
document.querySelector('#dropzone').addEventListener('dragleave', event => event.currentTarget.classList.remove('dragging'));
document.querySelector('#dropzone').addEventListener('drop', event => { event.preventDefault(); event.currentTarget.classList.remove('dragging'); analyseFile(event.dataTransfer.files[0]); });
tabs.forEach(tab => tab.addEventListener('click', () => renderView(tab.dataset.view)));
document.querySelector('#sourceRail').addEventListener('click', () => { if (!state.analysis) return showToast('Upload a paper to view its source.'); document.querySelector('#sourcePanel').scrollIntoView({ behavior: 'smooth' }); });
document.querySelector('#overviewRail').addEventListener('click', () => { if (state.analysis) renderView('overview'); else window.scrollTo({ top: 0, behavior: 'smooth' }); });
document.querySelector('#openPdfButton').addEventListener('click', () => { if (state.pdfUrl) window.open(pdfViewer.src || state.pdfUrl, '_blank', 'noopener'); });
document.querySelector('#themeButton').addEventListener('click', () => applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));
applyTheme(localStorage.getItem('paperpilot-theme') || 'dark');
restoreSavedPaper();
