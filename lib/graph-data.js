const RELATION_TYPES = new Set([
  'supports',
  'contradicts',
  'extends',
  'cites',
  'investigates',
  'related_to',
  'answers',
  'raises_question',
]);

const NODE_TYPES = new Set(['paper', 'concept', 'claim', 'question']);

function safeText(value, limit = 600) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, limit);
}

function stableId(prefix, value) {
  const input = safeText(value, 300) || 'untitled';
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function classifyRelation(label) {
  const normalized = safeText(label, 120).toLowerCase();
  if (/contradict|conflict|disagree|oppose/.test(normalized)) return 'contradicts';
  if (/support|evidence|validate|confirm/.test(normalized)) return 'supports';
  if (/extend|build|improve|expand/.test(normalized)) return 'extends';
  if (/cite|reference/.test(normalized)) return 'cites';
  if (/answer|resolve/.test(normalized)) return 'answers';
  if (/question|open problem|gap/.test(normalized)) return 'raises_question';
  if (/investig|stud|exam|evaluat/.test(normalized)) return 'investigates';
  return 'related_to';
}

function normalizeCitation(value, fallbackPaperId) {
  const page = Number(value?.page);
  return {
    paperId: safeText(value?.paperId || fallbackPaperId, 120),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : null,
    label: safeText(value?.label, 180) || 'Source location',
    passage: safeText(value?.passage, 500),
  };
}

function normalizeNode(value, fallbackPaperId) {
  const id = safeText(value?.id, 160);
  const type = NODE_TYPES.has(value?.type) ? value.type : 'concept';
  const confidence = Number(value?.confidence);
  const position = value?.position || {};
  return {
    id,
    type,
    label: safeText(value?.label, 160) || 'Untitled concept',
    description: safeText(value?.description, 700),
    aliases: Array.isArray(value?.aliases) ? [...new Set(value.aliases.map(alias => safeText(alias, 120)).filter(Boolean))].slice(0, 12) : [],
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    sourcePaperIds: Array.isArray(value?.sourcePaperIds)
      ? [...new Set(value.sourcePaperIds.map(idValue => safeText(idValue, 120)).filter(Boolean))]
      : [fallbackPaperId].filter(Boolean),
    citation: normalizeCitation(value?.citation, fallbackPaperId),
    evidenceQuality: safeText(value?.evidenceQuality, 60) || 'not established',
    uncertainty: Number.isFinite(Number(value?.uncertainty)) ? Math.max(0, Math.min(1, Number(value.uncertainty))) : 0,
    position: {
      x: Number.isFinite(Number(position.x)) ? Number(position.x) : 0,
      y: Number.isFinite(Number(position.y)) ? Number(position.y) : 0,
      z: Number.isFinite(Number(position.z)) ? Number(position.z) : 0,
    },
  };
}

function normalizeGraph(input) {
  const graph = input && typeof input === 'object' ? input : {};
  const paperMap = new Map();
  for (const rawPaper of Array.isArray(graph.papers) ? graph.papers : []) {
    const paper = {
      id: safeText(rawPaper?.id, 120),
      title: safeText(rawPaper?.title, 240) || 'Untitled paper',
      authors: safeText(rawPaper?.authors, 240),
      year: safeText(rawPaper?.year, 20),
      doi: safeText(rawPaper?.doi, 240),
      abstract: safeText(rawPaper?.abstract, 1000),
      ingestionStatus: safeText(rawPaper?.ingestionStatus, 40) || 'ready',
    };
    if (paper.id && !paperMap.has(paper.id)) paperMap.set(paper.id, paper);
  }
  const papers = [...paperMap.values()];
  const fallbackPaperId = papers[0]?.id || '';
  const nodeMap = new Map();
  for (const rawNode of Array.isArray(graph.nodes) ? graph.nodes : []) {
    const node = normalizeNode(rawNode, fallbackPaperId);
    if (!node.id || nodeMap.has(node.id)) continue;
    nodeMap.set(node.id, node);
  }
  const edgeMap = new Map();
  for (const rawEdge of Array.isArray(graph.edges) ? graph.edges : []) {
    const sourceId = safeText(rawEdge?.sourceId, 160);
    const targetId = safeText(rawEdge?.targetId, 160);
    if (!nodeMap.has(sourceId) || !nodeMap.has(targetId) || sourceId === targetId) continue;
    const relationType = RELATION_TYPES.has(rawEdge?.relationType) ? rawEdge.relationType : classifyRelation(rawEdge?.relationType);
    const key = [sourceId, targetId].sort().join('|') + `|${relationType}`;
    const weight = Number(rawEdge?.weight);
    const confidence = Number(rawEdge?.confidence);
    const edge = {
      id: safeText(rawEdge?.id, 160) || stableId('edge', key),
      sourceId,
      targetId,
      relationType,
      label: safeText(rawEdge?.label, 160) || relationType.replace('_', ' '),
      weight: Number.isFinite(weight) ? Math.max(0.05, Math.min(1, weight)) : 0.45,
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
      supportingSourceIds: Array.isArray(rawEdge?.supportingSourceIds)
        ? [...new Set(rawEdge.supportingSourceIds.map(idValue => safeText(idValue, 120)).filter(Boolean))]
        : [],
      citation: normalizeCitation(rawEdge?.citation, fallbackPaperId),
      inference: Boolean(rawEdge?.inference),
    };
    const prior = edgeMap.get(key);
    if (!prior || edge.weight > prior.weight) edgeMap.set(key, edge);
  }
  return {
    version: 1,
    papers,
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    generatedAt: new Date().toISOString(),
  };
}

function mergeIngestionGraph(graph, update) {
  return normalizeGraph({
    papers: [...(graph?.papers || []), ...(update?.papers || [])],
    nodes: [...(graph?.nodes || []), ...(update?.nodes || [])],
    edges: [...(graph?.edges || []), ...(update?.edges || [])],
  });
}

function sanitizeResearchQuery(value) {
  const query = safeText(value, 1000);
  if (!query) throw new Error('Enter a research question first.');
  return query;
}

function isHighStakesQuery(query) {
  return /\b(cancer|medical|medicine|diagnos|treat|therapy|disease|clinical|dose|suicide|self-harm)\b/i.test(query);
}

function validateTraversalResponse(value, graph) {
  const validIds = new Set((graph?.nodes || []).map(node => node.id));
  const validPaperIds = new Set((graph?.papers || []).map(paper => paper.id));
  const rawSteps = Array.isArray(value?.steps) ? value.steps : [];
  const steps = [];
  const seen = new Set();
  for (const rawStep of rawSteps) {
    const nodeId = safeText(rawStep?.nodeId, 160);
    if (!validIds.has(nodeId) || seen.has(nodeId)) continue;
    seen.add(nodeId);
    steps.push({
      nodeId,
      reason: safeText(rawStep?.reason, 500) || 'Relevant to the research question.',
      evidenceIds: Array.isArray(rawStep?.evidenceIds) ? rawStep.evidenceIds.map(id => safeText(id, 160)).filter(validIds.has, validIds) : [],
      contradictionIds: Array.isArray(rawStep?.contradictionIds) ? rawStep.contradictionIds.map(id => safeText(id, 160)).filter(validIds.has, validIds) : [],
      sourcePaperIds: Array.isArray(rawStep?.sourcePaperIds)
        ? rawStep.sourcePaperIds.map(id => safeText(id, 120)).filter(id => validPaperIds.has(id))
        : [],
    });
  }
  const citations = Array.isArray(value?.citations)
    ? value.citations
      .map(citation => normalizeCitation(citation, graph?.papers?.[0]?.id))
      .filter(citation => citation.page && validPaperIds.has(citation.paperId))
    : [];
  return {
    query: safeText(value?.query, 1000),
    summary: safeText(value?.summary, 1200) || 'No source-grounded synthesis was generated.',
    confidence: Math.max(0, Math.min(1, Number(value?.confidence) || 0)),
    steps,
    openQuestions: Array.isArray(value?.openQuestions) ? value.openQuestions.map(item => safeText(item, 300)).filter(Boolean).slice(0, 8) : [],
    citations,
  };
}

module.exports = {
  RELATION_TYPES,
  classifyRelation,
  isHighStakesQuery,
  mergeIngestionGraph,
  normalizeGraph,
  safeText,
  sanitizeResearchQuery,
  stableId,
  validateTraversalResponse,
};
