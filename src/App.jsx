import { useState, useRef, useEffect } from "react";
import * as pdfjsLib from "pdfjs-dist";

// ─── PDF.JS WORKER ────────────────────────────────────────────────────────────
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PERSONAS = [
  {
    id: "judge",
    name: "The Silent Judge",
    icon: "⚖️",
    tag: "Every word weighs a ton",
    sys: "You speak in short, deliberate sentences. You never validate or praise. You let silence do the work — short terse replies create pressure. Visible disappointment at any vagueness.",
  },
  {
    id: "devil",
    name: "The Devil's Advocate",
    icon: "😈",
    tag: "Nothing is ever good enough",
    sys: "You immediately challenge every single claim with 'But...' or 'Are you certain about that?' You find the weakest link in every answer. You never fully accept anything the candidate says.",
  },
  {
    id: "trap",
    name: "The Trap Setter",
    icon: "🕸️",
    tag: "Warm smile. Iron memory.",
    sys: "You appear warm and friendly. But you track every single fact stated. Later in the conversation you circle back: 'Earlier you said X — but that contradicts what you just said about Y. Explain that.' Surgical precision on inconsistencies.",
  },
  {
    id: "bull",
    name: "The Bulldozer",
    icon: "⚡",
    tag: "Think fast or get out",
    sys: "Rapid-fire pace. Impatient. You cut off long answers with 'Right, next question.' You show frustration at hesitation. Create a sense that time is running out and the candidate is already failing.",
  },
  {
    id: "analyst",
    name: "The Analyst",
    icon: "🔬",
    tag: "Data or it didn't happen",
    sys: "You demand specifics, numbers, and evidence at all times. 'Quantify that.' 'What were the exact metrics?' 'That's a claim, not evidence.' Buzzwords are meaningless to you and you call them out directly.",
  },
];

const MOODS = [
  { id: "warm",      label: "Warm",     color: "#00c9a7", desc: "Human, encouraging" },
  { id: "neutral",   label: "Neutral",  color: "#6b8aff", desc: "Standard corporate" },
  { id: "skeptical", label: "Skeptical",color: "#ffd02c", desc: "Visibly unconvinced" },
  { id: "hostile",   label: "Hostile",  color: "#ff8c2c", desc: "Cold and cutting" },
  { id: "brutal",    label: "Brutal",   color: "#ff2c5a", desc: "Treating you as unqualified" },
];

const ROLES = [
  "Software Engineer", "Product Manager", "Data Scientist", "UX Designer",
  "Investment Analyst", "Management Consultant", "Marketing Manager",
  "ML Engineer", "Business Analyst", "Operations Manager",
];

const COMPANIES = [
  { id: "faang",      label: "Big Tech / FAANG" },
  { id: "startup",    label: "Early-Stage Startup" },
  { id: "consulting", label: "Consulting Firm" },
  { id: "finance",    label: "Investment Bank" },
  { id: "corp",       label: "Large Enterprise" },
];

// ─── UTILS ────────────────────────────────────────────────────────────────────
const pc  = p => p <= 2 ? "#00c9a7" : p <= 4 ? "#6bff8c" : p <= 6 ? "#ffd02c" : p <= 8 ? "#ff8c2c" : "#ff2c5a";
const pl  = p => p <= 2 ? "Gentle"  : p <= 4 ? "Moderate" : p <= 6 ? "Elevated" : p <= 8 ? "Intense" : "Maximum";
const fmt = s => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

const parseEval = (text) => {
  const evalLine = text.match(/EVAL:\s*(.+?)(?:\n|$)/i);
  if (evalLine) {
    const s = evalLine[1];
    const ls = s.match(/ls=(\d+)/i);
    const fl = s.match(/fl=(\d+)/i);
    const mv = s.match(/mv=(\w+)/i);
    const cf = s.match(/cf=(.+?)(?:\s+\w+=|$)/i);
    if (ls && fl && mv) {
      return {
        ls: Math.min(100, Math.max(0, +ls[1])),
        fl: Math.min(100, Math.max(0, +fl[1])),
        mv: mv[1].toLowerCase(),
        cf: cf ? cf[1].trim() : null,
      };
    }
  }
  const jsonMatch = text.match(/\{[^}]*"ls"\s*:\s*(\d+)[^}]*"fl"\s*:\s*(\d+)[^}]*"mv"\s*:\s*"(\w+)"[^}]*\}/i);
  if (jsonMatch && jsonMatch.length >= 4) {
    return { ls: +jsonMatch[1], fl: +jsonMatch[2], mv: jsonMatch[3].toLowerCase(), cf: null };
  }
  return null;
};

const stripEval = (text) => {
  return text
    .replace(/^EVAL:.*$/gim, "")
    .replace(/\nEVAL:.*$/gim, "")
    .replace(/\n?\{[^}]*(?:"mv"|"ls"|"fl")[^}]*\}/g, "")
    .replace(/\{"mv":"[^"]+"\}/g, "")
    .replace(/\{"ls":\d+[^}]*\}/g, "")
    .replace(/SCORE:\d+\/\d+\/\w+/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const extractCandidateName = (resumeText) => {
  if (!resumeText) return null;
  const lines = resumeText.split("\n").map(l => l.trim()).filter(l => l.length > 2 && l.length < 60);
  for (const line of lines.slice(0, 5)) {
    if (/[@\d\/\\:.]/.test(line) && !/^[A-Z][a-z]+ [A-Z]/.test(line)) continue;
    if (/^(name|resume|cv|curriculum)/i.test(line)) continue;
    const words = line.split(/\s+/);
    if (words.length >= 2 && words.length <= 4 && /^[A-Za-z\s\-']+$/.test(line)) {
      return line;
    }
  }
  return null;
};

// ─── PDF EXTRACTION ───────────────────────────────────────────────────────────
async function extractPDFText(file) {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      let lastY = null;
      let pageLines = [];
      let currentLine = [];
      for (const item of textContent.items) {
        if (item.str.trim() === "") continue;
        const y = item.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          if (currentLine.length) pageLines.push(currentLine.join(" "));
          currentLine = [];
        }
        currentLine.push(item.str);
        lastY = y;
      }
      if (currentLine.length) pageLines.push(currentLine.join(" "));
      fullText += pageLines.join("\n") + "\n\n";
    }
    return fullText.trim();
  } catch (err) {
    throw new Error("PDF extraction failed: " + err.message + ". Try converting to .txt first.");
  }
}

// ─── OLLAMA API ───────────────────────────────────────────────────────────────
async function callOllama(messages, systemPrompt, cfg) {
  const url = `${cfg.ollamaUrl.replace(/\/$/, "")}/api/chat`;
  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: cfg.ollamaModel || "mistral",
        stream: false,
        options: { temperature: 0.75, top_p: 0.9, num_predict: 600 },
        messages: [{ role: "system", content: systemPrompt }, ...messages],
      }),
    });
  } catch (e) {
    throw new Error(
      `Cannot reach Ollama at ${cfg.ollamaUrl}.\n\nFix: Open a terminal and run:\n  OLLAMA_ORIGINS="*" ollama serve\n\nWindows: set OLLAMA_ORIGINS=* as a System Environment Variable, then run: ollama serve`
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 404) throw new Error(`Model "${cfg.ollamaModel}" not found. Run: ollama pull ${cfg.ollamaModel}`);
    throw new Error(`Ollama returned ${res.status}: ${body}`);
  }
  const data = await res.json();
  if (data.error) throw new Error("Ollama error: " + data.error);
  return (data.message?.content || "").trim();
}

async function testOllamaConnection(cfg) {
  const url = `${cfg.ollamaUrl.replace(/\/$/, "")}/api/tags`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, msg: `Ollama responded with ${res.status}` };
    const data = await res.json();
    const models = (data.models || []).map(m => m.name);
    const hasModel = models.some(m => m.startsWith(cfg.ollamaModel.split(":")[0]));
    return {
      ok: true, models, hasModel,
      msg: hasModel
        ? `✓ Connected · ${cfg.ollamaModel} ready`
        : `Connected but "${cfg.ollamaModel}" not found. Run: ollama pull ${cfg.ollamaModel}`,
    };
  } catch (e) {
    return { ok: false, msg: `Cannot connect to Ollama. Run: OLLAMA_ORIGINS="*" ollama serve` };
  }
}

async function researchCompanyWithMistral(companyName, role, cfg) {
  const prompt = `I am preparing for a ${role} job interview at ${companyName}. Please give me a comprehensive briefing covering:

1. What ${companyName} does — their main products, services, and business model
2. Company culture, values, and work environment
3. What they specifically look for when hiring ${role}s
4. Their typical interview process and what to expect
5. Recent news, developments, or challenges at ${companyName} that I should know about
6. Key things I should prepare and research before the interview

Be specific and detailed. Write in clear paragraphs, not just bullet points.`;

  return await callOllama(
    [{ role: "user", content: prompt }],
    `You are an expert career coach with deep knowledge of major companies and industries. You give accurate, specific, and genuinely useful interview preparation advice. You do not make things up — if you are uncertain about something specific, you say so clearly.`,
    cfg
  );
}

// ─── PROMPTS ──────────────────────────────────────────────────────────────────
function buildInterviewPrompt(settings, resume, companyInfo) {
  const persona      = PERSONAS.find(p => p.id === settings.persona) || PERSONAS[1];
  const companyLabel = COMPANIES.find(c => c.id === settings.company)?.label || settings.company;
  const target       = settings.targetCompany || companyLabel;
  const p            = settings.pressure;
  const candName     = extractCandidateName(resume);

  const pressureDesc =
    p <= 3 ? "Be gentle and professional. Light follow-ups only. Give the candidate space to think." :
    p <= 5 ? "Apply moderate pressure. Follow up clearly on vague answers. Show mild skepticism when warranted." :
    p <= 7 ? "Apply real pressure. Directly challenge weak answers. Show visible skepticism. Cut off rambling. You are hard to impress." :
             "Apply maximum pressure. Be relentless. Challenge everything. Show clear disappointment. Create authentic stress.";

  const moodDesc = {
    warm:     "Your tone is warm and human — you want them to succeed, but you still challenge hard.",
    neutral:  "Your tone is completely neutral and professional. No warmth, no hostility. A blank wall.",
    skeptical:"Your tone is visibly skeptical. You have not been impressed yet and the candidate can feel it.",
    hostile:  "Your tone is cold and cutting. Short sentences. Zero warmth. Visible impatience with weak answers.",
    brutal:   "Your tone makes clear you consider this candidate probably unqualified. Disappointed throughout.",
  }[settings.mood] || "Professional.";

  const resumeSection = resume
    ? `\n\nCANDIDATE RESUME — READ THIS CAREFULLY:\n${resume.slice(0, 4000)}\n\n` +
      (candName ? `The candidate's name is: ${candName}\n` : "") +
      `IMPORTANT: You have read this resume before the interview. Use the ACTUAL company names, job titles, dates, and technologies listed. Never say "[Candidate's Name]" or "[Company]" — use their real name and real employers from the resume. If something on the resume seems vague or exaggerated, probe it.`
    : "\n\nNo resume provided. Ask about their background early in the interview.";

  const companySection = companyInfo
    ? `\n\nCOMPANY CONTEXT (you work here):\n${companyInfo.slice(0, 2000)}\n\nReference this naturally: "here at ${target}..." or "what we care about is..." Make it feel like a real interview at ${target} specifically.`
    : "";

  return `You are ${persona.name}, a senior interviewer conducting a real job interview for a ${settings.role} position at ${target}.

PERSONA: ${persona.sys}

PRESSURE (${p}/10): ${pressureDesc}

TONE: ${moodDesc}
${resumeSection}${companySection}

STRICT RULES — FOLLOW EVERY ONE:
1. Ask ONLY ONE question per response. Never two questions. Never a list of questions. One. Choose the most important one.
2. Never use bullet points, numbered lists, headers, or markdown formatting of any kind.
3. Use natural contractions: don't, that's, I'm, you've, we're, it's, wasn't, wouldn't.
4. Start your response with a brief human reaction: "Right." / "Mm." / "Okay." / "I see." / "Go on." / "And?"
5. NEVER say "Great answer", "That's interesting", "Excellent", "That's a good point" — these are AI tells.
6. Reference the candidate by their real name. Reference their actual employers by name.
7. Keep responses under 120 words total. Be concise and precise.
8. If they give a vague buzzword answer, say exactly: "That's vague. Be specific."
9. Sometimes use just two words to add pressure: "Go on." or "And then?" or "Meaning?"
10. You are a real human. Never hint you are an AI. Never break character.

EVAL FORMAT — After every single response, on its own line, write exactly this:
EVAL: ls=NUMBER fl=NUMBER mv=WORD
Where: ls=logic/substance score of their last answer 0-100 (use 50 for your opener), fl=fluff/buzzword score 0-100 (use 0 for opener), mv=one of: accept challenge probe confront
If you caught a contradiction add: cf=brief description of contradiction

Example: EVAL: ls=68 fl=22 mv=challenge
Example: EVAL: ls=41 fl=55 mv=confront cf=said led project solo but earlier mentioned a co-lead

Now begin. Give a short cold opener in character and ask your first question.`;
}

function buildPrepPrompt(settings, resume, companyInfo) {
  const companyLabel = COMPANIES.find(c => c.id === settings.company)?.label || settings.company;
  const target       = settings.targetCompany || companyLabel;
  const candName     = extractCandidateName(resume);

  return `You are a sharp, experienced interview prep coach helping ${candName || "a candidate"} prepare for a ${settings.role} interview at ${target}.

Your style: direct, real, specific. No generic advice. No corporate speak. Give them actual useful intel.

${resume ? `THEIR RESUME:\n${resume.slice(0, 3000)}\n\nYou know their background well. Reference their actual companies, skills, and experiences when relevant.` : "No resume provided. Ask about their background if you need to."}

${companyInfo ? `COMPANY INTEL:\n${companyInfo.slice(0, 2000)}\n\nUse this to give specific advice about ${target}.` : `You know the general landscape for ${companyLabel} companies.`}

When they ask you to practice a question: play the interviewer, ask it directly as a real interviewer would, then after their answer give honest coaching feedback on what worked and what didn't.

Talk like a coach — conversational, direct. No headers or bullet lists unless they ask for a list format.`;
}

// ─── COMPONENTS (all outside App to prevent remount on every render) ──────────

function Gauge({ value, color, label, size = 80 }) {
  const r = size * 0.37, c = 2 * Math.PI * r, f = ((value || 0) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size*0.09}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={size*0.09}
        strokeDasharray={`${f} ${c-f}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dasharray 0.6s ease" }}/>
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={size*0.22} fontWeight="700" fontFamily="JetBrains Mono,monospace">
        {value ?? "-"}
      </text>
      <text x={size/2} y={size*0.84} textAnchor="middle"
        fill="rgba(255,255,255,0.35)" fontSize={size*0.115} fontFamily="DM Sans,sans-serif">
        {label}
      </text>
    </svg>
  );
}

function Bar({ val, color, label }) {
  return (
    <div style={{ marginBottom: 13 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>{label}</span>
        <span style={{ fontFamily: "JetBrains Mono,monospace", fontSize: 12, fontWeight: 600, color }}>{val}</span>
      </div>
      <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2 }}>
        <div style={{ height: "100%", borderRadius: 2, background: color, width: `${val}%`, transition: "width 0.6s ease" }}/>
      </div>
    </div>
  );
}

function Logo() {
  return (
    <>
      <span className="syne" style={{ fontSize: 17, fontWeight: 800, color: "#ff6b2c" }}>AI</span>
      <span className="syne" style={{ fontSize: 17, fontWeight: 700 }}>—Vantage</span>
    </>
  );
}

function TimerDisplay({ timer, color }) {
  return (
    <span className="mono" style={{ fontSize: 13, color, fontWeight: 600 }}>
      {fmt(timer)}
    </span>
  );
}

function ErrorBar({ error }) {
  if (!error) return null;
  return (
    <div style={{ margin: "0 0 12px", padding: "10px 14px", borderRadius: 8, background: "rgba(255,44,90,0.1)", border: "1px solid rgba(255,44,90,0.25)", fontSize: 12, color: "#ff8aaa", whiteSpace: "pre-wrap" }}>
      {error}
    </div>
  );
}

function ChatBubble({ m, icon, mc, prep }) {
  return (
    <div className="msg" style={{ marginBottom: 18, display: "flex", flexDirection: m.role === "assistant" ? "row" : "row-reverse", gap: 10, alignItems: "flex-start" }}>
      {m.role === "assistant" && (
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${prep ? "#6b8aff" : mc}18`, border: `1px solid ${prep ? "#6b8aff" : mc}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0, marginTop: 2 }}>
          {prep ? "🎓" : icon}
        </div>
      )}
      <div style={{ maxWidth: "84%" }}>
        <div style={{
          background: m.role === "assistant" ? "rgba(255,255,255,0.04)" : "rgba(255,107,44,0.08)",
          border: m.role === "assistant" ? "1px solid rgba(255,255,255,0.07)" : "1px solid rgba(255,107,44,0.22)",
          borderRadius: m.role === "assistant" ? "4px 12px 12px 12px" : "12px 4px 12px 12px",
          padding: "12px 15px", fontSize: 14, lineHeight: 1.78,
          color: m.role === "assistant" ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.93)",
          whiteSpace: "pre-wrap",
        }}>
          {m.content}
        </div>
        {!prep && m.role === "assistant" && m.ev?.cf && m.ev.cf !== "null" && m.ev.cf !== "none" && m.ev.cf !== null && (
          <div className="cflag" style={{ marginTop: 6, padding: "7px 11px", borderRadius: 6, background: "rgba(255,44,90,0.08)", borderLeft: "2px solid #ff2c5a", fontSize: 11, color: "#ff8aaa", lineHeight: 1.4 }}>
            ⚠ Contradiction: {m.ev.cf}
          </div>
        )}
      </div>
    </div>
  );
}

function Typing({ mc }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", background: `${mc}18`, border: `1px solid ${mc}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>···</div>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: "4px 12px 12px 12px", padding: "13px 18px" }}>
        <span className="dot" /><span className="dot" /><span className="dot" />
      </div>
    </div>
  );
}

function InputRow({ onSend, ph, input, setInput, loading, error }) {
  return (
    <div style={{ padding: "13px 22px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }}>
      <ErrorBar error={error} />
      <div style={{ display: "flex", gap: 10 }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          placeholder={ph || "Type here… (Enter to send)"}
          rows={3}
          style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "white", fontSize: 13, padding: "11px 13px", resize: "none", lineHeight: 1.6 }}
        />
        <button
          onClick={onSend}
          disabled={loading || !input.trim()}
          style={{ background: loading || !input.trim() ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#ff6b2c,#ff4000)", border: "none", borderRadius: 10, padding: "0 18px", minWidth: 58, color: loading || !input.trim() ? "rgba(255,255,255,0.2)" : "white", cursor: loading || !input.trim() ? "not-allowed" : "pointer", fontSize: 13, fontWeight: 600, fontFamily: "Syne,sans-serif" }}>
          Send
        </button>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.2)", marginTop: 5, textAlign: "center" }}>Shift+Enter for newline</div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => {
    if (document.getElementById("aiv-css")) return;
    const el = document.createElement("style");
    el.id = "aiv-css";
    el.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;600&display=swap');
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      html, body, #root { height: 100%; }
      body { background: #07070f; color: #e8e8f0; font-family: 'DM Sans', sans-serif; }
      .syne { font-family: 'Syne', sans-serif; }
      .mono { font-family: 'JetBrains Mono', monospace; }
      .hov  { transition: all 0.15s ease; cursor: pointer; }
      .hov:hover { transform: translateY(-1px); }
      select option { background: #0d0d1a; }
      input[type=range] { -webkit-appearance: none; appearance: none; outline: none; border: none; }
      input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: white; cursor: pointer; }
      textarea, input[type=text] { font-family: 'DM Sans', sans-serif; }
      textarea:focus, input[type=text]:focus { outline: none; border-color: rgba(255,107,44,0.45) !important; }
      .msg { animation: mi .22s ease; }
      @keyframes mi { from { opacity:0; transform:translateY(7px); } to { opacity:1; transform:translateY(0); } }
      .dot { display:inline-block; width:6px; height:6px; border-radius:50%; background:rgba(255,255,255,0.3); animation:bn 1.2s ease infinite; margin-right:4px; }
      .dot:nth-child(2) { animation-delay:.15s; } .dot:nth-child(3) { animation-delay:.3s; }
      @keyframes bn { 0%,60%,100%{transform:translateY(0);}30%{transform:translateY(-5px);} }
      ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      @keyframes gi { from{transform:scale(0.5) rotate(-8deg);opacity:0;} to{transform:scale(1) rotate(0);opacity:1;} }
      .grade { animation: gi .5s cubic-bezier(0.34,1.56,0.64,1); }
      @keyframes cfi { from{opacity:0;transform:translateX(-8px);} to{opacity:1;transform:translateX(0);} }
      .cflag { animation: cfi .25s ease; }
      .stab { cursor:pointer; padding:7px 15px; border-radius:8px; font-size:13px; font-weight:500; transition:all 0.15s; }
      .dzone { border:1.5px dashed rgba(255,255,255,0.12); border-radius:12px; padding:22px; text-align:center; cursor:pointer; transition:all 0.2s; }
      .dzone:hover, .dzone.drag { border-color:rgba(255,107,44,0.4); background:rgba(255,107,44,0.05); }
    `;
    document.head.appendChild(el);
  }, []);

  const [phase, setPhase]       = useState("setup");
  const [settings, setSettings] = useState({
    persona: "devil", pressure: 6, mood: "skeptical",
    role: "Software Engineer", company: "faang", targetCompany: "",
  });
  const [ollamaCfg, setOllamaCfg] = useState({
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "mistral",
  });
  const [connStatus, setConnStatus] = useState(null);

  const [resume, setResume]           = useState(() => localStorage.getItem("aiv-resume") || "");
  const [resumeName, setResumeName]   = useState(() => localStorage.getItem("aiv-resumeName") || "");
  const [companyInfo, setCompanyInfo] = useState(() => localStorage.getItem("aiv-company") || "");
  const [pdfLoading, setPdfLoading]   = useState(false);
  const [researching, setResearching] = useState(false);

  const [messages, setMessages] = useState([]);
  const [prepMsgs, setPrepMsgs] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [scores, setScores]     = useState([]);
  const [timer, setTimer]       = useState(0);
  const [error, setError]       = useState("");

  const [setupTab, setSetupTab]   = useState("persona");
  const [resumeTab, setResumeTab] = useState("upload");

  const chatRef  = useRef(null);
  const prepRef  = useRef(null);
  const fileRef  = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (resume) {
      localStorage.setItem("aiv-resume", resume);
      localStorage.setItem("aiv-resumeName", resumeName);
    }
  }, [resume, resumeName]);

  useEffect(() => {
    if (companyInfo) localStorage.setItem("aiv-company", companyInfo);
  }, [companyInfo]);

  useEffect(() => {
    if (phase === "interview") {
      timerRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (prepRef.current) prepRef.current.scrollTop = prepRef.current.scrollHeight;
  }, [prepMsgs, loading]);

  const persona    = PERSONAS.find(p => p.id === settings?.persona) || PERSONAS[1];
  const moodColor  = MOODS.find(m => m.id === settings?.mood)?.color || "#6b8aff";
  const setSetting = (k, v) => setSettings(s => ({ ...s, [k]: v }));
  const setCfg     = (k, v) => setOllamaCfg(c => ({ ...c, [k]: v }));

  const showError = (msg, dur = 7000) => {
    setError(msg);
    setTimeout(() => setError(""), dur);
  };

  const handleFile = async (file) => {
    if (!file) return;
    setPdfLoading(true);
    try {
      let text;
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        text = await extractPDFText(file);
      } else {
        text = await file.text();
      }
      if (!text.trim()) throw new Error("No text found in file.");
      setResume(text);
      setResumeName(file.name);
    } catch (e) {
      showError("Resume error: " + e.message);
    }
    setPdfLoading(false);
  };

  const doResearch = async () => {
    if (!settings.targetCompany.trim()) { showError("Enter a company name first."); return; }
    setResearching(true);
    setCompanyInfo("Asking Mistral about " + settings.targetCompany + "...");
    try {
      const info = await researchCompanyWithMistral(settings.targetCompany, settings.role, ollamaCfg);
      setCompanyInfo(info);
    } catch (e) {
      setCompanyInfo("");
      showError("Research failed: " + e.message);
    }
    setResearching(false);
  };

  const testConnection = async () => {
    setConnStatus({ ok: null, msg: "Testing..." });
    const result = await testOllamaConnection(ollamaCfg);
    setConnStatus(result);
  };

  const startPrep = async () => {
    setPhase("prep");
    if (prepMsgs.length > 0) return;
    setLoading(true);
    try {
      const target = settings.targetCompany || COMPANIES.find(c => c.id === settings.company)?.label || "the company";
      const text = await callOllama(
        [{ role: "user", content: `I'm preparing for a ${settings.role} interview at ${target}. Let's start.` }],
        buildPrepPrompt(settings, resume, companyInfo),
        ollamaCfg
      );
      setPrepMsgs([{ role: "assistant", content: text }]);
    } catch (e) {
      setPrepMsgs([{ role: "assistant", content: "⚠ " + e.message }]);
    }
    setLoading(false);
  };

  const sendPrep = async () => {
    if (!input.trim() || loading) return;
    const txt = input.trim();
    setInput("");
    const next = [...prepMsgs, { role: "user", content: txt }];
    setPrepMsgs(next);
    setLoading(true);
    try {
      const text = await callOllama(
        next.map(m => ({ role: m.role, content: m.content })),
        buildPrepPrompt(settings, resume, companyInfo),
        ollamaCfg
      );
      setPrepMsgs(p => [...p, { role: "assistant", content: text }]);
    } catch (e) {
      setPrepMsgs(p => [...p, { role: "assistant", content: "⚠ " + e.message }]);
    }
    setLoading(false);
  };

  const startInterview = async () => {
    setMessages([]); setScores([]); setTimer(0); setLoading(true); setPhase("interview");
    try {
      const raw = await callOllama(
        [{ role: "user", content: "Begin the interview." }],
        buildInterviewPrompt(settings, resume, companyInfo),
        ollamaCfg
      );
      const ev = parseEval(raw);
      setMessages([{ role: "assistant", content: stripEval(raw), ev }]);
    } catch (e) {
      setMessages([{ role: "assistant", content: "⚠ " + e.message, ev: null }]);
    }
    setLoading(false);
  };

  const sendInterview = async () => {
    if (!input.trim() || loading) return;
    const txt = input.trim();
    setInput("");
    const next = [...messages, { role: "user", content: txt }];
    setMessages(next);
    setLoading(true);
    try {
      const raw = await callOllama(
        next.map(m => ({ role: m.role, content: m.content })),
        buildInterviewPrompt(settings, resume, companyInfo),
        ollamaCfg
      );
      const ev = parseEval(raw);
      if (ev) setScores(p => [...p, ev]);
      setMessages(p => [...p, { role: "assistant", content: stripEval(raw), ev }]);
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", content: "⚠ " + e.message, ev: null }]);
    }
    setLoading(false);
  };

  const validSc = scores.filter(s => s?.ls != null);
  const avgL    = validSc.length ? Math.round(validSc.reduce((a, s) => a + s.ls, 0) / validSc.length) : 0;
  const avgF    = validSc.length ? Math.round(validSc.reduce((a, s) => a + s.fl, 0) / validSc.length) : 0;
  const flags   = scores.filter(s => s?.cf && s.cf !== "null" && s.cf !== null && s.cf !== "none").length;
  const lastSc  = validSc[validSc.length - 1] || null;

  const grade = () => {
    const n = avgL - avgF * 0.3 - flags * 10;
    if (n >= 82) return { g: "A+", l: "Outstanding",  c: "#00c9a7" };
    if (n >= 72) return { g: "A",  l: "Excellent",    c: "#00c9a7" };
    if (n >= 62) return { g: "B+", l: "Good",         c: "#6bff8c" };
    if (n >= 52) return { g: "B",  l: "Decent",       c: "#ffd02c" };
    if (n >= 40) return { g: "C",  l: "Needs Work",   c: "#ff8c2c" };
    if (n >= 28) return { g: "D",  l: "Weak",         c: "#ff5c2c" };
    return               { g: "F",  l: "Unprepared",   c: "#ff2c5a" };
  };

  const S = {
    card: { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, padding: 20 },
    lbl:  { fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 13, display: "block" },
    hdr:  { borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "14px 24px", display: "flex", alignItems: "center", gap: 10 },
    inp:  { width: "100%", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "white", padding: "10px 12px", fontSize: 13, fontFamily: "DM Sans,sans-serif" },
    txta: { resize: "vertical", lineHeight: 1.6, padding: "12px" },
  };

  // ══════════════════════════════════════════════════════════════
  // SETUP
  // ══════════════════════════════════════════════════════════════
  if (phase === "setup") {
    const pcolor = pc(settings.pressure);
    const tabs = [
      { id: "persona", label: "Interviewer" },
      { id: "context", label: "You & Company" },
      { id: "ai",      label: "Ollama Setup" },
    ];

    return (
      <div style={{ minHeight: "100vh", background: "#07070f" }}>
        <div style={S.hdr}>
          <Logo />
          <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em" }}>INTERVIEW PRESSURE SIMULATOR · MISTRAL 7B</span>
        </div>
        <div style={{ maxWidth: 1060, margin: "0 auto", padding: "28px 22px 80px" }}>
          <div style={{ textAlign: "center", marginBottom: 34 }}>
            <h1 className="syne" style={{ fontSize: "clamp(24px,4vw,50px)", fontWeight: 800, lineHeight: 1.1, marginBottom: 8 }}>
              Configure Your <span style={{ color: "#ff6b2c" }}>Session</span>
            </h1>
            <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14 }}>
              {resume ? `✓ Resume loaded: ${resumeName}` : "Upload your resume in 'You & Company' for best results."}
              {resume && companyInfo ? " · ✓ Company intel ready" : ""}
            </p>
            {error && (
              <div style={{ marginTop: 12, display: "inline-block", padding: "8px 16px", borderRadius: 8, background: "rgba(255,44,90,0.1)", border: "1px solid rgba(255,44,90,0.25)", fontSize: 12, color: "#ff8aaa" }}>
                {error}
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 26, background: "rgba(255,255,255,0.03)", padding: 5, borderRadius: 10, width: "fit-content", margin: "0 auto 26px" }}>
            {tabs.map(t => (
              <div key={t.id} className="stab hov" onClick={() => setSetupTab(t.id)}
                style={{ background: setupTab === t.id ? "rgba(255,107,44,0.18)" : "transparent", color: setupTab === t.id ? "#ff6b2c" : "rgba(255,255,255,0.45)", border: `1px solid ${setupTab === t.id ? "rgba(255,107,44,0.35)" : "transparent"}` }}>
                {t.label}
              </div>
            ))}
          </div>

          {setupTab === "persona" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={S.card}>
                  <span style={S.lbl}>INTERVIEWER PERSONA</span>
                  {PERSONAS.map(p => (
                    <div key={p.id} className="hov" onClick={() => setSetting("persona", p.id)}
                      style={{ padding: "11px 13px", borderRadius: 9, marginBottom: 7, display: "flex", alignItems: "center", gap: 11, border: `1px solid ${settings.persona === p.id ? "rgba(255,107,44,0.5)" : "rgba(255,255,255,0.07)"}`, background: settings.persona === p.id ? "rgba(255,107,44,0.09)" : "rgba(255,255,255,0.01)" }}>
                      <span style={{ fontSize: 19 }}>{p.icon}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
                        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.32)", marginTop: 2 }}>{p.tag}</div>
                      </div>
                      {settings.persona === p.id && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#ff6b2c", boxShadow: "0 0 6px #ff6b2c" }} />}
                    </div>
                  ))}
                </div>
                <div style={S.card}>
                  <span style={S.lbl}>TARGET ROLE</span>
                  <select value={settings.role} onChange={e => setSetting("role", e.target.value)} style={{ ...S.inp }}>
                    {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <span style={{ ...S.lbl, marginTop: 16 }}>COMPANY TYPE</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {COMPANIES.map(c => (
                      <div key={c.id} className="hov" onClick={() => setSetting("company", c.id)}
                        style={{ padding: "6px 13px", borderRadius: 6, fontSize: 12, fontWeight: 500, border: `1px solid ${settings.company === c.id ? "rgba(255,107,44,0.5)" : "rgba(255,255,255,0.1)"}`, background: settings.company === c.id ? "rgba(255,107,44,0.1)" : "transparent", color: settings.company === c.id ? "#ff6b2c" : "rgba(255,255,255,0.45)" }}>
                        {c.label}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                <div style={S.card}>
                  <span style={S.lbl}>PRESSURE LEVEL</span>
                  <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <span className="syne mono" style={{ fontSize: 46, fontWeight: 800, color: pcolor, lineHeight: 1 }}>{settings.pressure}</span>
                      <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)", marginLeft: 5 }}>/10</span>
                      <div style={{ fontSize: 12, color: pcolor, marginTop: 3, fontWeight: 600 }}>{pl(settings.pressure)}</div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
                      {settings.pressure <= 3 ? "Beginner-friendly" : settings.pressure <= 6 ? "Standard" : settings.pressure <= 8 ? "FAANG-level" : "Psychological warfare"}
                    </div>
                  </div>
                  <input type="range" min={1} max={10} value={settings.pressure} onChange={e => setSetting("pressure", +e.target.value)}
                    style={{ width: "100%", height: 6, borderRadius: 3, cursor: "pointer", background: `linear-gradient(to right,${pcolor} ${settings.pressure * 10}%,rgba(255,255,255,0.09) ${settings.pressure * 10}%)` }} />
                  <style>{`input[type=range]::-webkit-slider-thumb{box-shadow:0 0 10px ${pcolor}80}`}</style>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 9 }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(n => (
                      <div key={n} className="hov" onClick={() => setSetting("pressure", n)}
                        style={{ width: 7, height: 7, borderRadius: "50%", background: n <= settings.pressure ? pcolor : "rgba(255,255,255,0.09)", transition: "background 0.2s" }} />
                    ))}
                  </div>
                </div>

                <div style={S.card}>
                  <span style={S.lbl}>INTERVIEWER MOOD</span>
                  {MOODS.map(m => (
                    <div key={m.id} className="hov" onClick={() => setSetting("mood", m.id)}
                      style={{ padding: "10px 13px", borderRadius: 8, marginBottom: 7, display: "flex", alignItems: "center", gap: 11, border: `1px solid ${settings.mood === m.id ? m.color + "55" : "rgba(255,255,255,0.07)"}`, background: settings.mood === m.id ? m.color + "10" : "rgba(255,255,255,0.01)" }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: m.color, flexShrink: 0, boxShadow: settings.mood === m.id ? `0 0 10px ${m.color}` : "none", transition: "box-shadow 0.2s" }} />
                      <span style={{ fontWeight: 600, fontSize: 13 }}>{m.label}</span>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{m.desc}</span>
                    </div>
                  ))}
                </div>

                <div style={{ ...S.card, background: "rgba(255,107,44,0.04)", border: "1px solid rgba(255,107,44,0.18)", textAlign: "center" }}>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.42)", marginBottom: 4 }}>
                    {persona.icon} {persona.name} · P{settings.pressure} · {MOODS.find(m => m.id === settings.mood)?.label}
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 16, fontSize: 13, color: "rgba(255,255,255,0.7)" }}>
                    {settings.role}{settings.targetCompany ? ` @ ${settings.targetCompany}` : ""} · 🧠 {ollamaCfg.ollamaModel}
                  </div>
                  <div style={{ display: "flex", gap: 9 }}>
                    <button onClick={startPrep}
                      style={{ flex: 1, background: "rgba(107,138,255,0.12)", border: "1px solid rgba(107,138,255,0.25)", borderRadius: 9, padding: "12px", color: "#8aaeff", fontFamily: "Syne,sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                      🎓 Prep First
                    </button>
                    <button onClick={startInterview}
                      style={{ flex: 1, background: "linear-gradient(135deg,#ff6b2c,#ff4000)", border: "none", borderRadius: 9, padding: "12px", color: "white", fontFamily: "Syne,sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 18px rgba(255,107,44,0.3)" }}>
                      Enter Room →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {setupTab === "context" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={S.card}>
                <span style={S.lbl}>YOUR RESUME</span>
                <div style={{ display: "flex", gap: 7, marginBottom: 14 }}>
                  {["upload", "paste"].map(t => (
                    <div key={t} className="stab hov" onClick={() => setResumeTab(t)}
                      style={{ background: resumeTab === t ? "rgba(255,255,255,0.09)" : "transparent", color: resumeTab === t ? "white" : "rgba(255,255,255,0.4)", border: `1px solid ${resumeTab === t ? "rgba(255,255,255,0.18)" : "transparent"}` }}>
                      {t === "upload" ? "Upload File" : "Paste Text"}
                    </div>
                  ))}
                </div>
                {resumeTab === "upload" ? (
                  <>
                    <div className={`dzone${pdfLoading ? " drag" : ""}`}
                      onClick={() => !pdfLoading && fileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("drag"); }}
                      onDragLeave={e => e.currentTarget.classList.remove("drag")}
                      onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("drag"); handleFile(e.dataTransfer.files[0]); }}>
                      <div style={{ fontSize: 26, marginBottom: 7 }}>{pdfLoading ? "⏳" : "📄"}</div>
                      <div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>
                        {pdfLoading ? "Reading PDF…" : "Drop resume here or click to browse"}
                      </div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginTop: 4 }}>
                        .txt or .pdf — text is properly extracted with PDF.js
                      </div>
                    </div>
                    <input ref={fileRef} type="file" accept=".txt,.pdf" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
                    {resume && (
                      <div style={{ marginTop: 11, padding: "8px 12px", borderRadius: 7, background: "rgba(0,201,167,0.08)", border: "1px solid rgba(0,201,167,0.22)", fontSize: 12, color: "#00c9a7", display: "flex", alignItems: "center", gap: 8 }}>
                        ✓ {resumeName}
                        {extractCandidateName(resume) && <span style={{ color: "rgba(255,255,255,0.35)" }}>· Name: {extractCandidateName(resume)}</span>}
                        <button onClick={() => { setResume(""); setResumeName(""); localStorage.removeItem("aiv-resume"); localStorage.removeItem("aiv-resumeName"); }}
                          style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,0.3)", cursor: "pointer", fontSize: 14 }}>✕</button>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <textarea value={resume} onChange={e => setResume(e.target.value)}
                      placeholder="Paste your full resume text here. Include your name, companies, roles, dates, technologies."
                      style={{ ...S.inp, ...S.txta, minHeight: 240 }} />
                    {resume && (
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>
                        {resume.length} chars · Name detected: {extractCandidateName(resume) || "not found (put your name on the first line)"}
                      </div>
                    )}
                  </>
                )}
              </div>

              <div style={S.card}>
                <span style={S.lbl}>TARGET COMPANY</span>
                <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                  <input type="text" value={settings.targetCompany} onChange={e => setSetting("targetCompany", e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") doResearch(); }}
                    placeholder="Company name (e.g. Google, Zepto, McKinsey)"
                    style={{ ...S.inp, flex: 1 }} />
                  <button onClick={doResearch} disabled={researching || !settings.targetCompany.trim()}
                    style={{ background: researching ? "rgba(255,255,255,0.05)" : "rgba(107,138,255,0.15)", border: `1px solid ${researching ? "rgba(255,255,255,0.08)" : "rgba(107,138,255,0.35)"}`, borderRadius: 8, padding: "0 14px", color: researching ? "rgba(255,255,255,0.2)" : "#8aaeff", cursor: researching ? "not-allowed" : "pointer", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", fontFamily: "DM Sans,sans-serif", height: 42 }}>
                    {researching ? "Asking Mistral…" : "🧠 Ask Mistral"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", marginBottom: 12 }}>
                  Mistral generates company info from its training knowledge. Or paste manually.
                </div>
                <textarea value={companyInfo} onChange={e => setCompanyInfo(e.target.value)}
                  placeholder={"Company info will appear here after clicking 'Ask Mistral'.\n\nOr paste manually: what they do, culture, interview process, what they look for."}
                  style={{ ...S.inp, ...S.txta, minHeight: 280 }} />
                {companyInfo && !companyInfo.startsWith("Asking") && (
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 6 }}>{companyInfo.length} chars</div>
                )}
              </div>
            </div>
          )}

          {setupTab === "ai" && (
            <div style={{ maxWidth: 540, margin: "0 auto" }}>
              <div style={S.card}>
                <span style={S.lbl}>OLLAMA / MISTRAL 7B</span>
                <div style={{ padding: 16, borderRadius: 10, background: "rgba(255,190,44,0.07)", border: "1px solid rgba(255,190,44,0.2)", marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#ffd02c", marginBottom: 10 }}>One-time setup</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", lineHeight: 2 }}>
                    1. Install Ollama from <span style={{ color: "#6b8aff" }}>ollama.com</span><br />
                    2. <code style={{ background: "rgba(255,255,255,0.08)", padding: "1px 7px", borderRadius: 4, fontFamily: "JetBrains Mono,monospace", fontSize: 11 }}>ollama pull mistral</code><br />
                    3. Start with CORS enabled:<br />
                    &nbsp;&nbsp;<code style={{ background: "rgba(255,255,255,0.08)", padding: "2px 7px", borderRadius: 4, fontFamily: "JetBrains Mono,monospace", fontSize: 11 }}>OLLAMA_ORIGINS="*" ollama serve</code><br />
                    <span style={{ fontSize: 11, color: "#ffd02c" }}>Windows: set OLLAMA_ORIGINS=* as a System Environment Variable, then restart Ollama</span>
                  </div>
                </div>
                <span style={S.lbl}>OLLAMA URL</span>
                <input type="text" value={ollamaCfg.ollamaUrl} onChange={e => setCfg("ollamaUrl", e.target.value)}
                  style={{ ...S.inp, marginBottom: 14, fontFamily: "JetBrains Mono,monospace" }} />
                <span style={S.lbl}>MODEL</span>
                <input type="text" value={ollamaCfg.ollamaModel} onChange={e => setCfg("ollamaModel", e.target.value)}
                  style={{ ...S.inp, fontFamily: "JetBrains Mono,monospace" }} />
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 7 }}>
                  Recommended: mistral &nbsp;|&nbsp; Also works: mistral:instruct, llama3.2, phi4
                </div>
                <button onClick={testConnection}
                  style={{ marginTop: 18, width: "100%", background: "rgba(107,138,255,0.12)", border: "1px solid rgba(107,138,255,0.25)", borderRadius: 9, padding: "12px", color: "#8aaeff", fontFamily: "Syne,sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  Test Connection
                </button>
                {connStatus && (
                  <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: connStatus.ok ? "rgba(0,201,167,0.08)" : "rgba(255,44,90,0.08)", border: `1px solid ${connStatus.ok ? "rgba(0,201,167,0.25)" : "rgba(255,44,90,0.25)"}`, fontSize: 12, color: connStatus.ok ? "#00c9a7" : "#ff8aaa", lineHeight: 1.6 }}>
                    {connStatus.msg}
                    {connStatus.models?.length > 0 && <div style={{ marginTop: 6, color: "rgba(255,255,255,0.35)" }}>Available: {connStatus.models.join(", ")}</div>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // PREP CHAT
  // ══════════════════════════════════════════════════════════════
  if (phase === "prep") {
    const topics = [
      "What questions are likely coming?",
      "What's the company culture like?",
      "Where are the weak spots in my background?",
      "Practice a behavioral question with me",
      "How should I answer 'Tell me about yourself'?",
      "What should I know about their interview process?",
      "How do I discuss salary expectations?",
      "What's the hardest part of this interview?",
    ];
    return (
      <div style={{ background: "#07070f", display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ ...S.hdr, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Logo /></div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.38)" }}>🎓 Prep · {settings.role}{settings.targetCompany ? ` @ ${settings.targetCompany}` : ""} · 🧠 {ollamaCfg.ollamaModel}</span>
            <button onClick={() => setPhase("setup")} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.4)", padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "DM Sans,sans-serif" }}>← Setup</button>
            <button onClick={startInterview} style={{ background: "linear-gradient(135deg,#ff6b2c,#ff4000)", border: "none", borderRadius: 7, padding: "7px 16px", color: "white", fontFamily: "Syne,sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Enter Room →</button>
          </div>
        </div>
        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 252px", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ padding: "12px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: "rgba(107,138,255,0.14)", border: "1px solid rgba(107,138,255,0.28)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>🎓</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>Interview Prep Coach</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>
                  🧠 {ollamaCfg.ollamaModel}{resume ? ` · Resume: ${resumeName}` : ""}{companyInfo ? " · Company intel" : ""}
                </div>
              </div>
            </div>
            <div ref={prepRef} style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
              {prepMsgs.map((m, i) => <ChatBubble key={i} m={m} icon="🎓" mc="#6b8aff" prep={true} />)}
              {loading && <Typing mc="#6b8aff" />}
            </div>
            <InputRow onSend={sendPrep} ph="Ask anything…" input={input} setInput={setInput} loading={loading} error={error} />
          </div>
          <div style={{ overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ ...S.card, padding: 14 }}>
              <span style={S.lbl}>QUICK TOPICS</span>
              {topics.map(t => (
                <div key={t} className="hov" onClick={() => setInput(t)}
                  style={{ padding: "8px 11px", borderRadius: 7, fontSize: 12, marginBottom: 6, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.02)", color: "rgba(255,255,255,0.58)", lineHeight: 1.4, cursor: "pointer" }}>
                  {t}
                </div>
              ))}
            </div>
            {resume && (
              <div style={{ ...S.card, padding: 12 }}>
                <span style={S.lbl}>RESUME</span>
                <div style={{ fontSize: 11, color: "#00c9a7" }}>✓ {resumeName}</div>
                {extractCandidateName(resume) && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginTop: 4 }}>Name: {extractCandidateName(resume)}</div>}
              </div>
            )}
            {companyInfo && (
              <div style={{ ...S.card, padding: 12 }}>
                <span style={S.lbl}>COMPANY</span>
                <div style={{ fontSize: 11, color: "#00c9a7" }}>✓ {settings.targetCompany || "Info loaded"}</div>
              </div>
            )}
            <button onClick={startInterview} style={{ background: "linear-gradient(135deg,#ff6b2c,#ff4000)", border: "none", borderRadius: 9, padding: "13px", color: "white", fontFamily: "Syne,sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 16px rgba(255,107,44,0.3)" }}>
              Start Interview →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // INTERVIEW
  // ══════════════════════════════════════════════════════════════
  if (phase === "interview") {
    const pcolor = pc(settings.pressure);
    const lsV = lastSc?.ls, flV = lastSc?.fl;
    const lsC = lsV == null ? "#888" : lsV >= 70 ? "#00c9a7" : lsV >= 45 ? "#ffd02c" : "#ff2c5a";
    const flC = flV == null ? "#888" : flV >= 60 ? "#ff2c5a" : flV >= 30 ? "#ffd02c" : "#00c9a7";

    return (
      <div style={{ background: "#07070f", display: "flex", flexDirection: "column", height: "100vh" }}>
        <div style={{ ...S.hdr, justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Logo /></div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: moodColor, boxShadow: `0 0 8px ${moodColor}` }} />
              <span style={{ fontSize: 12, color: moodColor, fontWeight: 600 }}>{MOODS.find(m => m.id === settings.mood)?.label}</span>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>P-{settings.pressure} · {ollamaCfg.ollamaModel}</span>
            <TimerDisplay timer={timer} color={pcolor} />
            <button onClick={() => setPhase("results")} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.11)", borderRadius: 6, color: "rgba(255,255,255,0.4)", padding: "6px 13px", fontSize: 12, cursor: "pointer", fontFamily: "DM Sans,sans-serif" }}>End Session</button>
          </div>
        </div>

        <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 248px", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", overflow: "hidden", borderRight: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ padding: "12px 22px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 11, flexShrink: 0 }}>
              <div style={{ width: 30, height: 30, borderRadius: "50%", background: `${moodColor}18`, border: `1px solid ${moodColor}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>{persona.icon}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{persona.name}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.32)" }}>
                  {settings.role}{settings.targetCompany ? ` @ ${settings.targetCompany}` : ""} · P{settings.pressure}/10{resume ? " · Has your resume" : ""}
                </div>
              </div>
            </div>
            <div ref={chatRef} style={{ flex: 1, overflowY: "auto", padding: "18px 22px" }}>
              {messages.map((m, i) => <ChatBubble key={i} m={m} icon={persona.icon} mc={moodColor} prep={false} />)}
              {loading && <Typing mc={moodColor} />}
            </div>
            <InputRow onSend={sendInterview} ph={`Respond to ${persona.name}…`} input={input} setInput={setInput} loading={loading} error={error} />
          </div>

          <div style={{ overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>LIVE METRICS</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[{ v: lsV ?? avgL, c: lsC, l: "LOGIC" }, { v: flV ?? avgF, c: flC, l: "FLUFF" }].map(({ v, c, l }) => (
                <div key={l} style={{ ...S.card, padding: 9, display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <Gauge value={v} color={c} label={l} size={70} />
                </div>
              ))}
            </div>
            <div style={{ ...S.card, padding: 13 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 11 }}>SESSION AVG</div>
              <Bar val={avgL} color="#00c9a7" label="Logic" />
              <Bar val={avgF} color="#ff8c2c" label="Fluff" />
              <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Questions</span>
                <span className="mono" style={{ fontSize: 11, color: "white" }}>{scores.length}</span>
              </div>
            </div>
            <div style={{ ...S.card, padding: 13 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 9 }}>CONSISTENCY</div>
              {flags === 0
                ? <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "6px 0" }}>No contradictions</div>
                : scores.filter(s => s?.cf && s.cf !== "null" && s.cf !== "none" && s.cf !== null).map((s, i) => (
                  <div key={i} className="cflag" style={{ fontSize: 10, padding: "6px 9px", borderRadius: 5, marginBottom: 5, background: "rgba(255,44,90,0.07)", borderLeft: "2px solid #ff2c5a", color: "#ff8aaa", lineHeight: 1.4 }}>
                    ⚠ {s.cf}
                  </div>
                ))
              }
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>Flags</span>
                <span className="mono" style={{ fontSize: 11, fontWeight: 600, color: flags > 0 ? "#ff2c5a" : "#00c9a7" }}>{flags}</span>
              </div>
            </div>
            {lastSc?.mv && (
              <div style={{ ...S.card, padding: 11 }}>
                <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 6 }}>LAST MOVE</div>
                <div className="mono" style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.05em", color: lastSc.mv === "confront" ? "#ff2c5a" : lastSc.mv === "challenge" ? "#ff8c2c" : lastSc.mv === "probe" ? "#ffd02c" : "#00c9a7" }}>
                  {lastSc.mv === "accept" ? "✓ ACCEPTED" : lastSc.mv === "probe" ? "⟳ PROBING" : lastSc.mv === "challenge" ? "↯ CHALLENGING" : "⚡ CONFRONTING"}
                </div>
              </div>
            )}
            <div style={{ ...S.card, padding: 11 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 7 }}>PRESSURE</div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", background: "linear-gradient(to right,#00c9a7,#ffd02c,#ff2c5a)", width: `${settings.pressure * 10}%` }} />
              </div>
              <span className="mono" style={{ fontSize: 11, color: pcolor, fontWeight: 600 }}>{settings.pressure}/10 — {pl(settings.pressure)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // RESULTS
  // ══════════════════════════════════════════════════════════════
  const g = grade();
  const userMsgs = messages.filter(m => m.role === "user");
  return (
    <div style={{ minHeight: "100vh", background: "#07070f" }}>
      <div style={S.hdr}>
        <Logo />
        <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: "0.1em" }}>SESSION COMPLETE</span>
      </div>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "36px 22px 80px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div className="grade" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 90, height: 90, borderRadius: "50%", background: `${g.c}12`, border: `2px solid ${g.c}55`, fontFamily: "Syne,sans-serif", fontSize: 36, fontWeight: 800, color: g.c, marginBottom: 12 }}>{g.g}</div>
          <div className="syne" style={{ fontSize: 20, fontWeight: 700, marginBottom: 5 }}>{g.l}</div>
          <div style={{ color: "rgba(255,255,255,0.38)", fontSize: 13 }}>
            {persona.icon} {persona.name} · {settings.role}{settings.targetCompany ? ` @ ${settings.targetCompany}` : ""} · {fmt(timer)} · {scores.length} questions · 🧠 {ollamaCfg.ollamaModel}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 22 }}>
          {[
            { label: "Avg Logic Score",    val: avgL,          max: 100,  color: "#00c9a7", desc: "Structure and substance of answers" },
            { label: "Avg Fluff Level",    val: avgF,          max: 100,  color: "#ff8c2c", desc: "Buzzwords without evidence — lower is better" },
            { label: "Consistency Flags",  val: flags,         max: null, color: flags > 0 ? "#ff2c5a" : "#00c9a7", desc: "Times you contradicted yourself" },
            { label: "Questions Answered", val: scores.length, max: null, color: "#6b8aff", desc: "Total interview exchanges" },
          ].map(({ label, val, max, color, desc }) => (
            <div key={label} style={S.card}>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginBottom: 6 }}>{label}</div>
              <div className="mono" style={{ fontSize: 30, fontWeight: 700, color, marginBottom: 3 }}>{val}{max ? "/" + max : ""}</div>
              {max && (
                <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, marginBottom: 6 }}>
                  <div style={{ height: "100%", borderRadius: 2, background: color, width: `${val}%`, transition: "width 1s ease" }} />
                </div>
              )}
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>{desc}</div>
            </div>
          ))}
        </div>

        {scores.length > 0 && (
          <div style={{ ...S.card, marginBottom: 20 }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)", marginBottom: 14 }}>ANSWER-BY-ANSWER</div>
            {scores.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                <div className="mono" style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", minWidth: 20 }}>Q{i + 1}</div>
                <div style={{ flex: 1, fontSize: 12, color: "rgba(255,255,255,0.6)", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {userMsgs[i]?.content?.slice(0, 68)}{(userMsgs[i]?.content?.length || 0) > 68 ? "…" : ""}
                </div>
                <div style={{ display: "flex", gap: 12, flexShrink: 0 }}>
                  <div style={{ textAlign: "center" }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: s.ls >= 70 ? "#00c9a7" : s.ls >= 45 ? "#ffd02c" : "#ff2c5a" }}>{s.ls}</div>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>LOGIC</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: s.fl >= 60 ? "#ff2c5a" : s.fl >= 30 ? "#ffd02c" : "#00c9a7" }}>{s.fl}</div>
                    <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)" }}>FLUFF</div>
                  </div>
                  {s.cf && s.cf !== "null" && s.cf !== "none" && (
                    <div style={{ fontSize: 10, color: "#ff8aaa", maxWidth: 95, lineHeight: 1.3 }}>⚠ {s.cf}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ ...S.card, background: "rgba(255,107,44,0.04)", border: "1px solid rgba(255,107,44,0.13)", marginBottom: 22 }}>
          <div style={{ fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,107,44,0.55)", marginBottom: 9 }}>HONEST VERDICT</div>
          <p style={{ fontSize: 14, lineHeight: 1.85, color: "rgba(255,255,255,0.72)" }}>
            {avgL >= 70 && avgF <= 35 && flags === 0
              ? `Strong performance under ${pl(settings.pressure).toLowerCase()} pressure. Solid logic, minimal filler, zero contradictions caught. That combination is genuinely rare — most candidates have the substance or the composure, not both.`
              : flags > 0 && avgL >= 65
              ? `Technically decent answers, but ${flags} contradiction${flags > 1 ? "s were" : " was"} caught. In a real interview, a sharp interviewer would have pressed hard on exactly those moments. Your story needs to stay consistent — contradictions destroy credibility even when the underlying answer is strong.`
              : avgF > 55
              ? `Too much filler, not enough substance. Every buzzword without a concrete example is a red flag. Lead with specifics every time: actual numbers, actual decisions, actual outcomes. The words around them can be simple.`
              : avgL < 50
              ? `The pressure disrupted your structure. Clear answers under fire require practice until they're automatic. Work the STAR framework — Situation, Task, Action, Result — until you can produce it without thinking.`
              : `Decent effort. To go from decent to strong: lead every answer with the conclusion first, then support it. Eliminate vague language on first use.${flags > 0 ? " Fix the consistency — contradictions matter more than people think." : ""}`
            }
          </p>
        </div>

        <div style={{ display: "flex", gap: 9, justifyContent: "center" }}>
          <button onClick={() => setPhase("setup")} style={{ background: "linear-gradient(135deg,#ff6b2c,#ff4000)", border: "none", borderRadius: 9, padding: "12px 26px", color: "white", fontFamily: "Syne,sans-serif", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>New Session</button>
          <button onClick={startPrep} style={{ background: "rgba(107,138,255,0.1)", border: "1px solid rgba(107,138,255,0.22)", borderRadius: 9, padding: "12px 22px", color: "#8aaeff", fontSize: 13, cursor: "pointer", fontFamily: "Syne,sans-serif", fontWeight: 600 }}>🎓 More Prep</button>
          <button onClick={() => setPhase("interview")} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "12px 22px", color: "rgba(255,255,255,0.45)", fontSize: 13, cursor: "pointer", fontFamily: "Syne,sans-serif" }}>Review Chat</button>
        </div>
      </div>
    </div>
  );
}
