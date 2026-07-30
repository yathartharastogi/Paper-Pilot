import { NeuralUniverse } from './neural-universe.js?build=20260731v4';

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  })[character]);
}

function optionList(values, formatter) {
  return values.map(value => '<option value="' + escapeHtml(value.value) + '">' + escapeHtml(formatter(value)) + '</option>').join('');
}

export class UniversePanel {
  constructor({ root, paperId, graph, sourceReady = true, onCitation }) {
    this.root = root;
    this.paperId = paperId;
    this.graph = graph;
    this.sourceReady = sourceReady;
    this.onCitation = onCitation || (() => {});
    this.abortController = new AbortController();
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lastTraversal = null;
  }

  mount() {
    const papers = Array.isArray(this.graph.papers) ? this.graph.papers : [];
    const years = [...new Set(papers.map(paper => paper.year).filter(Boolean))].sort();
    const authors = [...new Set(papers.map(paper => paper.authors).filter(Boolean))].sort();
    this.root.innerHTML = [
      '<section class="universe-shell" aria-label="Neural research universe">',
      '<div class="universe-toolbar">',
      '<label class="universe-field">Find <input id="universeSearch" type="search" placeholder="Search concepts" /></label>',
      '<label class="universe-field">Paper <select id="universePaper"><option value="">All papers</option>' + optionList(papers.map(paper => ({ value: paper.id, label: paper.title })), item => item.label) + '</select></label>',
      '<label class="universe-field">Node <select id="universeNodeType"><option value="">All nodes</option><option value="concept">Concepts</option><option value="claim">Claims</option><option value="question">Open questions</option></select></label>',
      '<label class="universe-field">Relation <select id="universeRelation"><option value="">All relations</option><option value="supports">Supports</option><option value="contradicts">Contradicts</option><option value="extends">Extends</option><option value="raises_question">Open questions</option></select></label>',
      '<label class="universe-field">Year <select id="universeYear"><option value="">All years</option>' + optionList(years.map(value => ({ value })), item => item.value) + '</select></label>',
      '<label class="universe-field">Author <select id="universeAuthor"><option value="">All authors</option>' + optionList(authors.map(value => ({ value })), item => item.value) + '</select></label>',
      '<label class="universe-field">Performance <select id="universePerformance"><option value="auto">Auto</option><option value="high">High</option><option value="balanced">Balanced</option><option value="low">Low</option></select></label>',
      '<div class="universe-actions"><button type="button" id="universePause">Pause</button><button type="button" id="universeReplay">Replay route</button><button type="button" id="universeStop">Exit route</button><button type="button" id="universeReset">Reset</button><button type="button" id="universeFullscreen">Full screen</button></div>',
      '</div>',
      '<div class="universe-stage" id="universeStage">',
      '<canvas id="neuralCanvas" aria-label="Interactive three-dimensional neural research universe"></canvas>',
      '<div class="universe-hud"><span class="universe-status" id="universeStatus">Preparing neural regions</span><span id="universeCounts"></span></div>',
      '<div class="universe-legend" aria-label="Universe legend"><span><i class="legend-concept"></i>Concept</span><span><i class="legend-claim"></i>Claim</span><span><i class="legend-question"></i>Open question</span><span><i class="legend-support"></i>Evidence path</span><span><i class="legend-contradiction"></i>Contradiction</span></div>',
      '</div>',
      '<div class="universe-explore">',
      '<div><p class="card-label">Ask and explore</p><h3>Trace a research question through the paper.</h3><p>Routes stay inside the uploaded source. Model-inferred relationships are labelled in the detail panel.</p></div>',
      '<form id="universeExploreForm"><input id="universeQuery" maxlength="1000" placeholder="Ask a research question about this paper" aria-label="Research question" ' + (this.sourceReady ? '' : 'disabled') + ' /><button type="submit" ' + (this.sourceReady ? '' : 'disabled') + '>Explore <span>→</span></button></form>',
      this.sourceReady ? '' : '<p class="universe-restore-note">Restoring the local source session. You can inspect the graph now; Ask and explore will become available when the source reconnects.</p>',
      '<p class="high-stakes-notice" id="highStakesNotice" hidden>Paper Pilot is a research exploration tool and does not provide medical diagnosis or treatment advice.</p>',
      '</div>',
      '<aside class="universe-detail" id="universeDetail" aria-live="polite"><p class="detail-empty">Select a neuron to inspect its source, evidence quality, and first-degree links.</p></aside>',
      '</section>',
    ].join('');
    this._bindControls();
    this._renderCounts();
    this._mountRenderer();
  }

  _mountRenderer() {
    const canvas = this.root.querySelector('#neuralCanvas');
    try {
      this.universe = new NeuralUniverse({
        canvas,
        performance: 'auto',
        reducedMotion: this.reducedMotion,
        onSelect: node => this._renderDetail(node),
        onHover: node => this._setStatus(node ? node.label : 'Drag to rotate · scroll to zoom · select a neuron to focus'),
        onRouteStep: (step, index, total) => this._renderRouteStep(step, index, total),
      });
      this.universe.setGraph(this.graph);
      this._setStatus('Drag to rotate · scroll to zoom · select a neuron to focus');
    } catch (error) {
      this._renderFallback(error);
    }
  }

  _bindControls() {
    const signal = this.abortController.signal;
    const search = this.root.querySelector('#universeSearch');
    const paper = this.root.querySelector('#universePaper');
    const type = this.root.querySelector('#universeNodeType');
    const relation = this.root.querySelector('#universeRelation');
    const year = this.root.querySelector('#universeYear');
    const author = this.root.querySelector('#universeAuthor');
    const performance = this.root.querySelector('#universePerformance');
    const filters = () => this.universe?.applyFilters({
      search: search.value.trim(),
      nodeType: type.value,
      relationType: relation.value,
      year: year.value,
      author: author.value,
      paperId: paper.value,
    });
    search.addEventListener('input', filters, { signal });
    paper.addEventListener('change', filters, { signal });
    type.addEventListener('change', filters, { signal });
    relation.addEventListener('change', filters, { signal });
    year.addEventListener('change', filters, { signal });
    author.addEventListener('change', filters, { signal });
    performance.addEventListener('change', () => this.universe?.setPerformance(performance.value), { signal });
    this.root.querySelector('#universePause').addEventListener('click', event => {
      const paused = event.currentTarget.dataset.paused !== 'true';
      this.universe?.setPaused(paused);
      event.currentTarget.dataset.paused = paused ? 'true' : 'false';
      event.currentTarget.textContent = paused ? 'Resume' : 'Pause';
    }, { signal });
    this.root.querySelector('#universeReplay').addEventListener('click', () => {
      if (!this.lastTraversal?.steps?.length) {
        this._setStatus('Ask a question first to create an exploration route.');
        return;
      }
      this.universe?.playRoute(this.lastTraversal.steps);
      this._setStatus('Replaying the last source-grounded route');
    }, { signal });
    this.root.querySelector('#universeStop').addEventListener('click', () => {
      this.universe?.stopRoute();
      this._setStatus('Exploration route ended. You can keep browsing the universe.');
    }, { signal });
    this.root.querySelector('#universeReset').addEventListener('click', () => this.universe?.resetCamera(), { signal });
    this.root.querySelector('#universeFullscreen').addEventListener('click', () => {
      const stage = this.root.querySelector('#universeStage');
      if (document.fullscreenElement) document.exitFullscreen?.();
      else stage.requestFullscreen?.();
    }, { signal });
    this.root.querySelector('#universeExploreForm').addEventListener('submit', event => {
      event.preventDefault();
      this._explore();
    }, { signal });
  }

  async _explore() {
    if (!this.sourceReady) {
      this._setStatus('The source session is still restoring. Please wait a moment.');
      return;
    }
    const input = this.root.querySelector('#universeQuery');
    const query = input.value.trim();
    if (!query) {
      input.focus();
      return;
    }
    const button = this.root.querySelector('#universeExploreForm button');
    button.disabled = true;
    button.textContent = 'Tracing…';
    this._setStatus('Finding a source-grounded route');
    try {
      const response = await fetch('/api/research/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId: this.paperId, query }),
      });
      const traversal = await response.json();
      if (!response.ok) throw new Error(traversal.error || 'The exploration route could not be generated.');
      this.lastTraversal = traversal;
      this.root.querySelector('#highStakesNotice').hidden = !traversal.highStakesNotice;
      if (!traversal.steps?.length) {
        this._setStatus(traversal.summary);
        this._renderSynthesis(traversal);
        return;
      }
      this.universe?.playRoute(traversal.steps);
      this._renderSynthesis(traversal);
    } catch (error) {
      this._setStatus(error.message || 'The exploration route could not be generated.');
    } finally {
      button.disabled = false;
      button.innerHTML = 'Explore <span>→</span>';
    }
  }

  _renderRouteStep(step, index, total) {
    const node = this.graph.nodes.find(item => item.id === step.nodeId);
    this._setStatus('Exploring ' + (index + 1) + ' of ' + total + ': ' + (node?.label || 'source node'));
    if (node) this._renderDetail(node, step.reason);
  }

  _renderDetail(node, routeReason = '') {
    const citation = node.citation || {};
    const related = this.graph.edges.filter(edge => edge.sourceId === node.id || edge.targetId === node.id);
    const inference = related.some(edge => edge.inference);
    const neighbours = [...new Set(related.map(edge => edge.sourceId === node.id ? edge.targetId : edge.sourceId))]
      .map(id => this.graph.nodes.find(item => item.id === id))
      .filter(Boolean)
      .slice(0, 4)
      .map(item => item.label)
      .join(' · ');
    const sourceTitles = [...new Set(node.sourcePaperIds || [])]
      .map(id => this.graph.papers.find(paper => paper.id === id)?.title || id)
      .join(' · ');
    this.root.querySelector('#universeDetail').innerHTML = [
      '<div class="detail-topline"><span class="detail-type">' + escapeHtml(node.type) + '</span><span>' + Math.round((node.confidence || 0) * 100) + '% confidence</span></div>',
      '<h3>' + escapeHtml(node.label) + '</h3>',
      '<p>' + escapeHtml(routeReason || node.description || 'Source-linked research entity.') + '</p>',
      '<dl><div><dt>Evidence quality</dt><dd>' + escapeHtml(node.evidenceQuality || 'not established') + '</dd></div><div><dt>Relationships</dt><dd>' + related.length + ' visible</dd></div><div><dt>Uncertainty</dt><dd>' + Math.round((node.uncertainty || 0) * 100) + '%</dd></div><div><dt>Related sources</dt><dd>' + escapeHtml(sourceTitles || 'Current paper') + '</dd></div>' + (neighbours ? '<div><dt>First-degree links</dt><dd>' + escapeHtml(neighbours) + '</dd></div>' : '') + '</dl>',
      inference ? '<p class="inference-note">Some visible relationships are model-generated interpretations and are labelled as such.</p>' : '',
      citation.page ? '<button class="universe-citation" data-page="' + citation.page + '" data-label="' + escapeHtml(citation.label) + '">Open source · p. ' + citation.page + ' ↗</button>' : '<p class="citation-missing">No page anchor is available for this visual relationship.</p>',
    ].join('');
    const citationButton = this.root.querySelector('.universe-citation');
    citationButton?.addEventListener('click', () => this.onCitation(citation.page, citation.label), { signal: this.abortController.signal });
  }

  _renderSynthesis(traversal) {
    const citations = (traversal.citations || []).slice(0, 3).map(citation => 'p. ' + citation.page).join(' · ');
    this.root.querySelector('#universeDetail').innerHTML = [
      '<div class="detail-topline"><span class="detail-type">research synthesis</span><span>' + Math.round((traversal.confidence || 0) * 100) + '% confidence</span></div>',
      '<h3>' + escapeHtml(traversal.query) + '</h3>',
      '<p>' + escapeHtml(traversal.summary) + '</p>',
      traversal.openQuestions?.length ? '<p class="open-questions"><strong>Unresolved:</strong> ' + escapeHtml(traversal.openQuestions.join(' · ')) + '</p>' : '',
      citations ? '<p class="synthesis-citations">Source anchors: ' + escapeHtml(citations) + '</p>' : '<p class="citation-missing">No source-grounded route was available.</p>',
    ].join('');
  }

  _renderCounts() {
    const nodeCount = this.graph.nodes?.length || 0;
    const edgeCount = this.graph.edges?.length || 0;
    this.root.querySelector('#universeCounts').textContent = nodeCount + ' neurons · ' + edgeCount + ' pathways';
  }

  _setStatus(message) {
    const status = this.root.querySelector('#universeStatus');
    if (status) status.textContent = message;
  }

  _renderFallback(error) {
    const list = (this.graph.nodes || []).slice(0, 24).map(node => {
      const page = node.citation?.page;
      return '<button class="fallback-node" data-node="' + escapeHtml(node.id) + '"><span>' + escapeHtml(node.type) + '</span><strong>' + escapeHtml(node.label) + '</strong>' + (page ? '<small>p. ' + page + '</small>' : '') + '</button>';
    }).join('');
    this.root.querySelector('#universeStage').innerHTML = '<div class="universe-fallback"><p>3D rendering is unavailable here. Browse the source-linked research entities instead.</p><div>' + list + '</div><small>' + escapeHtml(error.message) + '</small></div>';
    this.root.querySelectorAll('.fallback-node').forEach(button => {
      button.addEventListener('click', () => {
        const node = this.graph.nodes.find(item => item.id === button.dataset.node);
        if (node) this._renderDetail(node);
      }, { signal: this.abortController.signal });
    });
  }

  updateGraph(graph) {
    this.graph = graph;
    this.universe?.setGraph(graph);
    this._renderCounts();
  }

  destroy() {
    this.abortController.abort();
    this.universe?.destroy();
    this.universe = null;
  }
}
