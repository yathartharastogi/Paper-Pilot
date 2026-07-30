import * as THREE from '/node_modules/three/build/three.module.js';
import { OrbitControls } from '/node_modules/three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from '/node_modules/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/node_modules/three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '/node_modules/three/examples/jsm/postprocessing/UnrealBloomPass.js';

const PERFORMANCE = {
  auto: { pixelRatio: 1.5, maxNodes: 2200, bloom: 1.05, segments: 8 },
  high: { pixelRatio: 2, maxNodes: 2600, bloom: 1.28, segments: 10 },
  balanced: { pixelRatio: 1.25, maxNodes: 1600, bloom: 0.82, segments: 7 },
  low: { pixelRatio: 1, maxNodes: 800, bloom: 0, segments: 5 },
};

const NODE_COLOURS = {
  paper: new THREE.Color('#ffd166'),
  concept: new THREE.Color('#72e3ff'),
  claim: new THREE.Color('#47ffc5'),
  question: new THREE.Color('#ff78bf'),
};

const EDGE_COLOURS = {
  supports: new THREE.Color('#d7ff78'),
  contradicts: new THREE.Color('#ff5f9b'),
  extends: new THREE.Color('#b78cff'),
  cites: new THREE.Color('#7fabff'),
  investigates: new THREE.Color('#72e3ff'),
  related_to: new THREE.Color('#7e9dff'),
  answers: new THREE.Color('#47ffc5'),
  raises_question: new THREE.Color('#ff9ed2'),
};

const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();
const dimmed = new THREE.Color('#1d3150');
const selected = new THREE.Color('#fff2a8');

function nodeSize(node) {
  if (node.type === 'paper') return 1.75;
  if (node.type === 'claim') return 1.3;
  if (node.type === 'question') return 1.04;
  return 0.96 + (node.confidence || 0.5) * 0.58;
}

function getPosition(node) {
  return new THREE.Vector3(node.position?.x || 0, node.position?.y || 0, node.position?.z || 0);
}

function easeOutCubic(value) {
  return 1 - ((1 - value) ** 3);
}

export class NeuralUniverse {
  constructor({ canvas, performance = 'auto', reducedMotion = false, onSelect, onHover, onRouteStep }) {
    if (!canvas || !window.WebGLRenderingContext) throw new Error('WebGL is unavailable in this browser.');
    this.canvas = canvas;
    this.performance = PERFORMANCE[performance] ? performance : 'auto';
    this.reducedMotion = reducedMotion;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});
    this.onRouteStep = onRouteStep || (() => {});
    this.abortController = new AbortController();
    this.pointer = new THREE.Vector2(4, 4);
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.routeTimers = new Set();
    this.filters = {};
    this.running = false;
    this.selectedId = null;
    this.hoveredId = null;
    this._setupScene();
    this._bindEvents();
  }

  _setupScene() {
    const parent = this.canvas.parentElement;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#07101e');
    this.scene.fog = new THREE.FogExp2('#07101e', 0.011);
    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 180);
    this.camera.position.set(0, 0, 37);
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, PERFORMANCE[this.performance].pixelRatio));
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 85;
    this.scene.add(new THREE.AmbientLight('#79a8ff', 1.1));
    const cyan = new THREE.PointLight('#37c9ff', 18, 58, 2);
    cyan.position.set(-12, 10, 20);
    const violet = new THREE.PointLight('#a487ff', 16, 54, 2);
    violet.position.set(17, -10, 13);
    this.scene.add(cyan, violet);
    this._createStarfield();
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), PERFORMANCE[this.performance].bloom, 0.48, 0.18);
    this.composer.addPass(this.bloomPass);
    this._resize(parent.clientWidth, parent.clientHeight);
    this.resizeObserver = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect;
      if (rect) this._resize(rect.width, rect.height);
    });
    this.resizeObserver.observe(parent);
  }

  _bindEvents() {
    const signal = this.abortController.signal;
    this.canvas.addEventListener('pointermove', event => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      this.needsPick = true;
    }, { signal });
    this.canvas.addEventListener('pointerleave', () => {
      this.pointer.set(4, 4);
      this._setHover(null);
    }, { signal });
    this.canvas.addEventListener('click', () => {
      if (this.hoveredId) this.focusNode(this.hoveredId);
    }, { signal });
  }

  _resize(width, height) {
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
  }

  setGraph(graph) {
    this.graph = graph || { nodes: [], edges: [] };
    this.selectedId = null;
    this.nodeById = new Map(this.graph.nodes.map(node => [node.id, node]));
    this.neighbors = new Map(this.graph.nodes.map(node => [node.id, new Set()]));
    this.graph.edges.forEach(edge => {
      this.neighbors.get(edge.sourceId)?.add(edge.targetId);
      this.neighbors.get(edge.targetId)?.add(edge.sourceId);
    });
    this._disposeGraph();
    this._createNodeMesh();
    this._createEdgeLines();
    this.ingestion = {
      started: performance.now(),
      duration: this.reducedMotion ? 0 : 560,
    };
    this.applyFilters(this.filters);
    this.start();
  }

  _createNodeMesh() {
    const quality = PERFORMANCE[this.performance];
    this.visibleNodes = this.graph.nodes.slice(0, quality.maxNodes);
    this.nodeIds = this.visibleNodes.map(node => node.id);
    this.nodeIndex = new Map(this.nodeIds.map((id, index) => [id, index]));
    this.nodeGeometry = new THREE.SphereGeometry(0.54, quality.segments, quality.segments);
    this.nodeMeshes = [];
    this.meshEntryByNodeIndex = new Array(this.visibleNodes.length);
    const groups = new Map();
    this.visibleNodes.forEach((node, index) => {
      const type = NODE_COLOURS[node.type] ? node.type : 'concept';
      if (!groups.has(type)) groups.set(type, []);
      groups.get(type).push({ node, index });
    });
    groups.forEach((entries, type) => {
      const material = new THREE.MeshBasicMaterial({
        color: NODE_COLOURS[type],
        fog: false,
        toneMapped: false,
        depthWrite: true,
      });
      const mesh = new THREE.InstancedMesh(this.nodeGeometry, material, entries.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.userData.nodeIds = entries.map(entry => entry.node.id);
      entries.forEach((entry, meshIndex) => {
        this.meshEntryByNodeIndex[entry.index] = { mesh, meshIndex };
      });
      this.nodeMeshes.push(mesh);
      this.scene.add(mesh);
    });
    this.baseScales = new Float32Array(this.visibleNodes.length);
    this.nodeVisibility = new Uint8Array(this.visibleNodes.length);
    this.visibleNodes.forEach((node, index) => {
      this.baseScales[index] = nodeSize(node);
      this.nodeVisibility[index] = 1;
      this._setMatrix(index, node, this.baseScales[index]);
    });
    this._markNodeMatricesDirty();
  }

  _createEdgeLines() {
    const visible = new Set(this.nodeIds);
    this.visibleEdges = this.graph.edges.filter(edge => visible.has(edge.sourceId) && visible.has(edge.targetId));
    const positions = new Float32Array(this.visibleEdges.length * 6);
    const colours = new Float32Array(this.visibleEdges.length * 6);
    this.visibleEdges.forEach((edge, index) => {
      const from = getPosition(this.nodeById.get(edge.sourceId));
      const to = getPosition(this.nodeById.get(edge.targetId));
      positions.set([from.x, from.y, from.z, to.x, to.y, to.z], index * 6);
      const colour = EDGE_COLOURS[edge.relationType] || EDGE_COLOURS.related_to;
      colours.set([colour.r, colour.g, colour.b, colour.r, colour.g, colour.b], index * 6);
    });
    this.edgeGeometry = new THREE.BufferGeometry();
    this.edgeGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.edgeGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    this.edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      fog: false,
      toneMapped: false,
      depthWrite: false,
    });
    this.edgeLines = new THREE.LineSegments(this.edgeGeometry, this.edgeMaterial);
    this.edgeVisibility = new Uint8Array(this.visibleEdges.length);
    this.edgeVisibility.fill(1);
    this.scene.add(this.edgeLines);
  }

  _setMatrix(index, node, scalar) {
    const entry = this.meshEntryByNodeIndex?.[index];
    if (!entry) return;
    scaleVector.setScalar(Math.max(0.001, scalar));
    matrix.compose(getPosition(node), quaternion, scaleVector);
    entry.mesh.setMatrixAt(entry.meshIndex, matrix);
  }

  _markNodeMatricesDirty() {
    this.nodeMeshes?.forEach(mesh => {
      mesh.instanceMatrix.needsUpdate = true;
    });
  }

  _createStarfield() {
    const count = 420;
    const positions = new Float32Array(count * 3);
    const colours = new Float32Array(count * 3);
    const colour = new THREE.Color('#85b8ff');
    for (let index = 0; index < count; index += 1) {
      const radius = 24 + ((index * 37) % 70);
      const angle = index * 2.399963229728653;
      const offset = ((index * 17) % 100) / 100 - 0.5;
      positions[index * 3] = Math.cos(angle) * radius;
      positions[index * 3 + 1] = Math.sin(angle) * radius * 0.66;
      positions[index * 3 + 2] = offset * 42 - 14;
      const intensity = 0.32 + ((index * 13) % 60) / 100;
      colours[index * 3] = colour.r * intensity;
      colours[index * 3 + 1] = colour.g * intensity;
      colours[index * 3 + 2] = colour.b * intensity;
    }
    this.starGeometry = new THREE.BufferGeometry();
    this.starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    this.starMaterial = new THREE.PointsMaterial({
      size: 0.11,
      vertexColors: true,
      transparent: true,
      opacity: 0.74,
      fog: false,
      toneMapped: false,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.starfield = new THREE.Points(this.starGeometry, this.starMaterial);
    this.scene.add(this.starfield);
  }

  _ingestionFactor(index) {
    if (!this.ingestion) return 1;
    const delay = Math.min(720, index * 18);
    const elapsed = performance.now() - this.ingestion.started - delay;
    if (this.ingestion.duration === 0) return 1;
    return Math.max(0.02, Math.min(1, easeOutCubic(Math.max(0, elapsed) / this.ingestion.duration)));
  }

  applyFilters(filters = {}) {
    this.filters = { ...filters };
    if (!this.nodeMeshes?.length) return;
    const papersById = new Map((this.graph.papers || []).map(paper => [paper.id, paper]));
    const relationNodes = new Set();
    if (filters.relationType) {
      this.visibleEdges.forEach(edge => {
        if (edge.relationType !== filters.relationType) return;
        relationNodes.add(edge.sourceId);
        relationNodes.add(edge.targetId);
      });
    }
    this.visibleNodes.forEach((node, index) => {
      const text = (node.label + ' ' + node.description).toLowerCase();
      const matchesSearch = !filters.search || text.includes(filters.search.toLowerCase());
      const matchesType = !filters.nodeType || node.type === filters.nodeType;
      const matchesPaper = !filters.paperId || node.sourcePaperIds.includes(filters.paperId);
      const sourcePapers = node.sourcePaperIds.map(id => papersById.get(id)).filter(Boolean);
      const matchesYear = !filters.year || sourcePapers.some(paper => paper.year === filters.year);
      const matchesAuthor = !filters.author || sourcePapers.some(paper => paper.authors.toLowerCase().includes(filters.author.toLowerCase()));
      const matchesRelation = !filters.relationType || relationNodes.has(node.id);
      const isVisible = matchesSearch && matchesType && matchesPaper && matchesYear && matchesAuthor && matchesRelation;
      this.nodeVisibility[index] = isVisible ? 1 : 0;
      this._setMatrix(index, node, isVisible ? this.baseScales[index] * this._ingestionFactor(index) : 0.001);
    });
    this.visibleEdges.forEach((edge, index) => {
      const sourceIndex = this.nodeIndex.get(edge.sourceId);
      const targetIndex = this.nodeIndex.get(edge.targetId);
      this.edgeVisibility[index] = (
        this.nodeVisibility[sourceIndex] &&
        this.nodeVisibility[targetIndex] &&
        (!filters.relationType || edge.relationType === filters.relationType)
      ) ? 1 : 0;
    });
    this._markNodeMatricesDirty();
    this._applySelectionStyles();
  }

  setPerformance(setting) {
    if (!PERFORMANCE[setting] || setting === this.performance) return;
    this.performance = setting;
    const quality = PERFORMANCE[setting];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
    this.bloomPass.strength = quality.bloom;
    if (this.graph) this.setGraph(this.graph);
  }

  _applySelectionStyles() {
    if (!this.nodeMeshes?.length) return;
    const focusSet = this.selectedId ? new Set([this.selectedId, ...(this.neighbors.get(this.selectedId) || [])]) : null;
    this.visibleNodes.forEach((node, index) => {
      if (!this.nodeVisibility[index]) return;
      const scale = node.id === this.selectedId ? this.baseScales[index] * 1.45 : this.baseScales[index];
      this._setMatrix(index, node, scale * this._ingestionFactor(index));
    });
    this.visibleEdges.forEach((edge, index) => {
      const isActive = this.edgeVisibility[index] && (!focusSet || edge.sourceId === this.selectedId || edge.targetId === this.selectedId);
      const colour = isActive ? (EDGE_COLOURS[edge.relationType] || EDGE_COLOURS.related_to) : dimmed;
      const colors = this.edgeGeometry.getAttribute('color');
      colors.setXYZ(index * 2, colour.r, colour.g, colour.b);
      colors.setXYZ(index * 2 + 1, colour.r, colour.g, colour.b);
    });
    this._markNodeMatricesDirty();
    this.edgeGeometry.getAttribute('color').needsUpdate = true;
  }

  _pick() {
    if (!this.needsPick || !this.nodeMeshes?.length) return;
    this.needsPick = false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    let closest = null;
    this.nodeMeshes.forEach(mesh => {
      const hit = this.raycaster.intersectObject(mesh, false)[0];
      if (hit && (!closest || hit.distance < closest.distance)) closest = hit;
    });
    this._setHover(closest ? closest.object.userData.nodeIds[closest.instanceId] : null);
  }

  _setHover(nodeId) {
    if (this.hoveredId === nodeId) return;
    this.hoveredId = nodeId;
    this.canvas.style.cursor = nodeId ? 'pointer' : 'grab';
    this.onHover(nodeId ? this.nodeById.get(nodeId) : null);
  }

  focusNode(nodeId, notify = true) {
    const node = this.nodeById.get(nodeId);
    if (!node) return;
    this.selectedId = nodeId;
    this._applySelectionStyles();
    const target = getPosition(node);
    const distance = node.type === 'paper' ? 15 : 8.5;
    this.cameraFlight = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      toPosition: target.clone().add(new THREE.Vector3(distance * 0.45, distance * 0.26, distance)),
      toTarget: target,
      started: performance.now(),
      duration: this.reducedMotion ? 0 : 720,
    };
    if (notify) this.onSelect(node);
    this.start();
  }

  resetCamera() {
    this.selectedId = null;
    this._applySelectionStyles();
    this.cameraFlight = {
      position: this.camera.position.clone(),
      target: this.controls.target.clone(),
      toPosition: new THREE.Vector3(0, 0, 37),
      toTarget: new THREE.Vector3(),
      started: performance.now(),
      duration: this.reducedMotion ? 0 : 650,
    };
    this.start();
  }

  playRoute(steps) {
    this.stopRoute();
    const route = Array.isArray(steps) ? steps.filter(step => this.nodeById.has(step.nodeId)) : [];
    let index = 0;
    const visit = () => {
      const step = route[index];
      if (!step) return;
      this.focusNode(step.nodeId);
      this.onRouteStep(step, index, route.length);
      index += 1;
      if (index < route.length) {
        const timer = window.setTimeout(() => {
          this.routeTimers.delete(timer);
          visit();
        }, this.reducedMotion ? 0 : 1550);
        this.routeTimers.add(timer);
      }
    };
    visit();
  }

  stopRoute() {
    this.routeTimers.forEach(timer => window.clearTimeout(timer));
    this.routeTimers.clear();
  }

  setPaused(paused) {
    if (paused) {
      this.running = false;
      if (this.frame) cancelAnimationFrame(this.frame);
      this.frame = null;
      return;
    }
    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    const frame = () => {
      if (!this.running) return;
      this.frame = requestAnimationFrame(frame);
      this._pick();
      this._moveCamera();
      this._animateIngestion();
      this._pulse();
      this.controls.update();
      this.composer.render();
    };
    frame();
  }

  _moveCamera() {
    if (!this.cameraFlight) return;
    const elapsed = performance.now() - this.cameraFlight.started;
    const ratio = this.cameraFlight.duration ? Math.min(1, elapsed / this.cameraFlight.duration) : 1;
    const eased = easeOutCubic(ratio);
    this.camera.position.lerpVectors(this.cameraFlight.position, this.cameraFlight.toPosition, eased);
    this.controls.target.lerpVectors(this.cameraFlight.target, this.cameraFlight.toTarget, eased);
    if (ratio === 1) this.cameraFlight = null;
  }

  _pulse() {
    if (this.reducedMotion || this.ingestion || !this.nodeMeshes?.length) return;
    const time = this.clock.getElapsedTime();
    this.visibleNodes.forEach((node, index) => {
      if (!this.nodeVisibility[index] || (node.id !== this.selectedId && index % 3 !== 0)) return;
      const pulse = 1 + Math.sin(time * (0.7 + node.confidence) + index) * (0.035 + node.confidence * 0.035);
      this._setMatrix(index, node, this.baseScales[index] * pulse);
    });
    this._markNodeMatricesDirty();
  }

  _animateIngestion() {
    if (!this.ingestion || !this.nodeMeshes?.length) return;
    let complete = true;
    this.visibleNodes.forEach((node, index) => {
      const factor = this._ingestionFactor(index);
      if (factor < 1) complete = false;
      if (this.nodeVisibility[index]) this._setMatrix(index, node, this.baseScales[index] * factor);
    });
    const totalDuration = this.ingestion.duration + Math.min(720, Math.max(0, this.visibleNodes.length - 1) * 18);
    const globalProgress = Math.min(1, (performance.now() - this.ingestion.started) / Math.max(1, totalDuration));
    this.edgeMaterial.opacity = 0.16 + globalProgress * 0.66;
    this._markNodeMatricesDirty();
    if (complete) this.ingestion = null;
  }

  _disposeGraph() {
    this.ingestion = null;
    if (this.nodeMeshes) {
      this.nodeMeshes.forEach(mesh => {
        this.scene.remove(mesh);
        mesh.material.dispose();
      });
      this.nodeGeometry?.dispose();
      this.nodeMeshes = null;
      this.nodeGeometry = null;
      this.meshEntryByNodeIndex = null;
    }
    if (this.edgeLines) {
      this.scene.remove(this.edgeLines);
      this.edgeGeometry.dispose();
      this.edgeMaterial.dispose();
      this.edgeLines = null;
    }
  }

  destroy() {
    this.stopRoute();
    this.setPaused(true);
    this.abortController.abort();
    this.resizeObserver?.disconnect();
    this._disposeGraph();
    if (this.starfield) {
      this.scene.remove(this.starfield);
      this.starGeometry.dispose();
      this.starMaterial.dispose();
      this.starfield = null;
    }
    this.controls.dispose();
    this.composer.dispose();
    this.renderer.dispose();
  }
}
