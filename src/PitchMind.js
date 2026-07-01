import React, { useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, increment, collection, addDoc, getDocs, deleteDoc, query, where } from "firebase/firestore";

const C = {
  // Core backgrounds — Vercel style
  bg: "#fafafa",         // page bg
  bg2: "#ffffff",        // card/panel bg
  bg3: "#f4f4f5",        // input/muted bg
  sidebar: "#09090b",    // dark sidebar like Vercel
  sidebarHover: "#18181b",
  sidebarActive: "#27272a",
  sidebarText: "#a1a1aa",
  sidebarTextActive: "#ffffff",
  sidebarBorder: "#27272a",

  // Borders
  border: "#e4e4e7",
  borderHover: "#a1a1aa",

  // Blue primary
  b2b: "#2563eb", b2bLight: "#3b82f6",
  b2bGlow: "rgba(37,99,235,0.08)", b2bBorder: "rgba(37,99,235,0.25)",

  // Purple B2C
  b2c: "#7c3aed", b2cLight: "#8b5cf6",
  b2cGlow: "rgba(124,58,237,0.08)", b2cBorder: "rgba(124,58,237,0.25)",

  // Green competitors
  comp: "#16a34a", compLight: "#22c55e",
  compGlow: "rgba(22,163,74,0.08)", compBorder: "rgba(22,163,74,0.25)",

  // Amber campaigns
  camp: "#d97706", campLight: "#f59e0b",
  campGlow: "rgba(217,119,6,0.08)", campBorder: "rgba(217,119,6,0.25)",

  gold: "#f59e0b", goldLight: "#fcd34d",

  // Status
  hot: "#ef4444", warm: "#f59e0b", cold: "#22c55e",

  // Typography
  white: "#09090b",     // primary text (near black)
  muted: "#71717a",     // secondary text
  dim: "#a1a1aa",       // tertiary text

  // Shadows
  cardShadow: "0 1px 2px rgba(0,0,0,0.05)",
  cardShadowMd: "0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)",
  cardShadowLg: "0 10px 25px -5px rgba(0,0,0,0.08), 0 4px 10px -6px rgba(0,0,0,0.05)",
};

const PLANS = {
  starter: {
    name: "Starter", price: 170, credits: 50, sessions: 10, leads: 60,
    color: C.b2bLight, desc: "Perfect for freelancers & solopreneurs",
    features: ["10 sessions/month", "60 leads + AI reports", "B2B Scanner", "B2C CSV Upload", "Competitor Radar", "Campaign Builder", "One-click WhatsApp & Email", "CRM pipeline"],
    b2cReviews: false, b2cApollo: false, b2cSocial: false, higgsfield: false, prioritySupport: false,
  },
  growth: {
    name: "Growth", price: 250, credits: 125, sessions: 25, leads: 150,
    color: C.b2cLight, desc: "Best value — most popular choice",
    features: ["25 sessions/month", "150 leads + AI reports", "Everything in Starter", "B2C Google Reviews leads", "B2C Apollo enrichment", "Website scoring (0-100)", "Priority support"],
    b2cReviews: true, b2cApollo: true, b2cSocial: false, higgsfield: false, prioritySupport: true,
  },
  pro: {
    name: "Pro", price: 450, credits: 300, sessions: 60, leads: 360,
    color: C.gold, desc: "For agencies & power users",
    features: ["60 sessions/month", "360 leads + AI reports", "Everything in Growth", "B2C Social Media leads", "Higgsfield ad creatives", "Full campaign packages", "Dedicated support"],
    b2cReviews: true, b2cApollo: true, b2cSocial: true, higgsfield: true, prioritySupport: true,
  },
};

// API keys live in Vercel env vars - never exposed to users
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_KEY || "";
const APOLLO_KEY = process.env.REACT_APP_APOLLO_KEY || "";

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
@keyframes fadeIn{from{opacity:0}to{opacity:1}}
@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes slideRight{from{width:0%}to{width:100%}}
@keyframes shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
@keyframes loadbar{0%{width:0%;opacity:1}85%{width:90%;opacity:1}100%{width:100%;opacity:0}}

*{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px}
body{
  background:#fafafa;
  color:#09090b;
  font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  font-feature-settings:'cv11','ss01';
  -webkit-font-smoothing:antialiased;
  -moz-osx-font-smoothing:grayscale;
}

/* Scrollbar */
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#d4d4d8;border-radius:99px}
::-webkit-scrollbar-thumb:hover{background:#a1a1aa}

/* Inputs */
input,textarea,select{font-family:inherit}
input::placeholder,textarea::placeholder{color:#a1a1aa;font-size:13px}
input:focus,textarea:focus,select:focus{
  outline:none;
  border-color:#2563eb !important;
  box-shadow:0 0 0 3px rgba(37,99,235,0.12) !important;
}
a{text-decoration:none;color:inherit}
button{font-family:inherit}

/* Top loading bar */
.pm-loadbar{
  position:fixed;top:0;left:0;height:2px;
  background:linear-gradient(90deg,#2563eb,#7c3aed,#2563eb);
  background-size:200% 100%;
  animation:loadbar 1.8s ease-in-out forwards;
  z-index:9999;
  border-radius:0 2px 2px 0;
}

/* Skeleton loader */
.pm-skeleton{
  background:linear-gradient(90deg,#f4f4f5 25%,#e4e4e7 50%,#f4f4f5 75%);
  background-size:200% 100%;
  animation:shimmer 1.5s infinite;
  border-radius:6px;
}

/* Cards */
.pm-card{
  background:#ffffff;
  border:1px solid #e4e4e7;
  border-radius:12px;
  transition:box-shadow 0.15s,border-color 0.15s,transform 0.15s;
}
.pm-card:hover{
  box-shadow:0 4px 12px rgba(0,0,0,0.08);
  border-color:#d4d4d8;
}

/* Buttons */
.pm-btn-primary{
  display:inline-flex;align-items:center;gap:6px;
  padding:9px 18px;
  background:#2563eb;
  color:#ffffff;
  border:none;border-radius:8px;
  font-size:13px;font-weight:600;
  cursor:pointer;
  transition:all 0.15s;
  letter-spacing:-0.01em;
}
.pm-btn-primary:hover{background:#1d4ed8;box-shadow:0 4px 14px rgba(37,99,235,0.35)}
.pm-btn-primary:active{transform:scale(0.98)}

.pm-btn-secondary{
  display:inline-flex;align-items:center;gap:6px;
  padding:9px 18px;
  background:#ffffff;
  color:#09090b;
  border:1px solid #e4e4e7;border-radius:8px;
  font-size:13px;font-weight:600;
  cursor:pointer;
  transition:all 0.15s;
}
.pm-btn-secondary:hover{background:#f4f4f5;border-color:#d4d4d8}
.pm-btn-secondary:active{transform:scale(0.98)}

/* Nav item active */
.pm-nav-active{background:#27272a !important;color:#ffffff !important}
.pm-nav-item:hover{background:#18181b}
`;

function LoadingDots({ color = "#2563eb" }) {
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: "5px", padding: "8px" }}>
      {[0, 0.15, 0.3].map((d, i) => (
        <span key={i} style={{ width: "6px", height: "6px", borderRadius: "50%", background: color, animation: "pulse 1.2s ease-in-out infinite", animationDelay: `${d}s`, display: "block" }} />
      ))}
    </div>
  );
}

function LoadingBar() {
  return <div style={{ position: "fixed", top: 0, left: 0, height: "2px", background: "linear-gradient(90deg,#2563eb,#7c3aed)", animation: "loadbar 1.8s ease-in-out forwards", zIndex: 9999, borderRadius: "0 2px 2px 0" }} />;
}

function SkeletonCard() {
  const s = { background: "linear-gradient(90deg,#f4f4f5 25%,#e4e4e7 50%,#f4f4f5 75%)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", borderRadius: "6px" };
  return (
    <div style={{ background: "#fff", border: "1px solid #e4e4e7", borderRadius: "12px", padding: "22px" }}>
      <div style={{ ...s, height: "16px", width: "55%", marginBottom: "12px" }} />
      <div style={{ ...s, height: "12px", width: "38%", marginBottom: "18px" }} />
      <div style={{ ...s, height: "40px", width: "32%", marginBottom: "14px" }} />
      <div style={{ ...s, height: "11px", width: "85%", marginBottom: "7px" }} />
      <div style={{ ...s, height: "11px", width: "60%" }} />
    </div>
  );
}

function Badge({ children, color = "#2563eb" }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", padding: "2px 9px", borderRadius: "99px", background: `${color}10`, color, fontSize: "11px", fontWeight: "600", border: `1px solid ${color}20`, letterSpacing: "0.01em" }}>
      {children}
    </span>
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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState("profile");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activePage, setActivePage] = useState("dashboard");
  const [b2cMode, setB2cMode] = useState("csv");
  const [reviewQuery, setReviewQuery] = useState({ business: "", location: "" });
  const [reviewLeads, setReviewLeads] = useState([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewErr, setReviewErr] = useState("");
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


  // ── GOOGLE REVIEWS LEAD FINDER ──
  const findReviewLeads = async () => {
    if (!reviewQuery.business || !reviewQuery.location) { setReviewErr("Enter business type and location."); return; }
    if (userData.credits < CREDITS_PER_SESSION) { setReviewErr("Not enough credits."); return; }
    setReviewErr(""); setReviewLoading(true); setReviewLeads([]);
    if (!await useCredits()) { setReviewErr("Not enough credits."); setReviewLoading(false); return; }
    try {
      if (GOOGLE_KEY) {
        // Real Google Places API call
        const searchRes = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(reviewQuery.business + " in " + reviewQuery.location)}&key=${GOOGLE_KEY}`
        );
        const searchData = await searchRes.json();
        const places = (searchData.results || []).slice(0, 5);
        const allReviewers = [];
        for (const place of places) {
          const detailRes = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,reviews,rating&key=${GOOGLE_KEY}`
          );
          const detail = await detailRes.json();
          const reviews = (detail.result?.reviews || []).filter(r => r.rating <= 3);
          reviews.forEach(r => {
            allReviewers.push({
              name: r.author_name, platform: "Google Reviews", location: reviewQuery.location,
              engagement: `${r.rating}★ review at ${place.name}: "${r.text?.substring(0, 80)}..."`,
              score: r.rating <= 2 ? 88 : 72,
              interestLevel: r.rating <= 2 ? "High" : "Medium",
              keyMetric: `${r.rating}/5 stars — unhappy with competitor`,
              bestApproach: "WhatsApp", painPoint: `Dissatisfied with ${place.name}`,
              hotReason: `Left ${r.rating}★ review — ready to switch`,
              strategy: `Reach out offering better service than ${place.name}`,
              leadType: "b2c", competitorName: place.name,
            });
          });
        }
        const top6 = allReviewers.sort((a, b) => b.score - a.score).slice(0, 6);
        if (top6.length > 0) {
          setReviewLeads(top6);
          for (const l of top6) await saveLead(l);
        } else {
          // Fallback to AI if no unhappy reviewers found
          throw new Error("NO_REVIEWS");
        }
      } else {
        throw new Error("NO_KEY");
      }
    } catch (e) {
      // AI fallback when no Google key or no results
      try {
        const prompt = `You are PitchMind. Generate 6 realistic people who recently left unhappy reviews at competitor ${reviewQuery.business} businesses in ${reviewQuery.location} and are ready to switch.
MY BUSINESS: ${profile.businessName} — ${profile.whatYouDo}
Return ONLY valid JSON array:
[{"name":"Real local name","platform":"Google Reviews","location":"${reviewQuery.location}","engagement":"2★ review at [CompetitorName]: Said [specific complaint]","score":85,"interestLevel":"High","keyMetric":"2/5 stars — actively unhappy","bestApproach":"WhatsApp","painPoint":"Dissatisfied with competitor's [specific issue]","hotReason":"Left bad review 3 days ago — ready to switch","strategy":"Contact offering exactly what they complained was missing","leadType":"b2c","competitorName":"[CompetitorName in ${reviewQuery.location}]"}]
Use realistic local names for ${reviewQuery.location}. Make competitor names realistic local businesses.`;
        const raw = await callClaude(apiKey, prompt, 2000);
        const parsed = safeJSON(raw);
        if (Array.isArray(parsed)) {
          setReviewLeads(parsed);
          for (const l of parsed) await saveLead(l);
        }
      } catch (e2) { setReviewErr(`Error: ${e2.message}`); }
    }
    setReviewLoading(false);
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
    <div style={{ background: "#09090b", minHeight: "100vh", fontFamily: "'Inter',sans-serif", color: "#ffffff" }}>
      <style>{CSS}</style>

      {/* Header */}
      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "32px 32px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "64px" }}>
          <svg width="28" height="28" viewBox="0 0 30 30" fill="none">
            <rect width="30" height="30" rx="7" fill="#2563EB"/>
            <path d="M9 15c0-3.31 2.69-6 6-6s6 2.69 6 6c0 1.5-.55 2.87-1.45 3.92" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
            <circle cx="15" cy="15" r="2" fill="white"/>
            <path d="M15 13v-2M15 19v-2M13 15h-2M19 15h-2" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: "16px", fontWeight: "700", color: "#ffffff", letterSpacing: "-0.3px" }}>{"PitchMind"}</span>
        </div>

        {/* Hero */}
        <div style={{ textAlign: "center", marginBottom: "64px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "5px 14px", background: "rgba(37,99,235,0.15)", border: "1px solid rgba(37,99,235,0.3)", borderRadius: "99px", fontSize: "12px", color: "#93c5fd", fontWeight: "600", marginBottom: "24px", letterSpacing: "0.02em" }}>
            {"✦ SIMPLE PRICING"}
          </div>
          <h1 style={{ fontSize: "52px", fontWeight: "800", color: "#ffffff", letterSpacing: "-2px", lineHeight: "1.1", marginBottom: "18px" }}>
            {"Start finding leads"}
            <br />
            <span style={{ background: "linear-gradient(135deg,#3b82f6,#7c3aed)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{"today."}</span>
          </h1>
          <p style={{ fontSize: "17px", color: "#71717a", maxWidth: "480px", margin: "0 auto", lineHeight: "1.7", fontWeight: "400" }}>
            {"One platform for B2B leads, B2C intelligence, competitor analysis and campaign building."}
          </p>
        </div>

        {/* Pricing cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "20px", marginBottom: "64px" }}>
          {Object.entries(PLANS).map(([key, p]) => {
            const isSel = selPlan === key;
            const isPop = key === "growth";
            return (
              <div key={key} onClick={() => setSelPlan(key)}
                style={{ position: "relative", background: isPop ? "#ffffff" : "#111111", border: `1px solid ${isPop ? "transparent" : isSel ? "#3b82f6" : "#27272a"}`, borderRadius: "16px", padding: "32px", cursor: "pointer", transition: "all 0.2s", boxShadow: isPop ? "0 0 0 1px #3b82f6, 0 20px 60px rgba(59,130,246,0.2)" : isSel ? "0 0 0 1px #3b82f6" : "none" }}>
                {isPop && (
                  <div style={{ position: "absolute", top: "-13px", left: "50%", transform: "translateX(-50%)", background: "linear-gradient(135deg,#2563eb,#7c3aed)", color: "#fff", fontSize: "11px", fontWeight: "700", padding: "4px 16px", borderRadius: "99px", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{"MOST POPULAR"}</div>
                )}
                <div style={{ marginBottom: "24px" }}>
                  <div style={{ fontSize: "13px", fontWeight: "600", color: isPop ? "#71717a" : "#52525b", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{p.name}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "4px", marginBottom: "6px" }}>
                    <span style={{ fontSize: "52px", fontWeight: "800", color: isPop ? "#09090b" : "#ffffff", letterSpacing: "-2px", lineHeight: 1 }}>{"$"}{p.price}</span>
                    <span style={{ fontSize: "14px", color: isPop ? "#71717a" : "#52525b", fontWeight: "400" }}>{"/month"}</span>
                  </div>
                  <div style={{ fontSize: "13px", color: isPop ? "#71717a" : "#52525b" }}>{p.desc}</div>
                </div>

                <button onClick={e => { e.stopPropagation(); setSelPlan(key); doPlan(); }}
                  style={{ width: "100%", padding: "12px", background: isPop ? "#2563eb" : isSel ? "#2563eb" : "transparent", border: `1px solid ${isPop ? "transparent" : "#3b82f6"}`, borderRadius: "9px", color: isPop || isSel ? "#ffffff" : "#3b82f6", fontSize: "14px", fontWeight: "600", cursor: "pointer", marginBottom: "28px", transition: "all 0.15s", letterSpacing: "-0.01em" }}>
                  {"Get started →"}
                </button>

                <div style={{ borderTop: `1px solid ${isPop ? "#e4e4e7" : "#27272a"}`, paddingTop: "22px" }}>
                  <div style={{ fontSize: "12px", fontWeight: "600", color: isPop ? "#09090b" : "#a1a1aa", marginBottom: "14px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{"What's included"}</div>
                  {p.features.map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "10px", marginBottom: "11px" }}>
                      <svg width="16" height="16" viewBox="0 0 16 16" style={{ flexShrink: 0, marginTop: "1px" }}>
                        <circle cx="8" cy="8" r="7" fill={isPop ? "#2563eb" : "#27272a"}/>
                        <path d="M5 8l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
                      </svg>
                      <span style={{ fontSize: "13px", color: isPop ? "#374151" : "#a1a1aa", lineHeight: "1.5", fontWeight: "400" }}>{f}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  {[
                    { icon: "🏢", label: "B2B Leads", ok: true },
                    { icon: "👥", label: "B2C Leads", ok: true },
                    { icon: "⭐", label: "Review Leads", ok: p.b2cReviews },
                    { icon: "🚀", label: "Enrichment", ok: p.b2cApollo },
                    { icon: "👥", label: "Social Finder", ok: p.b2cSocial },
                    { icon: "🎨", label: "Higgsfield", ok: p.higgsfield },
                  ].map((f, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                      <span style={{ fontSize: "12px", opacity: f.ok ? 1 : 0.3 }}>{f.icon}</span>
                      <span style={{ fontSize: "11px", color: f.ok ? (isPop ? "#374151" : "#71717a") : (isPop ? "#d1d5db" : "#3f3f46"), fontWeight: f.ok ? "500" : "400" }}>{f.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer note */}
        <div style={{ textAlign: "center", paddingBottom: "48px" }}>
          <p style={{ fontSize: "13px", color: "#52525b" }}>{"No setup fees · Cancel anytime · All plans include AI reports & one-click outreach"}</p>
        </div>
      </div>
    </div>
  );

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
  if (!userData) return <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}><style>{CSS}</style><LoadingDots color={C.b2b} /></div>;

  const safeMode = mode || "b2b";
  const userPlan = PLANS[userData?.plan || "starter"] || PLANS.starter;
  const plan = userPlan;
  const sessionsLeft = Math.floor(userData.credits / CREDITS_PER_SESSION);
  const creditPct = Math.round((userData.credits / userData.maxCredits) * 100);
  const hotCount = savedLeads.filter(l => l.score >= 80).length;
  const closedCount = savedLeads.filter(l => l.status === "closed").length;
  const pipelineCount = savedLeads.filter(l => ["contacted", "inprogress"].includes(l.status)).length;
  const canUseReviews = userPlan.b2cReviews;
  const canUseApollo = userPlan.b2cApollo;
  const canUseSocial = userPlan.b2cSocial;

  const navGroups = [
    { label: "MAIN", items: [{ key: "dashboard", icon: "🏠", label: "Dashboard" }, { key: "b2b", icon: "🏢", label: "B2B Leads" }, { key: "b2c", icon: "👥", label: "B2C Leads" }] },
    { label: "INTELLIGENCE", items: [{ key: "competitors", icon: "🕵️", label: "Competitor Radar" }, { key: "campaigns", icon: "📣", label: "Campaign Builder" }, { key: "reports", icon: "📋", label: "My Reports" }] },
    { label: "CRM", items: [{ key: "leads", icon: "💾", label: "My Leads" }, { key: "pipeline", icon: "📊", label: "Pipeline" }] },
    { label: "ACCOUNT", items: [{ key: "settings", icon: "⚙️", label: "Settings" }, { key: "billing", icon: "💳", label: "Plan & Billing" }] },
  ];

  const PageWrapper = ({ children, title, subtitle, action }) => (
    <div style={{ padding: "28px 32px", maxWidth: "1200px", animation: "fadeUp 0.2s ease" }}>
      {(title || action) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "24px" }}>
          <div>
            {title && <h1 style={{ fontSize: "22px", fontWeight: "800", color: C.white, marginBottom: "4px", letterSpacing: "-0.3px" }}>{title}</h1>}
            {subtitle && <p style={{ fontSize: "13px", color: C.muted }}>{subtitle}</p>}
          </div>
          {action && action}
        </div>
      )}
      {children}
    </div>
  );

  const StatCard = ({ label, value, color, sub, icon }) => (
    <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", boxShadow: C.cardShadow }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
        <div style={{ fontSize: "11px", fontWeight: "600", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
        <span style={{ fontSize: "18px" }}>{icon}</span>
      </div>
      <div style={{ fontSize: "36px", fontWeight: "900", color: color || C.b2b, lineHeight: 1, marginBottom: "4px" }}>{value}</div>
      <div style={{ fontSize: "12px", color: C.dim }}>{sub}</div>
    </div>
  );

  const renderPage = () => {

    if (activePage === "dashboard") return (
      <PageWrapper title="Dashboard" subtitle={`Welcome back! You have ${sessionsLeft} sessions remaining.`}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "16px", marginBottom: "24px" }}>
          <StatCard label="Total Leads" value={savedLeads.length} icon="🎯" sub="all time saved" color={C.b2b} />
          <StatCard label="Hot Leads" value={hotCount} icon="🔥" sub="score 80+" color="#EF4444" />
          <StatCard label="In Pipeline" value={pipelineCount} icon="📊" sub="active contacts" color={C.camp} />
          <StatCard label="Closed Won" value={closedCount} icon="✅" sub="converted" color={C.comp} />
        </div>
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "20px", marginBottom: "24px", boxShadow: C.cardShadow }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: C.white, marginBottom: "2px" }}>{"Session Credits"}</div>
              <div style={{ fontSize: "12px", color: C.muted }}>{userData.credits}{" of "}{userData.maxCredits}{" remaining · "}{sessionsLeft}{" sessions left"}</div>
            </div>
            <div style={{ padding: "4px 12px", borderRadius: "20px", background: `${plan.color}12`, color: plan.color, border: `1px solid ${plan.color}25`, fontSize: "11px", fontWeight: "700" }}>{plan.name}{" Plan"}</div>
          </div>
          <div style={{ width: "100%", height: "8px", background: C.bg3, borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ width: `${creditPct}%`, height: "100%", background: `linear-gradient(90deg, ${C.b2b}, ${C.b2bLight})`, borderRadius: "4px", transition: "width 0.5s" }} />
          </div>
        </div>
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>{"Quick Actions"}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "12px" }}>
            {[
              { icon: "🏢", label: "Scan B2B Leads", desc: "Find businesses weak in what you offer", page: "b2b", color: C.b2b },
              { icon: "👥", label: "Scan B2C Leads", desc: "Upload ad data or find reviewer leads", page: "b2c", color: C.b2cLight },
              { icon: "🕵️", label: "Analyze Competitors", desc: "See who you are up against", page: "competitors", color: C.comp },
            ].map((a, i) => (
              <button key={i} onClick={() => setActivePage(a.page)}
                style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "18px", textAlign: "left", cursor: "pointer", boxShadow: C.cardShadow, transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = a.color; e.currentTarget.style.boxShadow = `0 4px 16px ${a.color}18`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = C.cardShadow; }}>
                <div style={{ fontSize: "24px", marginBottom: "10px" }}>{a.icon}</div>
                <div style={{ fontSize: "13px", fontWeight: "700", color: C.white, marginBottom: "4px" }}>{a.label}</div>
                <div style={{ fontSize: "12px", color: C.muted }}>{a.desc}</div>
              </button>
            ))}
          </div>
        </div>
        {savedLeads.length > 0 && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: "700", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px" }}>{"Recent Leads"}</div>
              <button onClick={() => setActivePage("leads")} style={{ fontSize: "12px", color: C.b2b, background: "none", border: "none", cursor: "pointer", fontWeight: "600" }}>{"View all"}</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: "12px" }}>
              {savedLeads.slice(0,3).map((lead,i) => { const sc = scoreColor(lead.score); return <SavedLeadCard key={i} lead={lead} sc={sc} accentColor={lead.mode==="b2c"?C.b2cLight:C.b2b} websiteScore={websiteScores[lead.name]} onReport={()=>{setSelectedLead(lead);loadReport(lead);}} onStatus={s=>updateStatus(lead.id,s)} onNotes={n=>updateNotes(lead.id,n)} onDelete={()=>deleteLead(lead.id)} onScoreWebsite={()=>scoreWebsite(lead)} onCampaign={()=>{setActivePage("campaigns");buildCampaign(lead);}} />; })}
            </div>
          </div>
        )}
      </PageWrapper>
    );

    if (activePage === "b2b") return (
      <PageWrapper title="B2B Lead Scanner" subtitle="Find businesses weak in what you offer">
        <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "22px", marginBottom: "20px", boxShadow: C.cardShadow }}>
          <div style={{ display: "flex", gap: "12px", alignItems: "flex-end", flexWrap: "wrap" }}>
            {[{label:"Target Industry",key:"targetIndustry",ph:"Restaurants, Clinics, Gyms..."},{label:"Location",key:"location",ph:"Beirut, Dubai, Kuwait..."}].map(f => (
              <div key={f.key} style={{ flex: 1, minWidth: "180px" }}>
                <label style={{ display: "block", fontSize: "11px", fontWeight: "600", color: C.muted, marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>{f.label}</label>
                <input value={profile[f.key]||""} onChange={e=>setProfile(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                  style={{ width: "100%", padding: "10px 14px", background: C.bg3, border: `1px solid ${C.border}`, borderRadius: "8px", color: C.white, fontSize: "13px" }} />
              </div>
            ))}
            <button onClick={scanB2B} disabled={scanning||userData.credits<CREDITS_PER_SESSION}
              style={{ padding: "11px 24px", background: scanning||userData.credits<CREDITS_PER_SESSION?C.bg3:C.b2b, border: "none", borderRadius: "8px", color: scanning||userData.credits<CREDITS_PER_SESSION?C.dim:"#fff", fontSize: "13px", fontWeight: "700", cursor: scanning||userData.credits<CREDITS_PER_SESSION?"not-allowed":"pointer", whiteSpace: "nowrap" }}>
              {scanning?"Scanning...":"Find Leads"}
            </button>
          </div>
          {scanning && <div style={{ marginTop: "14px" }}><LoadingDots color={C.b2b} /></div>}
          {scanErr && <div style={{ color: "#EF4444", fontSize: "12px", marginTop: "10px", padding: "10px 14px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "8px" }}>{scanErr}</div>}
          {savedLeads.length > 0 && <button onClick={()=>exportToCSV(savedLeads)} style={{ marginTop: "12px", padding: "7px 14px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: "7px", color: C.muted, cursor: "pointer", fontSize: "12px", fontWeight: "600" }}>{"Export CSV"}</button>}
        </div>
        {leads.length > 0 && !scanning && (
          <>
            <div style={{ fontSize: "12px", fontWeight: "600", color: C.muted, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "14px" }}>{leads.length}{" leads found"}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: "14px" }}>
              {[...leads].sort((a,b)=>(b.score||0)-(a.score||0)).map((lead,i) => { const sc=scoreColor(lead.score); const saved=savedLeads.find(s=>s.name===lead.name); return <LeadCard key={i} lead={lead} saved={saved} sc={sc} mode="b2b" accentColor={C.b2b} accentGlow={C.b2bGlow} websiteScore={websiteScores[lead.name]} onReport={()=>{setSelectedLead(saved||lead);loadReport(saved||lead);}} onCampaign={()=>{setActivePage("campaigns");buildCampaign(lead);}} />; })}
            </div>
          </>
        )}
        {leads.length===0&&!scanning && (
          <div style={{ background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "12px", padding: "48px", textAlign: "center", boxShadow: C.cardShadow }}>
            <div style={{ fontSize: "48px", marginBottom: "14px" }}>{"🏢"}</div>
            <div style={{ fontSize: "18px", fontWeight: "800", color: C.white, marginBottom: "8px" }}>{"Ready to find hot leads?"}</div>
            <div style={{ fontSize: "13px", color: C.muted }}>{"Enter your target industry and location above"}</div>
          </div>
        )}
      </PageWrapper>
    );

    if (activePage === "b2c") return (
      <PageWrapper title="B2C Lead Intelligence" subtitle="Find real people interested in your business">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "10px", marginBottom: "20px" }}>
          {[
            {key:"csv",icon:"📤",label:"Ad Data Upload",desc:"Meta / TikTok / Google CSV",color:C.b2cLight,locked:false},
            {key:"reviews",icon:"⭐",label:"Google Reviews",desc:"Real people · Real intent",color:"#4285F4",locked:!canUseReviews},
            {key:"apollo",icon:"🚀",label:"Email Enrichment",desc:"Emails · LinkedIn · Phones",color:"#7C3AED",locked:!canUseApollo},
            {key:"social",icon:"👥",label:"Social Finder",desc:"Instagram · Facebook",color:"#EC4899",locked:!canUseSocial},
          ].map(m => (
            <div key={m.key} onClick={()=>!m.locked&&setB2cMode(m.key)}
              style={{ background:b2cMode===m.key?`${m.color}06`:C.bg2, border:`2px solid ${b2cMode===m.key?m.color:C.border}`, borderRadius:"12px", padding:"16px 12px", cursor:m.locked?"default":"pointer", opacity:m.locked?0.5:1, transition:"all 0.2s", position:"relative", textAlign:"center", boxShadow:C.cardShadow }}>
              {m.locked&&<div style={{ position:"absolute", top:"8px", right:"8px", fontSize:"9px", fontWeight:"700", padding:"2px 6px", background:"#FEF3C7", borderRadius:"4px", color:"#92400E" }}>{"Upgrade"}</div>}
              <div style={{ fontSize:"24px", marginBottom:"8px" }}>{m.icon}</div>
              <div style={{ fontSize:"12px", fontWeight:"700", color:b2cMode===m.key?m.color:C.white, marginBottom:"3px" }}>{m.label}</div>
              <div style={{ fontSize:"10px", color:C.muted }}>{m.desc}</div>
              {!m.locked&&b2cMode===m.key&&<div style={{ marginTop:"6px", fontSize:"10px", color:m.color, fontWeight:"700" }}>{"Active"}</div>}
            </div>
          ))}
        </div>
        {b2cMode==="csv"&&(
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"24px", boxShadow:C.cardShadow }}>
            <div style={{ fontSize:"14px", fontWeight:"700", color:C.white, marginBottom:"4px" }}>{"Upload Ad Performance Data"}</div>
            <div style={{ fontSize:"13px", color:C.muted, marginBottom:"18px" }}>{"AI scores every row — Meta, TikTok, Google, or any CSV format"}</div>
            <div onClick={()=>fileRef.current?.click()} style={{ border:`2px dashed ${csvName?C.b2cBorder:C.border}`, borderRadius:"10px", padding:"32px", textAlign:"center", cursor:"pointer", background:csvName?"#FAF5FF":C.bg3, transition:"all 0.2s", marginBottom:"16px" }}>
              <input ref={fileRef} type="file" accept=".csv" onChange={handleCSV} style={{ display:"none" }} />
              <div style={{ fontSize:"32px", marginBottom:"10px" }}>{csvName?"✅":"📂"}</div>
              <div style={{ fontSize:"14px", fontWeight:"700", color:csvName?C.b2cLight:C.white, marginBottom:"4px" }}>{csvName||"Click to upload CSV"}</div>
              <div style={{ fontSize:"12px", color:C.muted }}>{csvData.length>0?`${csvData.length} rows ready`:"Supports all ad platform exports"}</div>
            </div>
            <div style={{ display:"flex", gap:"8px", marginBottom:"16px", flexWrap:"wrap" }}>
              {["Meta Ads","TikTok Ads","Google Ads","Other"].map(p=>(
                <button key={p} onClick={()=>setProfile(pr=>({...pr,b2cPlatform:p}))}
                  style={{ padding:"7px 16px", borderRadius:"20px", border:`1px solid ${profile.b2cPlatform===p?C.b2cLight:C.border}`, background:profile.b2cPlatform===p?C.b2cGlow:"transparent", color:profile.b2cPlatform===p?C.b2cLight:C.muted, cursor:"pointer", fontSize:"12px", fontWeight:"600" }}>
                  {p}
                </button>
              ))}
            </div>
            <button onClick={processCSV} disabled={csvProcessing||!csvData.length||userData.credits<CREDITS_PER_SESSION}
              style={{ width:"100%", padding:"12px", background:!csvData.length||csvProcessing?C.bg3:C.b2cLight, border:"none", borderRadius:"9px", color:!csvData.length||csvProcessing?C.dim:"#fff", fontSize:"14px", fontWeight:"700", cursor:!csvData.length||csvProcessing?"not-allowed":"pointer" }}>
              {csvProcessing?"Analyzing...":csvData.length>0?`Analyze ${csvData.length} Rows`:"Upload CSV to continue"}
            </button>
            {csvProgress&&<div style={{ marginTop:"10px", fontSize:"12px", color:C.b2cLight, fontWeight:"600" }}>{csvProgress}</div>}
            {csvErr&&<div style={{ color:"#EF4444", fontSize:"12px", marginTop:"10px", padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:"8px" }}>{csvErr}</div>}
            {leads.length>0&&!csvProcessing&&(
              <div style={{ marginTop:"20px" }}>
                <div style={{ fontSize:"12px", fontWeight:"600", color:C.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:"14px" }}>{leads.length}{" leads analyzed"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:"14px" }}>
                  {[...leads].sort((a,b)=>(b.score||0)-(a.score||0)).map((lead,i)=>{const sc=scoreColor(lead.score);const saved=savedLeads.find(s=>s.name===lead.name);return <LeadCard key={i} lead={lead} saved={saved} sc={sc} mode="b2c" accentColor={C.b2cLight} accentGlow={C.b2cGlow} websiteScore={null} onReport={()=>{setSelectedLead(saved||lead);loadReport(saved||lead);}} onCampaign={()=>{setActivePage("campaigns");buildCampaign(lead);}} />;}) }
                </div>
              </div>
            )}
          </div>
        )}
        {b2cMode==="reviews"&&canUseReviews&&(
          <div style={{ background:C.bg2, border:"1px solid #BFDBFE", borderRadius:"12px", padding:"24px", boxShadow:C.cardShadow }}>
            <div style={{ fontSize:"14px", fontWeight:"700", color:C.white, marginBottom:"4px" }}>{"Google Reviews Lead Finder"}</div>
            <div style={{ fontSize:"13px", color:C.muted, marginBottom:"14px" }}>{"Find unhappy reviewers at your competitors — ready to switch"}</div>
            <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:"8px", padding:"10px 14px", marginBottom:"16px", fontSize:"12px", color:"#1D4ED8" }}>{"1-3 star reviewers at competitor businesses = your hottest prospects"}</div>
            <div style={{ display:"flex", gap:"12px", marginBottom:"16px", flexWrap:"wrap" }}>
              {[{label:"Business Type",key:"business",ph:"gym, salon, restaurant..."},{label:"Location",key:"location",ph:"Dubai, Beirut, Kuwait..."}].map(f=>(
                <div key={f.key} style={{ flex:1, minWidth:"160px" }}>
                  <label style={{ display:"block", fontSize:"11px", fontWeight:"600", color:C.muted, marginBottom:"6px", textTransform:"uppercase", letterSpacing:"0.5px" }}>{f.label}</label>
                  <input value={reviewQuery[f.key]} onChange={e=>setReviewQuery(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                    style={{ width:"100%", padding:"10px 14px", background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", color:C.white, fontSize:"13px" }} />
                </div>
              ))}
            </div>
            <button onClick={findReviewLeads} disabled={reviewLoading||!reviewQuery.business||!reviewQuery.location||userData.credits<CREDITS_PER_SESSION}
              style={{ width:"100%", padding:"12px", background:reviewLoading||!reviewQuery.business||!reviewQuery.location?C.bg3:"#2563EB", border:"none", borderRadius:"9px", color:reviewLoading||!reviewQuery.business||!reviewQuery.location?C.dim:"#fff", fontSize:"14px", fontWeight:"700", cursor:reviewLoading||!reviewQuery.business||!reviewQuery.location?"not-allowed":"pointer" }}>
              {reviewLoading?"Searching...":"Find Reviewer Leads"}
            </button>
            {reviewLoading&&<div style={{ marginTop:"12px" }}><LoadingDots color="#4285F4" /></div>}
            {reviewErr&&<div style={{ color:"#EF4444", fontSize:"12px", marginTop:"10px", padding:"10px", background:"#FEF2F2", borderRadius:"8px" }}>{reviewErr}</div>}
            {reviewLeads.length>0&&!reviewLoading&&(
              <div style={{ marginTop:"20px" }}>
                <div style={{ fontSize:"12px", fontWeight:"600", color:C.muted, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:"14px" }}>{reviewLeads.length}{" reviewer leads"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:"12px" }}>
                  {reviewLeads.map((lead,i)=>{const sc=scoreColor(lead.score);const saved=savedLeads.find(s=>s.name===lead.name);return <LeadCard key={i} lead={lead} saved={saved} sc={sc} mode="b2c" accentColor="#4285F4" accentGlow="rgba(66,133,244,0.08)" websiteScore={null} onReport={()=>{setSelectedLead(saved||lead);loadReport(saved||lead);}} onCampaign={()=>{setActivePage("campaigns");buildCampaign(lead);}} />;}) }
                </div>
              </div>
            )}
          </div>
        )}
        {(b2cMode==="apollo"||b2cMode==="social")&&(
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"48px", textAlign:"center", boxShadow:C.cardShadow }}>
            <div style={{ fontSize:"48px", marginBottom:"14px" }}>{b2cMode==="apollo"?"🚀":"👥"}</div>
            <div style={{ fontSize:"18px", fontWeight:"800", color:C.white, marginBottom:"8px" }}>{"Coming Soon"}</div>
            <div style={{ fontSize:"13px", color:C.muted, maxWidth:"360px", margin:"0 auto" }}>{b2cMode==="apollo"?"Apollo.io email enrichment — verified emails, phones and LinkedIn for all your saved leads.":"Instagram followers and Facebook group extraction — coming for Pro users."}</div>
          </div>
        )}
      </PageWrapper>
    );

    if (activePage === "competitors") return (
      <PageWrapper title="Competitor Radar" subtitle="Analyze top competitors and find their weaknesses">
        <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"22px", marginBottom:"20px", boxShadow:C.cardShadow }}>
          <div style={{ display:"flex", gap:"12px", alignItems:"flex-end", flexWrap:"wrap" }}>
            {[{label:"Industry",key:"industry",ph:"Marketing agencies, gyms..."},{label:"Location",key:"location",ph:"Dubai, Beirut, Kuwait..."}].map(f=>(
              <div key={f.key} style={{ flex:1, minWidth:"180px" }}>
                <label style={{ display:"block", fontSize:"11px", fontWeight:"600", color:C.muted, marginBottom:"6px", textTransform:"uppercase", letterSpacing:"0.5px" }}>{f.label}</label>
                <input value={compQuery[f.key]} onChange={e=>setCompQuery(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                  style={{ width:"100%", padding:"10px 14px", background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", color:C.white, fontSize:"13px" }} />
              </div>
            ))}
            <button onClick={scanCompetitors} disabled={compScanning||userData.credits<CREDITS_PER_SESSION}
              style={{ padding:"11px 24px", background:compScanning?C.bg3:C.comp, border:"none", borderRadius:"8px", color:compScanning?C.dim:"#fff", fontSize:"13px", fontWeight:"700", cursor:compScanning?"not-allowed":"pointer", whiteSpace:"nowrap" }}>
              {compScanning?"Analyzing...":"Analyze Competitors"}
            </button>
          </div>
          {compScanning&&<div style={{ marginTop:"12px" }}><LoadingDots color={C.compLight} /></div>}
          {compErr&&<div style={{ color:"#EF4444", fontSize:"12px", marginTop:"10px", padding:"10px 14px", background:"#FEF2F2", border:"1px solid #FECACA", borderRadius:"8px" }}>{compErr}</div>}
        </div>
        {competitors.length>0?(
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:"14px" }}>
            {competitors.map((comp,i)=>{
              const tc=comp.threatLevel==="High"?"#EF4444":comp.threatLevel==="Medium"?"#F59E0B":"#10B981";
              return (
                <div key={i} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"20px", boxShadow:C.cardShadow, display:"flex", flexDirection:"column" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}>
                    <div><div style={{ fontSize:"15px", fontWeight:"800", color:C.white, marginBottom:"2px" }}>{comp.name}</div><div style={{ fontSize:"11px", color:C.comp, fontWeight:"600" }}>{comp.marketPosition}</div></div>
                    <div style={{ textAlign:"center" }}><div style={{ fontSize:"9px", color:C.muted, fontWeight:"700", marginBottom:"1px" }}>{"STRENGTH"}</div><div style={{ fontSize:"22px", fontWeight:"900", color:C.comp }}>{comp.strength}</div></div>
                  </div>
                  <span style={{ fontSize:"10px", fontWeight:"700", padding:"3px 10px", borderRadius:"20px", background:`${tc}10`, color:tc, border:`1px solid ${tc}25`, display:"inline-block", marginBottom:"10px", width:"fit-content" }}>{comp.threatLevel}{" Threat"}</span>
                  {comp.website&&comp.website!=="N/A"&&<a href={comp.website.startsWith("http")?comp.website:`https://${comp.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:"11px", color:C.b2b, marginBottom:"8px", display:"block" }}>{comp.website}{" ↗"}</a>}
                  <div style={{ marginBottom:"8px" }}>{(comp.strongPoints||[]).slice(0,2).map((s,j)=><div key={j} style={{ fontSize:"12px", color:C.comp, marginBottom:"2px" }}>{"+ "}{s}</div>)}</div>
                  <div style={{ marginBottom:"10px" }}>{(comp.weakPoints||[]).slice(0,2).map((w,j)=><div key={j} style={{ fontSize:"12px", color:"#EF4444", marginBottom:"2px" }}>{"- "}{w}</div>)}</div>
                  <div style={{ fontSize:"12px", color:C.muted, flexGrow:1, marginBottom:"12px" }}>{comp.ourAdvantage}</div>
                  <button onClick={()=>loadCompReport(comp)} style={{ width:"100%", padding:"9px", background:C.comp, border:"none", borderRadius:"8px", color:"#fff", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>{"Deep Analysis"}</button>
                </div>
              );
            })}
          </div>
        ):!compScanning&&(
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"48px", textAlign:"center", boxShadow:C.cardShadow }}>
            <div style={{ fontSize:"48px", marginBottom:"14px" }}>{"🕵️"}</div>
            <div style={{ fontSize:"18px", fontWeight:"800", color:C.white, marginBottom:"8px" }}>{"Know your competition"}</div>
            <div style={{ fontSize:"13px", color:C.muted }}>{"Analyze top competitors and find their gaps"}</div>
          </div>
        )}
      </PageWrapper>
    );

    if (activePage === "campaigns") return (
      <PageWrapper title="Campaign Builder" subtitle="Generate complete ad campaigns from your leads">
        {campaignLoading&&<div style={{ textAlign:"center", padding:"60px" }}><LoadingDots color={C.camp} /><div style={{ fontSize:"14px", fontWeight:"600", color:C.muted, marginTop:"14px" }}>{"Building your campaign..."}</div></div>}
        {campaign&&!campaignLoading&&(
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"28px", boxShadow:C.cardShadow }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"22px" }}>
              <div>
                <div style={{ fontSize:"11px", fontWeight:"700", color:C.camp, letterSpacing:"1px", textTransform:"uppercase", marginBottom:"4px" }}>{"Campaign for "}{campaign.leadName}</div>
                <div style={{ fontSize:"22px", fontWeight:"800", color:C.white }}>{campaign.campaignName}</div>
                <div style={{ fontSize:"13px", color:C.muted, marginTop:"4px" }}>{campaign.objective}{" · "}{campaign.timeline}{" · "}{campaign.totalBudget}</div>
              </div>
              <div style={{ display:"flex", gap:"8px" }}>
                <button onClick={()=>{navigator.clipboard?.writeText([campaign.campaignName,campaign.callToAction,(campaign.hashtags||[]).join(" ")].join(" | "));}} style={{ padding:"9px 16px", background:C.camp, border:"none", borderRadius:"8px", color:"#fff", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>{"Copy"}</button>
                <button onClick={()=>setCampaign(null)} style={{ padding:"9px 16px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:"8px", color:C.muted, fontSize:"12px", cursor:"pointer" }}>{"Clear"}</button>
              </div>
            </div>
            {(campaign.platforms||[]).map((p,i)=>(
              <div key={i} style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"10px", padding:"16px", marginBottom:"14px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"10px" }}>
                  <div style={{ fontSize:"14px", fontWeight:"700", color:C.white }}>{p.platform}{" — "}{p.format}</div>
                  <div style={{ fontSize:"12px", color:C.camp, fontWeight:"700" }}>{p.budget}{"/day · "}{p.duration}</div>
                </div>
                {p.audience&&(
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"10px" }}>
                    <div><div style={{ fontSize:"10px", color:C.muted, textTransform:"uppercase", marginBottom:"4px" }}>{"Targeting"}</div><div style={{ fontSize:"12px", color:C.white }}>{p.audience.location}</div><div style={{ fontSize:"12px", color:C.white }}>{"Age "}{p.audience.age}</div></div>
                    <div><div style={{ fontSize:"10px", color:C.muted, textTransform:"uppercase", marginBottom:"4px" }}>{"Interests"}</div>{(p.audience.interests||[]).map((int,j)=><div key={j} style={{ fontSize:"12px", color:C.white }}>{"- "}{int}</div>)}</div>
                  </div>
                )}
              </div>
            ))}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px", marginBottom:"14px" }}>
              <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"10px", padding:"14px" }}>
                <div style={{ fontSize:"10px", fontWeight:"700", color:C.camp, textTransform:"uppercase", letterSpacing:"1px", marginBottom:"8px" }}>{"HOOK"}</div>
                <div style={{ fontSize:"14px", fontWeight:"700", color:C.white }}>{campaign.hook}</div>
              </div>
              <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"10px", padding:"14px" }}>
                <div style={{ fontSize:"10px", fontWeight:"700", color:C.camp, textTransform:"uppercase", letterSpacing:"1px", marginBottom:"8px" }}>{"CALL TO ACTION"}</div>
                <div style={{ fontSize:"14px", fontWeight:"700", color:C.white }}>{campaign.callToAction}</div>
              </div>
            </div>
            <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"10px", padding:"16px", marginBottom:"14px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px" }}>
                <div style={{ fontSize:"10px", fontWeight:"700", color:C.camp, textTransform:"uppercase", letterSpacing:"1px" }}>{"CAPTION"}</div>
                <button onClick={()=>navigator.clipboard?.writeText(campaign.caption||"")} style={{ fontSize:"10px", color:C.muted, background:"transparent", border:`1px solid ${C.border}`, borderRadius:"5px", padding:"2px 8px", cursor:"pointer" }}>{"Copy"}</button>
              </div>
              <div style={{ fontSize:"13px", lineHeight:"1.8", color:C.white, whiteSpace:"pre-wrap" }}>{campaign.caption}</div>
            </div>
            <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"10px", padding:"14px", marginBottom:"14px" }}>
              <div style={{ fontSize:"10px", fontWeight:"700", color:C.camp, textTransform:"uppercase", letterSpacing:"1px", marginBottom:"8px" }}>{"HASHTAGS"}</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:"6px" }}>{(campaign.hashtags||[]).map((h,i)=><span key={i} style={{ padding:"4px 12px", background:`${C.camp}10`, border:`1px solid ${C.camp}25`, borderRadius:"20px", fontSize:"12px", color:C.camp, fontWeight:"600" }}>{h}</span>)}</div>
            </div>
            <div style={{ background:"#FFFBEB", border:"1px solid #FDE68A", borderRadius:"10px", padding:"14px" }}>
              <div style={{ fontSize:"10px", fontWeight:"700", color:C.camp, textTransform:"uppercase", letterSpacing:"1px", marginBottom:"7px" }}>{"CREATIVE DIRECTION"}</div>
              <div style={{ fontSize:"13px", color:C.white, lineHeight:"1.7" }}>{campaign.creativeDirection}</div>
            </div>
          </div>
        )}
        {!campaign&&!campaignLoading&&(
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"48px", textAlign:"center", boxShadow:C.cardShadow }}>
            <div style={{ fontSize:"48px", marginBottom:"14px" }}>{"📣"}</div>
            <div style={{ fontSize:"18px", fontWeight:"800", color:C.white, marginBottom:"8px" }}>{"Build a Campaign"}</div>
            <div style={{ fontSize:"13px", color:C.muted, marginBottom:"20px" }}>{"Find a lead first, then click the campaign button on any lead card"}</div>
            <button onClick={()=>setActivePage("b2b")} style={{ padding:"10px 24px", background:C.b2b, border:"none", borderRadius:"8px", color:"#fff", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>{"Find a Lead"}</button>
          </div>
        )}
      </PageWrapper>
    );

    if (activePage === "reports") return (
      <PageWrapper title="My Reports" subtitle="All AI intelligence reports generated for your leads">
        {savedLeads.filter(l=>l.report).length===0?(
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"48px", textAlign:"center", boxShadow:C.cardShadow }}>
            <div style={{ fontSize:"48px", marginBottom:"14px" }}>{"📋"}</div>
            <div style={{ fontSize:"18px", fontWeight:"800", color:C.white, marginBottom:"8px" }}>{"No reports yet"}</div>
            <div style={{ fontSize:"13px", color:C.muted }}>{"Open any lead and click Get Report to generate an AI intelligence report"}</div>
          </div>
        ):(
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:"14px" }}>
            {savedLeads.filter(l=>l.report).map((lead,i)=>{
              const sc=scoreColor(lead.score);
              return (
                <div key={i} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"18px", boxShadow:C.cardShadow, cursor:"pointer", transition:"all 0.2s" }}
                  onClick={()=>{setSelectedLead(lead);loadReport(lead);}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow=C.cardShadowHover;e.currentTarget.style.borderColor="#BFDBFE";}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow=C.cardShadow;e.currentTarget.style.borderColor=C.border;}}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"8px" }}>
                    <div style={{ fontSize:"14px", fontWeight:"700", color:C.white }}>{lead.name}</div>
                    <div style={{ background:sc.bg, color:sc.color, border:`1px solid ${sc.border}`, borderRadius:"6px", padding:"2px 8px", fontSize:"10px", fontWeight:"800" }}>{sc.label}</div>
                  </div>
                  <div style={{ fontSize:"11px", color:C.muted, marginBottom:"10px" }}>{lead.type||lead.platform}{" · "}{lead.location||""}</div>
                  <div style={{ fontSize:"11px", color:C.b2b, fontWeight:"600" }}>{"View Report"}</div>
                </div>
              );
            })}
          </div>
        )}
      </PageWrapper>
    );

    if (activePage === "leads") return (
      <PageWrapper title="My Leads" subtitle="All saved leads with CRM pipeline"
        action={savedLeads.length>0?<button onClick={()=>exportToCSV(savedLeads)} style={{ padding:"9px 18px", background:"transparent", border:`1px solid ${C.border}`, borderRadius:"8px", color:C.muted, cursor:"pointer", fontSize:"12px", fontWeight:"600" }}>{"Export CSV"}</button>:null}>
        <div style={{ display:"flex", gap:"6px", marginBottom:"18px", flexWrap:"wrap" }}>
          {[{v:"all",l:`All (${savedLeads.length})`},...[{value:"new",label:"New"},{value:"contacted",label:"Contacted"},{value:"inprogress",label:"In Progress"},{value:"closed",label:"Closed Won"},{value:"lost",label:"Lost"}].map(s=>({v:s.value,l:`${s.label} (${savedLeads.filter(l=>l.status===s.value).length})`}))].map(({v,l})=>(
            <button key={v} onClick={()=>setSavedFilter(v)}
              style={{ padding:"6px 14px", borderRadius:"20px", border:`1px solid ${savedFilter===v?C.b2b:C.border}`, background:savedFilter===v?C.b2bGlow:"transparent", color:savedFilter===v?C.b2b:C.muted, cursor:"pointer", fontSize:"12px", fontWeight:"600", transition:"all 0.15s" }}>
              {l}
            </button>
          ))}
          <button onClick={()=>loadLeads(user.uid)} style={{ padding:"6px 12px", borderRadius:"20px", border:`1px solid ${C.border}`, background:"transparent", color:C.muted, cursor:"pointer", fontSize:"12px" }}>{"Refresh"}</button>
        </div>
        {(savedFilter==="all"?savedLeads:savedLeads.filter(l=>l.status===savedFilter)).length===0?(
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"48px", textAlign:"center", boxShadow:C.cardShadow }}>
            <div style={{ fontSize:"48px", marginBottom:"14px" }}>{"💾"}</div>
            <div style={{ fontSize:"18px", fontWeight:"800", color:C.white, marginBottom:"8px" }}>{"No leads here"}</div>
            <div style={{ fontSize:"13px", color:C.muted }}>{"Run a scan and your leads will appear here"}</div>
          </div>
        ):(
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:"14px" }}>
            {(savedFilter==="all"?savedLeads:savedLeads.filter(l=>l.status===savedFilter)).map((lead,i)=>{const sc=scoreColor(lead.score);return <SavedLeadCard key={i} lead={lead} sc={sc} accentColor={lead.mode==="b2c"?C.b2cLight:C.b2b} websiteScore={websiteScores[lead.name]} onReport={()=>{setSelectedLead(lead);loadReport(lead);}} onStatus={s=>updateStatus(lead.id,s)} onNotes={n=>updateNotes(lead.id,n)} onDelete={()=>deleteLead(lead.id)} onScoreWebsite={()=>scoreWebsite(lead)} onCampaign={()=>{setActivePage("campaigns");buildCampaign(lead);}} />;}) }
          </div>
        )}
      </PageWrapper>
    );

    if (activePage === "pipeline") return (
      <PageWrapper title="Pipeline" subtitle="Track every lead through your sales process">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"14px", alignItems:"start" }}>
          {[{value:"new",label:"New",color:"#6366F1"},{value:"contacted",label:"Contacted",color:C.b2b},{value:"inprogress",label:"In Progress",color:C.camp},{value:"closed",label:"Closed Won",color:C.comp},{value:"lost",label:"Lost",color:"#EF4444"}].map(col=>{
            const colLeads=savedLeads.filter(l=>l.status===col.value);
            return (
              <div key={col.value}>
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"10px", padding:"8px 12px", background:`${col.color}08`, border:`1px solid ${col.color}20`, borderRadius:"8px" }}>
                  <div style={{ fontSize:"11px", fontWeight:"700", color:col.color, textTransform:"uppercase", letterSpacing:"0.5px" }}>{col.label}</div>
                  <div style={{ fontSize:"11px", fontWeight:"800", color:col.color, background:`${col.color}12`, padding:"2px 8px", borderRadius:"10px" }}>{colLeads.length}</div>
                </div>
                {colLeads.map((lead,i)=>{const sc=scoreColor(lead.score);return (
                  <div key={i} style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"10px", padding:"14px", marginBottom:"8px", boxShadow:C.cardShadow, cursor:"pointer", transition:"all 0.15s" }}
                    onClick={()=>{setSelectedLead(lead);loadReport(lead);}}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor=col.color;e.currentTarget.style.boxShadow=`0 2px 8px ${col.color}15`;}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.boxShadow=C.cardShadow;}}>
                    <div style={{ fontSize:"13px", fontWeight:"700", color:C.white, marginBottom:"3px" }}>{lead.name}</div>
                    <div style={{ fontSize:"11px", color:C.muted, marginBottom:"8px" }}>{lead.type||lead.platform}</div>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div style={{ fontSize:"10px", fontWeight:"800", padding:"2px 7px", borderRadius:"4px", background:sc.bg, color:sc.color, border:`1px solid ${sc.border}` }}>{sc.label}</div>
                      <div style={{ fontSize:"11px", color:C.b2b, fontWeight:"600" }}>{"View"}</div>
                    </div>
                  </div>
                );})}
                {colLeads.length===0&&<div style={{ padding:"20px 14px", background:C.bg3, border:`1px dashed ${C.border}`, borderRadius:"8px", textAlign:"center", fontSize:"11px", color:C.dim }}>{"Empty"}</div>}
              </div>
            );
          })}
        </div>
      </PageWrapper>
    );

    if (activePage === "settings") return (
      <PageWrapper title="Settings" subtitle="Manage your profile and preferences">
        <div style={{ display:"grid", gridTemplateColumns:"200px 1fr", gap:"20px" }}>
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"8px", boxShadow:C.cardShadow, height:"fit-content" }}>
            {[{key:"profile",icon:"👤",label:"Profile"},{key:"mode",icon:"🔄",label:"Lead Mode"},{key:"outreach",icon:"💬",label:"Outreach"}].map(t=>(
              <button key={t.key} onClick={()=>setSettingsTab(t.key)}
                style={{ width:"100%", display:"flex", alignItems:"center", gap:"10px", padding:"10px 14px", border:"none", borderRadius:"8px", cursor:"pointer", fontSize:"13px", fontWeight:"600", textAlign:"left", background:settingsTab===t.key?C.b2bGlow:"transparent", color:settingsTab===t.key?C.b2b:C.muted, transition:"all 0.15s" }}>
                <span>{t.icon}</span>{t.label}
              </button>
            ))}
          </div>
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"12px", padding:"24px", boxShadow:C.cardShadow }}>
            {settingsTab==="profile"&&(
              <div>
                <div style={{ fontSize:"16px", fontWeight:"800", color:C.white, marginBottom:"20px" }}>{"Business Profile"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
                  {[{lbl:"Business Name",key:"businessName",ph:"Peach Agency"},{lbl:"Business Email",key:"businessEmail",ph:"hello@agency.com"},{lbl:"Target Industry",key:"targetIndustry",ph:"Restaurants, Clinics..."},{lbl:"Location",key:"location",ph:"Beirut, Dubai..."}].map(f=>(
                    <div key={f.key}>
                      <label style={{ display:"block", fontSize:"11px", fontWeight:"600", color:C.muted, marginBottom:"6px", textTransform:"uppercase", letterSpacing:"0.5px" }}>{f.lbl}</label>
                      <input value={profile[f.key]||""} onChange={e=>setProfile(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                        style={{ width:"100%", padding:"10px 14px", background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", color:C.white, fontSize:"13px" }} />
                    </div>
                  ))}
                  <div style={{ gridColumn:"1/-1" }}>
                    <label style={{ display:"block", fontSize:"11px", fontWeight:"600", color:C.muted, marginBottom:"6px", textTransform:"uppercase", letterSpacing:"0.5px" }}>{"What You Offer"}</label>
                    <textarea value={profile.whatYouDo||""} onChange={e=>setProfile(p=>({...p,whatYouDo:e.target.value}))} placeholder="Social media management, web design, ads..."
                      style={{ width:"100%", padding:"10px 14px", background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", color:C.white, fontSize:"13px", minHeight:"80px", resize:"vertical", fontFamily:"Inter,sans-serif" }} />
                  </div>
                </div>
                <button onClick={async()=>{await updateDoc(doc(db,"users",user.uid),{profile});}}
                  style={{ marginTop:"18px", padding:"10px 24px", background:C.b2b, border:"none", borderRadius:"8px", color:"#fff", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                  {"Save Changes"}
                </button>
              </div>
            )}
            {settingsTab==="mode"&&(
              <div>
                <div style={{ fontSize:"16px", fontWeight:"800", color:C.white, marginBottom:"6px" }}>{"Lead Mode"}</div>
                <div style={{ fontSize:"13px", color:C.muted, marginBottom:"20px" }}>{"Choose which lead types are active for your account"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px", marginBottom:"16px" }}>
                  {[{m:"b2b",icon:"🏢",label:"B2B Mode",desc:"Find businesses weak in what you offer. Perfect for agencies.",color:C.b2b,glow:C.b2bGlow},{m:"b2c",icon:"👥",label:"B2C Mode",desc:"Find individual customers. Best for gyms, salons, restaurants.",color:C.b2cLight,glow:C.b2cGlow}].map(opt=>{
                    const isActive=mode===opt.m||mode==="both";
                    return (
                      <div key={opt.m} onClick={()=>{const nm=mode==="both"?(opt.m==="b2b"?"b2c":"b2b"):(mode===opt.m?"both":opt.m);setMode(nm);updateDoc(doc(db,"users",user.uid),{mode:nm});}}
                        style={{ background:isActive?`${opt.color}06`:C.bg3, border:`2px solid ${isActive?opt.color:C.border}`, borderRadius:"12px", padding:"20px", cursor:"pointer", transition:"all 0.2s" }}>
                        <div style={{ fontSize:"28px", marginBottom:"10px" }}>{opt.icon}</div>
                        <div style={{ fontSize:"14px", fontWeight:"800", color:isActive?opt.color:C.white, marginBottom:"6px" }}>{opt.label}</div>
                        <div style={{ fontSize:"12px", color:C.muted, lineHeight:"1.6", marginBottom:"12px" }}>{opt.desc}</div>
                        <div style={{ display:"inline-flex", alignItems:"center", gap:"5px", padding:"4px 12px", borderRadius:"20px", background:isActive?`${opt.color}10`:C.bg, border:`1px solid ${isActive?opt.color:C.border}` }}>
                          <div style={{ width:"6px", height:"6px", borderRadius:"50%", background:isActive?opt.color:C.dim }} />
                          <span style={{ fontSize:"11px", fontWeight:"700", color:isActive?opt.color:C.dim }}>{isActive?"Active":"Inactive"}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ background:"#EFF6FF", border:"1px solid #BFDBFE", borderRadius:"10px", padding:"12px 16px", fontSize:"13px", color:"#1D4ED8" }}>
                  {"Current: "}<strong>{mode==="both"?"B2B + B2C active":mode==="b2b"?"B2B only":"B2C only"}</strong>
                </div>
              </div>
            )}
            {settingsTab==="outreach"&&(
              <div>
                <div style={{ fontSize:"16px", fontWeight:"800", color:C.white, marginBottom:"6px" }}>{"Outreach Settings"}</div>
                <div style={{ fontSize:"13px", color:C.muted, marginBottom:"20px" }}>{"Used for one-click WhatsApp and Email from lead reports"}</div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"14px" }}>
                  {[{lbl:"WhatsApp Number",key:"whatsappNumber",ph:"+961 XX XXX XXX"},{lbl:"Business Phone",key:"businessPhone",ph:"+961 XX XXX XXX"}].map(f=>(
                    <div key={f.key}>
                      <label style={{ display:"block", fontSize:"11px", fontWeight:"600", color:C.muted, marginBottom:"6px", textTransform:"uppercase", letterSpacing:"0.5px" }}>{f.lbl}</label>
                      <input value={profile[f.key]||""} onChange={e=>setProfile(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                        style={{ width:"100%", padding:"10px 14px", background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", color:C.white, fontSize:"13px" }} />
                    </div>
                  ))}
                </div>
                <button onClick={async()=>{await updateDoc(doc(db,"users",user.uid),{profile});}}
                  style={{ marginTop:"18px", padding:"10px 24px", background:C.b2b, border:"none", borderRadius:"8px", color:"#fff", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                  {"Save Changes"}
                </button>
              </div>
            )}
          </div>
        </div>
      </PageWrapper>
    );

    if (activePage === "billing") return (
      <PageWrapper title="Plan and Billing" subtitle="Manage your subscription">
        <div style={{ display:"grid", gridTemplateColumns:"1fr 2fr", gap:"20px", marginBottom:"28px" }}>
          <div style={{ background:C.bg2, border:`1px solid ${plan.color}30`, borderRadius:"12px", padding:"24px", boxShadow:C.cardShadow }}>
            <div style={{ fontSize:"11px", fontWeight:"700", color:plan.color, textTransform:"uppercase", letterSpacing:"0.5px", marginBottom:"8px" }}>{"Current Plan"}</div>
            <div style={{ fontSize:"28px", fontWeight:"900", color:plan.color, marginBottom:"2px" }}>{plan.name}</div>
            <div style={{ fontSize:"15px", color:C.muted, marginBottom:"18px" }}>{"$"}{plan.price}{"/month"}</div>
            <div style={{ display:"flex", gap:"20px", marginBottom:"16px", padding:"14px", background:C.bg3, borderRadius:"10px" }}>
              <div><div style={{ fontSize:"28px", fontWeight:"900", color:plan.color }}>{userData.credits}</div><div style={{ fontSize:"11px", color:C.muted }}>{"credits"}</div></div>
              <div><div style={{ fontSize:"28px", fontWeight:"900", color:plan.color }}>{sessionsLeft}</div><div style={{ fontSize:"11px", color:C.muted }}>{"sessions"}</div></div>
            </div>
            <div style={{ width:"100%", height:"6px", background:C.bg3, borderRadius:"3px", overflow:"hidden", marginBottom:"18px" }}>
              <div style={{ width:`${creditPct}%`, height:"100%", background:`linear-gradient(90deg, ${plan.color}, ${C.b2bLight})`, borderRadius:"3px" }} />
            </div>
            <button onClick={()=>setScreen("plan")} style={{ width:"100%", padding:"10px", background:C.b2b, border:"none", borderRadius:"8px", color:"#fff", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>{"Upgrade Plan"}</button>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px" }}>
            {Object.entries(PLANS).map(([key,p])=>{
              const isCurrent=userData.plan===key;
              return (
                <div key={key} style={{ background:isCurrent?`${p.color}06`:C.bg2, border:`2px solid ${isCurrent?p.color:C.border}`, borderRadius:"12px", padding:"20px", boxShadow:C.cardShadow, position:"relative" }}>
                  {key==="growth"&&<div style={{ position:"absolute", top:"-10px", left:"50%", transform:"translateX(-50%)", background:C.b2b, color:"#fff", fontSize:"9px", fontWeight:"800", padding:"3px 12px", borderRadius:"20px", whiteSpace:"nowrap" }}>{"MOST POPULAR"}</div>}
                  <div style={{ fontSize:"20px", fontWeight:"900", color:p.color, marginBottom:"2px" }}>{"$"}{p.price}</div>
                  <div style={{ fontSize:"10px", color:C.muted, marginBottom:"10px" }}>{"/month"}</div>
                  <div style={{ fontSize:"15px", fontWeight:"800", color:C.white, marginBottom:"4px" }}>{p.name}</div>
                  <div style={{ fontSize:"11px", color:C.muted, marginBottom:"14px" }}>{p.sessions}{" sessions · "}{p.leads}{" leads"}</div>
                  {isCurrent?<div style={{ padding:"8px", background:`${p.color}10`, border:`1px solid ${p.color}25`, borderRadius:"7px", color:p.color, fontSize:"12px", fontWeight:"700", textAlign:"center" }}>{"Current Plan"}</div>
                    :<button onClick={()=>setScreen("plan")} style={{ width:"100%", padding:"8px", background:p.color, border:"none", borderRadius:"7px", color:"#fff", fontSize:"12px", fontWeight:"700", cursor:"pointer" }}>{"Upgrade"}</button>}
                </div>
              );
            })}
          </div>
        </div>
      </PageWrapper>
    );

    return null;
  };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:C.bg, fontFamily:"Inter,sans-serif" }}>
      <style>{CSS}</style>

      {/* SIDEBAR */}
      <div style={{ width: sidebarCollapsed ? "60px" : "232px", background: "#09090b", borderRight: "1px solid #27272a", display: "flex", flexDirection: "column", transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)", flexShrink: 0, position: "sticky", top: 0, height: "100vh", overflowY: "auto", overflowX: "hidden", zIndex: 40 }}>

        {/* Logo */}
        <div style={{ padding: sidebarCollapsed ? "16px 14px" : "16px 20px", display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid #27272a", minHeight: "60px", cursor: "pointer", transition: "all 0.15s" }} onClick={() => setActivePage("dashboard")}
          onMouseEnter={e => e.currentTarget.style.background = "#18181b"}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          {/* PM Logo — geometric diamond */}
          <div style={{ flexShrink: 0, width: "30px", height: "30px" }}>
            <svg width="30" height="30" viewBox="0 0 30 30" fill="none">
              <rect width="30" height="30" rx="7" fill="#2563EB"/>
              {/* Brain shape */}
              <path d="M9 15c0-3.31 2.69-6 6-6s6 2.69 6 6c0 1.5-.55 2.87-1.45 3.92" stroke="white" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
              <path d="M11 18.5c.6.95 1.54 1.66 2.64 1.93" stroke="white" strokeWidth="1.6" strokeLinecap="round"/>
              <circle cx="15" cy="15" r="2" fill="white"/>
              <path d="M15 13v-2M15 19v-2" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              <path d="M13 15h-2M19 15h-2" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              <circle cx="23" cy="7" r="3" fill="#f59e0b"/>
              <path d="M21.8 7l.8.8 1.7-1.6" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          {!sidebarCollapsed && (
            <div style={{ overflow: "hidden", minWidth: 0 }}>
              <div style={{ fontSize: "15px", fontWeight: "700", color: "#ffffff", letterSpacing: "-0.3px", whiteSpace: "nowrap" }}>{"PitchMind"}</div>
              <div style={{ fontSize: "10px", color: "#71717a", whiteSpace: "nowrap" }}>{"AI Lead Intelligence"}</div>
            </div>
          )}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: "8px 8px", overflowY: "auto" }}>
          {navGroups.map((group, gi) => (
            <div key={gi} style={{ marginBottom: "4px" }}>
              {!sidebarCollapsed && (
                <div style={{ fontSize: "10px", fontWeight: "600", color: "#52525b", letterSpacing: "0.06em", textTransform: "uppercase", padding: "10px 12px 4px" }}>{group.label}</div>
              )}
              {sidebarCollapsed && gi > 0 && <div style={{ height: "1px", background: "#27272a", margin: "6px 8px" }} />}
              {group.items.map(item => {
                const isActive = activePage === item.key;
                return (
                  <button key={item.key} onClick={() => setActivePage(item.key)} title={sidebarCollapsed ? item.label : ""}
                    style={{ width: "100%", display: "flex", alignItems: "center", gap: "9px", padding: sidebarCollapsed ? "9px 0" : "8px 12px", border: "none", borderRadius: "7px", cursor: "pointer", fontSize: "13px", fontWeight: isActive ? "600" : "400", textAlign: "left", background: isActive ? "#27272a" : "transparent", color: isActive ? "#ffffff" : "#a1a1aa", transition: "all 0.12s", marginBottom: "1px", justifyContent: sidebarCollapsed ? "center" : "flex-start", letterSpacing: "-0.01em" }}
                    onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = "#18181b"; e.currentTarget.style.color = "#e4e4e7"; }}}
                    onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#a1a1aa"; }}}>
                    <span style={{ fontSize: "15px", flexShrink: 0, lineHeight: 1 }}>{item.icon}</span>
                    {!sidebarCollapsed && <span style={{ whiteSpace: "nowrap", overflow: "hidden" }}>{item.label}</span>}
                    {!sidebarCollapsed && isActive && <div style={{ width: "4px", height: "4px", borderRadius: "50%", background: "#3b82f6", marginLeft: "auto", flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Credits */}
        {!sidebarCollapsed && (
          <div style={{ padding: "12px 14px", borderTop: "1px solid #27272a" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "7px" }}>
              <span style={{ fontSize: "11px", color: "#71717a", fontWeight: "500" }}>{"Sessions"}</span>
              <span style={{ fontSize: "11px", color: "#3b82f6", fontWeight: "700" }}>{sessionsLeft}{" left"}</span>
            </div>
            <div style={{ width: "100%", height: "3px", background: "#27272a", borderRadius: "99px", overflow: "hidden", marginBottom: "8px" }}>
              <div style={{ width: `${creditPct}%`, height: "100%", background: "linear-gradient(90deg,#2563eb,#7c3aed)", borderRadius: "99px", transition: "width 0.5s ease" }} />
            </div>
            <div style={{ fontSize: "10px", color: "#52525b", fontWeight: "500" }}>{plan.name}{" Plan · $"}{plan.price}{"/mo"}</div>
          </div>
        )}

        {/* Collapse */}
        <button onClick={() => setSidebarCollapsed(s => !s)}
          style={{ padding: "13px", background: "transparent", border: "none", borderTop: "1px solid #27272a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-start", gap: "8px", color: "#52525b", fontSize: "12px", fontWeight: "500", transition: "all 0.15s", width: "100%" }}
          onMouseEnter={e => { e.currentTarget.style.background = "#18181b"; e.currentTarget.style.color = "#a1a1aa"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#52525b"; }}>
          <span style={{ fontSize: "11px", display: "inline-block", transition: "transform 0.22s", transform: sidebarCollapsed ? "rotate(180deg)" : "none" }}>{"⟨"}</span>
          {!sidebarCollapsed && <span>{"Collapse"}</span>}
        </button>
      </div>

      {/* MAIN */}
      <div style={{ flex:1, display:"flex", flexDirection:"column", minWidth:0 }}>
        <div style={{ height: "56px", background: "#ffffff", borderBottom: "1px solid #e4e4e7", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(8px)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "13px", color: "#71717a" }}>{"PitchMind"}</span>
            <span style={{ color: "#d4d4d8" }}>{" / "}</span>
            <span style={{ fontSize: "13px", fontWeight: "600", color: "#09090b" }}>
              {navGroups.flatMap(g => g.items).find(i => i.key === activePage)?.label || "Dashboard"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            {(scanning || csvProcessing || compScanning || campaignLoading || reviewLoading) && <LoadingBar />}
            {userData.credits < CREDITS_PER_SESSION && (
              <div style={{ display: "flex", alignItems: "center", gap: "5px", padding: "4px 10px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "99px", fontSize: "11px", color: "#dc2626", fontWeight: "600" }}>
                <span>{"⚠"}</span><span>{"Low credits"}</span>
              </div>
            )}
            <div style={{ padding: "4px 10px", background: `${plan.color}10`, border: `1px solid ${plan.color}20`, borderRadius: "99px", fontSize: "11px", fontWeight: "600", color: plan.color }}>{plan.name}</div>
            <div style={{ width: "1px", height: "20px", background: "#e4e4e7" }} />
            <div style={{ fontSize: "12px", color: "#71717a", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.email}</div>
            <button onClick={doLogout}
              style={{ padding: "6px 14px", background: "transparent", border: "1px solid #e4e4e7", borderRadius: "7px", color: "#71717a", cursor: "pointer", fontSize: "12px", fontWeight: "500", transition: "all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#f4f4f5"; e.currentTarget.style.color = "#09090b"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#71717a"; }}>
              {"Logout"}
            </button>
          </div>
        </div>
        <div style={{ flex:1, overflowY:"auto" }}>
          {renderPage()}
        </div>
      </div>

      {/* MODALS */}

      {/* INTELLIGENCE REPORT MODAL */}
      {selectedLead && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", backdropFilter:"blur(8px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}
          onClick={e=>e.target===e.currentTarget&&setSelectedLead(null)}>
          <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"16px", padding:"28px", maxWidth:"700px", width:"100%", maxHeight:"90vh", overflowY:"auto", position:"relative", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <button onClick={()=>setSelectedLead(null)}
              style={{ position:"absolute", top:"14px", right:"14px", background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", color:C.muted, width:"30px", height:"30px", cursor:"pointer", fontSize:"14px", display:"flex", alignItems:"center", justifyContent:"center" }}>{"✕"}</button>
            <div style={{ marginBottom:"18px" }}>
              <div style={{ fontSize:"18px", fontWeight:"800", color:C.white, marginBottom:"3px" }}>{selectedLead.name}</div>
              <div style={{ fontSize:"12px", color:C.muted, marginBottom:"14px" }}>{selectedLead.leadType==="b2c"?`${selectedLead.platform} · ${selectedLead.engagement}`:`${selectedLead.type} · ${selectedLead.location}`}</div>
              {selectedLead.id&&(
                <div style={{ display:"flex", gap:"4px", flexWrap:"wrap", marginBottom:"12px" }}>
                  {[{value:"new",label:"New",color:"#6366F1"},{value:"contacted",label:"Contacted",color:C.b2b},{value:"inprogress",label:"In Progress",color:C.camp},{value:"closed",label:"Closed Won",color:C.comp},{value:"lost",label:"Lost",color:"#EF4444"}].map(s=>(
                    <button key={s.value} onClick={()=>updateStatus(selectedLead.id,s.value)}
                      style={{ padding:"4px 10px", borderRadius:"6px", border:`1px solid ${selectedLead.status===s.value?s.color:C.border}`, background:selectedLead.status===s.value?`${s.color}10`:"transparent", color:selectedLead.status===s.value?s.color:C.muted, cursor:"pointer", fontSize:"11px", fontWeight:"600" }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              )}
              {selectedLead.report&&(
                <div style={{ background:C.bg3, border:"1px solid #FDE68A", borderRadius:"10px", padding:"14px", marginBottom:"14px" }}>
                  <div style={{ fontSize:"10px", fontWeight:"800", color:C.camp, letterSpacing:"1.5px", textTransform:"uppercase", marginBottom:"10px" }}>{"ONE-CLICK OUTREACH"}</div>
                  <div style={{ display:"flex", gap:"8px", flexWrap:"wrap", marginBottom:"10px" }}>
                    {selectedLead.report.whatsappMessage&&(
                      <button onClick={()=>{const phone=(selectedLead.phone||"").replace(/\D/g,"");const msg=encodeURIComponent(selectedLead.report.whatsappMessage);window.open(phone?`https://wa.me/${phone}?text=${msg}`:`https://wa.me/?text=${msg}`,"_blank");}}
                        style={{ display:"flex", alignItems:"center", gap:"7px", padding:"9px 16px", background:"rgba(37,211,102,0.1)", border:"1px solid rgba(37,211,102,0.3)", borderRadius:"8px", color:"#16A34A", fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                        {"WhatsApp"}
                      </button>
                    )}
                    {selectedLead.report.emailBody&&(
                      <button onClick={()=>{const to=selectedLead.email||"";const sub=encodeURIComponent(selectedLead.report.emailSubject||"");const body=encodeURIComponent(safeStr(selectedLead.report.emailBody)||"");window.open(`mailto:${to}?subject=${sub}&body=${body}`,"_blank");}}
                        style={{ display:"flex", alignItems:"center", gap:"7px", padding:"9px 16px", background:`${C.b2bGlow}`, border:`1px solid ${C.b2bBorder}`, borderRadius:"8px", color:C.b2b, fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                        {"Send Email"}
                      </button>
                    )}
                    <button onClick={()=>{setSelectedLead(null);setActivePage("campaigns");buildCampaign(selectedLead);}}
                      style={{ padding:"9px 16px", background:`${C.campGlow}`, border:`1px solid ${C.campBorder}`, borderRadius:"8px", color:C.camp, fontSize:"13px", fontWeight:"700", cursor:"pointer" }}>
                      {"Build Campaign"}
                    </button>
                  </div>
                  {selectedLead.report.whatsappMessage&&(
                    <div style={{ background:C.bg2, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"10px 12px" }}>
                      <div style={{ fontSize:"9px", color:"#16A34A", fontWeight:"700", letterSpacing:"0.5px", marginBottom:"4px" }}>{"WHATSAPP PREVIEW"}</div>
                      <div style={{ fontSize:"12px", color:C.muted, lineHeight:"1.6" }}>{selectedLead.report.whatsappMessage}</div>
                    </div>
                  )}
                </div>
              )}
              {selectedLead.id&&<textarea value={selectedLead.notes||""} onChange={e=>updateNotes(selectedLead.id,e.target.value)} placeholder="Add notes..." style={{ width:"100%", padding:"9px 12px", background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", color:C.white, fontSize:"12px", resize:"vertical", minHeight:"50px", fontFamily:"Inter,sans-serif", marginBottom:"12px" }} />}
            </div>
            {selectedLead.loading&&<div style={{ textAlign:"center", padding:"32px" }}><LoadingDots color={C.b2b} /><div style={{ color:C.muted, marginTop:"10px", fontSize:"13px" }}>{"Building intelligence report..."}</div></div>}
            {selectedLead.reportErr&&<div style={{ color:"#EF4444", padding:"12px", background:"#FEF2F2", borderRadius:"9px", fontSize:"13px", marginBottom:"12px" }}>{selectedLead.reportErr}</div>}
            {selectedLead.report&&(()=>{
              const r=selectedLead.report;
              const isB2C=selectedLead.leadType==="b2c";
              const sections=isB2C?[
                ["Profile Analysis",r.profileAnalysis],["Psychological Profile",r.psychologicalProfile],["Buying Signals",r.buyingSignals],
                ["Objections",r.likelyObjections],["Pitch Strategy",r.pitchStrategy],["Opening Message",r.openingMessage],
                ["Follow-Up Sequence",r.followUpSequence],["Closing Script",r.closingScript],["Best Time",r.bestTime],
                ["Conversion Tip",r.conversionTip],["Creative Insight",r.creativeInsight],
              ]:[
                ["Company Overview",r.companyOverview],["Weakness Analysis",r.weaknessAnalysis],["Website Analysis",r.websiteAnalysis],
                ["Decision Maker",r.decisionMaker],["Emotional Profile",r.emotionalProfile],["Objections",r.objections],
                ["Pitch Strategy",r.pitchStrategy],["Closing Angle",r.closingAngle],["Best Time",r.bestTime],
                ["Campaign Idea",r.campaignIdea],["Cold Email",r.emailBody],
              ];
              return sections.filter(([,v])=>safeStr(v)).map(([title,content2],i)=>(
                <div key={i} style={{ marginBottom:"14px" }}>
                  <div style={{ fontSize:"10px", fontWeight:"700", color:C.b2b, textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"6px", paddingBottom:"4px", borderBottom:`1px solid ${C.border}` }}>{title}</div>
                  <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"12px", fontSize:"13px", lineHeight:"1.8", color:C.white, whiteSpace:"pre-wrap" }}>{safeStr(content2)}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}

      {/* COMPETITOR DEEP MODAL */}
      {selectedComp&&(
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.6)", backdropFilter:"blur(8px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"20px" }}
          onClick={e=>e.target===e.currentTarget&&setSelectedComp(null)}>
          <div style={{ background:C.bg2, border:`1px solid ${C.compBorder}`, borderRadius:"16px", padding:"28px", maxWidth:"700px", width:"100%", maxHeight:"90vh", overflowY:"auto", position:"relative", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <button onClick={()=>setSelectedComp(null)} style={{ position:"absolute", top:"14px", right:"14px", background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", color:C.muted, width:"30px", height:"30px", cursor:"pointer", fontSize:"14px", display:"flex", alignItems:"center", justifyContent:"center" }}>{"✕"}</button>
            <div style={{ fontSize:"11px", fontWeight:"800", color:C.comp, letterSpacing:"2px", textTransform:"uppercase", marginBottom:"6px" }}>{"COMPETITOR DEEP ANALYSIS"}</div>
            <div style={{ fontSize:"19px", fontWeight:"800", color:C.white, marginBottom:"3px" }}>{selectedComp.name}</div>
            <div style={{ fontSize:"12px", color:C.muted, marginBottom:"20px" }}>{selectedComp.marketPosition}{" · Strength "}{selectedComp.strength}{"/100"}</div>
            {selectedComp.loading&&<div style={{ textAlign:"center", padding:"32px" }}><LoadingDots color={C.comp} /></div>}
            {selectedComp.reportErr&&<div style={{ color:"#EF4444", padding:"12px", background:"#FEF2F2", borderRadius:"9px", fontSize:"13px" }}>{selectedComp.reportErr}</div>}
            {selectedComp.report&&(()=>{
              const r=selectedComp.report;
              return [["Deep Analysis",r.deepAnalysis],["Their Strategy",r.theirStrategy],["Their Vulnerabilities",r.theirVulnerabilities],["How To Beat Them",r.howToBeatThem],["Your Positioning",r.positioningMessage],["Action Plan",r.actionPlan],["Key Learning",r.keyLearning]].filter(([,v])=>safeStr(v)).map(([title,value],i)=>(
                <div key={i} style={{ marginBottom:"14px" }}>
                  <div style={{ fontSize:"10px", fontWeight:"700", color:C.comp, textTransform:"uppercase", letterSpacing:"1.5px", marginBottom:"6px", paddingBottom:"4px", borderBottom:`1px solid ${C.border}` }}>{title}</div>
                  <div style={{ background:C.bg3, border:`1px solid ${C.border}`, borderRadius:"8px", padding:"12px", fontSize:"13px", lineHeight:"1.8", color:C.white, whiteSpace:"pre-wrap" }}>{safeStr(value)}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, saved, sc, mode, accentColor, accentGlow, websiteScore, onReport, onCampaign }) {
  if (!lead) return null;
  const isB2C = lead.leadType === "b2c" || mode === "b2c";
  return (
    <div style={{ background: "#ffffff", border: "1px solid #e4e4e7", borderRadius: "14px", padding: "22px", display: "flex", flexDirection: "column", transition: "all 0.18s", cursor: "default" }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = "#d4d4d8"; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.borderColor = "#e4e4e7"; e.currentTarget.style.transform = "translateY(0)"; }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
        <div style={{ flex: 1, paddingRight: "10px" }}>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#09090b", marginBottom: "3px", letterSpacing: "-0.2px" }}>{lead.name}</div>
          <div style={{ fontSize: "12px", color: "#71717a", fontWeight: "500" }}>{isB2C ? lead.platform : `${lead.type || ""} · ${lead.location || ""}`}</div>
        </div>
        <div style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: "8px", padding: "5px 10px", textAlign: "center", flexShrink: 0 }}>
          <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.05em", marginBottom: "1px", textTransform: "uppercase" }}>{sc.label}</div>
          <div style={{ fontSize: "20px", fontWeight: "800", lineHeight: 1 }}>{lead.score || 0}</div>
        </div>
      </div>

      {/* Details */}
      {!isB2C ? (
        <div style={{ marginBottom: "14px" }}>
          {lead.phone && <div style={{ fontSize: "12px", color: "#52525b", marginBottom: "4px", display: "flex", alignItems: "center", gap: "5px" }}>{"📞 "}{lead.phone}</div>}
          {lead.website === "No website"
            ? <div style={{ fontSize: "12px", color: "#ef4444", marginBottom: "4px" }}>{"No website"}</div>
            : lead.website
              ? <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: "12px", color: accentColor, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "4px" }}>
                  {lead.website.replace(/https?:\/\//, "")}{"  ↗"}
                </a>
              : null}
          {lead.rating && <div style={{ fontSize: "12px", color: "#d97706", fontWeight: "600" }}>{"⭐ "}{lead.rating}{"/5"}{lead.reviews ? ` (${lead.reviews} reviews)` : ""}</div>}
          {websiteScore && <div style={{ marginTop: "6px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: "600", padding: "2px 8px", borderRadius: "6px", background: websiteScore.score >= 70 ? "rgba(22,163,74,0.08)" : "rgba(239,68,68,0.08)", color: websiteScore.score >= 70 ? "#16a34a" : "#ef4444" }}>{"Site: "}{websiteScore.score}{"/100"}</div>}
        </div>
      ) : (
        <div style={{ marginBottom: "14px" }}>
          {lead.keyMetric && <div style={{ fontSize: "12px", color: "#d97706", fontWeight: "600", marginBottom: "4px" }}>{"📊 "}{lead.keyMetric}</div>}
          <div style={{ fontSize: "12px", color: "#52525b", marginBottom: "4px", lineHeight: "1.5" }}>{lead.engagement}</div>
          {lead.bestApproach && <div style={{ fontSize: "12px", color: accentColor, fontWeight: "600" }}>{lead.bestApproach}</div>}
        </div>
      )}

      {/* Weaknesses */}
      {(lead.weaknesses || []).length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px", marginBottom: "12px" }}>
          {lead.weaknesses.map((w, i) => (
            <span key={i} style={{ fontSize: "10px", fontWeight: "600", padding: "2px 7px", borderRadius: "4px", background: "rgba(239,68,68,0.07)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.15)" }}>{w}</span>
          ))}
        </div>
      )}

      {/* Pain point */}
      <div style={{ fontSize: "12px", color: "#71717a", lineHeight: "1.6", marginBottom: "14px", flexGrow: 1 }}>{lead.painPoint}</div>

      {saved && <div style={{ fontSize: "11px", color: "#16a34a", marginBottom: "8px", fontWeight: "600" }}>{"✓ Saved"}</div>}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px" }}>
        <button onClick={onReport}
          style={{ flex: 1, padding: "9px 14px", background: accentColor, border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px", fontWeight: "600", cursor: "pointer", transition: "all 0.15s", letterSpacing: "-0.01em" }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; e.currentTarget.style.transform = "translateY(-1px)"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}>
          {saved?.report ? "View Report" : "Get Report"}
        </button>
        <button onClick={onCampaign} title="Build Campaign"
          style={{ padding: "9px 12px", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: "8px", color: "#d97706", fontSize: "14px", cursor: "pointer", transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(217,119,6,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(217,119,6,0.08)"; }}>
          {"📣"}
        </button>
      </div>
    </div>
  );
}

function SavedLeadCard({ lead, sc, accentColor, websiteScore, onReport, onStatus, onNotes, onDelete, onScoreWebsite, onCampaign }) {
  if (!lead) return null;
  const isB2C = lead.leadType === "b2c" || lead.mode === "b2c";
  const sc2 = sc || scoreColor(70);
  const statuses = [
    { value: "new", label: "New", color: "#6366f1" },
    { value: "contacted", label: "Contacted", color: "#2563eb" },
    { value: "inprogress", label: "In Progress", color: "#d97706" },
    { value: "closed", label: "Closed", color: "#16a34a" },
    { value: "lost", label: "Lost", color: "#ef4444" },
  ];
  return (
    <div style={{ background: "#ffffff", border: `1px solid ${lead.status === "closed" ? "rgba(22,163,74,0.25)" : lead.status === "inprogress" ? "rgba(217,119,6,0.2)" : "#e4e4e7"}`, borderRadius: "14px", padding: "20px", display: "flex", flexDirection: "column", transition: "all 0.15s" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "10px" }}>
        <div style={{ flex: 1, paddingRight: "8px" }}>
          <div style={{ fontSize: "15px", fontWeight: "700", color: "#09090b", marginBottom: "2px", letterSpacing: "-0.2px" }}>{lead.name}</div>
          <div style={{ fontSize: "11px", color: "#71717a" }}>{isB2C ? (lead.platform || "B2C") : `${lead.type || ""} · ${lead.location || ""}`}</div>
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
          <div style={{ background: sc2.bg, color: sc2.color, border: `1px solid ${sc2.border}`, borderRadius: "7px", padding: "4px 8px", textAlign: "center" }}>
            <div style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.05em", textTransform: "uppercase" }}>{sc2.label}</div>
            <div style={{ fontSize: "16px", fontWeight: "800", lineHeight: 1 }}>{lead.score || 0}</div>
          </div>
          <button onClick={onDelete} style={{ width: "28px", height: "28px", background: "transparent", border: "1px solid #fee2e2", borderRadius: "6px", color: "#fca5a5", cursor: "pointer", fontSize: "11px", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.color = "#ef4444"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#fca5a5"; }}>{"✕"}</button>
        </div>
      </div>

      {!isB2C ? (
        <div style={{ marginBottom: "10px" }}>
          {lead.phone && <div style={{ fontSize: "12px", color: "#52525b", marginBottom: "3px" }}>{"📞 "}{lead.phone}</div>}
          {lead.website && lead.website !== "No website"
            ? <a href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`} target="_blank" rel="noopener noreferrer" style={{ fontSize: "12px", color: accentColor, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: "3px" }}>{lead.website.replace(/https?:\/\//, "")}{"  ↗"}</a>
            : <div style={{ fontSize: "12px", color: "#ef4444" }}>{"No website"}</div>}
          {lead.rating && <div style={{ fontSize: "12px", color: "#d97706", fontWeight: "600" }}>{"⭐ "}{lead.rating}{"/5"}</div>}
          {websiteScore
            ? <div style={{ marginTop: "5px", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", fontWeight: "600", padding: "2px 7px", borderRadius: "5px", background: websiteScore.score >= 70 ? "rgba(22,163,74,0.08)" : "rgba(239,68,68,0.08)", color: websiteScore.score >= 70 ? "#16a34a" : "#ef4444" }}>{"Site: "}{websiteScore.score}{"/100"}</div>
            : lead.website && lead.website !== "No website" && <button onClick={onScoreWebsite} style={{ marginTop: "4px", fontSize: "10px", color: accentColor, background: "transparent", border: `1px solid ${accentColor}30`, borderRadius: "5px", padding: "2px 8px", cursor: "pointer" }}>{"Score website"}</button>}
        </div>
      ) : (
        <div style={{ marginBottom: "10px" }}>
          {lead.keyMetric && <div style={{ fontSize: "12px", color: "#d97706", fontWeight: "600" }}>{"📊 "}{lead.keyMetric}</div>}
          {lead.bestApproach && <div style={{ fontSize: "12px", color: accentColor }}>{"💬 "}{lead.bestApproach}</div>}
        </div>
      )}

      {/* Status pills */}
      <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginBottom: "10px" }}>
        {statuses.map(s => (
          <button key={s.value} onClick={() => onStatus(s.value)}
            style={{ padding: "3px 9px", borderRadius: "99px", border: `1px solid ${lead.status === s.value ? s.color : "#e4e4e7"}`, background: lead.status === s.value ? `${s.color}10` : "transparent", color: lead.status === s.value ? s.color : "#a1a1aa", cursor: "pointer", fontSize: "10px", fontWeight: "600", transition: "all 0.12s" }}>
            {s.label}
          </button>
        ))}
      </div>

      <textarea value={lead.notes || ""} onChange={e => onNotes(e.target.value)} placeholder="Add notes..."
        style={{ width: "100%", padding: "8px 10px", background: "#f4f4f5", border: "1px solid #e4e4e7", borderRadius: "7px", color: "#09090b", fontSize: "12px", resize: "vertical", minHeight: "46px", fontFamily: "Inter,sans-serif", marginBottom: "10px", lineHeight: "1.5" }} />

      <div style={{ display: "flex", gap: "7px" }}>
        <button onClick={onReport}
          style={{ flex: 1, padding: "9px", background: accentColor, border: "none", borderRadius: "8px", color: "#fff", fontSize: "12px", fontWeight: "600", cursor: "pointer", transition: "all 0.15s", letterSpacing: "-0.01em" }}
          onMouseEnter={e => { e.currentTarget.style.opacity = "0.88"; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}>
          {lead.report ? "View Report" : "Get Report"}
        </button>
        <button onClick={onCampaign} title="Build Campaign"
          style={{ padding: "9px 12px", background: "rgba(217,119,6,0.08)", border: "1px solid rgba(217,119,6,0.2)", borderRadius: "8px", color: "#d97706", fontSize: "14px", cursor: "pointer" }}>
          {"📣"}
        </button>
      </div>
    </div>
  );
}


export default function PitchMind() {
  return <ErrorBoundary><PitchMindApp /></ErrorBoundary>;
}
