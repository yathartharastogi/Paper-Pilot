# PaperPilot

PaperPilot is a single-user, source-grounded workspace for reading one research paper at a time. It has no accounts, no shared paper library, and no general-purpose chat mode: analysis, debate, Q&A, and exploration are constrained to the uploaded PDF.

The workspace includes:

- a cited overview, claims/evidence view, novelty checker, and research-gap analyzer;
- source-limited Q&A and a debate view that defends the paper only where the PDF supports it;
- an interactive concept map and a 3D **Neural Research Universe**;
- browser persistence for the current uploaded PDF and its extracted analysis across refreshes;
- a compact light/dark interface, with dark as the default.

## Neural Research Universe

The Universe is a real Three.js/WebGL view, not a pre-rendered animation. It is built from the analysis returned for the current paper:

| Entity | Generated from | Traceability |
| --- | --- | --- |
| Paper region | Title, author, year, overview | Paper ID |
| Concept neuron | Extracted concept-map node | Page and source label |
| Claim neuron | Extracted claim/evidence item | Page, evidence quality |
| Question void | Research-gap item | Page, uncertainty |
| Evidence path | Paper-to-entity and concept-map relationships | Relation type and inference marker |

Concept-map relationships are explicitly marked as model-inferred when they are interpretations rather than direct extracted statements. The detail panel reports confidence, evidence quality, uncertainty, linked relationships, and an **Open source** action where a page anchor exists.

Use the toolbar to search, filter by node type, relationship, year, author, or performance tier. Drag to orbit, scroll to zoom, select a neuron to focus, use full-screen mode when useful, or pause animation. The renderer uses instanced meshes, supports a reduced-motion preference, and provides a source-linked list fallback when WebGL is unavailable.

**Ask and explore** calls POST /api/research/explore. It asks Gemini for a 1–6 node learning route from the current graph and source PDF. Invalid node/paper references are discarded. A route with no research entity or no valid source citation is converted to: “This paper doesn't address that.”

## Run locally

1. Install dependencies:

   ~~~powershell
   npm.cmd install
   ~~~

2. Copy .env.example to .env, then set your Gemini configuration:

   ~~~env
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-3.5-flash
   ~~~

3. Start the local server:

   ~~~powershell
   npm.cmd start
   ~~~

4. Open http://localhost:4173.

The key is loaded only by the Node server. Do not put it in browser JavaScript or commit .env.

## API surface

| Route | Purpose |
| --- | --- |
| POST /api/analyze | Analyze a PDF and return its source-linked analysis plus graph |
| POST /api/session | Restore the saved browser PDF/analysis into the current server session |
| POST /api/question | Ask or debate, limited to the source PDF |
| GET /api/research/graph?paperId=… | Retrieve the normalized Universe graph for the current session |
| POST /api/research/explore | Generate a guarded graph traversal for a research question |
| GET /api/health | Check configuration status without exposing the key |

## Tests and checks

~~~powershell
npm.cmd run check
npm.cmd test
~~~

The tests cover graph normalization, duplicate prevention, citation preservation, traversal validation, graph generation, static module delivery, and the no-paper exploration guard.

## Boundaries and limitations

- The local server keeps source PDFs in memory for its current runtime. The browser keeps the current PDF and analysis in IndexedDB so the workspace survives refreshes; after a server restart it restores the local source into a fresh session.
- The Universe currently visualizes the one active paper; its graph model supports multi-paper provenance, but the product does not present a paper-library or multi-upload workflow.
- Gemini can fail or be rate-limited. The UI shows the error rather than fabricating a successful analysis or route.
- PaperPilot is a reading and exploration aid, not medical, legal, financial, or other professional advice. High-stakes medical queries show an additional notice and remain limited to what the uploaded paper says.
