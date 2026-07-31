# Paper Pilot

> Turn a dense research PDF into an interactive, source-bound research workspace.

Paper Pilot helps readers move beyond a summary. Upload a paper and explore its argument, evidence, novelty, limitations, and core concepts - while keeping every answer tied back to the source.

It is built for students, researchers, and anyone who wants to understand a paper quickly without losing the ability to verify what the paper actually says.

## What makes it different

- **Grounded by design** - questions, debate responses, and exploration routes are limited to the uploaded paper. If the paper does not address something, Paper Pilot says so.
- **Evidence you can inspect** - insights include page citations; selecting one jumps the source PDF to the relevant page.
- **A map instead of a wall of text** - the Neural Research Universe turns claims, concepts, questions, and evidence into an interactive 3D graph.
- **Made for real study sessions** - save several papers locally, switch between them after a refresh, use rapid-recall flashcards, and remove papers from history whenever needed.

## Features

| Area | What Paper Pilot does |
| --- | --- |
| **Overview** | Extracts the paper's problem, contribution, method, result, and why it matters. |
| **Evidence** | Presents key claims with their evidence strength and source pages. |
| **Novelty** | Evaluates what is differentiated *within the paper's own discussion of prior work* - it does not make unsupported claims of global novelty. |
| **Research gaps** | Surfaces author-stated gaps and clearly labelled scope, method, and evidence limitations. |
| **Ask paper** | Answers only when the uploaded PDF supports the answer, with citations. |
| **Debate** | Lets you challenge a claim; the AI provides the strongest defence the paper supports and identifies meaningful limits. |
| **Concept map** | Shows the paper's central problem, methods, evidence, results, and limitations as linked concepts. |
| **Neuron Universe** | Provides a navigable 3D graph with search, filters, focused nodes, evidence paths, and an accessible fallback. |
| **Question tracing** | Traces a research question through a visible, saved sequence of source-linked graph nodes. |
| **Flashcards** | Builds quick review prompts from the paper and presents them in animated flip cards. |
| **Paper library** | Persists multiple uploaded papers locally, restores them after refresh, and supports deletion from history. |

## Screenshots

Final product screenshots will be added here after the demo captures are ready.

## How it works

```text
Upload PDF
    |
    v
Gemini analyses only the supplied paper
    |
    v
Paper Pilot builds cited analysis + concept map + research graph
    |
    +--> Read overview, evidence, novelty, and gaps
    +--> Ask or debate within the paper's boundaries
    +--> Explore and trace paths through the Neural Research Universe
    +--> Review with flashcards
```

## Local-first privacy model

- No accounts or shared cloud library.
- The Gemini API key stays on the Node server; it is never exposed in browser code.
- Paper metadata, the PDF, and generated analysis are stored locally in the browser using IndexedDB so the workspace can survive refreshes.
- The server maintains the current in-memory session needed for PDF analysis, question answering, and graph exploration.
- Deleting a saved paper removes its local browser record. Restarting the server may require the app to restore the selected local paper into a new server session.

## Tech stack

- **Frontend:** Vanilla HTML, CSS, and JavaScript
- **3D graph:** Three.js / WebGL
- **Backend:** Node.js HTTP server
- **AI:** Gemini `gemini-3.5-flash`
- **Persistence:** IndexedDB in the browser

## Run locally

### Prerequisites

- Node.js 18 or later
- A Gemini API key

### Setup

1. Install dependencies.

   ```powershell
   npm.cmd install
   ```

2. Copy the environment template and add your Gemini credentials.

   ```powershell
   Copy-Item .env.example .env
   ```

   ```env
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-3.5-flash
   ```

3. Start the app.

   ```powershell
   npm.cmd start
   ```

4. Open [http://localhost:4173](http://localhost:4173).

## Useful scripts

```powershell
# Validate the browser and server JavaScript
npm.cmd run check

# Run automated tests
npm.cmd test
```

## API routes

| Route | Purpose |
| --- | --- |
| `POST /api/analyze` | Analyses an uploaded PDF and returns its cited analysis and graph. |
| `POST /api/session` | Restores a browser-saved paper into the current server session. |
| `POST /api/question` | Handles source-limited paper Q&A and debate prompts. |
| `GET /api/research/graph?paperId=...` | Returns the normalised graph for the active paper. |
| `POST /api/research/explore` | Creates a validated, paper-grounded traversal for a research question. |
| `GET /api/health` | Reports server configuration status without exposing the API key. |

## Project structure

```text
PaperPilot/
|- index.html                     # App shell and views
|- styles.css                     # Dark visual system, transitions, and responsive layout
|- app.js                         # UI state, persistence, analysis views, and PDF navigation
|- server.js                      # Local API, Gemini calls, and PDF session handling
|- services/research-graph-service.js
|- lib/graph-data.js              # Graph validation and traversal guards
|- universe/                      # Three.js Neural Research Universe
`- test/                          # Server and graph tests
```

## Important boundaries

Paper Pilot is a research reading aid, not a replacement for reading or evaluating a paper. Generated outputs can be incomplete or affected by model availability, so citations should always be checked in the source PDF. The novelty and research-gap views are deliberately constrained to the paper's own evidence and stated scope.

---

Built to make research papers easier to understand, question, and verify.
