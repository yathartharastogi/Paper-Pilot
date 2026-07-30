const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { createServer } = require('../server');

function request(port, method, requestPath, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request({
      host: '127.0.0.1',
      port,
      method,
      path: requestPath,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
    }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('serves the universe module and rejects exploration without a known paper', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const module = await request(port, 'GET', '/universe/universe-bridge.js');
    assert.equal(module.status, 200);
    assert.match(module.headers['content-type'], /text\/javascript/);
    assert.equal(module.headers['cache-control'], 'no-store, max-age=0');
    const cacheBustedHome = await request(port, 'GET', '/?build=current');
    assert.equal(cacheBustedHome.status, 200);
    const renderer = await request(port, 'GET', '/universe/neural-universe.js');
    assert.equal(renderer.status, 200);
    const controls = await request(port, 'GET', '/node_modules/three/examples/jsm/controls/OrbitControls.js');
    assert.equal(controls.status, 200);

    const exploration = await request(port, 'POST', '/api/research/explore', { paperId: 'missing', query: 'What does this paper show?' });
    assert.equal(exploration.status, 400);
    assert.match(JSON.parse(exploration.body).error, /universe is not ready/i);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('rebuilds a graph when a saved analysis is restored into a new session', async () => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const session = await request(port, 'POST', '/api/session', {
      name: 'saved.pdf',
      mimeType: 'application/pdf',
      data: 'data:application/pdf;base64,JVBERi0xLjQK',
      analysis: {
        title: 'Restored paper',
        overview: { oneLiner: 'A saved overview.' },
        conceptMap: { nodes: [], links: [] },
        claims: [],
        researchGaps: [],
      },
    });
    const restored = JSON.parse(session.body);
    assert.equal(session.status, 200);
    assert.ok(restored.paperId);
    assert.ok(restored.graph.nodes.some(node => node.type === 'paper'));
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
