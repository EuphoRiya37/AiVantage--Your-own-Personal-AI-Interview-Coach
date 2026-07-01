# Contributing to AiVantage

Thank you for your interest in contributing! Here's how you can help.

## Setup for Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/EuphoRiya37/AiVantage--Your-own-Personal-AI-Interview-Coach.git
   cd AiVantage--Your-own-Personal-AI-Interview-Coach
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start Ollama with CORS:**
   ```bash
   # Mac / Linux
   OLLAMA_ORIGINS="*" ollama serve
   
   # Windows: Set OLLAMA_ORIGINS environment variable (see README)
   ```

4. **Run development server:**
   ```bash
   npm run dev
   ```

5. **Open browser:**
   Visit `http://localhost:5173`

## What to Work On

- Bug fixes (check existing issues)
- UI/UX improvements
- Better error handling
- Performance optimizations
- Documentation improvements

## Before Submitting

- Test locally with different resumes
- Ensure Ollama connection works
- Check browser console for errors
- Run `npm run build` to verify production build works

## Reporting Issues

- Describe the problem clearly
- Include steps to reproduce
- Mention your OS and Node version
- Include error messages from browser console

## Questions?

Open an issue or discussion in the repository. We're happy to help!

---

**License:** MIT (see LICENSE file)
