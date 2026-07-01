# AI—Vantage  · Interview Pressure Simulator

Runs 100% locally using Mistral 7B via Ollama. No Anthropic API needed.

---

## Setup (do this once)

### 1. Install Node.js
Download from https://nodejs.org (LTS version)
Check it works: `node --version`

### 2. Install Ollama + Mistral

Download Ollama from https://ollama.com

Then in a terminal:
```
ollama pull mistral
```

### 3. Start Ollama with CORS enabled

**Mac / Linux:**
```
OLLAMA_ORIGINS="*" ollama serve
```

**Windows (important):**
- Open System Properties → Advanced → Environment Variables
- Add a new System variable: Name = `OLLAMA_ORIGINS`, Value = `*`
- Click OK, then restart your computer (or at least restart Ollama)
- Then run: `ollama serve`

Keep this terminal open while using AI-Vantage.

### 4. Install app dependencies
Open a terminal in the `aivantage` folder:
```
npm install
```

---

## Run the app

```
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Using the app

1. **Ollama Setup tab** — Test your connection first. You should see "✓ Connected · mistral ready"
2. **You & Company tab** — Upload your resume (.pdf or .txt). Click "Ask Mistral" to get company research.
3. **Interviewer tab** — Pick your persona, pressure (1-10), and mood
4. **🎓 Prep First** — Chat with the prep coach before the interview
5. **Enter Room** — Start the interview

### Resume tips
- Text-based PDFs work best (not scanned images)
- If your PDF doesn't extract well, use "Paste Text" instead
- Your name should be on the first line of your resume for the interviewer to use it

### If Ollama isn't connecting
- Make sure OLLAMA_ORIGINS is set (see step 3)
- Try running `OLLAMA_ORIGINS="*" ollama serve` in a new terminal
- Use the "Test Connection" button in the Ollama Setup tab to diagnose

---

## What was fixed in v2
- PDF properly extracted using PDF.js (not binary garbling)
- EVAL JSON no longer leaks into chat messages
- Interviewer uses your real name and real companies from resume
- Logic/Fluff metrics now update correctly
- One question per response (enforced in prompt)
- Company research uses Mistral directly (no Anthropic needed)
- Mistral-only — no API keys needed
