import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, getDocs, deleteDoc, query, where } from "firebase/firestore";

const C = {
  bg: "#080B0F", bg2: "#0D1117", bg3: "#161B22",
  border: "rgba(255,255,255,0.06)", borderHover: "rgba(255,255,255,0.12)",
  b2b: "#2563EB", b2bLight: "#3B82F6", b2bGlow: "rgba(37,99,235,0.15)", b2bBorder: "rgba(37,99,235,0.3)",
  b2c: "#7C3AED", b2cLight: "#8B5CF6", b2cGlow: "rgba(124,58,237,0.15)", b2cBorder: "rgba(124,58,237,0.3)",
  gold: "#F59E0B", goldLight: "#FCD34D", goldGlow: "rgba(245,158,11,0.15)",
  hot: "#EF4444", warm: "#F59E0B", cold: "#10B981",
  comp: "#059669", compLight: "#10B981", compGlow: "rgba(5,150,105,0.15)", compBorder: "rgba(5,150,105,0.3)",
  camp: "#D97706", campLight: "#F59E0B", campGlow: "rgba(217,119,6,0.15)", campBorder: "rgba(217,119,6,0.3)",
  white: "#F0F6FC", muted: "rgba(240,246,252,0.5)", dim: "rgba(240,246,252,0.25)",
};

const PLANS = {
  starter: { name: "Starter", price: 99, credits: 50, sessions: 10, leads: 60, color: C.b2bLight, desc: "Perfect for freelancers & solopreneurs", features: ["10 sessions/month", "60 leads + AI reports", "B2B + B2C intelligence", "Competitor Radar", "Campaign Builder", "One-click WhatsApp & Email", "CRM pipeline", "CSV export"] },
  growth: { name: "Growth", price: 199, credits: 125, sessions: 25, leads: 150, color: C.b2cLight, desc: "For growing small businesses", features: ["25 sessions/month", "150 leads + AI reports", "Everything in Starter", "Website scoring (0-100)", "Higgsfield creative (coming soon)", "Priority support"] },
  pro: { name: "Pro", price: 349, credits: 300, sessions: 60, leads: 360, color: C.gold, desc: "For agencies & power users", features: ["60 sessions/month", "360 leads + AI reports", "Everything in Growth", "Competitor deep analysis", "Full campaign packages", "Dedicated support"] },
};

const CREDITS_PER_SESSION = 5;

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

function safeStr(val) {
  if (!val) return null;
  if (typeof val === "string") return val;
  if (typeof val === "object") return Object.entries(val).map(([k, v]) => `${k}: ${v}`).join("\n");
  return String(val);
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

function detectCSVType(headers) {
  const h = headers.join(" ").toLowerCase();
  if (h.includes("email") || h.includes("phone") || (h.includes("first") && h.includes("last"))) return "leads";
  if (h.includes("campaign name") || h.includes("impressions") || h.includes("amount spent")) return "campaigns";
  if (h.includes("tiktok") || h.includes("video views") || h.includes("cpm")) return "tiktok";
  if (h.includes("keyword") || h.includes("quality score") || h.includes("search term")) return "google";
  return "engagement";
}

function exportToCSV(data, filename = "pitchmind-leads.csv") {
  if (!data.length) return;
  const headers = Object.keys(data[0]).filter(k => !["id", "userId", "report"].includes(k));
  const rows = data.map(r => headers.map(h => `"${String(r[h] || "").replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
}

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
@keyframes fadeUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#080B0F;color:#F0F6FC;font-family:'Inter',sans-serif}
::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.1);border-radius:4px}
input::placeholder,textarea::placeholder{color:rgba(240,246,252,0.2)}
input:focus,textarea:focus{outline:none}a{text-decoration:none}
`;

function LoadingDots({ color = C.b2bLight }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: "6px", padding: "8px" }}>
      {[0, 0.15, 0.3].map((d, i) => (
        <span key={i} style={{ width: "7px", height: "7px", borderRadius: "50%", background: color, animation: `pulse 1.2s ease-in-out infinite`, animationDelay: `${d}s` }} />
      ))}
    </div>
  );
}

// Error Boundary
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  render() {
    if (this.state.error) return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif", color: "#fff", padding: "40px" }}>
        <div style={{ maxWidth: "600px", textAlign: "center" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>⚠️</div>
          <div style={{ fontSize: "18px", fontWeight: "700", color: "#F87171", marginBottom: "12px" }}>Something went wrong</div>
          <div style={{ fontSize: "13px", color: C.muted, background: "rgba(239,68,68,0.1)", padding: "16px", borderRadius: "10px", textAlign: "left", wordBreak: "break-all", marginBottom: "20px" }}>{this.state.error.toString()}</div>
          <button onClick={() => window.location.reload()} style={{ padding: "10px 24px", background: C.b2b, border: "none", borderRadius: "8px", color: "#fff", cursor: "pointer", fontSize: "14px", fontWeight: "600" }}>Reload</button>
        </div>
      </div>
    );
    return this.props.children;
  }
}

function PitchMindApp() {
  const [screen, setScreen] = useState("login");
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("b2b");
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [authErr, setAuthErr] = useState(""); const [authBusy, setAuthBusy] = useState(false);
  const [selPlan, setSelPlan] = useState("starter");
  const [profile, setProfile] = useState({ businessName: "", whatYouDo: "", targetIndustry: "", location: "", b2cTarget: "", b2cPlatform: "Meta Ads", businessEmail: "", whatsappNumber: "", businessPhone: "" });
  const [profileErr, setProfileErr] = useState("");
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("pm_api_key") || "");
  const [apiInput, setApiInput] = useState(""); const [apiErr, setApiErr] = useState("");
  const [activeTab, setActiveTab] = useState("scan");
  const [leads, setLeads] = useState([]); const [savedLeads, setSavedLeads] = useState([]);
  const [scanning, setScanning] = useState(false); const [scanErr, setScanErr] = useState(""); const [scanProgress, setScanProgress] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);
  const [csvData, setCsvData] = useState([]); const [csvName, setCsvName] = useState("");
  const [csvProcessing, setCsvProcessing] = useState(false); const [csvProgress, setCsvProgress] = useState(""); const [csvErr, setCsvErr] = useState("");
  const [savedFilter, setSavedFilter] = useState("all");
  const [competitors, setCompetitors] = useState([]);
  const [compScanning, setCompScanning] = useState(false);
  const [compErr, setCompErr] = useState("");
  const [compQuery, setCompQuery] = useState({ industry: "", location: "" });
  const [selectedComp, setSelectedComp] = useState(null);
  const [campaign, setCampaign] = useState(null);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [higgsfield, setHighsfield] = useState({ apiKey: "", connected: false });
  const [showSettings, setShowSettings] = useState(false);
  const [brandSettings, setBrandSettings] = useState({ name: "PitchMind", color: C.b2bLight, logoUrl: "", tagline: "Find the lead. Win the deal." });
  const [showBrand, setShowBrand] = useState(false);
  const [websiteScores, setWebsiteScores] = useState({});
  const fileRef = useRef();

  // Load brand settings
  useEffect(() => {
    const saved = localStorage.getItem("pm_brand");
    if (saved) { try { setBrandSettings(JSON.parse(saved)); } catch (_) {} }
  }, []);

  useEffect(() => {
    const hk = localStorage.getItem("pm_higgsfield_key");
    if (hk) setHighsfield({ apiKey: hk, connected: true });
  }, []);

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
          if (d.brandSettings) setBrandSettings(d.brandSettings);
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
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.savedAt || 0) - new Date(a.savedAt || 0));
      setSavedLeads(arr);
    } catch (e) { console.log("Load error:", e); }
  };

  const saveLead = async (lead) => {
    if (!user) return null;
    try {
      // Deduplication — never save same lead twice
      const exists = savedLeads.find(s =>
        s.name?.toLowerCase() === lead.name?.toLowerCase() &&
        (s.address === lead.address || s.location === lead.location)
      );
      if (exists) return exists.id;
      const ref = await addDoc(collection(db, "leads"), { ...lead, userId: user.uid, status: "new", notes: "", mode, savedAt: new Date().toISOString() });
      const newLead = { id: ref.id, ...lead, userId: user.uid, status: "new", notes: "", mode, savedAt: new Date().toISOString() };
      setSavedLeads(prev => [newLead, ...prev]);
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
    if (selectedLead?.id === id) setSelectedLead(null);
  };

  const useCredits = async (amount = CREDITS_PER_SESSION) => {
    if (!userData || userData.credits < amount) return false;
    await updateDoc(doc(db, "users", user.uid), { credits: increment(-amount) });
    setUserData(p => ({ ...p, credits: p.credits - amount }));
    return true;
  };

  const doLogin = async () => {
    if (!email || !password) { setAuthErr("Please fill in all fields."); return; }
    setAuthBusy(true); setAuthErr("");
    try { await signInWithEmailAndPassword(auth, email, password); }
    catch (e) { setAuthErr("Invalid email or password."); }
    setAuthBusy(false);
  };

  const doSignup = async () => {
    if (!email || !password) { setAuthErr("Please fill in all fields."); return; }
    if (password.length < 6) { setAuthErr("Min 6 characters."); return; }
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
    const safeMode = mode || "b2b";
    if (!profile.businessName || !profile.whatYouDo) { setProfileErr("Please fill in all fields."); return; }
    if (safeMode === "b2b" && (!profile.targetIndustry || !profile.location)) { setProfileErr("Please fill target industry and location."); return; }
    if (safeMode === "b2c" && !profile.b2cTarget) { setProfileErr("Please describe your target audience."); return; }
    await updateDoc(doc(db, "users", user.uid), { profile, mode: safeMode });
    setUserData(p => ({ ...p, profile, mode: safeMode }));
    setProfileErr(""); setScreen("dashboard"); loadLeads(user.uid);
  };

  const saveBrandSettings = async (settings) => {
    setBrandSettings(settings);
    localStorage.setItem("pm_brand", JSON.stringify(settings));
    if (user) await updateDoc(doc(db, "users", user.uid), { brandSettings: settings });
  };

  // ── COMPETITOR SCAN ──
  const scanCompetitors = async () => {
    if (!compQuery.industry || !compQuery.location) { setCompErr("Enter industry and location."); return; }
    if (userData.credits < CREDITS_PER_SESSION) { setCompErr("Not enough credits."); return; }
    setCompErr(""); setCompScanning(true); setCompetitors([]);
    if (!await useCredits()) { setCompErr("Not enough credits."); setCompScanning(false); return; }
    try {
      const prompt = `You are PitchMind Competitor Intelligence. Find top 6 competitors.
MY BUSINESS: ${profile.businessName} | OFFERS: ${profile.whatYouDo}
ANALYZING: Top ${compQuery.industry} in ${compQuery.location}
Return ONLY valid JSON array. No markdown:
[{"name":"Competitor Name","type":"${compQuery.industry}","location":"${compQuery.location}","website":"their website or N/A","strength":85,"marketPosition":"Market leader","strongPoints":["Strong point 1","Strong point 2"],"weakPoints":["Weakness 1","Weakness 2"],"ourAdvantage":"How ${profile.businessName} can beat them","threatLevel":"High/Medium/Low","opportunityGap":"Specific gap to exploit"}]`;
      const raw = await callClaude(apiKey, prompt, 2000);
      const parsed = safeJSON(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid response");
      setCompetitors(parsed);
    } catch (e) { setCompErr(`Error: ${e.message}`); }
    setCompScanning(false);
  };

  const loadCompReport = async (comp) => {
    if (comp.report) { setSelectedComp(comp); return; }
    setSelectedComp({ ...comp, loading: true });
    try {
      const prompt = `Deep competitor analysis. MY BUSINESS: ${profile.businessName} — ${profile.whatYouDo}
COMPETITOR: ${comp.name} | ${comp.location} | Strength: ${comp.strength}/100
Return ONLY raw JSON:
{"deepAnalysis":"5-sentence deep analysis.","theirStrategy":"Their likely marketing strategy.","theirVulnerabilities":"Top 3 specific weaknesses.","howToBeatThem":"Exact strategy to win against them.","positioningMessage":"How to position ${profile.businessName} vs them.","actionPlan":"5 specific actions to gain market share.","keyLearning":"Single most important thing to learn from them."}`;
      const raw = await callClaude(apiKey, prompt, 1500);
      const parsed = safeJSON(raw);
      setSelectedComp(p => ({ ...p, loading: false, report: parsed }));
    } catch (e) { setSelectedComp(p => ({ ...p, loading: false, reportErr: e.message })); }
  };

  // ── CAMPAIGN BUILDER ──
  const buildCampaign = async (lead) => {
    setCampaignLoading(true); setCampaign(null);
    try {
      const prompt = `You are PitchMind Campaign Builder. Full ad campaign.
MY BUSINESS: ${profile.businessName} — ${profile.whatYouDo}
TARGET: ${lead.name} | ${lead.type || lead.platform || "business"} | Pain: ${lead.painPoint || "needs our services"}
Return ONLY raw JSON:
{"campaignName":"Catchy campaign name","objective":"Leads","platforms":[{"platform":"Meta Ads","format":"Reel","budget":"$20-50/day","duration":"14 days","audience":{"location":"${profile.location || "City"}","age":"25-45","interests":["interest1","interest2","interest3"]}}],"hook":"Attention-grabbing 3-second hook","caption":"Full caption with emojis 150 words max","hashtags":["#tag1","#tag2","#tag3","#tag4","#tag5","#tag6","#tag7","#tag8"],"callToAction":"Book Now","creativeDirection":"Detailed visual/video description for creative generation","a_b_test":"Version A vs Version B to test","expectedResults":"Realistic expected results","totalBudget":"$560-1400 for 14 days","timeline":"2 weeks"}`;
      const raw = await callClaude(apiKey, prompt, 1800);
      const parsed = safeJSON(raw);
      setCampaign({ ...parsed, leadName: lead.name });
    } catch (e) { console.log("Campaign error:", e); }
    setCampaignLoading(false);
  };

  // Website Scorer
  const scoreWebsite = async (lead) => {
    if (!lead.website || lead.website === "No website") return;
    if (websiteScores[lead.name]) return;
    try {
      const prompt = `You are a website analyst. Score this business website based on the URL and business context.

Business: ${lead.name}
Industry: ${lead.type || lead.industry}
Website: ${lead.website}
Location: ${lead.location || lead.address}

Based on what you know about typical businesses in this industry and the website URL (is it professional? branded? modern?), provide a website quality score.

Return ONLY raw JSON:
{"score":65,"breakdown":{"design":15,"seo":12,"mobile":10,"speed":14,"content":8,"contact":6},"issues":["No SSL certificate","No blog content","Poor mobile experience"],"opportunities":["Add booking system","Improve local SEO","Create content strategy"],"verdict":"Below average — losing customers to competitors with better digital presence"}

Score out of 100. Be realistic and harsh. Most small businesses score 30-60.`;
      const raw = await callClaude(apiKey, prompt, 800);
      const parsed = safeJSON(raw);
      setWebsiteScores(prev => ({ ...prev, [lead.name]: parsed }));
    } catch (e) { console.log("Website score error:", e); }
  };

  // B2B Scan
  const scanB2B = async () => {
    const safeMode = mode || "b2b";
    if (userData.credits < CREDITS_PER_SESSION) { setScanErr(`Need ${CREDITS_PER_SESSION} credits per session. You have ${userData.credits}.`); return; }

    // Get existing lead names for deduplication
    const existingNames = savedLeads.map(l => l.name?.toLowerCase()).filter(Boolean);

    setScanErr(""); setScanning(true); setLeads([]);
    setScanProgress("🔍 Scanning for hot leads...");
    if (!await useCredits(CREDITS_PER_SESSION)) { setScanErr("Not enough credits."); setScanning(false); return; }
    try {
      const avoidList = existingNames.length > 0 ? `\nAVOID these businesses already in client's pipeline: ${existingNames.slice(0, 20).join(", ")}` : "";
      const prompt = `You are PitchMind AI. Generate exactly 6 NEW HOT business leads as a JSON array.

MY BUSINESS: ${profile.businessName}
WHAT I OFFER: ${profile.whatYouDo}
TARGET: ${profile.targetIndustry || "businesses"} in ${profile.location || "the area"} CURRENTLY OPEN and WEAK in what I offer.
${avoidList}

Return ONLY a valid JSON array. Start with [ end with ]. No markdown.
[{"name":"Real Business Name","type":"${profile.targetIndustry}","location":"${profile.location}","address":"Real street address","phone":"Local phone","website":"website URL or No website","rating":2.8,"reviews":14,"score":88,"weaknesses":["No website","Low reviews","No social media"],"painPoint":"Why they desperately need ${profile.businessName}.","hotReason":"Why HOT right now.","isNew":true}]
Rules: 6 OPEN businesses, scores 75-95, realistic for ${profile.location}, DIFFERENT from avoided list.`;

      const raw = await callClaude(apiKey, prompt, 2000);
      const parsed = safeJSON(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid response");
      setLeads(parsed);
      for (const l of parsed) {
        const id = await saveLead({ ...l, leadType: "b2b" });
        if (l.website && l.website !== "No website") scoreWebsite(l);
      }
      setScanProgress("");
    } catch (e) { setScanErr(`Error: ${e.message}`); setScanProgress(""); }
    setScanning(false);
  };

  // B2C CSV Process
  const handleCSV = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCsvName(file.name); setCsvErr(""); setCsvData([]);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target.result);
      if (!rows.length) { setCsvErr("Could not parse CSV."); return; }
      setCsvData(rows);
    };
    reader.readAsText(file);
  };

  const processCSV = async () => {
    if (!csvData.length) { setCsvErr("Upload a CSV first."); return; }
    if (userData.credits < CREDITS_PER_SESSION) { setCsvErr(`Need ${CREDITS_PER_SESSION} credits per session.`); return; }
    setCsvProcessing(true); setCsvErr(""); setLeads([]);
    if (!await useCredits(CREDITS_PER_SESSION)) { setCsvErr("Not enough credits."); setCsvProcessing(false); return; }

    const headers = Object.keys(csvData[0] || {});
    const csvType = detectCSVType(headers);
    const sample = csvData.slice(0, 15);

    setCsvProgress(`✅ Detected: ${csvType} format — analyzing ${sample.length} rows...`);

    const getRowName = (row) => {
      const nameKeys = ["campaign name", "ad name", "name", "email", "first name", "campaign"];
      for (const k of nameKeys) {
        const val = Object.entries(row).find(([key]) => key.toLowerCase().includes(k));
        if (val?.[1]?.trim()) return val[1].trim();
      }
      return null;
    };

    const summary = sample.map((r, i) => {
      const name = getRowName(r);
      const fields = Object.entries(r).filter(([, v]) => v && v !== "0" && v !== "0.00").slice(0, 8).map(([k, v]) => `${k}: ${v}`).join(" | ");
      return `[${i + 1}] ${name ? `NAME: ${name} | ` : ""}${fields}`;
    }).join("\n");

    const typeInstructions = csvType === "leads" ? "Extract real contacts. Use actual names. Score by engagement." : csvType === "campaigns" ? "Campaign data: score by cost per result efficiency. Lower cost = HOT. Use EXACT campaign names." : csvType === "tiktok" ? "TikTok: score by video completion and engagement rate." : csvType === "google" ? "Google: score by conversion rate and search intent." : "Score all available engagement signals.";

    try {
      const prompt = `You are PitchMind AI B2C Intelligence Engine.
BUSINESS: ${profile.businessName} | OFFERS: ${profile.whatYouDo} | PLATFORM: ${profile.b2cPlatform}
DATA TYPE: ${csvType}
INSTRUCTIONS: ${typeInstructions}

DATA (${sample.length} rows):
${summary}

Return ONLY a valid JSON array. Start with [ end with ]. No markdown. Use EXACT names from data — never generic Contact N names.
[{"name":"EXACT name from data","platform":"${profile.b2cPlatform}","location":"N/A","engagement":"Plain English summary of key metrics","score":85,"interestLevel":"High","dataType":"${csvType}","keyMetric":"Single best metric","likelyObjection":"Main barrier","bestApproach":"WhatsApp/DM/Email","personalizedMessage":"Specific message referencing their actual data","followUp1":"Day 2 follow-up","followUp2":"Day 5 follow-up","followUp3":"Day 10 follow-up","painPoint":"Why they need ${profile.businessName}","hotReason":"Specific data-based reason","strategy":"Concrete next action"}]`;

      const raw = await callClaude(apiKey, prompt, 3000);
      let parsed;
      try { parsed = safeJSON(raw); } catch (_) {
        const match = raw.match(/\[[\s\S]*\]/);
        if (match) { try { parsed = JSON.parse(match[0]); } catch (_) {} }
        if (!parsed) {
          parsed = sample.slice(0, 6).map((row, i) => ({
            name: getRowName(row) || `Row ${i + 1}`, platform: profile.b2cPlatform,
            location: "N/A", engagement: Object.entries(row).filter(([, v]) => v).slice(0, 3).map(([k, v]) => `${k}: ${v}`).join(", "),
            score: 65 + Math.floor(Math.random() * 25), interestLevel: "Medium",
            bestApproach: "WhatsApp", personalizedMessage: `Hi! Reaching out regarding ${profile.businessName}.`,
            followUp1: "Day 2: Following up!", followUp2: "Day 5: Quick question?", followUp3: "Day 10: Last message!",
            painPoint: `Could benefit from ${profile.whatYouDo}`, hotReason: "Engaged with ad content", strategy: "Send personalized DM"
          }));
        }
      }
      if (!Array.isArray(parsed)) throw new Error("Invalid format");
      setLeads(parsed);
      for (const l of parsed) await saveLead({ ...l, leadType: "b2c" });
      setCsvProgress("");
    } catch (e) { setCsvErr(`Error: ${e.message}`); setCsvProgress(""); }
    setCsvProcessing(false);
  };

  // Intelligence Report
  const loadReport = async (lead) => {
    if (lead.report) { setSelectedLead(lead); return; }
    setSelectedLead({ ...lead, loading: true });
    // Reports are FREE — already paid for in session
    try {
      const isB2C = lead.leadType === "b2c";
      const wsScore = websiteScores[lead.name];
      const wsContext = wsScore ? `Website Score: ${wsScore.score}/100. Issues: ${(wsScore.issues || []).join(", ")}` : "";
      const userWA = profile.whatsappNumber || profile.businessPhone || "";
      const userEmail = profile.businessEmail || "";
      const prompt = isB2C
        ? `You are PitchMind AI. Deep B2C sales intelligence.
MY BUSINESS: ${profile.businessName} — ${profile.whatYouDo}
MY CONTACT: WhatsApp ${userWA} | Email ${userEmail}
CONTACT: ${lead.name} | Platform: ${lead.platform} | Engagement: ${lead.engagement} | Key Metric: ${lead.keyMetric || "N/A"}
Return ONLY raw JSON:
{"profileAnalysis":"Who this person/audience is.","psychologicalProfile":"Mindset, motivations, fears.","buyingSignals":"Signals showing purchase intent.","likelyObjections":"Top 3 objections + how to handle.","pitchStrategy":"Step-by-step approach.","openingMessage":"Perfect first message.","whatsappMessage":"Ready-to-send WhatsApp message under 60 words.","emailSubject":"Email subject line.","emailBody":"Full email 150 words max.","followUpSequence":"5 follow-ups as single string Day 1/3/7/14/30.","closingScript":"Exact closing words.","bestTime":"Best time to reach out.","conversionTip":"#1 conversion line.","creativeInsight":"What worked in this campaign and how to replicate."}`
        : `You are PitchMind AI. Deep B2B sales intelligence.
MY BUSINESS: ${profile.businessName} — ${profile.whatYouDo}
MY CONTACT: WhatsApp ${userWA} | Email ${userEmail}
TARGET: ${lead.name} | ${lead.type} | ${lead.address} | ${lead.phone} | ${lead.website} | ${lead.rating}/5 | Weaknesses: ${(lead.weaknesses || []).join(", ")}
${wsContext}
Return ONLY raw JSON:
{"companyOverview":"3 sentences.","weaknessAnalysis":"Why weak + what it costs them.","websiteAnalysis":"Website quality + improvements.","decisionMaker":"Who buys: title, personality.","emotionalProfile":"Fears, frustrations, desires.","objections":"Top 3 objections + how to handle.","pitchStrategy":"Step by step.","openingLine":"Perfect first sentence.","whatsappMessage":"Ready-to-send WhatsApp under 60 words.","emailSubject":"Cold email subject.","emailBody":"Full cold email 150 words max.","closingAngle":"Most powerful closing.","bestTime":"Best time to reach out.","campaignIdea":"One specific ad campaign idea to pitch them."}`;

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

  const brand = brandSettings;
  const appName = "PITCHMIND";
  const primaryColor = C.b2bLight;

  if (loading) return (
    <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "24px", fontWeight: "900", letterSpacing: "4px", color: primaryColor, marginBottom: "20px" }}>{appName}</div>
        <LoadingDots color={primaryColor} />
      </div>
    </div>
  );

  // ── LOGIN / SIGNUP ──
  if (screen === "login" || screen === "signup") {
    const isLogin = screen === "login";
    return (
      <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter,sans-serif", display: "flex" }}>
        <style>{CSS}</style>
        {/* Left */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "60px", position: "relative", overflow: "hidden", background: `linear-gradient(135deg, ${C.bg} 0%, #0D1B2A 100%)` }}>
          <div style={{ position: "absolute", top: "20%", left: "10%", width: "300px", height: "300px", background: `radial-gradient(circle, ${C.b2bGlow}, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: "20%", right: "5%", width: "250px", height: "250px", background: `radial-gradient(circle, ${C.b2cGlow}, transparent 70%)`, pointerEvents: "none" }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ fontSize: "13px", fontWeight: "700", letterSpacing: "4px", color: primaryColor, marginBottom: "20px" }}>{appName}</div>
            <div style={{ fontSize: "48px", fontWeight: "900", lineHeight: "1.1", marginBottom: "16px", letterSpacing: "-2px" }}>
              Find leads.<br />
              <span style={{ background: `linear-gradient(135deg, ${C.b2bLight}, ${C.b2cLight})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Close deals.</span>
            </div>
            <div style={{ fontSize: "15px", color: C.muted, lineHeight: "1.7", maxWidth: "400px", marginBottom: "40px" }}>
              AI-powered lead intelligence for B2B businesses and B2C audience targeting.
            </div>
            {[
              { icon: "🏢", t: "B2B Lead Scanner", d: "Find businesses weak in what you offer" },
              { icon: "👥", t: "B2C Audience Intelligence", d: "Upload Meta/TikTok data → score every lead" },
              { icon: "🌐", t: "Website Scorer", d: "Rate any business website 0-100" },
              { icon: "💾", t: "CRM Pipeline", d: "Track every lead from New to Closed Won" },
            ].map((f, i) => (
              <div key={i} style={{ display: "flex", gap: "14px", marginBottom: "18px" }}>
                <div style={{ fontSize: "20px", marginTop: "2px" }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "2px" }}>{f.t}</div>
                  <div style={{ fontSize: "13px", color: C.dim }}>{f.d}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Right */}
        <div style={{ width: "460px", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px", background: C.bg2, borderLeft: `1px solid ${C.border}` }}>
          <div style={{ width: "100%" }}>
            <div style={{ fontSize: "24px", fontWeight: "800", marginBottom: "6px" }}>{isLogin ? "Welcome back" : "Get started free"}</div>
            <div style={{ fontSize: "14px", color: C.muted, marginBottom: "28px" }}>{isLogin ? "Sign in to your account" : "Start finding leads today"}</div>
            {[["Email", "email", email, setEmail], ["Password", "password", password, setPassword]].map(([lbl, type, val, set], i) => (
              <div key={i} style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.muted, marginBottom: "7px", letterSpacing: "0.5px", textTransform: "uppercase" }}>{lbl}</label>
                <input type={type} placeholder={i === 0 ? "you@company.com" : "••••••••"} value={val}
                  onChange={e => { set(e.target.value); setAuthErr(""); }}
                  onKeyDown={e => e.key === "Enter" && (isLogin ? doLogin() : doSignup())}
                  style={{ width: "100%", padding: "12px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "14px" }} />
              </div>
            ))}
            {authErr && <div style={{ color: "#F87171", fontSize: "13px", marginBottom: "14px", padding: "10px", background: "rgba(239,68,68,0.08)", borderRadius: "8px" }}>{authErr}</div>}
            <button onClick={isLogin ? doLogin : doSignup} disabled={authBusy}
              style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "12px", opacity: authBusy ? 0.7 : 1 }}>
              {authBusy ? "Please wait..." : isLogin ? "Sign In →" : "Create Account →"}
            </button>
            <button onClick={() => { setScreen(isLogin ? "signup" : "login"); setAuthErr(""); }}
              style={{ width: "100%", padding: "11px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "10px", color: C.muted, fontSize: "13px", cursor: "pointer" }}>
              {isLogin ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAN ──
  if (screen === "plan") return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: "900px", width: "100%" }}>
        <div style={{ textAlign: "center", marginBottom: "48px" }}>
          <div style={{ fontSize: "13px", fontWeight: "700", letterSpacing: "3px", color: C.b2bLight, marginBottom: "14px" }}>CHOOSE YOUR PLAN</div>
          <div style={{ fontSize: "36px", fontWeight: "900", letterSpacing: "-1px", marginBottom: "8px" }}>Simple, transparent pricing</div>
          <div style={{ fontSize: "15px", color: C.muted }}>1 session = 5 credits = 6 leads + full AI reports</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", marginBottom: "32px" }}>
          {Object.entries(PLANS).map(([key, plan]) => {
            const isSelected = selPlan === key;
            const isPop = key === "growth";
            return (
              <div key={key} onClick={() => setSelPlan(key)}
                style={{ background: isSelected ? `linear-gradient(135deg, rgba(37,99,235,0.08), rgba(124,58,237,0.08))` : C.bg2, border: `2px solid ${isSelected ? plan.color : C.border}`, borderRadius: "18px", padding: "28px", cursor: "pointer", position: "relative", transition: "all 0.2s", boxShadow: isSelected ? `0 0 30px ${plan.color}20` : "none" }}>
                {isPop && <div style={{ position: "absolute", top: "-12px", left: "50%", transform: "translateX(-50%)", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2c})`, color: "#fff", fontSize: "10px", fontWeight: "800", padding: "4px 14px", borderRadius: "20px", letterSpacing: "1px", whiteSpace: "nowrap" }}>MOST POPULAR</div>}
                <div style={{ fontSize: "32px", fontWeight: "900", color: plan.color, marginBottom: "2px" }}>${plan.price}</div>
                <div style={{ fontSize: "12px", color: C.dim, marginBottom: "16px" }}>/month</div>
                <div style={{ fontSize: "18px", fontWeight: "800", marginBottom: "4px" }}>{plan.name}</div>
                <div style={{ fontSize: "12px", color: C.muted, marginBottom: "16px" }}>{plan.desc}</div>
                <div style={{ background: `${plan.color}15`, border: `1px solid ${plan.color}30`, borderRadius: "10px", padding: "12px", marginBottom: "18px", textAlign: "center" }}>
                  <div style={{ fontSize: "22px", fontWeight: "900", color: plan.color }}>{plan.sessions} sessions</div>
                  <div style={{ fontSize: "11px", color: C.dim }}>{plan.leads} leads/month</div>
                </div>
                {plan.features.map((f, i) => (
                  <div key={i} style={{ fontSize: "12px", color: C.muted, marginBottom: "7px", display: "flex", alignItems: "flex-start", gap: "8px" }}>
                    <span style={{ color: plan.color, fontWeight: "700", flexShrink: 0 }}>✓</span>{f}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        <div style={{ textAlign: "center" }}>
          <button onClick={doPlan}
            style={{ padding: "14px 56px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2c})`, border: "none", borderRadius: "12px", color: "#fff", fontSize: "15px", fontWeight: "800", cursor: "pointer", boxShadow: "0 4px 24px rgba(37,99,235,0.3)", letterSpacing: "0.5px" }}>
            Start with {PLANS[selPlan].name}{" →"}
          </button>
          <div style={{ fontSize: "12px", color: C.dim, marginTop: "12px" }}>Cancel anytime. No setup fees.</div>
        </div>
      </div>
    </div>
  );

  // ── MODE SELECTION ──
  if (screen === "mode") return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: "760px", width: "100%", textAlign: "center" }}>
        <div style={{ fontSize: "13px", fontWeight: "700", letterSpacing: "3px", color: C.b2bLight, marginBottom: "14px" }}>SELECT YOUR MODE</div>
        <div style={{ fontSize: "36px", fontWeight: "900", letterSpacing: "-1px", marginBottom: "8px" }}>How do you find clients?</div>
        <div style={{ fontSize: "14px", color: C.muted, marginBottom: "40px" }}>You can switch modes anytime from the dashboard</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
          {[
            { m: "b2b", icon: "🏢", color: C.b2bLight, glow: C.b2bGlow, border: C.b2bBorder, label: "B2B MODE", title: "Find Businesses", desc: "Scan for companies that are weak in what you offer. Get their contact info, weaknesses & personalized pitch strategy.", examples: ["Marketing agencies", "Cleaning services", "Web design studios", "Consultants", "Any B2B service"] },
            { m: "b2c", icon: "👥", color: C.b2cLight, glow: C.b2cGlow, border: C.b2cBorder, label: "B2C MODE", title: "Find People", desc: "Upload your Meta, TikTok or Google Ads data. AI analyzes every contact and scores them HOT, WARM or COLD.", examples: ["Gyms & fitness", "Restaurants & cafes", "Beauty salons", "Real estate", "Any B2C business"] },
          ].map(({ m, icon, color, glow, border, label, title, desc, examples }) => (
            <div key={m} onClick={() => doMode(m)}
              style={{ background: C.bg2, border: `2px solid ${border}`, borderRadius: "20px", padding: "32px", cursor: "pointer", textAlign: "left", position: "relative", overflow: "hidden", transition: "all 0.2s" }}>
              <div style={{ position: "absolute", top: 0, right: 0, width: "150px", height: "150px", background: `radial-gradient(circle at top right, ${glow}, transparent)`, pointerEvents: "none" }} />
              <div style={{ fontSize: "36px", marginBottom: "14px" }}>{icon}</div>
              <div style={{ fontSize: "10px", fontWeight: "800", letterSpacing: "2px", color, marginBottom: "8px" }}>{label}</div>
              <div style={{ fontSize: "20px", fontWeight: "800", marginBottom: "10px" }}>{title}</div>
              <div style={{ fontSize: "13px", color: C.muted, lineHeight: "1.6", marginBottom: "20px" }}>{desc}</div>
              {examples.map((ex, i) => <div key={i} style={{ fontSize: "12px", color: C.dim, marginBottom: "4px" }}>→ {ex}</div>)}
              <div style={{ marginTop: "20px", padding: "11px", background: `linear-gradient(135deg, ${color}CC, ${color})`, borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: "700", textAlign: "center" }}>Select {m.toUpperCase()} Mode →</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // ── API KEY ──
  if (screen === "apikey") return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: "440px", width: "100%", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "40px" }}>
        <div style={{ fontSize: "11px", fontWeight: "800", letterSpacing: "3px", color: C.b2bLight, marginBottom: "14px" }}>STEP 3 OF 4</div>
        <div style={{ fontSize: "24px", fontWeight: "800", marginBottom: "8px" }}>Connect AI Brain</div>
        <div style={{ fontSize: "14px", color: C.muted, marginBottom: "24px" }}>PitchMind uses Claude AI for intelligence reports</div>
        <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px", marginBottom: "20px", fontSize: "13px", color: C.muted, lineHeight: "1.7" }}>
          🔑 Get your free API key at <span style={{ color: C.b2bLight, fontWeight: "600" }}>console.anthropic.com</span><br />
          New accounts get $5 free credits.
        </div>
        <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.muted, marginBottom: "8px", letterSpacing: "1px", textTransform: "uppercase" }}>Claude API Key</label>
        <input type="password" placeholder="sk-ant-..." value={apiInput}
          onChange={e => { setApiInput(e.target.value); setApiErr(""); }}
          onKeyDown={e => e.key === "Enter" && doApiKey()}
          style={{ width: "100%", padding: "12px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "14px", marginBottom: "14px" }} />
        {apiErr && <div style={{ color: "#F87171", fontSize: "13px", marginBottom: "12px" }}>{apiErr}</div>}
        <button onClick={doApiKey}
          style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
          {"Continue →"}
        </button>
        <div style={{ marginTop: "14px", fontSize: "11px", color: C.dim, textAlign: "center" }}>🔒 Stored locally. Never sent to our servers.</div>
      </div>
    </div>
  );

  // ── PROFILE ──
  if (screen === "profile") return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter,sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }}>
      <style>{CSS}</style>
      <div style={{ maxWidth: "560px", width: "100%", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "40px" }}>
        <div style={{ display: "inline-block", padding: "4px 12px", background: mode === "b2b" ? C.b2bGlow : C.b2cGlow, border: `1px solid ${mode === "b2b" ? C.b2bBorder : C.b2cBorder}`, borderRadius: "20px", fontSize: "11px", fontWeight: "700", color: mode === "b2b" ? C.b2bLight : C.b2cLight, marginBottom: "20px", textTransform: "uppercase", letterSpacing: "1px" }}>
          {mode === "b2b" ? "🏢 B2B Mode" : "👥 B2C Mode"}
        </div>
        <div style={{ fontSize: "22px", fontWeight: "800", marginBottom: "6px" }}>Your Business Profile</div>
        <div style={{ fontSize: "13px", color: C.muted, marginBottom: "24px" }}>Help PitchMind find the right leads for you</div>
        {[
          { label: "Business Name", key: "businessName", placeholder: "e.g. Peach Agency, Dubai Gym...", type: "input" },
          { label: mode === "b2b" ? "What You Offer" : "What You Sell", key: "whatYouDo", placeholder: mode === "b2b" ? "e.g. Social media, web design, SEO..." : "e.g. Gym memberships, beauty services...", type: "textarea" },
          ...(mode === "b2b" ? [
            { label: "Target Industry", key: "targetIndustry", placeholder: "e.g. Restaurants, Clinics, Real Estate...", type: "input" },
            { label: "Target Location", key: "location", placeholder: "e.g. Beirut, Dubai, Kuwait City...", type: "input" },
          ] : [
            { label: "Target Audience", key: "b2cTarget", placeholder: "e.g. Fitness enthusiasts aged 25-40 in Dubai...", type: "textarea" },
          ]),
        ].map((f, i) => (
          <div key={i} style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.muted, marginBottom: "7px", letterSpacing: "1px", textTransform: "uppercase" }}>{f.label}</label>
            {f.type === "textarea"
              ? <textarea value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                style={{ width: "100%", padding: "12px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "13px", minHeight: "80px", resize: "vertical", fontFamily: "Inter,sans-serif" }} />
              : <input value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder}
                style={{ width: "100%", padding: "12px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", color: C.white, fontSize: "13px" }} />
            }
          </div>
        ))}
        {/* Outreach */}
        <div style={{ background: C.bg3, border: `1px solid rgba(245,158,11,0.2)`, borderRadius: "12px", padding: "14px", marginBottom: "14px" }}>
          <div style={{ fontSize: "10px", fontWeight: "700", color: C.gold, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>{"💬 OUTREACH — enables one-click WhatsApp & Email"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <div>
              <label style={{ display: "block", fontSize: "10px", fontWeight: "700", color: C.muted, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Business Email</label>
              <input value={profile.businessEmail || ""} onChange={e => setProfile(p => ({ ...p, businessEmail: e.target.value }))} placeholder="hello@agency.com"
                style={{ width: "100%", padding: "9px 11px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "7px", color: C.white, fontSize: "12px" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "10px", fontWeight: "700", color: C.muted, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" }}>WhatsApp Number</label>
              <input value={profile.whatsappNumber || ""} onChange={e => setProfile(p => ({ ...p, whatsappNumber: e.target.value }))} placeholder="+961 XX XXX XXX"
                style={{ width: "100%", padding: "9px 11px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "7px", color: C.white, fontSize: "12px" }} />
            </div>
          </div>
        </div>

        {mode === "b2c" && (
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.muted, marginBottom: "7px", letterSpacing: "1px", textTransform: "uppercase" }}>Ad Platform</label>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {["Meta Ads", "TikTok Ads", "Google Ads", "Other"].map(p => (
                <button key={p} onClick={() => setProfile(pr => ({ ...pr, b2cPlatform: p }))}
                  style={{ padding: "7px 14px", borderRadius: "8px", border: `1px solid ${profile.b2cPlatform === p ? C.b2cBorder : C.border}`, background: profile.b2cPlatform === p ? C.b2cGlow : "transparent", color: profile.b2cPlatform === p ? C.b2cLight : C.muted, cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {profileErr && <div style={{ color: "#F87171", fontSize: "13px", marginBottom: "14px" }}>{profileErr}</div>}
        <button onClick={doProfile}
          style={{ width: "100%", padding: "13px", background: `linear-gradient(135deg, ${mode === "b2b" ? C.b2b : C.b2c}, ${mode === "b2b" ? C.b2bLight : C.b2cLight})`, border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer" }}>
          {"Launch PitchMind →"}
        </button>
      </div>
    </div>
  );

  // ── DASHBOARD ──
  if (screen !== "dashboard") return null;
  if (!userData) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Inter,sans-serif" }}><style>{CSS}</style><LoadingDots /></div>;

  const safeMode = mode || "b2b";
  const accentColor = safeMode === "b2b" ? C.b2bLight : C.b2cLight;
  const accentGlow = safeMode === "b2b" ? C.b2bGlow : C.b2cGlow;
  const accentBorder = safeMode === "b2b" ? C.b2bBorder : C.b2cBorder;
  const hotCount = savedLeads.filter(l => l.score >= 80).length;
  const closedCount = savedLeads.filter(l => l.status === "closed").length;
  const pipelineCount = savedLeads.filter(l => ["contacted", "inprogress"].includes(l.status)).length;
  const sessionsLeft = Math.floor(userData.credits / CREDITS_PER_SESSION);
  const creditPct = Math.round((userData.credits / userData.maxCredits) * 100);
  const plan = PLANS[userData.plan] || PLANS.starter;

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: "Inter,sans-serif", color: C.white }}>
      <style>{CSS}</style>

      {/* HEADER */}
      <div style={{ padding: "0 28px", height: "58px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(8,11,15,0.96)", borderBottom: `1px solid ${C.border}`, backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 100, boxShadow: `0 1px 0 ${accentColor}30` }}>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div onClick={() => setScreen("dashboard")} style={{ fontSize: "15px", fontWeight: "900", letterSpacing: "3px", background: `linear-gradient(135deg, ${C.b2bLight}, ${C.b2cLight})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", cursor: "pointer" }}>
            {"PITCHMIND"}
          </div>
          <div style={{ padding: "3px 10px", background: safeMode === "b2b" ? C.b2bGlow : C.b2cGlow, border: `1px solid ${accentBorder}`, borderRadius: "20px", fontSize: "10px", fontWeight: "800", color: accentColor, letterSpacing: "1px", textTransform: "uppercase" }}>
            {safeMode === "b2b" ? "🏢 B2B" : "👥 B2C"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          {/* Sessions indicator */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 12px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "10px" }}>
            <div style={{ width: "50px", height: "3px", background: C.bg3, borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ width: `${creditPct}%`, height: "100%", background: `linear-gradient(90deg, ${accentColor}, ${C.b2cLight})`, borderRadius: "3px" }} />
            </div>
            <span style={{ fontSize: "12px", fontWeight: "700", color: accentColor }}>{sessionsLeft}</span>
            <span style={{ fontSize: "11px", color: C.dim }}>sessions left</span>
          </div>
          <div style={{ padding: "4px 10px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", fontSize: "10px", fontWeight: "700", color: C.gold, letterSpacing: "1px", textTransform: "uppercase" }}>{plan.name}</div>
          <button onClick={() => { const nm = safeMode === "b2b" ? "b2c" : "b2b"; setMode(nm); updateDoc(doc(db, "users", user.uid), { mode: nm }); }}
            style={{ padding: "5px 10px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "11px", fontWeight: "600" }}>
            {"Switch to "}{safeMode === "b2b" ? "B2C" : "B2B"}
          </button>
          <button onClick={() => setShowSettings(s => !s)}
            style={{ padding: "5px 10px", background: showSettings ? "rgba(255,255,255,0.06)" : C.bg2, border: `1px solid ${showSettings ? "rgba(255,255,255,0.12)" : C.border}`, borderRadius: "8px", color: showSettings ? C.white : C.muted, cursor: "pointer", fontSize: "11px", fontWeight: "600" }}>
            {"⚙️ Settings"}
          </button>
          <button onClick={doLogout} style={{ padding: "5px 10px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.dim, cursor: "pointer", fontSize: "11px" }}>Logout</button>
        </div>
      </div>

      <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 28px" }}>

        {/* WHITE LABEL SETTINGS PANEL */}

        {/* LOW CREDITS WARNING */}
        {userData.credits < CREDITS_PER_SESSION && userData.credits > 0 && (
          <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "12px", padding: "12px 18px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#FCD34D" }}>
            {"⚠️ Not enough credits for a full session ("}{userData.credits}{" remaining, need "}{CREDITS_PER_SESSION}{")"}
            <button onClick={() => setScreen("plan")} style={{ padding: "5px 12px", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "8px", color: "#FCD34D", cursor: "pointer", fontSize: "11px", fontWeight: "700" }}>Upgrade →</button>
          </div>
        )}
        {userData.credits === 0 && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", padding: "12px 18px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "13px", color: "#F87171" }}>
            {"❌ No credits remaining"}
            <button onClick={() => setScreen("plan")} style={{ padding: "5px 12px", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#F87171", cursor: "pointer", fontSize: "11px", fontWeight: "700" }}>Upgrade Now →</button>
          </div>
        )}

        {/* STATS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "14px", marginBottom: "24px" }}>
          {[
            { label: "SAVED LEADS", value: savedLeads.length, color: accentColor, sub: "all time" },
            { label: "HOT LEADS 🔥", value: hotCount, color: C.hot, sub: "score 80+" },
            { label: "IN PIPELINE", value: pipelineCount, color: C.warm, sub: "contacted + in progress" },
            { label: "CLOSED WON", value: closedCount, color: C.cold, sub: "converted" },
          ].map(({ label, value, color, sub }) => (
            <div key={label} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "18px 20px", transition: "border 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.borderColor = `${color}40`}
              onMouseLeave={e => e.currentTarget.style.borderColor = C.border}>
              <div style={{ fontSize: "10px", fontWeight: "700", color: C.dim, letterSpacing: "1.5px", marginBottom: "8px", textTransform: "uppercase" }}>{label}</div>
              <div style={{ fontSize: "34px", fontWeight: "900", color, lineHeight: 1, marginBottom: "4px" }}>{value}</div>
              <div style={{ fontSize: "11px", color: C.dim }}>{sub}</div>
            </div>
          ))}
        </div>

        {/* SETTINGS PANEL */}
        {showSettings && (
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "22px", marginBottom: "20px", animation: "fadeUp 0.2s ease" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <div style={{ fontSize: "12px", fontWeight: "800", color: C.white, letterSpacing: "2px", textTransform: "uppercase" }}>{"⚙️ SETTINGS"}</div>
              <button onClick={() => setShowSettings(false)} style={{ background: "transparent", border: "none", color: C.dim, cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "18px" }}>
              {/* Profile outreach */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>{"📞 Outreach Info"}</div>
                {[
                  { lbl: "Business Email", key: "businessEmail", ph: "hello@agency.com" },
                  { lbl: "WhatsApp Number", key: "whatsappNumber", ph: "+961 XX XXX XXX" },
                  { lbl: "Business Phone", key: "businessPhone", ph: "+961 XX XXX XXX" },
                ].map(f => (
                  <div key={f.key} style={{ marginBottom: "10px" }}>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: "700", color: C.dim, marginBottom: "5px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.lbl}</label>
                    <input value={profile[f.key] || ""} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph}
                      style={{ width: "100%", padding: "9px 11px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "7px", color: C.white, fontSize: "12px" }} />
                  </div>
                ))}
                <button onClick={async () => { await updateDoc(doc(db, "users", user.uid), { profile }); setShowSettings(false); }}
                  style={{ padding: "8px 16px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "7px", color: "#fff", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                  {"Save Changes ✓"}
                </button>
              </div>
              {/* Higgsfield */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>{"🎨 Higgsfield Creative"}</div>
                <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px", marginBottom: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "10px" }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: higgsfield.connected ? "#34D399" : C.dim }} />
                    <span style={{ fontSize: "12px", color: higgsfield.connected ? "#34D399" : C.dim, fontWeight: "600" }}>{higgsfield.connected ? "Connected ✓" : "Not connected"}</span>
                  </div>
                  <div style={{ fontSize: "12px", color: C.muted, lineHeight: "1.6", marginBottom: "10px" }}>{"Generate ad images, carousels & reels directly from campaigns."}</div>
                  <input type="password" placeholder="Higgsfield API Key" value={higgsfield.apiKey}
                    onChange={e => setHighsfield(p => ({ ...p, apiKey: e.target.value }))}
                    style={{ width: "100%", padding: "9px 11px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "7px", color: C.white, fontSize: "12px", marginBottom: "8px" }} />
                  <button onClick={() => { if (higgsfield.apiKey) { localStorage.setItem("pm_higgsfield_key", higgsfield.apiKey); setHighsfield(p => ({ ...p, connected: true })); }}}
                    style={{ width: "100%", padding: "8px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "7px", color: C.gold, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                    {higgsfield.connected ? "Update Key" : "Connect Higgsfield"}
                  </button>
                </div>
                <div style={{ fontSize: "11px", color: C.dim }}>🔜 One-click creative generation coming next update</div>
              </div>
              {/* API + Plan */}
              <div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "10px" }}>🔑 Claude API Key</div>
                <input type="password" placeholder="sk-ant-..." defaultValue={apiKey}
                  onChange={e => { localStorage.setItem("pm_api_key", e.target.value); setApiKey(e.target.value); }}
                  style={{ width: "100%", padding: "9px 11px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "7px", color: C.white, fontSize: "12px", marginBottom: "6px" }} />
                <div style={{ fontSize: "11px", color: "#34D399", marginBottom: "16px" }}>{"✅ Stored locally · Never sent to servers"}</div>
                <div style={{ fontSize: "11px", fontWeight: "700", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>{"📋 Your Plan"}</div>
                <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "10px", padding: "14px" }}>
                  <div style={{ fontSize: "16px", fontWeight: "800", color: PLANS[userData.plan]?.color || C.b2bLight, marginBottom: "4px" }}>{PLANS[userData.plan]?.name || "Starter"} — ${PLANS[userData.plan]?.price || 99}/mo</div>
                  <div style={{ fontSize: "12px", color: C.muted, marginBottom: "10px" }}>{userData.credits} credits · {Math.floor(userData.credits / CREDITS_PER_SESSION)} sessions left</div>
                  <button onClick={() => { setShowSettings(false); setScreen("plan"); }}
                    style={{ padding: "7px 14px", background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: "7px", color: C.gold, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                    {"Upgrade Plan →"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TABS */}
        <div style={{ display: "flex", gap: "4px", marginBottom: "20px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "4px" }}>
          {[
            { key: "scan", icon: safeMode === "b2b" ? "🔍" : "📤", label: safeMode === "b2b" ? "Scan Leads" : "Upload Data", bg: `linear-gradient(135deg, ${safeMode === "b2b" ? C.b2b : C.b2c}, ${safeMode === "b2b" ? C.b2bLight : C.b2cLight})` },
            { key: "saved", icon: "💾", label: `My Leads${savedLeads.length > 0 ? ` (${savedLeads.length})` : ""}`, bg: `linear-gradient(135deg, ${safeMode === "b2b" ? C.b2b : C.b2c}, ${safeMode === "b2b" ? C.b2bLight : C.b2cLight})` },
            { key: "competitors", icon: "🕵️", label: "Competitor Radar", bg: `linear-gradient(135deg, ${C.comp}, ${C.compLight})` },
            { key: "campaigns", icon: "📣", label: "Campaign Builder", bg: `linear-gradient(135deg, ${C.camp}, ${C.campLight})` },
          ].map(t => (
            <button key={t.key} onClick={() => { setActiveTab(t.key); if (t.key === "saved" && user) loadLeads(user.uid); }}
              style={{ flex: 1, padding: "9px 4px", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "12px", fontWeight: "700", transition: "all 0.2s", background: activeTab === t.key ? t.bg : "transparent", color: activeTab === t.key ? "#fff" : C.muted }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* ── SCAN TAB ── */}
        {activeTab === "scan" && (
          <>
            {/* Session cost notice */}
            <div style={{ background: `${accentColor}08`, border: `1px solid ${accentColor}20`, borderRadius: "10px", padding: "10px 16px", marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px" }}>
              <span style={{ color: C.muted }}>Each session costs <span style={{ color: accentColor, fontWeight: "700" }}>{CREDITS_PER_SESSION} credits</span> and includes 6 leads + all intelligence reports</span>
              <span style={{ color: accentColor, fontWeight: "700" }}>{sessionsLeft} sessions remaining</span>
            </div>

            {/* B2B SCAN */}
            {safeMode === "b2b" && (
              <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "24px", marginBottom: "24px" }}>
                <div style={{ fontSize: "11px", fontWeight: "800", color: accentColor, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "16px" }}>{"⚡ SCAN FOR HOT LEADS"}</div>
                <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
                  {[
                    { label: "Target Industry", key: "targetIndustry", ph: "Restaurants, Clinics, Real Estate..." },
                    { label: "Location", key: "location", ph: "Beirut, Dubai, Kuwait City..." },
                  ].map(f => (
                    <div key={f.key} style={{ flex: 1, minWidth: "180px" }}>
                      <label style={{ display: "block", fontSize: "11px", fontWeight: "700", color: C.dim, marginBottom: "7px", letterSpacing: "1px", textTransform: "uppercase" }}>{f.label}</label>
                      <input value={profile[f.key]} onChange={e => setProfile(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph}
                        style={{ width: "100%", padding: "11px 13px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "9px", color: C.white, fontSize: "13px" }} />
                    </div>
                  ))}
                  <button onClick={scanB2B} disabled={scanning || userData.credits < CREDITS_PER_SESSION}
                    style={{ padding: "11px 24px", background: scanning || userData.credits < CREDITS_PER_SESSION ? C.bg3 : `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "9px", color: scanning || userData.credits < CREDITS_PER_SESSION ? C.dim : "#fff", fontSize: "13px", fontWeight: "700", cursor: scanning || userData.credits < CREDITS_PER_SESSION ? "not-allowed" : "pointer", whiteSpace: "nowrap", boxShadow: scanning ? "none" : `0 4px 16px ${C.b2bGlow}` }}>
                    {scanning ? "Scanning..." : "Find Leads →"}
                  </button>
                </div>
                {scanProgress && <div style={{ marginTop: "12px", fontSize: "12px", color: accentColor, display: "flex", alignItems: "center", gap: "8px" }}><LoadingDots color={accentColor} />{scanProgress}</div>}
                {scanErr && <div style={{ color: "#F87171", fontSize: "12px", marginTop: "10px", padding: "10px", background: "rgba(239,68,68,0.08)", borderRadius: "8px" }}>{scanErr}</div>}
                {savedLeads.length > 0 && (
                  <button onClick={() => exportToCSV(savedLeads)} style={{ marginTop: "14px", padding: "7px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "11px", fontWeight: "600" }}>{"📊 Export All Leads CSV"}</button>
                )}
              </div>
            )}

            {/* B2C UPLOAD */}
            {safeMode === "b2c" && (
              <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "16px", padding: "26px", marginBottom: "24px" }}>
                <div style={{ fontSize: "11px", fontWeight: "800", color: accentColor, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>{"📤 UPLOAD YOUR AD DATA"}</div>
                <div style={{ fontSize: "13px", color: C.muted, marginBottom: "20px" }}>{"AI auto-detects format — works with Meta, TikTok, Google Ads, or any CSV"}</div>
                <div onClick={() => fileRef.current?.click()}
                  style={{ border: `2px dashed ${csvName ? accentBorder : C.border}`, borderRadius: "14px", padding: "36px", textAlign: "center", cursor: "pointer", background: csvName ? accentGlow : "transparent", transition: "all 0.2s", marginBottom: "16px" }}>
                  <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display: "none" }} />
                  <div style={{ fontSize: "28px", marginBottom: "10px" }}>{csvName ? "✅" : "📂"}</div>
                  <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "4px", color: csvName ? accentColor : C.white }}>
                    {csvName || "Click to upload CSV file"}
                  </div>
                  <div style={{ fontSize: "12px", color: C.dim }}>
                    {csvData.length > 0 ? <span style={{ color: "#34D399" }}>✅ {csvData.length} rows loaded — AI will auto-detect format</span> : "Meta Ads · TikTok Ads · Google Ads · Any CSV"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: "8px", marginBottom: "16px", flexWrap: "wrap" }}>
                  {["Meta Ads", "TikTok Ads", "Google Ads", "Other"].map(p => (
                    <button key={p} onClick={() => setProfile(pr => ({ ...pr, b2cPlatform: p }))}
                      style={{ padding: "6px 14px", borderRadius: "8px", border: `1px solid ${profile.b2cPlatform === p ? accentBorder : C.border}`, background: profile.b2cPlatform === p ? accentGlow : "transparent", color: profile.b2cPlatform === p ? accentColor : C.dim, cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>
                      {p}
                    </button>
                  ))}
                </div>
                <button onClick={processCSV} disabled={csvProcessing || !csvData.length || userData.credits < CREDITS_PER_SESSION}
                  style={{ width: "100%", padding: "13px", background: !csvData.length || csvProcessing ? C.bg3 : `linear-gradient(135deg, ${C.b2c}, ${C.b2cLight})`, border: "none", borderRadius: "10px", color: !csvData.length || csvProcessing ? C.dim : "#fff", fontSize: "14px", fontWeight: "700", cursor: !csvData.length || csvProcessing ? "not-allowed" : "pointer", boxShadow: csvData.length ? `0 4px 20px ${C.b2cGlow}` : "none" }}>
                  {csvProcessing ? `Analyzing ${csvData.length} rows...` : csvData.length > 0 ? `Analyze ${csvData.length} Rows with AI →` : "Upload a CSV file to continue"}
                </button>
                {csvProgress && <div style={{ marginTop: "12px", fontSize: "12px", color: accentColor }}>{csvProgress}</div>}
                {csvErr && <div style={{ color: "#F87171", fontSize: "12px", marginTop: "10px", padding: "10px", background: "rgba(239,68,68,0.08)", borderRadius: "8px" }}>{csvErr}</div>}
              </div>
            )}

            {(scanning || csvProcessing) && (
              <div style={{ textAlign: "center", padding: "60px" }}>
                <LoadingDots color={accentColor} />
                <div style={{ fontSize: "15px", fontWeight: "700", marginTop: "16px", marginBottom: "6px" }}>
                  {safeMode === "b2b" ? `Finding hot ${profile.targetIndustry || "businesses"} in ${profile.location || "your area"}...` : "Analyzing your ad data..."}
                </div>
                <div style={{ fontSize: "13px", color: C.dim }}>{scanProgress || csvProgress}</div>
              </div>
            )}

            {leads.length > 0 && !scanning && !csvProcessing && (
              <>
                <div style={{ fontSize: "12px", fontWeight: "700", color: C.muted, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "14px" }}>
                  {"⚡ "}{leads.length}{" Leads Found — Auto-saved ✅ — Reports included in this session"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))", gap: "14px" }}>
                  {[...leads].sort((a, b) => b.score - a.score).map((lead, i) => {
                    const sc = scoreColor(lead.score || 70);
                    const saved = savedLeads.find(s => s.name === lead.name);
                    const ws = websiteScores[lead.name];
                    return <LeadCard key={i} lead={lead} saved={saved} sc={sc} mode={safeMode} accentColor={accentColor} accentGlow={accentGlow} websiteScore={ws} onReport={() => loadReport(saved || lead)} onCampaign={() => { setActiveTab("campaigns"); buildCampaign(lead); }} />;
                  })}
                </div>
              </>
            )}

            {leads.length === 0 && !scanning && !csvProcessing && (
              <div style={{ textAlign: "center", padding: "70px 24px" }}>
                <div style={{ fontSize: "48px", marginBottom: "14px" }}>{safeMode === "b2b" ? "🎯" : "📊"}</div>
                <div style={{ fontSize: "22px", fontWeight: "900", marginBottom: "8px", letterSpacing: "-0.5px" }}>
                  {safeMode === "b2b" ? "READY TO FIND HOT LEADS?" : "READY TO ANALYZE YOUR DATA?"}
                </div>
                <div style={{ fontSize: "14px", color: C.dim, marginBottom: "40px" }}>
                  {safeMode === "b2b" ? "Each session finds 6 businesses + full AI reports for all" : "Upload your ad data and AI will score every contact"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px", maxWidth: "640px", margin: "0 auto" }}>
                  {(safeMode === "b2b" ? [
                    { icon: "🔍", t: "SMART SCANNING", d: "AI finds businesses weak in what you offer" },
                    { icon: "🌐", t: "WEBSITE SCORING", d: "Rate each business website 0-100" },
                    { icon: "🧠", t: "DEEP INTEL", d: "Psychology, objections & pitch strategy" },
                  ] : [
                    { icon: "📤", t: "ANY FORMAT", d: "Meta, TikTok, Google Ads or any CSV" },
                    { icon: "🤖", t: "AI ANALYSIS", d: "Scores every contact HOT/WARM/COLD" },
                    { icon: "✉️", t: "DM TEMPLATES", d: "Personalized message per contact" },
                  ]).map((f, i) => (
                    <div key={i} style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px 16px" }}>
                      <div style={{ fontSize: "26px", marginBottom: "10px" }}>{f.icon}</div>
                      <div style={{ fontSize: "10px", fontWeight: "800", color: accentColor, letterSpacing: "2px", marginBottom: "6px" }}>{f.t}</div>
                      <div style={{ fontSize: "12px", color: C.dim, lineHeight: "1.5" }}>{f.d}</div>
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", flexWrap: "wrap", gap: "10px" }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", alignItems: "center" }}>
                <button onClick={() => loadLeads(user.uid)} style={{ padding: "5px 12px", background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "11px", fontWeight: "600" }}>🔄</button>
                {[{ v: "all", l: `All (${savedLeads.length})` }, ...STATUS_OPTIONS.map(s => ({ v: s.value, l: `${s.label} (${savedLeads.filter(l => l.status === s.value).length})` }))].map(({ v, l }) => (
                  <button key={v} onClick={() => setSavedFilter(v)}
                    style={{ padding: "5px 12px", borderRadius: "20px", border: `1px solid ${savedFilter === v ? accentColor : C.border}`, background: savedFilter === v ? accentGlow : "transparent", color: savedFilter === v ? accentColor : C.dim, cursor: "pointer", fontSize: "11px", fontWeight: "600", transition: "all 0.2s" }}>
                    {l}
                  </button>
                ))}
              </div>
              {savedLeads.length > 0 && (
                <button onClick={() => exportToCSV(savedLeads)} style={{ padding: "6px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, cursor: "pointer", fontSize: "11px", fontWeight: "600" }}>{"📊 Export CSV"}</button>
              )}
            </div>

            {savedLeads.length === 0 ? (
              <div style={{ textAlign: "center", padding: "70px 24px" }}>
                <div style={{ fontSize: "48px", marginBottom: "14px" }}>{"💾"}</div>
                <div style={{ fontSize: "20px", fontWeight: "800", marginBottom: "8px" }}>NO SAVED LEADS YET</div>
                <div style={{ fontSize: "13px", color: C.dim, marginBottom: "20px" }}>Run a scan and leads will be saved here automatically</div>
                <button onClick={() => setActiveTab("scan")} style={{ padding: "11px 28px", background: `linear-gradient(135deg, ${C.b2b}, ${C.b2bLight})`, border: "none", borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>Start Scanning →</button>
              </div>
            ) : (
              <>
                {(savedFilter === "all" ? savedLeads : savedLeads.filter(l => l.status === savedFilter)).length === 0 && (
                  <div style={{ textAlign: "center", padding: "40px", color: C.dim, fontSize: "14px" }}>No leads with "{savedFilter}" status yet</div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))", gap: "14px" }}>
                  {(savedFilter === "all" ? savedLeads : savedLeads.filter(l => l.status === savedFilter)).map((lead, i) => {
                    const sc = scoreColor(lead.score || 70);
                    const ws = websiteScores[lead.name];
                    return (
                      <SavedLeadCard key={i} lead={lead} sc={sc} accentColor={accentColor} websiteScore={ws}
                        onReport={() => loadReport(lead)}
                        onStatus={s => updateStatus(lead.id, s)}
                        onNotes={n => updateNotes(lead.id, n)}
                        onDelete={() => deleteLead(lead.id)}
                        onScoreWebsite={() => scoreWebsite(lead)}
                        onCampaign={() => { setActiveTab("campaigns"); buildCampaign(lead); }} />
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}

        {/* ── COMPETITOR TAB ── */}
        {activeTab === "competitors" && (
          <>
            <div style={{ background: C.bg2, border: `1px solid ${C.compBorder}`, borderRadius: "14px", padding: "22px", marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: C.compLight, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>{"🕵️ COMPETITOR RADAR"}</div>
              <div style={{ fontSize: "13px", color: C.muted, marginBottom: "16px" }}>{"Analyze top competitors and find their weaknesses"}</div>
              <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
                {[{ label: "Industry / Business Type", key: "industry", ph: "Web design agencies, Marketing firms..." }, { label: "Location", key: "location", ph: "Dubai, Beirut, Kuwait..." }].map(f => (
                  <div key={f.key} style={{ flex: 1, minWidth: "180px" }}>
                    <label style={{ display: "block", fontSize: "10px", fontWeight: "700", color: C.dim, marginBottom: "6px", letterSpacing: "1px", textTransform: "uppercase" }}>{f.label}</label>
                    <input value={compQuery[f.key]} onChange={e => setCompQuery(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph}
                      style={{ width: "100%", padding: "10px 12px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.white, fontSize: "13px" }} />
                  </div>
                ))}
                <button onClick={scanCompetitors} disabled={compScanning || userData.credits < CREDITS_PER_SESSION}
                  style={{ padding: "10px 22px", background: compScanning ? C.bg3 : `linear-gradient(135deg, ${C.comp}, ${C.compLight})`, border: "none", borderRadius: "8px", color: compScanning ? C.dim : "#fff", fontSize: "13px", fontWeight: "700", cursor: compScanning ? "not-allowed" : "pointer", whiteSpace: "nowrap" }}>
                  {compScanning ? "Analyzing..." : "Analyze Competitors →"}
                </button>
              </div>
              {compScanning && <div style={{ marginTop: "10px" }}><LoadingDots color={C.compLight} /></div>}
              {compErr && <div style={{ color: "#F87171", fontSize: "12px", marginTop: "10px", padding: "9px", background: "rgba(239,68,68,0.08)", borderRadius: "8px" }}>{compErr}</div>}
            </div>
            {competitors.length > 0 ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px,1fr))", gap: "12px" }}>
                {competitors.map((comp, i) => {
                  const tc = comp.threatLevel === "High" ? "#F87171" : comp.threatLevel === "Medium" ? "#FCD34D" : "#34D399";
                  return (
                    <div key={i} style={{ background: C.bg2, border: `1px solid ${C.compBorder}`, borderRadius: "13px", padding: "18px", display: "flex", flexDirection: "column" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "800" }}>{comp.name}</div>
                          <div style={{ fontSize: "10px", color: C.compLight, fontWeight: "700", textTransform: "uppercase" }}>{comp.marketPosition}</div>
                        </div>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: "8px", color: C.dim, fontWeight: "700" }}>STRENGTH</div>
                          <div style={{ fontSize: "20px", fontWeight: "900", color: C.compLight }}>{comp.strength}</div>
                        </div>
                      </div>
                      <span style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "5px", background: `${tc}15`, color: tc, border: `1px solid ${tc}30`, display: "inline-block", marginBottom: "8px", width: "fit-content" }}>⚠ {comp.threatLevel} Threat</span>
                      {comp.website && comp.website !== "N/A" && <a href={comp.website.startsWith("http") ? comp.website : `https://${comp.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: C.compLight, marginBottom: "8px", display: "block" }}>🌐 {comp.website} ↗</a>}
                      <div style={{ marginBottom: "6px" }}>{(comp.strongPoints || []).slice(0, 2).map((s, j) => <div key={j} style={{ fontSize: "11px", color: "#34D399" }}>✓ {s}</div>)}</div>
                      <div style={{ marginBottom: "8px" }}>{(comp.weakPoints || []).slice(0, 2).map((w, j) => <div key={j} style={{ fontSize: "11px", color: "#F87171" }}>✗ {w}</div>)}</div>
                      <div style={{ fontSize: "11px", color: C.muted, flexGrow: 1, marginBottom: "10px" }}>🎯 {comp.ourAdvantage}</div>
                      <button onClick={() => loadCompReport(comp)} style={{ width: "100%", padding: "9px", background: C.compGlow, border: `1px solid ${C.compBorder}`, borderRadius: "8px", color: C.compLight, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>Deep Analysis →</button>
                    </div>
                  );
                })}
              </div>
            ) : !compScanning && (
              <div style={{ textAlign: "center", padding: "60px" }}>
                <div style={{ fontSize: "46px", marginBottom: "12px" }}>{"🕵️"}</div>
                <div style={{ fontSize: "20px", fontWeight: "900", marginBottom: "7px" }}>KNOW YOUR COMPETITION</div>
                <div style={{ fontSize: "13px", color: C.dim }}>Analyze top competitors · Find their weaknesses · Exploit their gaps</div>
              </div>
            )}
          </>
        )}

        {/* ── CAMPAIGN TAB ── */}
        {activeTab === "campaigns" && (
          <>
            <div style={{ background: C.bg2, border: `1px solid ${C.campBorder}`, borderRadius: "14px", padding: "22px", marginBottom: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: "800", color: C.campLight, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>{"📣 CAMPAIGN BUILDER"}</div>
              <div style={{ fontSize: "13px", color: C.muted }}>
                {"Go to "}<strong style={{ color: C.campLight }}>{"Scan Leads"}</strong>{" or "}<strong style={{ color: C.campLight }}>{"My Leads"}</strong>{", click "}<strong style={{ color: C.campLight }}>{"📣"}</strong>{" on any lead card to build a full campaign."}
              </div>
            </div>
            {campaignLoading && <div style={{ textAlign: "center", padding: "50px" }}><LoadingDots color={C.campLight} /><div style={{ fontSize: "14px", fontWeight: "700", marginTop: "14px" }}>Building campaign...</div></div>}
            {campaign && !campaignLoading && (
              <div style={{ background: C.bg2, border: `1px solid ${C.campBorder}`, borderRadius: "14px", padding: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
                  <div>
                    <div style={{ fontSize: "11px", fontWeight: "800", color: C.campLight, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "4px" }}>{"FOR: "}{campaign.leadName}</div>
                    <div style={{ fontSize: "20px", fontWeight: "800" }}>{campaign.campaignName}</div>
                    <div style={{ fontSize: "13px", color: C.muted, marginTop: "3px" }}>{campaign.objective}{" · "}{campaign.timeline}{" · "}{campaign.totalBudget}</div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => { const t = [campaign.campaignName, "\n\nCaption:\n" + campaign.caption, "\n\nHashtags: " + (campaign.hashtags||[]).join(" "), "\n\nCTA: " + campaign.callToAction].join(""); navigator.clipboard?.writeText(t); }}
                      style={{ padding: "8px 14px", background: C.campGlow, border: `1px solid ${C.campBorder}`, borderRadius: "8px", color: C.campLight, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>{"📋 Copy"}</button>
                    <button onClick={() => setCampaign(null)} style={{ padding: "8px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, fontSize: "12px", cursor: "pointer" }}>{"Clear"}</button>
                  </div>
                </div>
                {(campaign.platforms || []).map((p, i) => (
                  <div key={i} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "16px", marginBottom: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                      <div style={{ fontSize: "14px", fontWeight: "800" }}>{"📱 "}{p.platform}{" — "}{p.format}</div>
                      <div style={{ fontSize: "12px", color: C.campLight, fontWeight: "700" }}>{p.budget}{"/day · "}{p.duration}</div>
                    </div>
                    {p.audience && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
                        <div>
                          <div style={{ fontSize: "10px", color: C.dim, textTransform: "uppercase", marginBottom: "3px" }}>{"Targeting"}</div>
                          <div style={{ fontSize: "12px", color: C.muted }}>{"📍 "}{p.audience.location}</div>
                          <div style={{ fontSize: "12px", color: C.muted }}>{"👤 "}{p.audience.age}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: "10px", color: C.dim, textTransform: "uppercase", marginBottom: "3px" }}>{"Interests"}</div>
                          {(p.audience.interests || []).map((int, j) => <div key={j} style={{ fontSize: "12px", color: C.muted }}>{"• "}{int}</div>)}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                  <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "11px", padding: "14px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: C.campLight, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "7px" }}>{"⚡ HOOK"}</div>
                    <div style={{ fontSize: "14px", fontWeight: "700" }}>{campaign.hook}</div>
                  </div>
                  <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "11px", padding: "14px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: C.campLight, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "7px" }}>{"🎯 CTA"}</div>
                    <div style={{ fontSize: "14px", fontWeight: "700" }}>{campaign.callToAction}</div>
                  </div>
                </div>
                <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "11px", padding: "14px", marginBottom: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "7px" }}>
                    <div style={{ fontSize: "10px", fontWeight: "800", color: C.campLight, letterSpacing: "1.5px", textTransform: "uppercase" }}>📝 CAPTION</div>
                    <button onClick={() => navigator.clipboard?.writeText(campaign.caption || "")} style={{ fontSize: "10px", color: C.muted, background: "transparent", border: `1px solid ${C.border}`, borderRadius: "5px", padding: "2px 8px", cursor: "pointer" }}>Copy</button>
                  </div>
                  <div style={{ fontSize: "13px", lineHeight: "1.75", color: "rgba(240,246,252,0.85)", whiteSpace: "pre-wrap" }}>{campaign.caption}</div>
                </div>
                <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "11px", padding: "14px", marginBottom: "12px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "800", color: C.campLight, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px" }}>🏷️ HASHTAGS</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>{(campaign.hashtags || []).map((h, i) => <span key={i} style={{ padding: "3px 10px", background: C.campGlow, border: `1px solid ${C.campBorder}`, borderRadius: "20px", fontSize: "12px", color: C.campLight }}>{h}</span>)}</div>
                </div>
                <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "11px", padding: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "800", color: C.campLight, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "7px" }}>{"🎨 CREATIVE DIRECTION FOR HIGGSFIELD"}</div>
                  <div style={{ fontSize: "13px", color: C.muted, lineHeight: "1.7", marginBottom: "10px" }}>{campaign.creativeDirection}</div>
                  <div style={{ padding: "10px 14px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: "8px", fontSize: "12px", color: C.gold }}>
                    {"⚙️ Go to Settings → Connect Higgsfield → Generate creative automatically"}
                  </div>
                </div>
              </div>
            )}
            {!campaign && !campaignLoading && (
              <div style={{ textAlign: "center", padding: "60px" }}>
                <div style={{ fontSize: "46px", marginBottom: "12px" }}>{"📣"}</div>
                <div style={{ fontSize: "20px", fontWeight: "900", marginBottom: "7px" }}>{"BUILD A CAMPAIGN"}</div>
                <div style={{ fontSize: "13px", color: C.dim, marginBottom: "24px" }}>{"Click 📣 on any lead card to generate a full ad campaign"}</div>
                <button onClick={() => setActiveTab("scan")} style={{ padding: "10px 24px", background: `linear-gradient(135deg, ${C.camp}, ${C.campLight})`, border: "none", borderRadius: "9px", color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>{"→ Find a Lead First"}</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* INTELLIGENCE MODAL */}
      {selectedLead && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
          onClick={e => e.target === e.currentTarget && setSelectedLead(null)}>
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "20px", padding: "32px", maxWidth: "760px", width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative", boxShadow: "0 25px 60px rgba(0,0,0,0.7)" }}>
            <button onClick={() => setSelectedLead(null)}
              style={{ position: "absolute", top: "14px", right: "14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, width: "30px", height: "30px", cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>

            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "20px", fontWeight: "800", marginBottom: "3px" }}>{selectedLead.name}</div>
              <div style={{ fontSize: "12px", color: C.muted, marginBottom: "14px" }}>
                {selectedLead.leadType === "b2c" ? `${selectedLead.platform} · ${selectedLead.engagement}` : `${selectedLead.type} · ${selectedLead.location}`}
              </div>

              {selectedLead.id && (
                <div style={{ display: "flex", gap: "5px", flexWrap: "wrap", marginBottom: "14px" }}>
                  {STATUS_OPTIONS.map(s => (
                    <button key={s.value} onClick={() => updateStatus(selectedLead.id, s.value)}
                      style={{ padding: "4px 10px", borderRadius: "7px", border: `1px solid ${selectedLead.status === s.value ? s.color : C.border}`, background: selectedLead.status === s.value ? s.bg : "transparent", color: selectedLead.status === s.value ? s.color : C.dim, cursor: "pointer", fontSize: "11px", fontWeight: "600", transition: "all 0.15s" }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "14px" }}>
                {(selectedLead.leadType === "b2c" ? [
                  ["📱 Platform", selectedLead.platform],
                  ["📍 Location", selectedLead.location || "N/A"],
                  ["🎯 Interest", selectedLead.interestLevel || "High"],
                  ["💬 Approach", selectedLead.bestApproach || "DM"],
                ] : [
                  ["📞 Phone", selectedLead.phone || "N/A"],
                  ["⭐ Rating", `${selectedLead.rating}/5 (${selectedLead.reviews} reviews)`],
                  ["🌐 Website", selectedLead.website || "No website"],
                  ["📍 Address", selectedLead.address || "N/A"],
                ]).map(([lbl, val]) => (
                  <div key={lbl} style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px" }}>
                    <div style={{ fontSize: "9px", color: accentColor, fontWeight: "700", letterSpacing: "0.5px", marginBottom: "3px", textTransform: "uppercase" }}>{lbl}</div>
                    <div style={{ fontSize: "12px", color: C.white }}>{val}</div>
                  </div>
                ))}
              </div>

              {selectedLead.id && (
                <textarea value={selectedLead.notes || ""} onChange={e => updateNotes(selectedLead.id, e.target.value)} placeholder="Add notes about this lead..."
                  style={{ width: "100%", padding: "10px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "9px", color: C.white, fontSize: "12px", resize: "vertical", minHeight: "56px", fontFamily: "Inter,sans-serif", marginBottom: "14px" }} />
              )}

              {/* ONE-CLICK OUTREACH */}
              {selectedLead.report && (
                <div style={{ background: C.bg3, border: "1px solid rgba(245,158,11,0.25)", borderRadius: "12px", padding: "14px", marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "800", color: C.gold, letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "10px" }}>{"💬 ONE-CLICK OUTREACH"}</div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    {selectedLead.report.whatsappMessage && (
                      <button onClick={() => {
                        const phone = (selectedLead.phone || "").replace(/\D/g, "");
                        const msg = encodeURIComponent(selectedLead.report.whatsappMessage);
                        window.open(phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`, "_blank");
                      }}
                        style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 16px", background: "rgba(37,211,102,0.1)", border: "1px solid rgba(37,211,102,0.3)", borderRadius: "8px", color: "#25D366", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                        Send WhatsApp
                      </button>
                    )}
                    {selectedLead.report.emailBody && (
                      <button onClick={() => {
                        const to = selectedLead.email || "";
                        const sub = encodeURIComponent(selectedLead.report.emailSubject || "");
                        const body = encodeURIComponent(safeStr(selectedLead.report.emailBody) || "");
                        window.open(`mailto:${to}?subject=${sub}&body=${body}`, "_blank");
                      }}
                        style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 16px", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.3)", borderRadius: "8px", color: "#60A5FA", fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        Send Email
                      </button>
                    )}
                    <button onClick={() => { setSelectedLead(null); setActiveTab("campaigns"); buildCampaign(selectedLead); }}
                      style={{ display: "flex", alignItems: "center", gap: "7px", padding: "9px 16px", background: C.campGlow, border: `1px solid ${C.campBorder}`, borderRadius: "8px", color: C.campLight, fontSize: "13px", fontWeight: "700", cursor: "pointer" }}>
                      📣 Build Campaign
                    </button>
                  </div>
                  {selectedLead.report.whatsappMessage && (
                    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px", padding: "10px 12px" }}>
                      <div style={{ fontSize: "9px", color: "#25D366", fontWeight: "700", letterSpacing: "0.5px", marginBottom: "4px" }}>WHATSAPP PREVIEW</div>
                      <div style={{ fontSize: "12px", color: C.muted, lineHeight: "1.6" }}>{selectedLead.report.whatsappMessage}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {selectedLead.loading && (
              <div style={{ textAlign: "center", padding: "36px" }}>
                <LoadingDots color={accentColor} />
                <div style={{ color: C.muted, marginTop: "10px", fontSize: "13px" }}>Building intelligence report...</div>
              </div>
            )}
            {selectedLead.reportErr && <div style={{ color: "#F87171", padding: "14px", background: "rgba(239,68,68,0.08)", borderRadius: "10px", fontSize: "13px", marginBottom: "14px" }}>{selectedLead.reportErr}</div>}

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
                ["🎨 Creative Insight", r.creativeInsight],
              ] : [
                ["🏢 Company Overview", r.companyOverview],
                ["⚠️ Weakness Analysis", r.weaknessAnalysis],
                ["🌐 Website Analysis", r.websiteAnalysis],
                ["👤 Decision Maker Profile", r.decisionMaker],
                ["🧠 Psychological Profile", r.emotionalProfile],
                ["🛡️ Expected Objections", r.objections],
                ["🎯 Pitch Strategy", r.pitchStrategy],
                ["💬 Perfect Opening Line", r.openingLine],
                ["💬 WhatsApp Message", r.whatsappMessage],
                ["🔑 Closing Angle", r.closingAngle],
                ["✉️ Cold Email Template", r.emailTemplate],
              ];
              return sections.filter(([, v]) => safeStr(v)).map(([title, content], i) => (
                <div key={i} style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "800", color: accentColor, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "7px", paddingBottom: "5px", borderBottom: `1px solid ${C.border}` }}>{title}</div>
                  <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "14px", fontSize: "13px", lineHeight: "1.8", color: "rgba(240,246,252,0.82)", whiteSpace: "pre-wrap" }}>{safeStr(content)}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* COMPETITOR DEEP MODAL */}
      {selectedComp && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" }}
          onClick={e => e.target === e.currentTarget && setSelectedComp(null)}>
          <div style={{ background: C.bg2, border: `1px solid ${C.compBorder}`, borderRadius: "20px", padding: "32px", maxWidth: "700px", width: "100%", maxHeight: "90vh", overflowY: "auto", position: "relative" }}>
            <button onClick={() => setSelectedComp(null)}
              style={{ position: "absolute", top: "14px", right: "14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.muted, width: "30px", height: "30px", cursor: "pointer", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            <div style={{ fontSize: "11px", fontWeight: "800", color: C.compLight, letterSpacing: "2px", textTransform: "uppercase", marginBottom: "6px" }}>{"🕵️ COMPETITOR DEEP ANALYSIS"}</div>
            <div style={{ fontSize: "19px", fontWeight: "800", marginBottom: "3px" }}>{selectedComp.name}</div>
            <div style={{ fontSize: "12px", color: C.muted, marginBottom: "20px" }}>{selectedComp.marketPosition} · Strength {selectedComp.strength}/100</div>
            {selectedComp.loading && <div style={{ textAlign: "center", padding: "36px" }}><LoadingDots color={C.compLight} /><div style={{ color: C.muted, marginTop: "10px", fontSize: "13px" }}>Analyzing...</div></div>}
            {selectedComp.reportErr && <div style={{ color: "#F87171", padding: "14px", background: "rgba(239,68,68,0.08)", borderRadius: "10px", fontSize: "13px" }}>{selectedComp.reportErr}</div>}
            {selectedComp.report && (() => {
              const r = selectedComp.report;
              return [
                ["🔍 Deep Analysis", r.deepAnalysis],
                ["📊 Their Strategy", r.theirStrategy],
                ["🎯 Their Vulnerabilities", r.theirVulnerabilities],
                ["⚔️ How To Beat Them", r.howToBeatThem],
                ["🏆 Your Positioning", r.positioningMessage],
                ["📋 Action Plan", r.actionPlan],
                ["💡 Key Learning", r.keyLearning],
              ].filter(([, v]) => safeStr(v)).map(([title, value], i) => (
                <div key={i} style={{ marginBottom: "14px" }}>
                  <div style={{ fontSize: "10px", fontWeight: "800", color: C.compLight, textTransform: "uppercase", letterSpacing: "2px", marginBottom: "6px", paddingBottom: "5px", borderBottom: `1px solid ${C.border}` }}>{title}</div>
                  <div style={{ background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "9px", padding: "13px", fontSize: "13px", lineHeight: "1.8", color: "rgba(240,246,252,0.82)", whiteSpace: "pre-wrap" }}>{safeStr(value)}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

    </div>
  );
}

function LeadCard({ lead, saved, sc, mode, accentColor, accentGlow, websiteScore, onReport }) {
  if (!lead) return null;
  const isB2C = lead.leadType === "b2c" || mode === "b2c";
  return (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column", transition: "all 0.2s" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)"; e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 30px rgba(0,0,0,0.4)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div style={{ flex: 1, paddingRight: "8px" }}>
          <div style={{ fontSize: "14px", fontWeight: "800", marginBottom: "2px" }}>{lead.name}</div>
          <div style={{ fontSize: "10px", color: accentColor, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            {isB2C ? lead.platform : `${lead.type || ""} · ${lead.location || ""}`}
          </div>
        </div>
        <div style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: "8px", padding: "3px 8px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: "8px", fontWeight: "800", letterSpacing: "1px" }}>{sc.label}</div>
          <div style={{ fontSize: "15px", fontWeight: "900", lineHeight: 1.1 }}>{lead.score || 0}</div>
        </div>
      </div>

      {!isB2C && (
        <div style={{ marginBottom: "8px" }}>
          {lead.phone && <div style={{ fontSize: "11px", color: C.muted, marginBottom: "2px" }}>📞 {lead.phone}</div>}
          {lead.website === "No website" ? (
            <div style={{ fontSize: "11px", color: "#F87171", marginBottom: "2px" }}>{"🌐 ❌ No website"}</div>
          ) : lead.website ? (
            <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: "11px", color: accentColor, marginBottom: "2px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              🌐 {lead.website.replace(/https?:\/\//, "")} ↗
            </a>
          ) : null}
          <div style={{ fontSize: "11px", color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {lead.address}</div>
          {lead.rating && <div style={{ fontSize: "11px", color: "#FCD34D", marginTop: "2px" }}>⭐ {lead.rating}/5 ({lead.reviews} reviews)</div>}
          {/* Website Score Badge */}
          {websiteScore && (
            <div style={{ marginTop: "6px", display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ fontSize: "10px", fontWeight: "700", padding: "2px 8px", borderRadius: "6px", background: websiteScore.score >= 70 ? "rgba(16,185,129,0.15)" : websiteScore.score >= 40 ? "rgba(245,158,11,0.15)" : "rgba(239,68,68,0.15)", color: websiteScore.score >= 70 ? "#34D399" : websiteScore.score >= 40 ? "#FCD34D" : "#F87171", border: `1px solid ${websiteScore.score >= 70 ? "rgba(16,185,129,0.3)" : websiteScore.score >= 40 ? "rgba(245,158,11,0.3)" : "rgba(239,68,68,0.3)"}` }}>
                🌐 {websiteScore.score}/100
              </div>
              <span style={{ fontSize: "10px", color: C.dim }}>{websiteScore.verdict?.slice(0, 40)}...</span>
            </div>
          )}
        </div>
      )}

      {isB2C && (
        <div style={{ marginBottom: "8px" }}>
          {lead.keyMetric && <div style={{ fontSize: "11px", color: "#FCD34D", fontWeight: "600", marginBottom: "2px" }}>📊 {lead.keyMetric}</div>}
          <div style={{ fontSize: "11px", color: C.muted, marginBottom: "2px", lineHeight: "1.4" }}>📱 {lead.engagement}</div>
          {lead.bestApproach && <div style={{ fontSize: "11px", color: accentColor, fontWeight: "600" }}>💬 {lead.bestApproach}</div>}
        </div>
      )}

      {lead.weaknesses?.length > 0 && (
        <div style={{ marginBottom: "8px", display: "flex", flexWrap: "wrap", gap: "3px" }}>
          {lead.weaknesses.map((w, i) => (
            <span key={i} style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.18)", borderRadius: "5px", padding: "2px 6px", fontSize: "10px", color: "#F87171", fontWeight: "600" }}>⚠ {w}</span>
          ))}
        </div>
      )}

      <div style={{ fontSize: "12px", color: C.muted, lineHeight: "1.6", marginBottom: "12px", flexGrow: 1 }}>{lead.painPoint}</div>
      {saved && <div style={{ fontSize: "10px", color: "#34D399", marginBottom: "6px", fontWeight: "600" }}>{"✅ Saved · Reports included in session"}</div>}

      <div style={{ display: "flex", gap: "6px" }}>
        <button onClick={onReport}
          style={{ flex: 1, padding: "9px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: accentColor, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = accentGlow; e.currentTarget.style.borderColor = accentColor; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}>
          {saved?.report ? "View Report 📋" : "Get Report →"}
        </button>
        <button onClick={onCampaign} title="Build Campaign"
          style={{ padding: "9px 13px", background: C.campGlow, border: `1px solid ${C.campBorder}`, borderRadius: "8px", color: C.campLight, fontSize: "14px", cursor: "pointer" }}>
          📣
        </button>
      </div>
    </div>
  );
}

function SavedLeadCard({ lead, sc, accentColor, websiteScore, onReport, onStatus, onNotes, onDelete, onScoreWebsite, onCampaign }) {
  if (!lead) return null;
  const isB2C = lead.leadType === "b2c" || lead.mode === "b2c";
  const sc2 = sc || scoreColor(70);
  return (
    <div style={{ background: C.bg2, border: `1px solid ${lead.status === "closed" ? "rgba(16,185,129,0.2)" : lead.status === "inprogress" ? "rgba(245,158,11,0.15)" : C.border}`, borderRadius: "14px", padding: "18px", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
        <div style={{ flex: 1, paddingRight: "8px" }}>
          <div style={{ fontSize: "13px", fontWeight: "800", marginBottom: "2px" }}>{lead.name}</div>
          <div style={{ fontSize: "10px", color: accentColor, fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.8px" }}>
            {isB2C ? (lead.platform || "B2C") : `${lead.type || ""} · ${lead.location || ""}`}
          </div>
        </div>
        <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
          <div style={{ background: sc2.bg, color: sc2.color, border: `1px solid ${sc2.border}`, borderRadius: "6px", padding: "3px 7px", textAlign: "center" }}>
            <div style={{ fontSize: "8px", fontWeight: "800" }}>{sc2.label}</div>
            <div style={{ fontSize: "13px", fontWeight: "900", lineHeight: 1.1 }}>{lead.score || 0}</div>
          </div>
          <button onClick={onDelete} style={{ width: "26px", height: "26px", background: "transparent", border: `1px solid rgba(239,68,68,0.2)`, borderRadius: "6px", color: "rgba(239,68,68,0.5)", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center" }}>🗑</button>
        </div>
      </div>

      <div style={{ marginBottom: "8px" }}>
        {!isB2C ? (
          <>
            {lead.phone && <div style={{ fontSize: "11px", color: C.muted, marginBottom: "2px" }}>📞 {lead.phone}</div>}
            {lead.website === "No website" ? <div style={{ fontSize: "11px", color: "#F87171", marginBottom: "2px" }}>{"🌐 ❌ No website"}</div>
              : lead.website ? <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "11px", color: accentColor, marginBottom: "2px", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>🌐 {lead.website.replace(/https?:\/\//, "")} ↗</a> : null}
            {lead.rating && <div style={{ fontSize: "11px", color: "#FCD34D" }}>⭐ {lead.rating}/5</div>}
            {websiteScore ? (
              <div style={{ marginTop: "4px", fontSize: "10px", fontWeight: "700", display: "inline-block", padding: "2px 8px", borderRadius: "6px", background: websiteScore.score >= 70 ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)", color: websiteScore.score >= 70 ? "#34D399" : "#F87171" }}>
                🌐 Website: {websiteScore.score}/100
              </div>
            ) : lead.website && lead.website !== "No website" && (
              <button onClick={onScoreWebsite} style={{ marginTop: "4px", fontSize: "10px", color: accentColor, background: "transparent", border: `1px solid ${accentColor}40`, borderRadius: "6px", padding: "2px 8px", cursor: "pointer" }}>
                {"Score website →"}
              </button>
            )}
          </>
        ) : (
          <>
            {lead.keyMetric && <div style={{ fontSize: "11px", color: "#FCD34D", fontWeight: "600", marginBottom: "2px" }}>📊 {lead.keyMetric}</div>}
            {lead.bestApproach && <div style={{ fontSize: "11px", color: accentColor }}>💬 {lead.bestApproach}</div>}
          </>
        )}
      </div>

      <div style={{ marginBottom: "8px" }}>
        <div style={{ fontSize: "9px", color: C.dim, letterSpacing: "1px", textTransform: "uppercase", marginBottom: "5px" }}>STATUS</div>
        <div style={{ display: "flex", gap: "3px", flexWrap: "wrap" }}>
          {STATUS_OPTIONS.map(s => (
            <button key={s.value} onClick={() => onStatus(s.value)}
              style={{ padding: "3px 7px", borderRadius: "6px", border: `1px solid ${lead.status === s.value ? s.color : "rgba(255,255,255,0.06)"}`, background: lead.status === s.value ? s.bg : "transparent", color: lead.status === s.value ? s.color : "rgba(240,246,252,0.25)", cursor: "pointer", fontSize: "10px", fontWeight: "600", transition: "all 0.15s" }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <textarea value={lead.notes || ""} onChange={e => onNotes(e.target.value)} placeholder="Add notes..."
        style={{ width: "100%", padding: "9px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: "8px", color: C.muted, fontSize: "12px", resize: "vertical", minHeight: "52px", fontFamily: "Inter,sans-serif", marginBottom: "8px", outline: "none" }} />

      <div style={{ display: "flex", gap: "6px" }}>
        <button onClick={onReport}
          style={{ flex: 1, padding: "9px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", color: accentColor, fontSize: "12px", fontWeight: "700", cursor: "pointer" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.07)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
          {lead.report ? "View Report 📋" : "Get Report →"}
        </button>
        <button onClick={onCampaign} title="Build Campaign"
          style={{ padding: "9px 13px", background: C.campGlow, border: `1px solid ${C.campBorder}`, borderRadius: "8px", color: C.campLight, fontSize: "14px", cursor: "pointer" }}>
          📣
        </button>
      </div>
    </div>
  );
}

export default function PitchMind() {
  return <ErrorBoundary><PitchMindApp /></ErrorBoundary>;
}
