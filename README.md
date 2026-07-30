# PaperPilot

A single-user, source-grounded research-paper workspace powered by Gemini 3.5 Flash.

Upload a PDF to generate a cited overview, evidence check, interactive concept map, source-limited Q&A, and an evidence-based debate mode that defends only what the paper can support.

## Run locally

```powershell
npm.cmd start
```

Open `http://localhost:4173`.

## Configuration

Copy `.env.example` to `.env` and provide a Gemini API key. `.env` is ignored by Git and is read on the server only.

```env
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-3.5-flash
```

The local runtime retains the uploaded PDF only for the current server session. It does not create accounts or persist a paper library.
