const test = require('node:test');
const assert = require('node:assert/strict');

const { buildResearchGraph } = require('../services/research-graph-service');

test('builds a source-linked research graph from extracted paper analysis', () => {
  const graph = buildResearchGraph('paper-123', {
    title: 'Traceable systems',
    authors: 'A. Researcher',
    year: '2026',
    overview: { oneLiner: 'A source-grounded overview.' },
    conceptMap: {
      nodes: [
        { id: 'method', label: 'Method', summary: 'The tested method.', page: 2, labelSource: 'Methods' },
        { id: 'result', label: 'Result', summary: 'The observed result.', page: 5, labelSource: 'Results' },
      ],
      links: [{ source: 'method', target: 'result', label: 'supports' }],
    },
    claims: [{ claim: 'The method improved a measured outcome.', evidence: 'strong', reason: 'Reported in the results.', page: 5, label: 'Results' }],
    researchGaps: [{ gap: 'Long-term effects remain unknown.', type: 'Evidence gap', reason: 'The study is short.', paperRelation: 'stated by the authors', page: 7, label: 'Limitations' }],
  });

  assert.equal(graph.papers[0].id, 'paper-123');
  assert.ok(graph.nodes.some(node => node.type === 'paper'));
  assert.ok(graph.nodes.some(node => node.type === 'claim' && node.citation.page === 5));
  assert.ok(graph.nodes.some(node => node.type === 'question' && node.citation.page === 7));
  assert.ok(graph.edges.some(edge => edge.relationType === 'supports' && edge.inference));
  assert.ok(graph.edges.every(edge => edge.supportingSourceIds.includes('paper-123')));
});
