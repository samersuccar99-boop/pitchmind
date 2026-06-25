import { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, getDocs, deleteDoc, query, where } from "firebase/firestore";

// ── DESIGN TOKENS ─────────────────────────────────────────────────────────
const C = {
  bg: "#080B0F",
  bg2: "#0D1117",
  bg3: "#161B22",
  border: "rgba(255,255,255,0.06)",
  borderHover: "rgba(255,255,255,0.12)",
  // B2B - Electric Blue
  b2b: "#2563EB",
  b2bLight: "#3B82F6",
  b2bGlow: "rgba(37,99,235,0.15)",
  b2bBorder: "rgba(37,99,235,0.3)",
  // B2C - Violet Purple  
  b2c: "#7C3AED",
  b2cLight: "#8B5CF6",
  b2cGlow: "rgba(124,58,237,0.15)",
  b2cBorder: "rgba(124,58,237,0.3)",
  // Gold accent
  gold: "#F59E0B",
  goldLight: "#FCD34D",
  goldGlow: "rgba(245,158,11,0.15)",
  // Status
  hot: "#EF4444",
  warm: "#F59E0B",
  cold: "#10B981",
  white: "#F0F6FC",
  muted: "rgba(240,246,252,0.5)",
  dim: "rgba(240,246,252,0.25)",
};

const PLANS = {
  starter: { name: "Starter", price: 99, credits: 50, color: C.b2bLight },
  growth: { name: "Growth", price: 199, credits: 150, color: C.b2cLight },
  agency: { name: "Agency", price: 399, credits: 400, color: C.gold },
};

const STATUS_OPTIONS = [
  { value: "new", label: "New", bg: "rgba(99,102,241,0.15)", color: "#818CF8" },
  { value: "contacted", label: "Contacted", bg: "rgba(59,130,246,0.15)", color: "#60A5FA" },
  { value: "inprogress", label: "In Progress", bg: "rgba(245,158,11,0.15)", color: "#FCD34D" },
  { value: "closed", label: "Closed Won", bg: "rgba(16,185,129,0.15)", color: "#34D399" },
  { value: "lost", label: "Lost", bg: "rgba(239,68,68,0.15)", color: "#F87171" },
];

function scoreColor(s) {
  if (s >= 80) return { bg: "rgba(239,68,68,0.12)", color: "#F87171", border: "rgba(239,68,68,0.25)", label: "HOT" };
  if (s >= 60) return { bg: "rgba(245,158,11,0.12)", color: "#FCD34D", border: "rgba(245,158,11,0.25)", label: "WARM" };
  return { bg: "rgba(16,185,129,0.12)", color: "#34D399", border: "rgba(16,185,129,0.25)", label: "COLD" };
}

async function callClaude(apiKey, prompt, maxTokens = 2000) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error?.message || `HTTP ${r.status}`);
  return d.content[0].text;
}

function safeJSON(raw) {
  const c = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(c); } catch (_) {}
  const obj = c.match(/\{[\s\S]*\}/); if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
  const arr = c.match(/\[[\s\S]*\]/); if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
  throw new Error("Could not parse JSON");
}

function parseCSV(text) {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, "").toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/"/g, ""));
    const row = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  }).filter(r => Object.values(r).some(v => v));
}

// ── GLOBAL CSS ─────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes borderPulse{0%,100%{border-color:rgba(37,99,235,0.3)}50%{border-color:rgba(37,99,235,0.7)}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080B0F;color:#F0F6FC;font-family:'Inter',sans-serif}
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.2)}
input::placeholder,textarea::placeholder{color:rgba(240,246,252,0.2)}
input:focus,textarea:focus{outline:none}
a{text-decoration:none}
`;

// ── SHARED COMPONENTS ──────────────────────────────────────────────────────
const Dot = ({ delay = 0 }) => (
  <span style={{ display: "inline-block", width: "6px", height: "6px", borderRadius: "50%", background: C.b2bLight, margin: "0 3px", animation: `pulse 1.2s ease-in-out infinite`, animationDelay: `${delay}s`, boxShadow: `0 0 6px ${C.b2bLight}` }} />
);

const LoadingDots = ({ color = C.b2bLight }) => (
  <div style={{ display: "flex", justifyContent: "center", gap: "6px", padding: "8px" }}>
    {[0, 0.15, 0.3].map((d, i) => (
      <span key={i} style={{ width: "7px", height: "7px", borderRadius: "50%", background: color, animation: `pulse 1.2s ease-in-out infinite`, animationDelay: `${d}s` }} />
    ))}
  </div>
);

// ── ERROR BOUNDARY ────────────────────────────────────────────────────────
class ErrorBoundary extends (require("react").Component) {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ background: "#080B0F", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif", color: "#fff", padding: "40px" }}>
          <div style={{ maxWidth: "600px", textAlign: "center" }}>
            <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
            <div style={{ fontSize: "18px", fontWeight: "700", marginBottom: "12px", color: "#F87171" }}>Something went wrong</div>
            <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.5)", background: "rgba(239,68,68,0.1)", padding: "16px", borderRadius: "10px", textAlign: "left", wordBreak: "break-all" }}>
              {this.state.error.toString()}
            </div>
            <button onClick={() => window.location.reload()} style={{ marginTop: "20px", padding: "10px 24px", background: "#2563EB", border: "none", borderRadius: "8px", color: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── MAIN APP ───────────────────────────────────────────────────────────────
function PitchMindInner() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("b2b"); // b2b | b2c
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [selPlan, setSelPlan] = useState("starter");
  const [profile, setProfile] = useState({ businessName: "", whatYouDo: "", targetIndustry: "", location: "", b2cTarget: "", b2cPlatform: "Meta Ads" });
  const [profileErr, setProfileErr] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("pm_api_key") || "");
  const [apiInput, setApiInput] = useState("");
  const [apiErr, setApiErr] = useState("");
  const [activeTab, setActiveTab] = useState("scan");
  const [leads, setLeads] = useState([]);
  const [savedLeads, setSavedLeads] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [scanProgress, setScanProgress] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [csvData, setCsvData] = useState([]);
  const [csvName, setCsvName] = useState("");
  const [csvProcessing, setCsvProcessing] = useState(false);
  const [csvProgress, setCsvProgress] = useState("");
  const [csvErr, setCsvErr] = useState("");
  const [savedFilter, setSavedFilter] = useState("all");
  const fileRef = useRef();

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const d = snap.data();
          setUserData(d);
          if (d.profile) setProfile(p => ({ ...p, ...d.profile }));
          if (d.mode) setMode(d.mode);
          const k = localStorage.getItem("pm_api_key") || "";
          if (!k) setScreen("apikey");
          else if (!d.profile?.businessName) setScreen("profile");
          else { setScreen("dashboard"); loadLeads(u.uid); }
        } else setScreen("plan");
      } else { setUser(null); setUserData(null); setScreen("login"); }
      setLoading(false);
    });
  }, []);

  const loadLeads = async (uid) => {
    try {
      const q = query(collection(db, "leads"), where("userId", "==", uid));
      const snap = await getDocs(q);
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
      setSavedLeads(arr);
    } catch (e) { console.log("Load error:", e); }
  };

  const saveLead = async (lead) => {
    if (!user) return null;
    try {
      const exists = savedLeads.find(s => s.name === lead.name && s.address === lead.address);
      if (exists) return exists.id;
      const ref = await addDoc(collection(db, "leads"), { ...lead, userId: user.uid, status: "new", notes: "", mode, savedAt: new Date().toISOString() });
      setSavedLeads(prev => [{ id: ref.id, ...lead, userId: user.uid, status: "new", notes: "", mode, savedAt: new Date().toISOString() }, ...prev]);
      return ref.id;
    } catch (e) { return null; }
  };

  const updateStatus = async (id, status) => {
    await updateDoc(doc(db, "leads", id), { status });
    setSavedLeads(p => p.map(l => l.id === id ? { ...l, status } : l));
    if (selectedLead?.id === id) setSelectedLead(p => ({ ...p, status }));
  };

  const updateNotes = async (id, notes) => {
    await updateDoc(doc(db, "leads", id), { notes });
    setSavedLeads(p => p.map(l => l.id === id ? { ...l, notes } : l));
    if (selectedLead?.id === id) setSelectedLead(p => ({ ...p, notes }));
  };

  const deleteLead = async (id) => {
    await deleteDoc(doc(db, "leads", id));
    setSavedLeads(p => p.filter(l => l.id !== id));
    setSelectedLead(null);
  };

  const useCredit = async () => {
    if (!userData || userData.credits <= 0) return false;
    await updateDoc(doc(db, "users", user.uid), { credits: increment(-1) });
    setUserData(p => ({ ...p, credits: p.credits - 1 }));
    return true;
  };

  // ── AUTH ──
  const doLogin = async () => {
    if (!email || !password) { setAuthErr("Please fill in all fields."); return; }
    setAuthBusy(true); setAuthErr("");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (e) { setAuthErr("Invalid email or password."); }
    setAuthBusy(false);
  };

  const doSignup = async () => {
    if (!email || !password) { setAuthErr("Please fill in all fields."); return; }
    if (password.length < 6) { setAuthErr("Password must be at least 6 characters."); return; }
    setAuthBusy(true); setAuthErr("");
    try { await createUserWithEmailAndPassword(auth, email, password); }
    catch (e) { setAuthErr(e.message.replace("Firebase: ", "")); }
    setAuthBusy(false);
  };

  const doPlan = async () => {
    const p = PLANS[selPlan];
    await setDoc(doc(db, "users", user.uid), { email: user.email, plan: selPlan, credits: p.credits, maxCredits: p.credits, createdAt: new Date().toISOString(), profile: null, mode: "b2b" });
    setUserData({ email: user.email, plan: selPlan, credits: p.credits, maxCredits: p.credits });
    setScreen("mode");
  };

  const doMode = async (m) => {
    setMode(m);
    await updateDoc(doc(db, "users", user.uid), { mode: m });
    setScreen("apikey");
  };

  const doApiKey = () => {
    if (!apiInput.trim().startsWith("sk-ant-")) { setApiErr("Invalid key. Must start with sk-ant-"); return; }
    localStorage.setItem("pm_api_key", apiInput.trim());
    setApiKey(apiInput.trim()); setApiErr(""); setScreen("profile");
  };

  const doProfile = async () => {
    if (!profile.businessName || !profile.whatYouDo) { setProfileErr("Please fill in all fields."); return; }
    if (mode === "b2b" && (!profile.targetIndustry || !profile.location)) { setProfileErr("Please fill in all fields."); return; }
    if (mode === "b2c" && !profile.b2cTarget) { setProfileErr("Please describe your target audience."); return; }
    await updateDoc(doc(db, "users", user.uid), { profile, mode });
    setUserData(p => ({ ...p, profile, mode }));
    setProfileErr(""); setScreen("dashboard"); loadLeads(user.uid);
  };

  // ── B2B SCAN ──
  const scanB2B = async () => {
    if (userData.credits <= 0) { setScanErr("No credits left! Please upgrade."); return; }
    setScanErr(""); setScanning(true); setLeads([]);
    setScanProgress("🔍 Scanning for weak businesses...");
    if (!await useCredit()) { setScanErr("No credits."); setScanning(false); return; }
    try {
      const prompt = `You are PitchMind AI. Generate exactly 6 HOT business leads as a JSON array.
MY BUSINESS: ${profile.businessName}. WHAT I OFFER: ${profile.whatYouDo}.
TARGET: ${profile.targetIndustry || "businesses"} businesses in ${profile.location || "your area"} that are CURRENTLY OPEN and WEAK in what I offer.
IMPORTANT: Return ONLY a valid JSON array. Start with [ end with ]. No markdown.
[{"name":"Real Business Name","type":"${profile.targetIndustry}","location":"${profile.location}","address":"Real street address","phone":"Local phone","website":"No website","rating":2.8,"reviews":14,"score":88,"weaknesses":["No website","Low reviews","No social media"],"painPoint":"Why they need ${profile.businessName}.","hotReason":"Why HOT right now."}]
Rules: 6 OPEN businesses, scores 75-95, realistic for ${profile.location}.`;
      const raw = await callClaude(apiKey, prompt, 2000);
      const parsed = safeJSON(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid response");
      setLeads(parsed);
      for (const l of parsed) await saveLead({ ...l, leadType: "b2b" });
      setScanProgress("");
    } catch (e) { setScanErr(`Error: ${e.message}`); setScanProgress(""); }
    setScanning(false);
  };

  // ── B2C CSV UPLOAD & PROCESS ──
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvName(file.name); setCsvErr(""); setCsvData([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      if (rows.length === 0) { setCsvErr("Could not parse CSV. Please check the file format."); return; }
      setCsvData(rows);
    };
    reader.readAsText(file);
  };

  const detectCSVType = (headers, rows) => {
    const h = headers.join(" ").toLowerCase();
    // Lead Ads format - has individual person data
    if (h.includes("email") || h.includes("phone") || (h.includes("first") && h.includes("last"))) return "leads";
    // Campaign performance format
    if (h.includes("campaign name") || h.includes("impressions") || h.includes("amount spent")) return "campaigns";
    // TikTok format
    if (h.includes("tiktok") || h.includes("video views") || h.includes("cpm")) return "tiktok";
    // Google Ads format
    if (h.includes("keyword") || h.includes("quality score") || h.includes("search term")) return "google";
    // Audience/engagement format
    if (h.includes("engagement") || h.includes("reach") || h.includes("followers")) return "audience";
    return "unknown";
  };

  const processCSV = async () => {
    if (csvData.length === 0) { setCsvErr("Please upload a CSV file first."); return; }
    if (userData.credits <= 0) { setCsvErr("No credits left! Please upgrade."); return; }
    setCsvProcessing(true); setCsvErr(""); setLeads([]);
    setCsvProgress(`📊 Detecting format and analyzing ${csvData.length} rows...`);
    if (!await useCredit()) { setCsvErr("No credits."); setCsvProcessing(false); return; }
    try {
      const headers = Object.keys(csvData[0] || {});
      const csvType = detectCSVType(headers, csvData);
      const sample = csvData.slice(0, 15);
      const summary = sample.map((r, i) => `Row ${i+1}: ${Object.entries(r).map(([k,v]) => `${k}="${v}"`).join(", ")}`).join("\n");

      setCsvProgress(`✅ Detected: ${csvType === "leads" ? "Lead Ads data (individual contacts)" : csvType === "campaigns" ? "Campaign performance data" : csvType === "tiktok" ? "TikTok Ads data" : csvType === "google" ? "Google Ads data" : "Engagement data"} — generating intelligence...`);

      const prompt = `You are PitchMind AI. Analyze this ${profile.b2cPlatform} data and generate B2C lead intelligence.

MY BUSINESS: ${profile.businessName}
WHAT I OFFER: ${profile.whatYouDo}
DATA TYPE DETECTED: ${csvType}
CSV HEADERS: ${headers.join(", ")}

DATA (${sample.length} rows):
${summary}

ANALYSIS INSTRUCTIONS based on data type:
${csvType === "leads" ? 
  "- This is LEAD ADS data with real individual contacts
- Extract name, email, phone, location per person
- Score based on: recency, completeness of info, any engagement signals
- Generate highly personalized messages using their actual name" 
  : csvType === "campaigns" ? 
  "- This is CAMPAIGN PERFORMANCE data (not individual people)
- Each row = one ad campaign
- Analyze: cost per result, reach, engagement rate, results count
- Lower cost per result + higher results = HOT campaign audience to retarget
- Generate retargeting strategy per campaign
- Name each lead after the campaign for clarity"
  : csvType === "tiktok" ?
  "- This is TIKTOK ADS data
- Analyze video performance, engagement rates, audience behavior
- Higher video completion rate = more interested audience
- Generate TikTok-specific outreach strategies"
  : csvType === "google" ?
  "- This is GOOGLE ADS data
- Analyze search terms, keywords, conversion rates
- High intent keywords = HOT leads
- Generate search-intent based outreach"
  : "- Analyze whatever engagement signals are available
- Score based on any available metrics
- Generate relevant outreach strategies"}

Return ONLY a raw JSON array. Start with [ end with ]. No markdown, no explanation.
Generate exactly ${Math.min(sample.length, 8)} objects, one per data row:
[{"name":"Person name OR Campaign name OR Ad name","platform":"${profile.b2cPlatform}","location":"location or N/A","engagement":"Key metrics: e.g. 66 conversations started, $3.45 cost per result, 10493 reach","score":88,"interestLevel":"High/Medium/Low","dataType":"${csvType}","keyMetric":"The single most important metric from this row","likelyObjection":"Main barrier to conversion","bestApproach":"WhatsApp/DM/Email/Retarget Ad","personalizedMessage":"Specific outreach message based on the actual data","followUp1":"Day 2 follow-up","followUp2":"Day 5 follow-up","followUp3":"Day 10 follow-up","painPoint":"Why this audience needs ${profile.businessName}","hotReason":"Specific reason this is a hot lead based on the data","strategy":"One specific action to take with this campaign/person"}]`;

      const raw = await callClaude(apiKey, prompt, 3000);
      let parsed;
      try {
        parsed = safeJSON(raw);
      } catch(e) {
        // Try to extract any JSON array from response
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) {
          try { parsed = JSON.parse(match[0]); } catch(_) {}
        }
        if (!parsed) {
          // Generate basic leads from CSV data if parsing fails
          parsed = sample.slice(0,6).map((row, i) => ({
            name: row.name || row['ad name'] || row['campaign name'] || row.email || `Contact ${i+1}`,
            platform: profile.b2cPlatform,
            location: row.location || row.country || row.region || "N/A",
            engagement: Object.entries(row).filter(([k,v]) => v && !['name','email','phone'].includes(k.toLowerCase())).slice(0,3).map(([k,v]) => `${k}: ${v}`).join(', ') || "Ad interaction",
            score: 70 + Math.floor(Math.random() * 20),
            interestLevel: "Medium",
            likelyObjection: "Need more information",
            bestApproach: "WhatsApp",
            personalizedMessage: `Hi! We noticed your interest in ${profile.businessName}. We'd love to tell you more!`,
            followUp1: "Following up on my previous message about our offer.",
            followUp2: "Just checking in — would love to answer any questions you have.",
            followUp3: "Last follow-up — we have a special offer just for you this week!",
            painPoint: `Could benefit from ${profile.whatYouDo}`,
            hotReason: "Engaged with our ad content"
          }));
        }
      }
      if (!Array.isArray(parsed)) throw new Error("Invalid response format");
      setLeads(parsed);
      for (const l of parsed) await saveLead({ ...l, leadType: "b2c" });
      setCsvProgress("");
    } catch (e) { setCsvErr(`Error: ${e.message}`); setCsvProgress(""); }
    setCsvProcessing(false);
  };

  // ── REPORT ──
  const loadReport = async (lead) => {
    if (lead.report) { setSelectedLead(lead); return; }
    if (userData.credits <= 0) { alert("No credits left!"); return; }
    setSelectedLead({ ...lead, loading: true });
    await useCredit();
    try {
      const isB2C = lead.leadType === "b2c";
      const prompt = isB2C ? `You are PitchMind AI. Deep B2C sales intelligence report.
MY BUSINESS: ${profile.businessName} — ${profile.whatYouDo}
CONTACT: ${lead.name} | Platform: ${lead.platform} | Engagement: ${lead.engagement} | Location: ${lead.location}
Return ONLY raw JSON:
{"profileAnalysis":"Who this person likely is based on their engagement behavior.","psychologicalProfile":"Their mindset, motivations, fears and desires as a potential customer.","buyingSignals":"Specific signals from their engagement that show purchase intent.","likelyObjections":"Top 3 objections and how to handle each one.","pitchStrategy":"Exact step-by-step approach to convert this person.","openingMessage":"Perfect first message tailored to their specific engagement.","followUpSequence":"5 follow-up messages with timing (day 1, 3, 7, 14, 30).","closingScript":"Exact words to use when closing this person.","bestTime":"Best time and day to reach out based on their behavior.","conversionTip":"The single most powerful thing to say to convert this person."}`
      : `You are PitchMind AI. Deep B2B sales intelligence report.
MY BUSINESS: ${profile.businessName} — ${profile.whatYouDo}
TARGET: ${lead.name} | ${lead.type} | ${lead.address} | ${lead.phone} | ${lead.website} | ${lead.rating}/5 | Weaknesses: ${(lead.weaknesses || []).join(", ")}
Return ONLY raw JSON:
{"companyOverview":"3 sentences about this business.","weaknessAnalysis":"Exactly why they are weak and what it costs them.","decisionMaker":"Who buys: title, personality, priorities.","emotionalProfile":"Their fears, frustrations, desires.","objections":"Top 3 objections and real reasons.","pitchStrategy":"Step by step approach.","openingLine":"Perfect first sentence.","closingAngle":"Most powerful closing argument.","emailTemplate":"4-sentence cold email."}`;
      const raw = await callClaude(apiKey, prompt, 2500);
      const parsed = safeJSON(raw);
      if (lead.id) {
        await updateDoc(doc(db, "leads", lead.id), { report: parsed });
        setSavedLeads(p => p.map(l => l.id === lead.id ? { ...l, report: parsed } : l));
      }
      setSelectedLead(p => ({ ...p, loading: false, report: parsed }));
    } catch (e) { setSelectedLead(p => ({ ...p, loading: false, reportErr: e.message })); }
  };

  const doLogout = async () => { await signOut(auth); setLeads([]); setSavedLeads([]); setScreen("login"); };

  const exportCSV = (data) => {
    if (!data.length) return;
    const headers = Object.keys(data[0]).filter(k => !["id", "userId", "report"].includes(k));
    const rows = data.map(r => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "pitchmind-leads.csv"; a.click();
  };

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "28px", fontWeight: "900", letterSpacing: "4px", background: `linear-gradient(135deg, ${C.b2bLight}, ${C.b2cLight})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "24px" }}>PITCHMIND</div>
        <LoadingDots />
      </div>
    </div>
  );

  // Safety check
  if (!screen) return null;

  // ── LOGIN / SIGNUP ──
  if (screen === "login" || screen === "signup") {
    const isLogin = screen === "login";
    return (
      <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif", display: "flex" }}>
        <style>{CSS}</style>
        {/* Left panel */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "60px", background: `linear-gradient(135deg, ${C.bg} 0%, #0D1B2A 100%)`, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: "20%", left: "10%", width: "300px", height: "300px", background: `radial-gradient(circle, ${C.b2bGlow} 0%, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "20%", right: "10%", width: "250px", height: "250px", background: `radial-gradient(circle, ${C.b2cGlow} 0%, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: "700", letterSpacing: "4px", color: C.b2bLight, marginBottom: "24px", textTransform: "uppercase" }}>PITCHMIND</div>
            <div style={{ fontSize: "48px", fontWeight: "900", lineHeight: "1.1", marginBottom: "20px", letterSpacing: "-2px" }}>
              Find leads.<br />
              <span style={{ background: `linear-gradient(135deg, ${C.b2bLight}, ${C.b2cLight})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Close deals.</span>
            </div>
            <div style={{ fontSize: "16px", color: C.muted, lineHeight: "1.7", maxWidth: "400px", marginBottom: "48px" }}>
              AI-powered lead intelligence for B2B businesses and B2C audience targeting. Upload your ad data and let AI do the rest.
            </div>
            {[
              { icon: "🏢", title: "B2B Lead Scanner", desc: "Find businesses weak in what you offer" },
              { icon: "👥", title: "B2C Audience Intelligence", desc: "Upload Meta/TikTok data → get hot leads" },
              { icon: "🧠", title: "AI Pitch Strategy", desc: "Psychology, objections & personalized scripts" },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "20px" }}>
                <div style={{ fontSize: "20px", marginTop: "2px" }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "2px" }}>{f.title}</div>
                  <div style={{ fontSize: "13px", color: C.dim }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Right panel */}
        <div style={{ width: "480px", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", background: C.bg2, borderLeft: `1px solid ${C.border}` }}>
          <div style={{ width: "100%" }}>
            <div style={{ fontSize: "24px", fontWeight: "800", marginBottom: "6px" }}>{isLogin ? "Welcome back" : "Create account"}</div>
            <div style={{ fontSize: "14px", color: C.muted, marginBottom: "32px" }}>{isLogin ? "Sign in to your PitchMind account" : "Start finding leads in minutes"}</div>
            {["Email", "Password"].map((lbl, i) => (
              <div key={i} style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "12px", fontWeight: "600", color: C.muted, marginBottom: "8px", letterSpacing: "0.5px", textTransform: "uppercase" }}>{lbl}</label>
                <input
                  type={i === 1 ? "password" : "email"}
                  placeholder={i === 0 ? "you@company.com" : "••••••••"}
                  value={i === 0 ? email : password}
                  onChange={e => { i === 0 ? setEmail(e.target.value) : setPassword(e.target.value); setAuthErr(""); }}
                  onKeyDown={e => e.key === "Enter" && (isLogin ? doLogin() : doSignup())}
                  style={{ width: "100%", padding: "12px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "14px", transition: "border 0.2s" }}
                />
              </div>
            ))}
            {authErr && <div style={{ color: "#F87171", fontSize: "13px", marginBottom: "16px", padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: "8px", border: "1px solid rgba(239,68,68,0.2)" }}>{authErr}</div>}
            <button onClick={isLogin ? doLogin : doSignup} disabled={authBusy}
              style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "14px", boxShadow: `0 4px 20px ${C.b2bGlow}`, transition: "opacity 0.2s", opacity: authBusy ? 0.7 : 1 }}>
              {authBusy ? "Please wait..." : isLogin ? "Sign In →" : "Create Account →"}
            </button>
            <button onClick={() => { setScreen(isLogin ? "signup" : "login"); setAuthErr(""); }}
              style={{ width: "100%", padding: "12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", color: C.muted, fontSize: "13px", cursor: "pointer", transition: "all 0.2s" }}>
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAN ──
  if (screen === "plan") return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: "800px", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", letterSpacing: "3px", color: C.b2bLight, marginBottom: "16px", textTransform: "uppercase" }}>Choose Your Plan</div>
          <div style={{ fontSize: "36px", fontWeight: "900", letterSpacing: "-1px" }}>Simple, transparent pricing</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", marginBottom: "32px" }}>
          {Object.entries(PLANS).map(([key, plan]) => {
            const isSelected = selPlan === key;
            const isPop = key === "growth";
            return (
              <div key={key} onClick={() => setSelPlan(key)}
                style={{ background: isSelected ? `linear-gradient(135deg, rgba(37,99,235,0.1), rgba(124,58,237,0.1))` : C.bg2, border: `2px solid ${isSelected ? C.b2bLight : C.border}`, borderRadius: "16px", padding: "28px", cursor: "pointer", position: "relative", transition: "all 0.2s", boxShadow: isSelected ? `0 0 30px rgba(37,99,235,0.15)` : "none" }}>
                {isPop && <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2c})`, color: "#fff", fontSize: "10px", fontWeight: "800", padding: "4px 14px", borderRadius: "20px", letterSpacing: "1px" }}>MOST POPULAR</div>}
                <div style={{ fontSize: "32px", fontWeight: "900", color: plan.color, marginBottom: "4px" }}>${plan.price}</div>
                <div style={{ fontSize: "12px", color: C.dim, marginBottom: "16px" }}>/month</div>
                <div style={{ fontSize: "18px", fontWeight: "800", marginBottom: "8px" }}>{plan.name}</div>
                <div style={{ fontSize: "28px", fontWeight: "900", color: plan.color }}>{plan.credits}</div>
                <div style={{ fontSize: "12px", color: C.muted, marginBottom: "20px" }}>credits/month</div>
                {["B2B + B2C intelligence", "Full AI pitch reports", "CRM pipeline", "Export to CSV"].map((f, i) => (
                  <div key={i} style={{ fontSize: "12px", color: C.muted, marginBottom: "6px", display: "flex", alignItems: "center", gap: "8px" }}>
                    <span style={{ color: C.b2bLight, fontWeight: "700" }}>✓</span>{f}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <button onClick={doPlan}
          style={{ display: "block", margin: "0 auto", padding: "14px 48px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2c})`, border: "none", borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 24px rgba(37,99,235,0.3)", letterSpacing: "0.5px" }}>
          Start with {PLANS[selPlan].name} →
        </button>
      </div>
    </div>
  );

  // ── MODE SELECTION ──
  if (screen === "mode") return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: "760px", width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "13px", fontWeight: "700", letterSpacing: "3px", color: C.b2bLight, marginBottom: "16px", textTransform: "uppercase" }}>Select Your Mode</div>
        <div style={{ fontSize: "36px", fontWeight: "900", letterSpacing: "-1px", marginBottom: "12px" }}>How do you find clients?</div>
        <div style={{ fontSize: "15px", color: C.muted, marginBottom: "48px" }}>This determines how PitchMind searches for leads</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "24px" }}>
          {/* B2B */}
          <div onClick={() => doMode("b2b")}
            style={{ background: C.bg2, border: `2px solid ${C.b2bBorder}`, borderRadius: "20px", padding: "36px 28px", cursor: "pointer", transition: "all 0.2s", textAlign: "left", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, right: 0, width: "150px", height: "150px", background: `radial-gradient(circle at top right, ${C.b2bGlow}, transparent)`, pointerEvents: "none" }} />
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>🏢</div>
            <div style={{ fontSize: "11px", fontWeight: "800", letterSpacing: "2px", color: C.b2bLight, marginBottom: "10px", textTransform: "uppercase" }}>B2B Mode</div>
            <div style={{ fontSize: "22px", fontWeight: "800", marginBottom: "12px", letterSpacing: "-0.5px" }}>Find Businesses</div>
            <div style={{ fontSize: "14px", color: C.muted, lineHeight: "1.65", marginBottom: "24px" }}>
              Scan for companies that are weak in what you offer. Get their contact info, pain points & personalized pitch strategy.
            </div>
            {["Marketing agencies", "Web design studios", "Cleaning services", "Consulting firms", "Any B2B service"].map((ex, i) => (
              <div key={i} style={{ fontSize: "12px", color: C.dim, marginBottom: "4px" }}>→ {ex}</div>
            ))}
            <div style={{ marginTop: "24px", padding: "12px 20px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: "700", textAlign: "center", boxShadow: `0 4px 16px ${C.b2bGlow}` }}>
              Select B2B Mode →
            </div>
          </div>
          {/* B2C */}
          <div onClick={() => doMode("b2c")}
            style={{ background: C.bg2, border: `2px solid ${C.b2cBorder}`, borderRadius: "20px", padding: "36px 28px", cursor: "pointer", transition: "all 0.2s", textAlign: "left", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, right: 0, width: "150px", height: "150px", background: `radial-gradient(circle at top right, ${C.b2cGlow}, transparent)`, pointerEvents: "none" }} />
            <div style={{ fontSize: "40px", marginBottom: "16px" }}>👥</div>
            <div style={{ fontSize: "11px", fontWeight: "800", letterSpacing: "2px", color: C.b2cLight, marginBottom: "10px", textTransform: "uppercase" }}>B2C Mode</div>
            <div style={{ fontSize: "22px", fontWeight: "800", marginBottom: "12px", letterSpacing: "-0.5px" }}>Find People</div>
            <div style={{ fontSize: "14px", color: C.muted, lineHeight: "1.65", marginBottom: "24px" }}>
              Upload your Meta Ads or TikTok data. AI analyzes every contact's engagement and scores them as HOT, WARM or COLD leads.
            </div>
            {["Gyms & fitness centers", "Restaurants & cafes", "Beauty salons & spas", "Real estate agents", "Any B2C business"].map((ex, i) => (
              <div key={i} style={{ fontSize: "12px", color: C.dim, marginBottom: "4px" }}>→ {ex}</div>
            ))}
            <div style={{ marginTop: "24px", padding: "12px 20px", background: `linear-gradient(135deg, ${C.b2c}, ${C.b2cLight})`, borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: "700", textAlign: "center", boxShadow: `0 4px 16px ${C.b2cGlow}` }}>
              Select B2C Mode →
            </div>
          </div>
        </div>
        <div style={{ fontSize: "12px", color: C.dim, marginTop: "24px" }}>You can switch modes anytime from your dashboard settings</div>
      </div>
    </div>
  );

  // ── API KEY ──
  if (screen === "apikey") return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: "440px", width: "100%", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "40px" }}>
        <div style={{ fontSize: "11px", fontWeight: "800", letterSpacing: "3px", color: C.b2bLight, marginBottom: "16px", textTransform: "uppercase" }}>Step 3 of 4</div>
        <div style={{ fontSize: "26px", fontWeight: "800", marginBottom: "8px" }}>Connect AI Brain</div>
        <div style={{ fontSize: "14px", color: C.muted, marginBottom: "28px" }}>PitchMind uses Claude AI to generate intelligence reports</div>
        <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px", marginBottom: "24px", fontSize: "13px", color: C.muted, lineHeight: "1.7" }}>
          🔑 Get your free API key at <span style={{ color: C.b2bLight, fontWeight: "600" }}>console.anthropic.com</span><br />
          New accounts get $5 free credits — enough for hundreds of searches.
        </div>
        <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.muted, marginBottom: "8px", letterSpacing: "1px", textTransform: "uppercase" }}>Claude API Key</label>
        <input type="password" placeholder="sk-ant-..." value={apiInput}
          onChange={e => { setApiInput(e.target.value); setApiErr(""); }}
          onKeyDown={e => e.key === "Enter" && doApiKey()}
          style={{ width: "100%", padding: "13px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "14px", marginBottom: "14px" }} />
        {apiErr && <div style={{ color: "#F87171", fontSize: "13px", marginBottom: "14px" }}>{apiErr}</div>}
        <button onClick={doApiKey}
          style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: `0 4px 20px ${C.b2bGlow}` }}>
          Continue →
        </button>
        <div style={{ marginTop: "16px", fontSize: "11px", color: C.dim, textAlign: "center" }}>🔒 Stored locally in your browser. Never sent to our servers.</div>
      </div>
    </div>
  );

  // ── PROFILE ──
  if (screen === "profile") return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: "560px", width: "100%", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
          <div style={{ padding: "6px 12px", background: safeMode === "b2b" ? C.b2bGlow : C.b2cGlow, border: `1px solid ${mode === "b2b" ? C.b2bBorder : C.b2cBorder}`, borderRadius: "20px", fontSize: "12px", fontWeight: "700", color: safeMode === "b2b" ? C.b2bLight : C.b2cLight, textTransform: "uppercase", letterSpacing: "1px" }}>
            {mode === "b2b" ? "🏢 B2B Mode" : "👥 B2C Mode"}
          </div>
        </div>
        <div style={{ fontSize: "24px", fontWeight: "800", marginBottom: "6px" }}>Your Business Profile</div>
        <div style={{ fontSize: "14px", color: C.muted, marginBottom: "28px" }}>Help PitchMind understand what you offer</div>
        {[
          { label: "Business Name", key: "businessName", placeholder: "e.g. Peach Agency, Dubai Gym, ABC Clinic..." },
          { label: mode === "b2b" ? "What You Offer" : "What You Sell", key: "whatYouDo", placeholder: mode === "b2b" ? "e.g. Social media management, web design, SEO..." : "e.g. Gym memberships, restaurant meals, beauty services..." },
          ...(mode === "b2b" ? [
            { label: "Target Industry", key: "targetIndustry", placeholder: "e.g. Restaurants, Clinics, Real Estate..." },
            { label: "Target Location", key: "location", placeholder: "e.g. Beirut, Dubai, Kuwait City..." },
          ] : [
            { label: "Your Target Audience", key: "b2cTarget", placeholder: "e.g. Fitness enthusiasts aged 25-40 in Dubai who want to lose weight..." },
          ]),
        ].map((f, i) => (
          <div key={i} style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.muted, marginBottom: "8px", letterSpacing: "1px", textTransform: "uppercase" }}>{f.label}</label>
            {f.key === "whatYouDo" || f.key === "b2cTarget" ? (
              <textarea value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                style={{ width: "100%", padding: "12px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "13px", minHeight: "80px", resize: "vertical", fontFamily: "Inter, sans-serif" }} />
            ) : (
              <input value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                style={{ width: "100%", padding: "12px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "13px" }} />
            )}
          </div>
        ))}
        {safeMode === "b2c" && (
          <div style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.muted, marginBottom: "8px", letterSpacing: "1px", textTransform: "uppercase" }}>Ad Platform</label>
            <div style={{ display: "flex", gap: "10px" }}>
              {["Meta Ads", "TikTok Ads", "Google Ads", "Other"].map(p => (
                <button key={p} onClick={() => setProfile(pr => ({ ...pr, b2cPlatform: p }))}
                  style={{ padding: "8px 16px", borderRadius: "8px", border: `1px solid ${profile.b2cPlatform === p ? C.b2cBorder : C.border}`, background: profile.b2cPlatform === p ? C.b2cGlow : "transparent", color: profile.b2cPlatform === p ? C.b2cLight : C.muted, cursor: "pointer", fontSize: "12px", fontWeight: "600", transition: "all 0.2s" }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {profileErr && <div style={{ color: "#F87171", fontSize: "13px", marginBottom: "16px" }}>{profileErr}</div>}
        <button onClick={doProfile}
          style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg, ${safeMode === "b2b" ? C.b2b : C.b2c}, ${safeMode === "b2b" ? C.b2bLight : C.b2cLight})`, border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", boxShadow: `0 4px 20px ${safeMode === "b2b" ? C.b2bGlow : C.b2cGlow}` }}>
          Launch PitchMind →
        </button>
      </div>
    </div>
  );

  // ── DASHBOARD ──
  if (screen !== "dashboard") return null;
  if (!userData) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter, sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "24px", fontWeight: "900", letterSpacing: "4px", background: `linear-gradient(135deg, ${C.b2bLight}, ${C.b2cLight})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "24px" }}>PITCHMIND</div>
        <LoadingDots />
      </div>
    </div>
  );
  const safeMode = mode || "b2b";
  const accentColor = safeMode === "b2b" ? C.b2bLight : C.b2cLight;
  const accentGlow = safeMode === "b2b" ? C.b2bGlow : C.b2cGlow;
  const accentBorder = safeMode === "b2b" ? C.b2bBorder : C.b2cBorder;
  const hotCount = savedLeads.filter(l => l.score >= 80).length;
  const closedCount = savedLeads.filter(l => l.status === "closed").length;
  const pipelineCount = savedLeads.filter(l => ["contacted", "inprogress"].includes(l.status)).length;
  const creditPct = userData ? Math.round((userData.credits / userData.maxCredits) * 100) : 0;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter, sans-serif", color: C.white }}>
      <style>{CSS}</style>

      {/* HEADER */}
      <div style={{ padding: "0 32px", height: "60px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(8,11,15,0.95)", borderBottom: `1px solid ${C.border}`, backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
          <div onClick={() => setScreen("dashboard")} style={{ fontSize: "16px", fontWeight: "900", letterSpacing: "3px", background: `linear-gradient(135deg, ${C.b2bLight}, ${C.b2cLight})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", cursor: "pointer", textTransform: "uppercase" }}>PITCHMIND</div>
          <div style={{ padding: "3px 10px", background: safeMode === "b2b" ? C.b2bGlow : C.b2cGlow, border: `1px solid ${accentBorder}`, borderRadius: "20px", fontSize: "11px", fontWeight: "700", color: accentColor, letterSpacing: "1px", textTransform: "uppercase" }}>
            {safeMode === "b2b" ? "🏢 B2B" : "👥 B2C"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {/* Credits */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 14px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "10px" }}>
            <div style={{ width: "60px", height: "4px", background: C.bg3, borderRadius: "4px", overflow: "hidden" }}>
              <div style={{ width: `${creditPct}%`, height: "100%", background: `linear-gradient(90deg, ${C.b2bLight}, ${C.b2cLight})`, borderRadius: "4px", transition: "width 0.5s" }} />
            </div>
            <span style={{ fontSize: "12px", fontWeight: "700", color: accentColor }}>{userData?.credits}</span>
            <span style={{ fontSize: "11px", color: C.dim }}>/ {userData?.maxCredits} credits</span>
          </div>
          <button onClick={() => { const newMode = safeMode === "b2b" ? "b2c" : "b2b"; setMode(newMode); updateDoc(doc(db, "users", user.uid), { mode: newMode }); }}
            style={{ padding: "6px 12px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "11px", fontWeight: "600" }}>
            Switch to {safeMode === "b2b" ? "B2C" : "B2B"}
          </button>
          <button onClick={() => setScreen("profile")} style={{ padding: "6px 12px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "11px" }}>Settings</button>
          <button onClick={doLogout} style={{ padding: "6px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.dim, cursor: "pointer", fontSize: "11px" }}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "32px 32px" }}>

        {/* Low credits warning */}
        {userData?.credits <= 5 && userData?.credits > 0 && (
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "12px", padding: "12px 20px", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#FCD34D" }}>
            ⚠️ Only {userData.credits} credits remaining
            <button style={{ padding: "5px 14px", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", color: "#FCD34D", cursor: "pointer", fontSize: "12px", fontWeight: "700" }}>Upgrade →</button>
          </div>
        )}
        {userData?.credits === 0 && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", padding: "12px 20px", marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#F87171" }}>
            ❌ No credits remaining — upgrade to continue
            <button style={{ padding: "5px 14px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#F87171", cursor: "pointer", fontSize: "12px", fontWeight: "700" }}>Upgrade Now →</button>
          </div>
        )}

        {/* STATS ROW */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "28px" }}>
          {[
            { label: "SAVED LEADS", value: savedLeads.length, color: accentColor },
            { label: "HOT LEADS 🔥", value: hotCount, color: C.hot },
            { label: "IN PIPELINE", value: pipelineCount, color: C.warm },
            { label: "CLOSED WON", value: closedCount, color: C.cold },
          ].map(({ label, value, color }) => (
            <div key={label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "20px 24px" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: C.dim, letterSpacing: "1.5px", marginBottom: "10px", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: "36px", fontWeight: "900", color, lineHeight: 1 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "28px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "5px" }}>
          {[
            { key: "scan", label: safeMode === "b2b" ? "🔍 Scan Businesses" : "📤 Upload Ad Data" },
            { key: "saved", label: `💾 My Leads${savedLeads.length > 0 ? ` (${savedLeads.length})` : ""}` },
          ].map(t => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); if (t.key === "saved" && user) loadLeads(user.uid); }}
              style={{ flex: 1, padding: "10px", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "13px", fontWeight: "700", transition: "all 0.2s", background: activeTab === t.key ? `linear-gradient(135deg, ${safeMode === "b2b" ? C.b2b : C.b2c}, ${safeMode === "b2b" ? C.b2bLight : C.b2cLight})` : "transparent", color: activeTab === t.key ? "#fff" : C.muted, boxShadow: activeTab === t.key ? `0 2px 12px ${accentGlow}` : "none" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── SCAN TAB ── */}
        {activeTab === "scan" && (
          <>
            {/* B2B SCAN */}
            {safeMode === "b2b" && (
              <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "24px", marginBottom: "28px" }}>
                <div style={{ fontSize: "11px", fontWeight: "800", color: accentColor, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "18px" }}>⚡ SCAN FOR HOT LEADS <span style={{ color: C.dim, fontWeight: "400", textTransform: "none", letterSpacing: "0" }}>— 1 credit per scan</span></div>
                <div style={{ display: "flex", gap: "14px", alignItems: "flex-end", flexWrap: "wrap" }}>
                  {[
                    { label: "Target Industry", key: "targetIndustry", ph: "Restaurants, Clinics, Real Estate..." },
                    { label: "Location", key: "location", ph: "Beirut, Dubai, Kuwait City..." },
                  ].map(f => (
                    <div key={f.key} style={{ flex: 1, minWidth: "200px" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.dim, marginBottom: "8px", letterSpacing: "1px", textTransform: "uppercase" }}>{f.label}</label>
                      <input value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph}
                        style={{ width: "100%", padding: "11px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "13px" }} />
                    </div>
                  ))}
                  <button onClick={scanB2B} disabled={scanning || userData?.credits === 0}
                    style={{ padding: "11px 28px", background: scanning || userData?.credits === 0 ? C.bg3 : `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "10px", color: scanning || userData?.credits === 0 ? C.dim : "#fff", fontSize: "13px", fontWeight: "700", cursor: scanning || userData?.credits === 0 ? "not-allowed" : "pointer", whiteSpace: "nowrap", boxShadow: scanning ? "none" : `0 4px 16px ${C.b2bGlow}`, transition: "all 0.2s" }}>
                    {scanning ? "Scanning..." : "Find Leads →"}
                  </button>
                </div>
                {scanProgress && <div style={{ marginTop: "14px", fontSize: "12px", color: accentColor, display: "flex", alignItems: "center", gap: "8px" }}><LoadingDots color={accentColor} />{scanProgress}</div>}
                {scanErr && <div style={{ color: "#F87171", fontSize: "12px", marginTop: "10px", padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: "8px" }}>{scanErr}</div>}
                {savedLeads.length > 0 && (
                  <div style={{ marginTop: "16px", display: "flex", gap: "8px" }}>
                    <button onClick={() => exportCSV(savedLeads)} style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "11px", fontWeight: "600" }}>📊 Export CSV</button>
                  </div>
                )}
              </div>
            )}

            {/* B2C UPLOAD */}
            {safeMode === "b2c" && (
              <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "28px", marginBottom: "28px" }}>
                <div style={{ fontSize: "11px", fontWeight: "800", color: accentColor, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>📤 UPLOAD YOUR AD DATA</div>
                <div style={{ fontSize: "13px", color: C.muted, marginBottom: "24px" }}>Upload a CSV export from {profile.b2cPlatform} — AI will score and analyze every contact</div>

                {/* How to export guide */}
                <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "18px", marginBottom: "24px" }}>
                  <div style={{ fontSize: "11px", fontWeight: "700", color: C.dim, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "12px" }}>What CSV files work with PitchMind</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                    {([
                      { step: "📊", text: "Meta Campaign Reports (Ads Manager → Reports → Export)" },
                      { step: "👤", text: "Meta Lead Ads (Ads Manager → Download Leads)" },
                      { step: "🎵", text: "TikTok Ads Reports (TikTok Ads Manager → Export)" },
                      { step: "🔍", text: "Google Ads Reports (Google Ads → Reports → Download)" },
                    ]).map(({ step, text }) => (
                      <div key={step} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                        <div style={{ width: "22px", height: "22px", borderRadius: "50%", background: accentGlow, border: `1px solid ${accentBorder}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "800", color: accentColor, flexShrink: 0 }}>{step}</div>
                        <div style={{ fontSize: "12px", color: C.muted }}>{text}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Upload area */}
                <div onClick={() => fileRef.current?.click()}
                  style={{ border: `2px dashed ${csvName ? accentBorder : C.border}`, borderRadius: "14px", padding: "40px", textAlign: "center", cursor: "pointer", background: csvName ? accentGlow : "transparent", transition: "all 0.2s", marginBottom: "20px" }}>
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
                  <div style={{ fontSize: "32px", marginBottom: "12px" }}>{csvName ? "✅" : "📂"}</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "6px", color: csvName ? accentColor : C.white }}>
                    {csvName ? csvName : "Click to upload CSV file"}
                  </div>
                  <div style={{ fontSize: "12px", color: C.dim }}>
                    {csvData.length > 0 ? (
                      <span style={{ color: "#34D399" }}>✅ {csvData.length} rows loaded — AI will auto-detect format</span>
                    ) : (
                      <span>Supports: Meta Lead Ads, Campaign Reports, TikTok Ads, Google Ads, or any CSV</span>
                    )}
                  </div>
                </div>

                {/* Platform selector */}
                <div style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                  {["Meta Ads", "TikTok Ads", "Google Ads", "Other"].map(p => (
                    <button key={p} onClick={() => setProfile(pr => ({ ...pr, b2cPlatform: p }))}
                      style={{ padding: "7px 14px", borderRadius: "8px", border: `1px solid ${profile.b2cPlatform === p ? accentBorder : C.border}`, background: profile.b2cPlatform === p ? accentGlow : "transparent", color: profile.b2cPlatform === p ? accentColor : C.dim, cursor: "pointer", fontSize: "12px", fontWeight: "600", transition: "all 0.2s" }}>
                      {p}
                    </button>
                  ))}
                </div>

                <button onClick={processCSV} disabled={csvProcessing || csvData.length === 0 || userData?.credits === 0}
                  style={{ width: "100%", padding: "13px", background: csvData.length === 0 || csvProcessing ? C.bg3 : `linear-gradient(135deg, ${C.b2c}, ${C.b2cLight})`, border: "none", borderRadius: "10px", color: csvData.length === 0 || csvProcessing ? C.dim : "#fff", fontSize: "14px", fontWeight: "700", cursor: csvData.length === 0 || csvProcessing ? "not-allowed" : "pointer", boxShadow: csvData.length > 0 ? `0 4px 20px ${C.b2cGlow}` : "none", transition: "all 0.2s" }}>
                  {csvProcessing ? `Analyzing ${csvData.length} contacts...` : csvData.length > 0 ? `Analyze ${csvData.length} Contacts with AI →` : "Upload a CSV file to continue"}
                </button>

                {csvProgress && <div style={{ marginTop: "14px", fontSize: "12px", color: accentColor, display: "flex", alignItems: "center", gap: "8px" }}><LoadingDots color={accentColor} />{csvProgress}</div>}
                {csvErr && <div style={{ color: "#F87171", fontSize: "12px", marginTop: "10px", padding: "10px 14px", background: "rgba(239,68,68,0.08)", borderRadius: "8px" }}>{csvErr}</div>}
              </div>
            )}

            {/* SCANNING */}
            {(scanning || csvProcessing) && safeMode === "b2b" && (
              <div style={{ textAlign: "center", padding: "60px" }}>
                <div style={{ marginBottom: "20px" }}><LoadingDots color={accentColor} /></div>
                <div style={{ fontSize: "16px", fontWeight: "700", marginBottom: "8px" }}>
                  {mode === "b2b" ? `Hunting weak ${profile.targetIndustry || "businesses"} in ${profile.location || "your area"}...` : `Analyzing your ad data with AI...`}
                </div>
                <div style={{ fontSize: "13px", color: C.dim }}>{scanProgress || csvProgress}</div>
              </div>
            )}

            {/* LEADS GRID */}
            {leads.length > 0 && !scanning && !csvProcessing && (
              <>
                <div style={{ fontSize: "13px", fontWeight: "700", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "16px" }}>
                  ⚡ {leads.length} Leads Found — Auto-saved ✅
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))", gap: "16px" }}>
                  {[...leads].sort((a, b) => b.score - a.score).map((lead, i) => {
                    const sc = scoreColor(lead.score);
                    const saved = savedLeads.find(s => s.name === lead.name);
                    return <LeadCard key={i} lead={lead} saved={saved} sc={sc} mode={mode} accentColor={accentColor} accentGlow={accentGlow} onReport={() => loadReport(saved || lead)} />;
                  })}
                </div>
              </>
            )}

            {/* EMPTY STATE */}
            {leads.length === 0 && !scanning && !csvProcessing && (
              <div style={{ textAlign: "center", padding: "80px 24px" }}>
                <div style={{ fontSize: "52px", marginBottom: "16px" }}>{mode === "b2b" ? "🎯" : "📊"}</div>
                <div style={{ fontSize: "22px", fontWeight: "900", marginBottom: "10px", letterSpacing: "-0.5px" }}>
                  {mode === "b2b" ? "READY TO FIND LEADS?" : "READY TO ANALYZE YOUR DATA?"}
                </div>
                <div style={{ fontSize: "14px", color: C.dim, marginBottom: "48px" }}>
                  {mode === "b2b" ? "Enter target industry & location to find businesses that need you" : "Upload your Meta or TikTok ad data to find your hottest prospects"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", maxWidth: "640px", margin: "0 auto" }}>
                  {(mode === "b2b" ? [
                    { icon: "🔍", title: "SMART SCANNING", desc: "AI finds businesses weak in what you offer" },
                    { icon: "🧠", title: "DEEP INTEL", desc: "Psychology, objections & pitch strategy" },
                    { icon: "💾", title: "AUTO-SAVED", desc: "Every lead saved to your CRM instantly" },
                  ] : [
                    { icon: "📤", title: "UPLOAD DATA", desc: "Your Meta/TikTok ad engagement data" },
                    { icon: "🤖", title: "AI ANALYSIS", desc: "Claude scores every contact HOT/WARM/COLD" },
                    { icon: "✉️", title: "DM TEMPLATES", desc: "Personalized message for each person" },
                  ]).map((f, i) => (
                    <div key={i} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "22px 18px" }}>
                      <div style={{ fontSize: "28px", marginBottom: "12px" }}>{f.icon}</div>
                      <div style={{ fontSize: "10px", fontWeight: "800", color: accentColor, letterSpacing: "2px", marginBottom: "8px" }}>{f.title}</div>
                      <div style={{ fontSize: "12px", color: C.dim, lineHeight: "1.5" }}>{f.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── SAVED LEADS TAB ── */}
        {activeTab === "saved" && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", flexWrap: "wrap", gap: "12px" }}>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button onClick={() => loadLeads(user.uid)} style={{ padding: "6px 14px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>🔄 Refresh</button>
                {["all", "new", "contacted", "inprogress", "closed", "lost"].map(s => {
                  const count = s === "all" ? savedLeads.length : savedLeads.filter(l => l.status === s).length;
                  const st = STATUS_OPTIONS.find(o => o.value === s);
                  return (
                    <button key={s} onClick={() => setSavedFilter(s)}
                      style={{ padding: "6px 14px", borderRadius: "20px", border: `1px solid ${savedFilter === s ? C.b2bLight : C.border}`, background: savedFilter === s ? C.b2bGlow : "transparent", color: savedFilter === s ? C.b2bLight : C.dim, cursor: "pointer", fontSize: "12px", fontWeight: "600", transition: "all 0.2s" }}>
                      {s === "all" ? `All (${count})` : `${st?.label} (${count})`}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => exportCSV(savedLeads)} style={{ padding: "7px 16px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>📊 Export All CSV</button>
            </div>

            {(savedFilter === "all" ? savedLeads : savedLeads.filter(l => l.status === savedFilter)).length === 0 && savedLeads.length > 0 && (
              <div style={{ textAlign: "center", padding: "40px", color: C.dim, fontSize: "14px" }}>No leads with this status yet</div>
            )}
            {savedLeads.length === 0 ? (
              <div style={{ textAlign: "center", padding: "80px 24px" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>💾</div>
                <div style={{ fontSize: "20px", fontWeight: "800", marginBottom: "8px" }}>NO SAVED LEADS YET</div>
                <div style={{ fontSize: "13px", color: C.dim, marginBottom: "24px" }}>Run a scan and leads will appear here automatically</div>
                <button onClick={() => setActiveTab("scan")} style={{ padding: "11px 28px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Start Scanning →</button>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px,1fr))", gap: "16px" }}>
                {(savedFilter === "all" ? savedLeads : savedLeads.filter(l => l.status === savedFilter)).map((lead, i) => {
                  const sc = scoreColor(lead.score);
                  return (
                    <SavedLeadCard key={i} lead={lead} sc={sc} mode={lead.mode || mode} accentColor={accentColor}
                      onReport={() => loadReport(lead)}
                      onStatus={(status) => updateStatus(lead.id, status)}
                      onNotes={(notes) => updateNotes(lead.id, notes)}
                      onDelete={() => deleteLead(lead.id)} />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* INTELLIGENCE MODAL */}
      {selectedLead && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
          onClick={e => e.target === e.currentTarget && setSelectedLead(null)}>
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "36px", maxWidth: "760px", width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 25px 60px rgba(0,0,0,0.7)" }}>
            <button onClick={() => setSelectedLead(null)}
              style={{ position: "absolute", top: "16px", right: "16px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, width: "32px", height: "32px", cursor: "pointer", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>

            <div style={{ marginBottom: "24px" }}>
              <div style={{ fontSize: "22px", fontWeight: "800", marginBottom: "4px" }}>{selectedLead.name}</div>
              <div style={{ fontSize: "13px", color: C.muted, marginBottom: "16px" }}>
                {selectedLead.leadType === "b2c" ? `${selectedLead.platform} • ${selectedLead.engagement}` : `${selectedLead.type} · ${selectedLead.location}`}
              </div>

              {/* Status */}
              {selectedLead.id && (
                <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "16px" }}>
                  {STATUS_OPTIONS.map(s => (
                    <button key={s.value} onClick={() => updateStatus(selectedLead.id, s.value)}
                      style={{ padding: "4px 12px", borderRadius: "8px", border: `1px solid ${selectedLead.status === s.value ? s.color : C.border}`, background: selectedLead.status === s.value ? s.bg : "transparent", color: selectedLead.status === s.value ? s.color : C.dim, cursor: "pointer", fontSize: "11px", fontWeight: "600", transition: "all 0.2s" }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              {/* Contact info grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "16px" }}>
                {selectedLead.leadType === "b2c" ? [
                  ["📱 Platform", selectedLead.platform],
                  ["📍 Location", selectedLead.location || "N/A"],
                  ["🎯 Interest Level", selectedLead.interestLevel || "High"],
                  ["💬 Best Approach", selectedLead.bestApproach || "DM"],
                ] : [
                  ["📞 Phone", selectedLead.phone || "N/A"],
                  ["⭐ Rating", `${selectedLead.rating}/5 (${selectedLead.reviews} reviews)`],
                  ["🌐 Website", selectedLead.website || "No website"],
                  ["📍 Address", selectedLead.address || "N/A"],
                ].map(([lbl, val]) => (
                  <div key={lbl} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 14px" }}>
                    <div style={{ fontSize: "10px", color: accentColor, fontWeight: "700", letterSpacing: "0.5px", marginBottom: "4px", textTransform: "uppercase" }}>{lbl}</div>
                    <div style={{ fontSize: "13px", color: C.white }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Notes */}
              {selectedLead.id && (
                <textarea value={selectedLead.notes || ""} onChange={e => updateNotes(selectedLead.id, e.target.value)} placeholder="Add notes..."
                  style={{ width: "100%", padding: "12px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "13px", resize: "vertical", minHeight: "60px", fontFamily: "Inter, sans-serif", marginBottom: "16px" }} />
              )}
            </div>

            {selectedLead.loading && (
              <div style={{ textAlign: "center", padding: "40px" }}>
                <LoadingDots color={accentColor} />
                <div style={{ color: C.muted, marginTop: "12px", fontSize: "13px" }}>Building intelligence report...</div>
              </div>
            )}

            {selectedLead.reportErr && (
              <div style={{ color: "#F87171", padding: "14px", background: "rgba(239,68,68,0.08)", borderRadius: "10px", fontSize: "13px" }}>{selectedLead.reportErr}</div>
            )}

            {selectedLead.report && (() => {
              const r = selectedLead.report;
              const isB2C = selectedLead.leadType === "b2c";
              const sections = isB2C ? [
                ["👤 Profile Analysis", r.profileAnalysis],
                ["🧠 Psychological Profile", r.psychologicalProfile],
                ["📈 Buying Signals", r.buyingSignals],
                ["🛡️ Objections & How To Handle", r.likelyObjections],
                ["🎯 Pitch Strategy", r.pitchStrategy],
                ["💬 Opening Message", r.openingMessage],
                ["📅 Follow-Up Sequence", r.followUpSequence],
                ["🔑 Closing Script", r.closingScript],
                ["⏰ Best Time To Reach Out", r.bestTime],
                ["⚡ #1 Conversion Tip", r.conversionTip],
              ] : [
                ["🏢 Company Overview", r.companyOverview],
                ["⚠️ Weakness Analysis", r.weaknessAnalysis],
                ["👤 Decision Maker Profile", r.decisionMaker],
                ["🧠 Psychological Profile", r.emotionalProfile],
                ["🛡️ Expected Objections", r.objections],
                ["🎯 Pitch Strategy", r.pitchStrategy],
                ["💬 Perfect Opening Line", r.openingLine],
                ["🔑 Closing Angle", r.closingAngle],
                ["✉️ Cold Email Template", r.emailTemplate],
              ];
              return sections.filter(([_, v]) => v).map(([title, content], i) => (
                <div key={i} style={{ marginBottom: "18px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "800", color: accentColor, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "8px", paddingBottom: "6px", borderBottom: `1px solid ${C.border}` }}>{title}</div>
                  <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "16px", fontSize: "13px", lineHeight: "1.8", color: "rgba(240,246,252,0.8)", whiteSpace: "pre-wrap" }}>{content}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── LEAD CARD (Scan Results) ─────────────────────────────────────────────
function LeadCard({ lead, saved, sc, mode, accentColor, accentGlow, onReport }) {
  if (!lead) return null;
  const isB2C = lead.leadType === "b2c" || mode === "b2c";
  return (
    <div style={{ background: "#0D1117", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", transition: "all 0.2s", cursor: "default" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(0,0,0,0.4)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div style={{ flex: 1, paddingRight: "10px" }}>
          <div style={{ fontSize: "15px", fontWeight: "800", marginBottom: "3px", letterSpacing: "0.2px" }}>{lead.name}</div>
          <div style={{ fontSize: "11px", color: accentColor, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            {isB2C ? lead.platform : `${lead.type} · ${lead.location}`}
          </div>
        </div>
        <div style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: "8px", padding: "4px 10px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: "9px", fontWeight: "800", letterSpacing: "1px" }}>{sc.label}</div>
          <div style={{ fontSize: "16px", fontWeight: "900", lineHeight: 1.1 }}>{lead.score}</div>
        </div>
      </div>

      {isB2C ? (
        <div style={{ marginBottom: "10px" }}>
          {lead.keyMetric && <div style={{ fontSize: "11px", color: "#FCD34D", marginBottom: "3px", fontWeight: "600" }}>📊 {lead.keyMetric}</div>}
          <div style={{ fontSize: "11px", color: "rgba(240,246,252,0.45)", marginBottom: "2px", lineHeight: "1.4" }}>📱 {lead.engagement}</div>
          {lead.location && lead.location !== "N/A" && <div style={{ fontSize: "11px", color: "rgba(240,246,252,0.35)" }}>📍 {lead.location}</div>}
          {lead.bestApproach && <div style={{ fontSize: "11px", color: accentColor, marginTop: "3px", fontWeight: "600" }}>💬 {lead.bestApproach}</div>}
          {lead.dataType === "campaigns" && lead.strategy && <div style={{ fontSize: "11px", color: "#34D399", marginTop: "3px" }}>🎯 {lead.strategy}</div>}
        </div>
      ) : (
        <div style={{ marginBottom: "10px" }}>
          {lead.phone && <div style={{ fontSize: "12px", color: "rgba(240,246,252,0.5)", marginBottom: "2px" }}>📞 {lead.phone}</div>}
          {lead.website === "No website" ? (
            <div style={{ fontSize: "12px", color: "#F87171", marginBottom: "2px" }}>🌐 ❌ No website</div>
          ) : (
            <a href={lead.website?.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: "12px", color: accentColor, marginBottom: "2px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              🌐 {lead.website?.replace(/https?:\/\//, "")} ↗
            </a>
          )}
          <div style={{ fontSize: "12px", color: "rgba(240,246,252,0.3)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {lead.address}</div>
          {lead.rating && <div style={{ fontSize: "12px", color: "#FCD34D", marginTop: "3px" }}>⭐ {lead.rating}/5 ({lead.reviews} reviews)</div>}
        </div>
      )}

      {lead.weaknesses && lead.weaknesses.length > 0 && (
        <div style={{ marginBottom: "10px", display: "flex", flexWrap: "wrap", gap: "4px" }}>
          {lead.weaknesses.map((w, i) => (
            <span key={i} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: "5px", padding: "2px 7px", fontSize: "10px", color: "#F87171", fontWeight: "600" }}>⚠ {w}</span>
          ))}
        </div>
      )}

      <div style={{ fontSize: "12px", color: "rgba(240,246,252,0.6)", lineHeight: "1.6", marginBottom: "14px", flexGrow: 1 }}>{lead.painPoint}</div>

      {saved && <div style={{ fontSize: "10px", color: "#34D399", marginBottom: "8px", fontWeight: "600" }}>✅ Saved to My Leads</div>}

      <button onClick={onReport}
        style={{ width: "100%", padding: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: accentColor, fontSize: "12px", fontWeight: "700", cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.3px" }}
        onMouseEnter={e => { e.currentTarget.style.background = accentGlow; e.currentTarget.style.borderColor = accentColor; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}>
        Get Full Intelligence Report → <span style={{ opacity: 0.5, fontSize: "10px" }}>(1 credit)</span>
      </button>
    </div>
  );
}

// ── SAVED LEAD CARD ──────────────────────────────────────────────────────
function SavedLeadCard({ lead, sc, mode, accentColor, onReport, onStatus, onNotes, onDelete }) {
  if (!lead) return null;
  const sc2 = sc || { bg: "rgba(239,68,68,0.12)", color: "#F87171", border: "rgba(239,68,68,0.25)", label: "HOT" };
  const isB2C = lead.leadType === "b2c" || lead.mode === "b2c";
  const st = STATUS_OPTIONS.find(s => s.value === lead.status) || STATUS_OPTIONS[0];
  return (
    <div style={{ background: "#0D1117", border: `1px solid ${lead.status === "closed" ? "rgba(16,185,129,0.2)" : lead.status === "inprogress" ? "rgba(245,158,11,0.15)" : "rgba(255,255,255,0.06)"}`, borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", transition: "border 0.2s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div style={{ flex: 1, paddingRight: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: "800", marginBottom: "2px" }}>{lead.name}</div>
          <div style={{ fontSize: "11px", color: accentColor, fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            {isB2C ? (lead.platform || "N/A") : `${lead.type || ""} · ${lead.location || ""}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
          <div style={{ background: sc2.bg, color: sc2.color, border: `1px solid ${sc2.border}`, borderRadius: "6px", padding: "3px 8px", textAlign: "center" }}>
            <div style={{ fontSize: "8px", fontWeight: "800", letterSpacing: "0.5px" }}>{sc2.label}</div>
            <div style={{ fontSize: "14px", fontWeight: "900", lineHeight: 1.1 }}>{lead.score || 0}</div>
          </div>
          <button onClick={onDelete} style={{ width: "28px", height: "28px", background: "transparent", border: `1px solid rgba(239,68,68,0.2)`, borderRadius: "6px", color: "rgba(239,68,68,0.5)", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑</button>
        </div>
      </div>

      {/* Contact info */}
      <div style={{ marginBottom: "10px" }}>
        {isB2C ? (
          <>
            <div style={{ fontSize: "11px", color: "rgba(240,246,252,0.45)", marginBottom: "2px" }}>📱 {lead.engagement}</div>
            {lead.bestApproach && <div style={{ fontSize: "11px", color: accentColor }}>💬 {lead.bestApproach}</div>}
          </>
        ) : (
          <>
            {lead.phone && <div style={{ fontSize: "11px", color: "rgba(240,246,252,0.45)", marginBottom: "2px" }}>📞 {lead.phone}</div>}
            {lead.website === "No website" ? (
              <div style={{ fontSize: "11px", color: "#F87171", marginBottom: "2px" }}>🌐 ❌ No website</div>
            ) : (
              <a href={lead.website?.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: "11px", color: accentColor, marginBottom: "2px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                🌐 {lead.website?.replace(/https?:\/\//, "")} ↗
              </a>
            )}
            {lead.rating && <div style={{ fontSize: "11px", color: "#FCD34D" }}>⭐ {lead.rating}/5</div>}
          </>
        )}
      </div>

      {/* Status */}
      <div style={{ marginBottom: "10px" }}>
        <div style={{ fontSize: "10px", color: "rgba(240,246,252,0.3)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "6px" }}>STATUS</div>
        <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
          {STATUS_OPTIONS.map(s => (
            <button key={s.value} onClick={() => onStatus(s.value)}
              style={{ padding: "3px 8px", borderRadius: "6px", border: `1px solid ${lead.status === s.value ? s.color : "rgba(255,255,255,0.06)"}`, background: lead.status === s.value ? s.bg : "transparent", color: lead.status === s.value ? s.color : "rgba(240,246,252,0.25)", cursor: "pointer", fontSize: "10px", fontWeight: "600", transition: "all 0.15s" }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <textarea value={lead.notes || ""} onChange={e => onNotes(e.target.value)} placeholder="Add notes about this lead..."
        style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", color: "rgba(240,246,252,0.7)", fontSize: "12px", resize: "vertical", minHeight: "56px", fontFamily: "Inter, sans-serif", marginBottom: "10px", outline: "none" }} />

      <button onClick={onReport}
        style={{ width: "100%", padding: "9px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: accentColor, fontSize: "12px", fontWeight: "700", cursor: "pointer", transition: "all 0.2s" }}
        onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
        onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
        {lead.report ? "View Report 📋" : "Get Intelligence Report →"}
      </button>
    </div>
  );
}

export default function PitchMind() {
  return <ErrorBoundary><PitchMindInner /></ErrorBoundary>;
}
