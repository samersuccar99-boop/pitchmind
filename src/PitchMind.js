import { useState, useEffect } from "react";
import { auth, db } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
} from "firebase/firestore";

// ── Styles ──────────────────────────────────────────────────────────────────
const S = {
  app: { fontFamily: "'Inter', sans-serif", background: "linear-gradient(135deg, #1a0533 0%, #0f0020 50%, #2d0a5e 100%)", minHeight: "100vh", color: "#fff" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" },
  card: { background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "24px", padding: "40px", maxWidth: "480px", width: "100%", textAlign: "center" },
  logo: { fontSize: "30px", fontWeight: "800", background: "linear-gradient(135deg, #a855f7, #fff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "6px", letterSpacing: "-1px" },
  tag: { color: "#c084fc", fontSize: "12px", marginBottom: "28px", letterSpacing: "2px", textTransform: "uppercase" },
  label: { display: "block", textAlign: "left", fontSize: "11px", fontWeight: "700", color: "#c084fc", marginBottom: "6px", letterSpacing: "0.5px", textTransform: "uppercase" },
  inp: { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: "10px", color: "#fff", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "12px" },
  textarea: { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: "10px", color: "#fff", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "12px", resize: "vertical", minHeight: "70px", fontFamily: "inherit" },
  btn: { width: "100%", padding: "13px", background: "linear-gradient(135deg, #6b21c8, #8b3cf7)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer", marginBottom: "10px" },
  btnSm: { padding: "10px 20px", background: "linear-gradient(135deg, #6b21c8, #8b3cf7)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer" },
  btnGhost: { width: "100%", padding: "12px", background: "transparent", border: "1px solid rgba(168,85,247,0.4)", borderRadius: "10px", color: "#c084fc", fontSize: "13px", fontWeight: "600", cursor: "pointer" },
  header: { padding: "16px 28px", borderBottom: "1px solid rgba(168,85,247,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 },
  hLogo: { fontSize: "20px", fontWeight: "800", background: "linear-gradient(135deg, #a855f7, #fff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.5px" },
  badge: { background: "rgba(139,60,247,0.2)", border: "1px solid #8b3cf7", borderRadius: "20px", padding: "3px 10px", fontSize: "11px", color: "#c084fc", fontWeight: "600" },
  main: { maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" },
  profileBanner: { background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "16px", padding: "16px 20px", marginBottom: "28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" },
  sCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "18px", padding: "24px", marginBottom: "28px" },
  statsRow: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "14px", marginBottom: "28px" },
  statCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "12px", padding: "18px", textAlign: "center" },
  statNum: { fontSize: "28px", fontWeight: "800", background: "linear-gradient(135deg, #a855f7, #fff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" },
  statLbl: { fontSize: "11px", color: "#c084fc", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px", marginTop: "3px" },
  leadsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px,1fr))", gap: "16px" },
  lCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "14px", padding: "20px", transition: "all 0.2s" },
  lName: { fontSize: "15px", fontWeight: "700", marginBottom: "2px" },
  lSub: { fontSize: "11px", color: "#c084fc", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" },
  weakTag: { display: "inline-block", borderRadius: "6px", padding: "2px 7px", fontSize: "10px", fontWeight: "700", marginRight: "4px", marginBottom: "3px" },
  lPain: { fontSize: "12px", color: "rgba(255,255,255,0.65)", lineHeight: "1.55", margin: "10px 0 14px" },
  vBtn: { width: "100%", padding: "9px", background: "rgba(139,60,247,0.2)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: "8px", color: "#c084fc", fontSize: "12px", fontWeight: "600", cursor: "pointer" },
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "24px" },
  modal: { background: "linear-gradient(135deg, #1a0533 0%, #0f0020 100%)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "20px", padding: "36px", maxWidth: "740px", width: "100%", maxHeight: "88vh", overflowY: "auto", position: "relative" },
  mClose: { position: "absolute", top: "16px", right: "16px", background: "rgba(255,255,255,0.1)", border: "none", borderRadius: "8px", color: "#fff", width: "30px", height: "30px", cursor: "pointer", fontSize: "15px" },
  mTitle: { fontSize: "10px", fontWeight: "700", color: "#a855f7", textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "8px" },
  mBox: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.15)", borderRadius: "10px", padding: "14px", fontSize: "13px", lineHeight: "1.75", color: "rgba(255,255,255,0.85)", marginBottom: "16px", whiteSpace: "pre-wrap" },
  infoGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "20px" },
  infoBox: { background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "8px", padding: "10px 12px" },
  infoLbl: { fontSize: "9px", color: "#a855f7", fontWeight: "700", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "3px" },
  infoVal: { fontSize: "12px", color: "#fff", fontWeight: "500" },
  dot: { display: "inline-block", width: "7px", height: "7px", borderRadius: "50%", background: "#a855f7", margin: "0 3px", animation: "pulse 1.4s ease-in-out infinite" },
  empty: { textAlign: "center", padding: "60px 24px", color: "rgba(255,255,255,0.4)" },
  err: { color: "#ef4444", fontSize: "12px", marginTop: "8px" },
  // Plans
  plansGrid: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "16px", marginBottom: "24px" },
  planCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "16px", padding: "24px", textAlign: "center", cursor: "pointer", transition: "all 0.2s" },
  planCardActive: { background: "rgba(168,85,247,0.15)", border: "2px solid #a855f7" },
  creditBar: { background: "rgba(255,255,255,0.06)", borderRadius: "8px", height: "6px", overflow: "hidden", marginTop: "6px" },
  creditFill: { height: "100%", borderRadius: "8px", background: "linear-gradient(90deg, #6b21c8, #a855f7)", transition: "width 0.3s" },
};

const PLANS = {
  starter: { name: "Starter", price: 99, credits: 50, color: "#c084fc" },
  growth: { name: "Growth", price: 199, credits: 150, color: "#a855f7" },
  agency: { name: "Agency", price: 399, credits: 400, color: "#7c3aed" },
};

function scoreColor(s) {
  if (s >= 80) return { bg: "rgba(239,68,68,0.15)", color: "#ef4444", border: "rgba(239,68,68,0.3)", label: "HOT" };
  if (s >= 60) return { bg: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "rgba(245,158,11,0.3)", label: "WARM" };
  return { bg: "rgba(34,197,94,0.15)", color: "#22c55e", border: "rgba(34,197,94,0.3)", label: "COLD" };
}

async function callClaude(apiKey, prompt, maxTokens = 2000) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
  return data.content[0].text;
}

function safeJSON(raw) {
  const clean = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch (_) {}
  const obj = clean.match(/\{[\s\S]*\}/); if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
  const arr = clean.match(/\[[\s\S]*\]/); if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
  throw new Error("Could not parse JSON");
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function PitchMind() {
  const [screen, setScreen] = useState("login"); // login | signup | plan | profile | dashboard
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authErr, setAuthErr] = useState("");
  const [authLoading2, setAuthLoading2] = useState(false);

  // Plan selection
  const [selectedPlan, setSelectedPlan] = useState("starter");

  // Business profile
  const [profile, setProfile] = useState({ businessName: "", whatYouDo: "", targetIndustry: "", location: "" });
  const [profileErr, setProfileErr] = useState("");

  // Search
  const [leads, setLeads] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState("");
  const [progress, setProgress] = useState("");
  const [selectedLead, setSelectedLead] = useState(null);

  // API Key (stored locally)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("pm_api_key") || "");
  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState("");

  const CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(168,85,247,0.4);border-radius:3px}
  input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.25)}`;

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        const snap = await getDoc(doc(db, "users", u.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserData(data);
          if (data.profile) setProfile(data.profile);
          if (!apiKey && data.profile) setScreen("dashboard");
          else if (!apiKey) setScreen("apikey");
          else if (!data.profile?.businessName) setScreen("profile");
          else setScreen("dashboard");
        } else {
          setScreen("plan");
        }
      } else {
        setUser(null);
        setUserData(null);
        setScreen("login");
      }
      setAuthLoading(false);
    });
    return unsub;
  }, []);

  const handleSignup = async () => {
    if (!email || !password) { setAuthErr("Please fill in all fields."); return; }
    if (password.length < 6) { setAuthErr("Password must be at least 6 characters."); return; }
    setAuthLoading2(true); setAuthErr("");
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setAuthErr(e.message.replace("Firebase: ", ""));
    }
    setAuthLoading2(false);
  };

  const handleLogin = async () => {
    if (!email || !password) { setAuthErr("Please fill in all fields."); return; }
    setAuthLoading2(true); setAuthErr("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e) {
      setAuthErr("Invalid email or password.");
    }
    setAuthLoading2(false);
  };

  const handlePlan = async () => {
    const plan = PLANS[selectedPlan];
    await setDoc(doc(db, "users", user.uid), {
      email: user.email,
      plan: selectedPlan,
      credits: plan.credits,
      maxCredits: plan.credits,
      createdAt: new Date().toISOString(),
      profile: null,
    });
    const snap = await getDoc(doc(db, "users", user.uid));
    setUserData(snap.data());
    setScreen("apikey");
  };

  const handleApiKey = () => {
    if (!apiKeyInput.trim().startsWith("sk-ant-")) { setAuthErr("Invalid key. Must start with sk-ant-"); return; }
    localStorage.setItem("pm_api_key", apiKeyInput.trim());
    setApiKey(apiKeyInput.trim());
    setAuthErr("");
    setScreen("profile");
  };

  const handleProfile = async () => {
    if (!profile.businessName || !profile.whatYouDo || !profile.targetIndustry || !profile.location) {
      setProfileErr("Please fill in all fields."); return;
    }
    await updateDoc(doc(db, "users", user.uid), { profile });
    setUserData(prev => ({ ...prev, profile }));
    setProfileErr("");
    setScreen("dashboard");
  };

  const useCredit = async () => {
    if (!userData || userData.credits <= 0) return false;
    await updateDoc(doc(db, "users", user.uid), { credits: increment(-1) });
    setUserData(prev => ({ ...prev, credits: prev.credits - 1 }));
    return true;
  };

  const findLeads = async () => {
    if (userData.credits <= 0) {
      setSearchErr("❌ No credits left! Please upgrade your plan to continue.");
      return;
    }
    setSearchErr(""); setSearching(true); setLeads([]);
    setProgress("🔍 Scanning for weak businesses...");

    const ok = await useCredit();
    if (!ok) { setSearchErr("No credits available."); setSearching(false); return; }

    try {
      const prompt = `You are PitchMind AI, an intelligent lead generation engine.

MY BUSINESS: ${profile.businessName}
WHAT I OFFER: ${profile.whatYouDo}
TARGET: ${profile.targetIndustry} businesses in ${profile.location} that are WEAK in what I offer.

Generate 6 realistic HOT leads — real-sounding ${profile.targetIndustry} businesses in ${profile.location} that clearly need "${profile.businessName}"'s services.

Return ONLY raw JSON array:
[{
  "name": "Business name",
  "type": "${profile.targetIndustry}",
  "location": "${profile.location}",
  "address": "Street address in ${profile.location}",
  "phone": "Local phone number",
  "website": "weak website URL or 'No website'",
  "rating": 3.2,
  "reviews": 18,
  "score": 88,
  "weaknesses": ["No social media", "Poor website", "Low reviews"],
  "painPoint": "Why they desperately need ${profile.businessName}.",
  "hotReason": "Why they are a HOT lead right now."
}]`;

      const raw = await callClaude(apiKey, prompt, 2000);
      const parsed = safeJSON(raw);
      setLeads(Array.isArray(parsed) ? parsed : []);
      setProgress("");
    } catch (e) {
      setSearchErr(`Error: ${e.message}`);
      setProgress("");
    }
    setSearching(false);
  };

  const loadProfile = async (lead) => {
    if (userData.credits <= 0) {
      alert("No credits left! Please upgrade your plan.");
      return;
    }
    setSelectedLead({ ...lead, loading: true, report: null });
    await useCredit();
    try {
      const prompt = `You are PitchMind AI. Create a deep sales intelligence report.

MY BUSINESS: ${profile.businessName}
WHAT I OFFER: ${profile.whatYouDo}

TARGET:
- Company: ${lead.name}
- Industry: ${lead.type}
- Address: ${lead.address}
- Phone: ${lead.phone}
- Website: ${lead.website}
- Rating: ${lead.rating}/5 (${lead.reviews} reviews)
- Weaknesses: ${(lead.weaknesses || []).join(", ")}

Return ONLY raw JSON:
{
  "companyOverview": "3 sentences about this business.",
  "weaknessAnalysis": "Exactly WHY their presence is weak and what it costs them.",
  "decisionMaker": "Who owns/manages this: personality, fears, priorities.",
  "emotionalProfile": "Their frustrations, fears, hidden desires. Psychological.",
  "objections": "Top 3 objections and real reasons behind each.",
  "pitchStrategy": "Step-by-step: what to say first, trust-building, angle to use.",
  "openingLine": "Perfect first sentence to make them stop and listen.",
  "closingAngle": "Most powerful argument to close this deal.",
  "socialApproach": "How to find and approach them on Instagram/Facebook.",
  "emailTemplate": "4-sentence cold email personalized for this business."
}`;
      const raw = await callClaude(apiKey, prompt, 2500);
      const parsed = safeJSON(raw);
      setSelectedLead({ ...lead, loading: false, report: parsed });
    } catch (e) {
      setSelectedLead(prev => ({ ...prev, loading: false, reportErr: e.message }));
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setLeads([]);
    setScreen("login");
  };

  // ── LOADING ──
  if (authLoading) return (
    <div style={{ ...S.app, ...S.center }}>
      <style>{CSS}</style>
      <div style={S.logo}>PitchMind</div>
      <div style={{ marginTop: "20px" }}>{[0,0.2,0.4].map((d,i)=><span key={i} style={{...S.dot,animationDelay:`${d}s`}}/>)}</div>
    </div>
  );

  // ── LOGIN ──
  if (screen === "login") return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.center}>
        <div style={S.card}>
          <div style={S.logo}>PitchMind</div>
          <div style={S.tag}>Find the lead. Win the deal.</div>
          <label style={S.label}>Email</label>
          <input style={S.inp} type="email" placeholder="you@example.com" value={email} onChange={e=>{setEmail(e.target.value);setAuthErr("");}} />
          <label style={S.label}>Password</label>
          <input style={S.inp} type="password" placeholder="••••••••" value={password} onChange={e=>{setPassword(e.target.value);setAuthErr("");}} onKeyDown={e=>e.key==="Enter"&&handleLogin()} />
          {authErr && <div style={{...S.err,marginBottom:"10px"}}>{authErr}</div>}
          <button style={S.btn} onClick={handleLogin} disabled={authLoading2}>{authLoading2?"Signing in...":"Sign In"}</button>
          <button style={S.btnGhost} onClick={()=>{setScreen("signup");setAuthErr("");}}>Don't have an account? Sign Up</button>
        </div>
      </div>
    </div>
  );

  // ── SIGNUP ──
  if (screen === "signup") return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.center}>
        <div style={S.card}>
          <div style={S.logo}>PitchMind</div>
          <div style={S.tag}>Create your account</div>
          <label style={S.label}>Email</label>
          <input style={S.inp} type="email" placeholder="you@example.com" value={email} onChange={e=>{setEmail(e.target.value);setAuthErr("");}} />
          <label style={S.label}>Password</label>
          <input style={S.inp} type="password" placeholder="Min 6 characters" value={password} onChange={e=>{setPassword(e.target.value);setAuthErr("");}} onKeyDown={e=>e.key==="Enter"&&handleSignup()} />
          {authErr && <div style={{...S.err,marginBottom:"10px"}}>{authErr}</div>}
          <button style={S.btn} onClick={handleSignup} disabled={authLoading2}>{authLoading2?"Creating account...":"Create Account"}</button>
          <button style={S.btnGhost} onClick={()=>{setScreen("login");setAuthErr("");}}>Already have an account? Sign In</button>
        </div>
      </div>
    </div>
  );

  // ── PLAN SELECTION ──
  if (screen === "plan") return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.center}>
        <div style={{...S.card, maxWidth:"700px"}}>
          <div style={S.logo}>PitchMind</div>
          <div style={S.tag}>Choose your plan</div>
          <div style={S.plansGrid}>
            {Object.entries(PLANS).map(([key, plan]) => (
              <div key={key} style={{...S.planCard, ...(selectedPlan===key?S.planCardActive:{})}} onClick={()=>setSelectedPlan(key)}>
                <div style={{fontSize:"18px",fontWeight:"800",color:plan.color,marginBottom:"4px"}}>${plan.price}</div>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)",marginBottom:"12px"}}>/month</div>
                <div style={{fontSize:"15px",fontWeight:"700",marginBottom:"8px"}}>{plan.name}</div>
                <div style={{fontSize:"24px",fontWeight:"800",color:plan.color}}>{plan.credits}</div>
                <div style={{fontSize:"11px",color:"rgba(255,255,255,0.5)"}}>credits/month</div>
              </div>
            ))}
          </div>
          <div style={{fontSize:"12px",color:"rgba(255,255,255,0.4)",marginBottom:"20px",textAlign:"left",lineHeight:"1.7"}}>
            ✅ 1 credit = 1 lead scan OR 1 intelligence report<br/>
            ✅ Credits reset every month<br/>
            ✅ Upgrade anytime
          </div>
          <button style={S.btn} onClick={handlePlan}>Start with {PLANS[selectedPlan].name} →</button>
        </div>
      </div>
    </div>
  );

  // ── API KEY ──
  if (screen === "apikey") return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.center}>
        <div style={S.card}>
          <div style={S.logo}>PitchMind</div>
          <div style={S.tag}>Connect your AI brain</div>
          <div style={{background:"rgba(168,85,247,0.08)",border:"1px solid rgba(168,85,247,0.2)",borderRadius:"10px",padding:"12px 14px",marginBottom:"20px",fontSize:"12px",color:"rgba(255,255,255,0.6)",lineHeight:"1.6",textAlign:"left"}}>
            🔑 PitchMind uses Claude AI to generate lead intelligence.<br/>Get your free API key at <span style={{color:"#a855f7"}}>console.anthropic.com</span>
          </div>
          <label style={S.label}>Claude API Key</label>
          <input style={S.inp} type="password" placeholder="sk-ant-..." value={apiKeyInput} onChange={e=>{setApiKeyInput(e.target.value);setAuthErr("");}} onKeyDown={e=>e.key==="Enter"&&handleApiKey()} />
          {authErr && <div style={{...S.err,marginBottom:"10px"}}>{authErr}</div>}
          <button style={S.btn} onClick={handleApiKey}>Continue →</button>
          <div style={{marginTop:"14px",fontSize:"11px",color:"rgba(255,255,255,0.2)",lineHeight:"1.6"}}>🔒 Stored locally in your browser. Never sent to our servers.</div>
        </div>
      </div>
    </div>
  );

  // ── PROFILE SETUP ──
  if (screen === "profile") return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.center}>
        <div style={{...S.card,maxWidth:"600px",textAlign:"left"}}>
          <div style={{...S.logo,textAlign:"center"}}>PitchMind</div>
          <div style={{...S.tag,textAlign:"center"}}>Tell us about your business</div>
          <div style={{background:"rgba(168,85,247,0.08)",border:"1px solid rgba(168,85,247,0.2)",borderRadius:"10px",padding:"12px 14px",marginBottom:"20px",fontSize:"12px",color:"rgba(255,255,255,0.6)",lineHeight:"1.6"}}>
            💡 This helps PitchMind find businesses that are weak in exactly what you offer.
          </div>
          <label style={S.label}>Your Business Name</label>
          <input style={S.inp} placeholder="e.g. Peach Agency..." value={profile.businessName} onChange={e=>setProfile(p=>({...p,businessName:e.target.value}))} />
          <label style={S.label}>What You Offer</label>
          <textarea style={S.textarea} placeholder="e.g. Social media management, paid ads, web design..." value={profile.whatYouDo} onChange={e=>setProfile(p=>({...p,whatYouDo:e.target.value}))} />
          <label style={S.label}>Target Industry</label>
          <input style={S.inp} placeholder="e.g. Restaurants, Clinics, Real Estate..." value={profile.targetIndustry} onChange={e=>setProfile(p=>({...p,targetIndustry:e.target.value}))} />
          <label style={S.label}>Target Location</label>
          <input style={S.inp} placeholder="e.g. Beirut, Dubai, Kuwait City..." value={profile.location} onChange={e=>setProfile(p=>({...p,location:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&handleProfile()} />
          {profileErr && <div style={{...S.err,marginBottom:"10px"}}>{profileErr}</div>}
          <button style={S.btn} onClick={handleProfile}>Find My Leads →</button>
        </div>
      </div>
    </div>
  );

  // ── DASHBOARD ──
  const hotLeads = leads.filter(l=>l.score>=80).length;
  const warmLeads = leads.filter(l=>l.score>=60&&l.score<80).length;
  const avgScore = leads.length ? Math.round(leads.reduce((a,l)=>a+l.score,0)/leads.length) : 0;
  const creditPct = userData ? Math.round((userData.credits/userData.maxCredits)*100) : 0;
  const plan = PLANS[userData?.plan] || PLANS.starter;

  return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.header}>
        <div style={S.hLogo}>PitchMind</div>
        <div style={{display:"flex",gap:"10px",alignItems:"center"}}>
          {/* Credits indicator */}
          <div style={{background:"rgba(168,85,247,0.15)",border:"1px solid rgba(168,85,247,0.3)",borderRadius:"10px",padding:"6px 12px",fontSize:"12px"}}>
            <span style={{color:"#c084fc",fontWeight:"700"}}>{userData?.credits || 0}</span>
            <span style={{color:"rgba(255,255,255,0.4)"}}> / {userData?.maxCredits || 0} credits</span>
          </div>
          <div style={S.badge}>{plan.name} Plan</div>
          <button onClick={()=>setScreen("profile")} style={{background:"rgba(168,85,247,0.15)",border:"1px solid rgba(168,85,247,0.3)",borderRadius:"8px",color:"#c084fc",padding:"5px 10px",cursor:"pointer",fontSize:"11px"}}>Edit Profile</button>
          <button onClick={handleLogout} style={{background:"rgba(255,255,255,0.07)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",color:"rgba(255,255,255,0.4)",padding:"5px 10px",cursor:"pointer",fontSize:"11px"}}>Logout</button>
        </div>
      </div>

      <div style={S.main}>
        {/* Credit Warning */}
        {userData?.credits <= 5 && userData?.credits > 0 && (
          <div style={{background:"rgba(245,158,11,0.1)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:"12px",padding:"14px 18px",marginBottom:"20px",fontSize:"13px",color:"#f59e0b",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            ⚠️ Only {userData.credits} credits left! Upgrade to keep finding leads.
            <button onClick={()=>setScreen("plan")} style={{background:"rgba(245,158,11,0.2)",border:"1px solid rgba(245,158,11,0.4)",borderRadius:"8px",color:"#f59e0b",padding:"5px 12px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>Upgrade →</button>
          </div>
        )}
        {userData?.credits === 0 && (
          <div style={{background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:"12px",padding:"14px 18px",marginBottom:"20px",fontSize:"13px",color:"#ef4444",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            ❌ No credits left! Upgrade your plan to continue searching.
            <button onClick={()=>setScreen("plan")} style={{background:"rgba(239,68,68,0.2)",border:"1px solid rgba(239,68,68,0.4)",borderRadius:"8px",color:"#ef4444",padding:"5px 12px",cursor:"pointer",fontSize:"12px",fontWeight:"700"}}>Upgrade Now →</button>
          </div>
        )}

        {/* Profile Banner */}
        <div style={S.profileBanner}>
          <div>
            <div style={{fontSize:"13px",fontWeight:"700",marginBottom:"3px"}}>🏢 {profile.businessName}</div>
            <div style={{fontSize:"12px",color:"rgba(255,255,255,0.5)"}}>{profile.whatYouDo?.substring(0,80)}...</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:"12px",color:"#c084fc",fontWeight:"600"}}>Targeting: {profile.targetIndustry}</div>
            <div style={{fontSize:"11px",color:"rgba(255,255,255,0.4)"}}>📍 {profile.location}</div>
            <div style={{marginTop:"6px"}}>
              <div style={{fontSize:"10px",color:"rgba(255,255,255,0.3)",marginBottom:"3px"}}>{userData?.credits}/{userData?.maxCredits} credits</div>
              <div style={S.creditBar}><div style={{...S.creditFill,width:`${creditPct}%`}}/></div>
            </div>
          </div>
        </div>

        {/* Hero */}
        <div style={{marginBottom:"28px"}}>
          <div style={{fontSize:"36px",fontWeight:"800",lineHeight:"1.1",marginBottom:"8px",letterSpacing:"-1.5px"}}>
            Find businesses<br/>
            <span style={{background:"linear-gradient(135deg, #a855f7, #c084fc)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>that need you.</span>
          </div>
          <div style={{color:"#c084fc",fontSize:"14px"}}>AI scans {profile.targetIndustry} businesses in {profile.location} and finds the ones weakest in what you offer.</div>
        </div>

        {/* Stats */}
        {leads.length > 0 && (
          <div style={S.statsRow}>
            {[["🔴 Hot Leads",hotLeads],["🟡 Warm Leads",warmLeads],["Avg. Score",`${avgScore}%`]].map(([lbl,val])=>(
              <div key={lbl} style={S.statCard}>
                <div style={S.statNum}>{val}</div>
                <div style={S.statLbl}>{lbl}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div style={S.sCard}>
          <div style={{fontSize:"12px",fontWeight:"700",color:"#c084fc",marginBottom:"16px",textTransform:"uppercase",letterSpacing:"1px"}}>🔍 Scan for Hot Leads <span style={{color:"rgba(255,255,255,0.3)",fontWeight:"400",textTransform:"none",fontSize:"11px"}}>— costs 1 credit per scan</span></div>
          <div style={{display:"flex",gap:"12px",alignItems:"flex-end",flexWrap:"wrap"}}>
            <div style={{flex:1,minWidth:"180px"}}>
              <label style={S.label}>Target Industry</label>
              <input style={{...S.inp,marginBottom:0}} placeholder="Restaurants, Clinics..." value={profile.targetIndustry} onChange={e=>setProfile(p=>({...p,targetIndustry:e.target.value}))} />
            </div>
            <div style={{flex:1,minWidth:"180px"}}>
              <label style={S.label}>Location</label>
              <input style={{...S.inp,marginBottom:0}} placeholder="Beirut, Dubai..." value={profile.location} onChange={e=>setProfile(p=>({...p,location:e.target.value}))} />
            </div>
            <button style={{...S.btnSm,opacity:searching||userData?.credits===0?0.6:1}} onClick={findLeads} disabled={searching||userData?.credits===0}>
              {searching?"Scanning...":"Scan Now →"}
            </button>
          </div>
          {progress && <div style={{marginTop:"12px",fontSize:"12px",color:"#c084fc"}}>{progress}</div>}
          {searchErr && <div style={S.err}>{searchErr}</div>}
        </div>

        {/* Loading */}
        {searching && (
          <div style={{textAlign:"center",padding:"50px"}}>
            <div style={{marginBottom:"12px"}}>{[0,0.2,0.4].map((d,i)=><span key={i} style={{...S.dot,animationDelay:`${d}s`}}/>)}</div>
            <div style={{color:"#c084fc",fontSize:"14px",fontWeight:"600"}}>Hunting for weak {profile.targetIndustry} businesses in {profile.location}...</div>
          </div>
        )}

        {/* Leads Grid */}
        {leads.length > 0 && !searching && (
          <>
            <div style={{fontSize:"15px",fontWeight:"700",marginBottom:"16px"}}>⚡ {leads.length} Leads Found</div>
            <div style={S.leadsGrid}>
              {[...leads].sort((a,b)=>b.score-a.score).map((lead,i)=>{
                const sc = scoreColor(lead.score);
                return (
                  <div key={i} style={S.lCard}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(168,85,247,0.5)";e.currentTarget.style.background="rgba(255,255,255,0.07)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(168,85,247,0.2)";e.currentTarget.style.background="rgba(255,255,255,0.04)";}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
                      <div style={{flex:1,paddingRight:"8px"}}>
                        <div style={S.lName}>{lead.name}</div>
                        <div style={S.lSub}>{lead.type} · {lead.location}</div>
                      </div>
                      <div style={{background:sc.bg,color:sc.color,border:`1px solid ${sc.border}`,borderRadius:"8px",padding:"3px 8px",fontSize:"11px",fontWeight:"800",flexShrink:0,textAlign:"center"}}>
                        <div>{sc.label}</div><div style={{fontSize:"13px"}}>{lead.score}</div>
                      </div>
                    </div>
                    <div style={{marginBottom:"8px"}}>
                      {lead.phone&&<div style={{fontSize:"11px",color:"rgba(255,255,255,0.55)",marginBottom:"2px"}}>📞 {lead.phone}</div>}
                      <div style={{fontSize:"11px",color:lead.website==="No website"?"#ef4444":"#a855f7",marginBottom:"2px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        🌐 {lead.website==="No website"?"❌ No website":lead.website.replace(/https?:\/\//,"")}
                      </div>
                      <div style={{fontSize:"11px",color:"rgba(255,255,255,0.35)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>📍 {lead.address}</div>
                      {lead.rating&&<div style={{fontSize:"11px",color:"#f59e0b",marginTop:"2px"}}>⭐ {lead.rating}/5 ({lead.reviews} reviews)</div>}
                    </div>
                    {lead.weaknesses&&<div style={{marginBottom:"8px"}}>{lead.weaknesses.map((w,j)=><span key={j} style={{...S.weakTag,background:"rgba(239,68,68,0.12)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.25)"}}>⚠ {w}</span>)}</div>}
                    <div style={S.lPain}>{lead.painPoint}</div>
                    <button style={S.vBtn} onClick={()=>loadProfile(lead)}
                      onMouseEnter={e=>{e.currentTarget.style.background="rgba(139,60,247,0.35)";e.currentTarget.style.color="#fff";}}
                      onMouseLeave={e=>{e.currentTarget.style.background="rgba(139,60,247,0.2)";e.currentTarget.style.color="#c084fc";}}>
                      Get Full Pitch Strategy → <span style={{opacity:0.5,fontSize:"10px"}}>(1 credit)</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {leads.length===0&&!searching&&(
          <div style={S.empty}>
            <div style={{fontSize:"48px",marginBottom:"12px"}}>🎯</div>
            <div style={{fontSize:"18px",fontWeight:"700",color:"rgba(255,255,255,0.6)",marginBottom:"6px"}}>Ready to hunt for leads?</div>
            <div style={{fontSize:"13px"}}>PitchMind will find {profile.targetIndustry} businesses in {profile.location} that are weakest in what you offer.</div>
          </div>
        )}
      </div>

      {/* Intelligence Modal */}
      {selectedLead&&(
        <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&setSelectedLead(null)}>
          <div style={S.modal}>
            <button style={S.mClose} onClick={()=>setSelectedLead(null)}>✕</button>
            <div style={{marginBottom:"20px"}}>
              <div style={{fontSize:"22px",fontWeight:"800",marginBottom:"3px"}}>{selectedLead.name}</div>
              <div style={{color:"#c084fc",fontSize:"12px",marginBottom:"14px"}}>{selectedLead.type} · {selectedLead.location}</div>
              <div style={S.infoGrid}>
                <div style={S.infoBox}><div style={S.infoLbl}>📞 Phone</div><div style={S.infoVal}>{selectedLead.phone}</div></div>
                <div style={S.infoBox}><div style={S.infoLbl}>⭐ Rating</div><div style={S.infoVal}>{selectedLead.rating}/5 ({selectedLead.reviews} reviews)</div></div>
                <div style={{...S.infoBox,gridColumn:"1/-1"}}><div style={S.infoLbl}>🌐 Website</div><div style={{...S.infoVal,color:selectedLead.website==="No website"?"#ef4444":"#a855f7"}}>{selectedLead.website}</div></div>
                <div style={{...S.infoBox,gridColumn:"1/-1"}}><div style={S.infoLbl}>📍 Address</div><div style={S.infoVal}>{selectedLead.address}</div></div>
              </div>
              {selectedLead.weaknesses&&<div style={{marginBottom:"4px"}}>{selectedLead.weaknesses.map((w,i)=><span key={i} style={{...S.weakTag,background:"rgba(239,68,68,0.12)",color:"#ef4444",border:"1px solid rgba(239,68,68,0.25)"}}>⚠ {w}</span>)}</div>}
            </div>
            {selectedLead.loading&&(
              <div style={{textAlign:"center",padding:"36px"}}>
                <div style={{marginBottom:"10px"}}>{[0,0.2,0.4].map((d,i)=><span key={i} style={{...S.dot,animationDelay:`${d}s`}}/>)}</div>
                <div style={{color:"#c084fc",fontWeight:"600",fontSize:"13px"}}>Building your personalized pitch strategy...</div>
              </div>
            )}
            {selectedLead.reportErr&&<div style={{color:"#ef4444",padding:"14px",background:"rgba(239,68,68,0.1)",borderRadius:"10px",fontSize:"12px"}}>{selectedLead.reportErr}</div>}
            {selectedLead.report&&(()=>{
              const r=selectedLead.report;
              return [
                ["🏢","Company Overview",r.companyOverview],
                ["⚠️","Weakness Analysis",r.weaknessAnalysis],
                ["👤","Decision Maker Profile",r.decisionMaker],
                ["🧠","Psychological & Emotional Profile",r.emotionalProfile],
                ["🛡️","Expected Objections",r.objections],
                ["🎯","Pitch Strategy",r.pitchStrategy],
                ["💬","Perfect Opening Line",r.openingLine],
                ["🔑","Closing Angle",r.closingAngle],
                ["📱","Social Media Approach",r.socialApproach],
                ["✉️","Cold Email Template",r.emailTemplate],
              ].map(([icon,title,content],i)=>(
                <div key={i}><div style={S.mTitle}>{icon} {title}</div><div style={S.mBox}>{content}</div></div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
