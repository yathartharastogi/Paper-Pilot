const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyRelation,
  mergeIngestionGraph,
  normalizeGraph,
  sanitizeResearchQuery,
  validateTraversalResponse,
} = require('../lib/graph-data');

test('normalizes duplicate entities and preserves a traceable citation', () => {
  const graph = normalizeGraph({
    papers: [{ id: 'paper-a', title: 'A Paper', year: '2025' }],
    nodes: [
      { id: 'claim-1', type: 'claim', label: 'A supported result', citation: { paperId: 'paper-a', page: 4, label: 'Results' } },
      { id: 'claim-1', type: 'claim', label: 'Duplicate' },
      { id: 'question-1', type: 'question', label: 'An open question' },
    ],
    edges: [
      { sourceId: 'claim-1', targetId: 'question-1', relationType: 'extends', weight: 0.3 },
      { sourceId: 'question-1', targetId: 'claim-1', relationType: 'extends', weight: 0.8 },
      { sourceId: 'missing', targetId: 'claim-1', relationType: 'supports' },
    ],
  });

  assert.equal(graph.nodes.length, 2);
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].weight, 0.8);
  assert.equal(graph.nodes[0].citation.page, 4);
  assert.equal(classifyRelation('conflicting evidence'), 'contradicts');
});

test('merges ingestion updates without creating duplicate nodes or edges', () => {
  const initial = normalizeGraph({
    papers: [{ id: 'paper-a', title: 'A' }],
    nodes: [{ id: 'concept-1', type: 'concept', label: 'Concept one' }],
    edges: [],
  });
  const merged = mergeIngestionGraph(initial, {
    papers: [{ id: 'paper-a', title: 'A revised' }],
    nodes: [
      { id: 'concept-1', type: 'concept', label: 'Concept one again' },
      { id: 'claim-1', type: 'claim', label: 'Claim one' },
    ],
    edges: [{ sourceId: 'concept-1', targetId: 'claim-1', relationType: 'supports' }],
  });

  assert.equal(merged.papers.length, 1);
  assert.equal(merged.nodes.length, 2);
  assert.equal(merged.edges.length, 1);
});

test('rejects traversal references that are not in the graph', () => {
  const graph = normalizeGraph({
    papers: [{ id: 'paper-a', title: 'A' }],
    nodes: [
      { id: 'concept-1', type: 'concept', label: 'Concept' },
      { id: 'claim-1', type: 'claim', label: 'Claim' },
    ],
    edges: [{ sourceId: 'concept-1', targetId: 'claim-1', relationType: 'supports' }],
  });
  const traversal = validateTraversalResponse({
    query: 'What happened?',
    summary: 'A source-grounded answer.',
    confidence: 0.9,
    steps: [
      { nodeId: 'concept-1', reason: 'First', evidenceIds: ['claim-1', 'outside-node'], sourcePaperIds: ['paper-a', 'outside-paper'] },
      { nodeId: 'outside-node', reason: 'Ignore this' },
      { nodeId: 'concept-1', reason: 'Ignore duplicate' },
    ],
    citations: [
      { paperId: 'paper-a', page: 3, label: 'Methods' },
      { paperId: 'outside-paper', page: 9, label: 'Not allowed' },
    ],
  }, graph);

  assert.deepEqual(traversal.steps.map(step => step.nodeId), ['concept-1']);
  assert.deepEqual(traversal.steps[0].evidenceIds, ['claim-1']);
  assert.deepEqual(traversal.steps[0].sourcePaperIds, ['paper-a']);
  assert.deepEqual(traversal.citations.map(citation => citation.paperId), ['paper-a']);
});

test('requires a bounded research query', () => {
  assert.throws(() => sanitizeResearchQuery(' \u0000 '), /Enter a research question/);
  assert.equal(sanitizeResearchQuery('  Explain the method.\n'), 'Explain the method.');
});
