import { useState } from "react";

const S = {
  app: { fontFamily: "'Inter', sans-serif", background: "linear-gradient(135deg, #1a0533 0%, #0f0020 50%, #2d0a5e 100%)", minHeight: "100vh", color: "#fff" },
  center: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: "24px" },
  card: { background: "rgba(255,255,255,0.05)", backdropFilter: "blur(20px)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "24px", padding: "40px", maxWidth: "560px", width: "100%", textAlign: "center" },
  logo: { fontSize: "30px", fontWeight: "800", background: "linear-gradient(135deg, #a855f7, #fff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: "6px", letterSpacing: "-1px" },
  tag: { color: "#c084fc", fontSize: "12px", marginBottom: "28px", letterSpacing: "2px", textTransform: "uppercase" },
  label: { display: "block", textAlign: "left", fontSize: "11px", fontWeight: "700", color: "#c084fc", marginBottom: "6px", letterSpacing: "0.5px", textTransform: "uppercase" },
  inp: { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: "10px", color: "#fff", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "12px" },
  textarea: { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(168,85,247,0.4)", borderRadius: "10px", color: "#fff", fontSize: "13px", outline: "none", boxSizing: "border-box", marginBottom: "12px", resize: "vertical", minHeight: "70px", fontFamily: "inherit" },
  btn: { width: "100%", padding: "13px", background: "linear-gradient(135deg, #6b21c8, #8b3cf7)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "14px", fontWeight: "700", cursor: "pointer" },
  btnSm: { padding: "10px 20px", background: "linear-gradient(135deg, #6b21c8, #8b3cf7)", border: "none", borderRadius: "10px", color: "#fff", fontSize: "13px", fontWeight: "700", cursor: "pointer" },
  header: { padding: "16px 28px", borderBottom: "1px solid rgba(168,85,247,0.2)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(0,0,0,0.2)", backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100 },
  hLogo: { fontSize: "20px", fontWeight: "800", background: "linear-gradient(135deg, #a855f7, #fff)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "-0.5px" },
  badge: { background: "rgba(139,60,247,0.2)", border: "1px solid #8b3cf7", borderRadius: "20px", padding: "3px 10px", fontSize: "11px", color: "#c084fc", fontWeight: "600" },
  main: { maxWidth: "1200px", margin: "0 auto", padding: "32px 24px" },
  profileBanner: { background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "16px", padding: "16px 20px", marginBottom: "28px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" },
  sCard: { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "18px", padding: "24px", marginBottom: "28px" },
  searchGrid: { display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: "12px", alignItems: "end" },
  sInp: { padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "10px", color: "#fff", fontSize: "13px", outline: "none", width: "100%", boxSizing: "border-box" },
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
  step: { display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px", fontSize: "13px", color: "rgba(255,255,255,0.5)" },
  stepActive: { color: "#a855f7", fontWeight: "600" },
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
  if (!data.content?.[0]?.text) throw new Error("Empty API response");
  return data.content[0].text;
}

function safeJSON(raw) {
  const clean = raw.replace(/```json|```/g, "").trim();
  try { return JSON.parse(clean); } catch (_) {}
  const obj = clean.match(/\{[\s\S]*\}/); if (obj) { try { return JSON.parse(obj[0]); } catch (_) {} }
  const arr = clean.match(/\[[\s\S]*\]/); if (arr) { try { return JSON.parse(arr[0]); } catch (_) {} }
  throw new Error("Could not parse JSON");
}

// OpenStreetMap Overpass API — free, no key, no CORS
async function searchOSM(industry, location) {
  const query = `[out:json][timeout:25];
area[name="${location}"]->.searchArea;
(
  node["name"]["amenity"](area.searchArea);
  node["name"]["shop"](area.searchArea);
  node["name"]["office"](area.searchArea);
  node["name"]["tourism"](area.searchArea);
)->.all;
.all out 20;`;
  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: query,
  });
  if (!response.ok) throw new Error("OpenStreetMap unavailable");
  const data = await response.json();
  return data.elements || [];
}

export default function PitchMind() {
  const [step, setStep] = useState("login"); // login | profile | search
  const [apiKey, setApiKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [keyErr, setKeyErr] = useState("");
  const [profile, setProfile] = useState({ businessName: "", whatYouDo: "", targetIndustry: "", location: "" });
  const [profileErr, setProfileErr] = useState("");
  const [leads, setLeads] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [searchErr, setSearchErr] = useState("");
  const [progress, setProgress] = useState("");

  const handleLogin = () => {
    if (!keyInput.trim().startsWith("sk-ant-")) { setKeyErr("Invalid key. Must start with sk-ant-"); return; }
    setApiKey(keyInput.trim()); setKeyErr(""); setStep("profile");
  };

  const handleProfile = () => {
    if (!profile.businessName || !profile.whatYouDo || !profile.targetIndustry || !profile.location) {
      setProfileErr("Please fill in all fields."); return;
    }
    setProfileErr(""); setStep("search");
  };

  const findLeads = async () => {
    setSearchErr(""); setSearching(true); setLeads([]); setProgress("🔍 Searching for real businesses...");
    try {
      // Try OSM first
      let osmResults = [];
      try {
        osmResults = await searchOSM(profile.targetIndustry, profile.location);
      } catch (_) {}

      setProgress("🧠 AI is identifying weak businesses that need your services...");

      // Claude does the heavy lifting — finds + scores leads based on business profile
      const prompt = `You are PitchMind AI, an intelligent lead generation engine.

MY BUSINESS PROFILE:
- Business Name: ${profile.businessName}
- What I do: ${profile.whatYouDo}
- I am looking for: ${profile.targetIndustry} businesses in ${profile.location} that are WEAK in what I offer

${osmResults.length > 0 ? `Real businesses found nearby: ${osmResults.slice(0,10).map(e => e.tags?.name).filter(Boolean).join(", ")}` : ""}

YOUR TASK:
Generate 6 realistic HOT leads — real-sounding businesses in ${profile.location} that are in the ${profile.targetIndustry} industry AND are clearly weak/struggling in areas where "${profile.businessName}" can help.

For each lead, identify their SPECIFIC weaknesses that make them a perfect target for ${profile.businessName}.

Return ONLY raw JSON array, no markdown:
[
  {
    "name": "Real business name",
    "type": "${profile.targetIndustry}",
    "location": "${profile.location}",
    "address": "Realistic street address in ${profile.location}",
    "phone": "Realistic local phone number",
    "website": "Either a basic/weak website URL or 'No website'",
    "rating": 3.2,
    "reviews": 18,
    "score": 88,
    "weaknesses": ["No social media", "Poor website", "Low reviews"],
    "painPoint": "Specific one-sentence reason why they desperately need ${profile.businessName}'s services.",
    "hotReason": "One sentence on why they are a HOT lead right now."
  }
]

Rules:
- Score 80-95 = HOT (they urgently need the service)
- Score 60-79 = WARM (they could benefit)
- Score below 60 = COLD (skip these)
- Focus on businesses that are VISIBLY weak in: ${profile.whatYouDo}
- Make names, addresses, phones realistic for ${profile.location}
- Vary the weakness types across the 6 leads`;

      const raw = await callClaude(apiKey, prompt, 2000);
      const parsed = safeJSON(raw);
      if (!Array.isArray(parsed)) throw new Error("Invalid response");
      setLeads(parsed);
      setProgress("");
    } catch (e) {
      setSearchErr(`Error: ${e.message}`);
      setProgress("");
    }
    setSearching(false);
  };

  const loadProfile = async (lead) => {
    setSelectedLead({ ...lead, loading: true, report: null, reportErr: null });
    try {
      const prompt = `You are PitchMind AI. Create a deep sales intelligence report.

MY BUSINESS: ${profile.businessName}
WHAT I OFFER: ${profile.whatYouDo}

TARGET LEAD:
- Company: ${lead.name}
- Industry: ${lead.type}
- Location: ${lead.address}
- Phone: ${lead.phone}
- Website: ${lead.website}
- Google Rating: ${lead.rating}/5 (${lead.reviews} reviews)
- Their Weaknesses: ${(lead.weaknesses || []).join(", ")}
- Why They're Hot: ${lead.hotReason}

Return ONLY raw JSON, no markdown:
{
  "companyOverview": "3 sentences: what this business does, their current situation, and why they're struggling.",
  "weaknessAnalysis": "Detailed breakdown of exactly WHY their marketing/online presence is weak and what it's costing them.",
  "decisionMaker": "Who likely owns/manages this business: their personality, fears, and what they care about most.",
  "emotionalProfile": "How the owner FEELS about their situation right now — their frustrations, fears, and hidden desires. Be psychological.",
  "objections": "Top 3 objections they'll raise when you approach them, and the real reason behind each one.",
  "pitchStrategy": "Step-by-step approach: what to say first, how to build trust, which pain to press on, how to position ${profile.businessName}.",
  "openingLine": "The single perfect first sentence to say/write to this specific business owner that will make them stop and listen.",
  "closingAngle": "The one argument that will make them say yes — specific to their weakness and your service.",
  "socialApproach": "How to find and approach them on Instagram/Facebook/LinkedIn — what to look for and what to say.",
  "emailTemplate": "A 4-sentence cold email/DM template completely personalized for this business and their specific weakness."
}`;
      const raw = await callClaude(apiKey, prompt, 2500);
      const parsed = safeJSON(raw);
      setSelectedLead({ ...lead, loading: false, report: parsed });
    } catch (e) {
      setSelectedLead(prev => ({ ...prev, loading: false, reportErr: `Error: ${e.message}` }));
    }
  };

  const CSS = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
  *{box-sizing:border-box;margin:0;padding:0}
  ::-webkit-scrollbar{width:5px}::-webkit-scrollbar-thumb{background:rgba(168,85,247,0.4);border-radius:3px}
  input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.25)}
  textarea{font-family:inherit}`;

  // STEP 1: LOGIN
  if (step === "login") return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.center}>
        <div style={S.card}>
          <div style={S.logo}>PitchMind</div>
          <div style={S.tag}>Find the lead. Win the deal.</div>
          <label style={S.label}>Claude API Key</label>
          <input style={S.inp} type="password" placeholder="sk-ant-..." value={keyInput}
            onChange={e => { setKeyInput(e.target.value); setKeyErr(""); }}
            onKeyDown={e => e.key === "Enter" && handleLogin()} />
          {keyErr && <div style={{ ...S.err, marginBottom: "10px" }}>{keyErr}</div>}
          <button style={S.btn} onClick={handleLogin}>Continue →</button>
          <div style={{ marginTop: "16px", fontSize: "11px", color: "rgba(255,255,255,0.2)", lineHeight: "1.6" }}>🔒 Your key stays in your browser. Never stored.</div>
        </div>
      </div>
    </div>
  );

  // STEP 2: BUSINESS PROFILE
  if (step === "profile") return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.center}>
        <div style={{ ...S.card, maxWidth: "600px", textAlign: "left" }}>
          <div style={{ ...S.logo, textAlign: "center" }}>PitchMind</div>
          <div style={{ ...S.tag, textAlign: "center" }}>Tell us about your business</div>

          <div style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "10px", padding: "12px 14px", marginBottom: "20px", fontSize: "12px", color: "rgba(255,255,255,0.6)", lineHeight: "1.6" }}>
            💡 PitchMind needs to understand YOUR business so it can find the RIGHT leads — businesses that are weak in exactly what you offer.
          </div>

          <label style={S.label}>Your Business Name</label>
          <input style={S.inp} placeholder="e.g. Peach Agency, TechCorp, ABC Factory..." value={profile.businessName}
            onChange={e => setProfile(p => ({ ...p, businessName: e.target.value }))} />

          <label style={S.label}>What You Offer / What You Do</label>
          <textarea style={S.textarea} placeholder="e.g. We offer social media management, paid ads, web design and SEO for businesses in Lebanon and GCC..."
            value={profile.whatYouDo} onChange={e => setProfile(p => ({ ...p, whatYouDo: e.target.value }))} />

          <label style={S.label}>Target Industry (Who You Want to Sell To)</label>
          <input style={S.inp} placeholder="e.g. Restaurants, Plastic manufacturers, Real estate agencies, Clinics..."
            value={profile.targetIndustry} onChange={e => setProfile(p => ({ ...p, targetIndustry: e.target.value }))} />

          <label style={S.label}>Target Location</label>
          <input style={S.inp} placeholder="e.g. Beirut, Dubai, Kuwait City, Riyadh..."
            value={profile.location} onChange={e => setProfile(p => ({ ...p, location: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleProfile()} />

          {profileErr && <div style={{ ...S.err, marginBottom: "10px" }}>{profileErr}</div>}
          <button style={S.btn} onClick={handleProfile}>Find My Leads →</button>
        </div>
      </div>
    </div>
  );

  // STEP 3: MAIN DASHBOARD
  const hotLeads = leads.filter(l => l.score >= 80).length;
  const warmLeads = leads.filter(l => l.score >= 60 && l.score < 80).length;
  const avgScore = leads.length ? Math.round(leads.reduce((a, l) => a + l.score, 0) / leads.length) : 0;

  return (
    <div style={S.app}><style>{CSS}</style>
      <div style={S.header}>
        <div style={S.hLogo}>PitchMind</div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <div style={S.badge}>🎯 Lead Intelligence</div>
          <button onClick={() => setStep("profile")} style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "8px", color: "#c084fc", padding: "5px 10px", cursor: "pointer", fontSize: "11px" }}>Edit Profile</button>
          <button onClick={() => { setApiKey(""); setStep("login"); setLeads([]); }} style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "rgba(255,255,255,0.4)", padding: "5px 10px", cursor: "pointer", fontSize: "11px" }}>Logout</button>
        </div>
      </div>

      <div style={S.main}>
        {/* Business Profile Banner */}
        <div style={S.profileBanner}>
          <div>
            <div style={{ fontSize: "13px", fontWeight: "700", marginBottom: "3px" }}>🏢 {profile.businessName}</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.5)" }}>{profile.whatYouDo.substring(0, 80)}...</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: "12px", color: "#c084fc", fontWeight: "600" }}>Targeting: {profile.targetIndustry}</div>
            <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.4)" }}>📍 {profile.location}</div>
          </div>
        </div>

        {/* Hero */}
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "36px", fontWeight: "800", lineHeight: "1.1", marginBottom: "8px", letterSpacing: "-1.5px" }}>
            Find businesses<br />
            <span style={{ background: "linear-gradient(135deg, #a855f7, #c084fc)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>that need you.</span>
          </div>
          <div style={{ color: "#c084fc", fontSize: "14px" }}>AI scans {profile.targetIndustry} businesses in {profile.location} and finds the ones weakest in {profile.whatYouDo.split(" ").slice(0,4).join(" ")}...</div>
        </div>

        {/* Stats */}
        {leads.length > 0 && (
          <div style={S.statsRow}>
            {[["🔴 Hot Leads", hotLeads], ["🟡 Warm Leads", warmLeads], ["Avg. Score", `${avgScore}%`]].map(([lbl, val]) => (
              <div key={lbl} style={S.statCard}>
                <div style={S.statNum}>{val}</div>
                <div style={S.statLbl}>{lbl}</div>
              </div>
            ))}
          </div>
        )}

        {/* Search */}
        <div style={S.sCard}>
          <div style={{ fontSize: "12px", fontWeight: "700", color: "#c084fc", marginBottom: "16px", textTransform: "uppercase", letterSpacing: "1px" }}>🔍 Scan for Hot Leads</div>
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <label style={S.label}>Target Industry</label>
              <input style={S.sInp} placeholder="Restaurants, Clinics, Factories..." value={profile.targetIndustry}
                onChange={e => setProfile(p => ({ ...p, targetIndustry: e.target.value }))} />
            </div>
            <div style={{ flex: 1, minWidth: "200px" }}>
              <label style={S.label}>Location</label>
              <input style={S.sInp} placeholder="Beirut, Dubai, Kuwait..." value={profile.location}
                onChange={e => setProfile(p => ({ ...p, location: e.target.value }))} />
            </div>
            <button style={{ ...S.btnSm, opacity: searching ? 0.6 : 1, marginTop: "18px" }} onClick={findLeads} disabled={searching}>
              {searching ? "Scanning..." : "Scan Now →"}
            </button>
          </div>
          {progress && <div style={{ marginTop: "12px", fontSize: "12px", color: "#c084fc" }}>{progress}</div>}
          {searchErr && <div style={S.err}>{searchErr}</div>}
        </div>

        {/* Loading */}
        {searching && (
          <div style={{ textAlign: "center", padding: "50px" }}>
            <div style={{ marginBottom: "12px" }}>{[0,0.2,0.4].map((d,i) => <span key={i} style={{...S.dot, animationDelay:`${d}s`}}/>)}</div>
            <div style={{ color: "#c084fc", fontSize: "14px", fontWeight: "600" }}>Hunting for weak {profile.targetIndustry} businesses in {profile.location}...</div>
            <div style={{ color: "rgba(255,255,255,0.3)", fontSize: "12px", marginTop: "5px" }}>Finding businesses that need {profile.businessName} the most</div>
          </div>
        )}

        {/* Leads */}
        {leads.length > 0 && !searching && (
          <>
            <div style={{ fontSize: "15px", fontWeight: "700", marginBottom: "16px" }}>⚡ {leads.length} Leads Found — Sorted by Opportunity</div>
            <div style={S.leadsGrid}>
              {[...leads].sort((a,b) => b.score - a.score).map((lead, i) => {
                const sc = scoreColor(lead.score);
                return (
                  <div key={i} style={S.lCard}
                    onMouseEnter={e => { e.currentTarget.style.borderColor="rgba(168,85,247,0.5)"; e.currentTarget.style.background="rgba(255,255,255,0.07)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor="rgba(168,85,247,0.2)"; e.currentTarget.style.background="rgba(255,255,255,0.04)"; }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                      <div style={{ flex: 1, paddingRight: "8px" }}>
                        <div style={S.lName}>{lead.name}</div>
                        <div style={S.lSub}>{lead.type} · {lead.location}</div>
                      </div>
                      <div style={{ background: sc.bg, color: sc.color, border: `1px solid ${sc.border}`, borderRadius: "8px", padding: "3px 8px", fontSize: "11px", fontWeight: "800", flexShrink: 0, textAlign: "center" }}>
                        <div>{sc.label}</div>
                        <div style={{ fontSize: "13px" }}>{lead.score}</div>
                      </div>
                    </div>

                    {/* Contact */}
                    <div style={{ marginBottom: "8px" }}>
                      {lead.phone && <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.55)", marginBottom: "2px" }}>📞 {lead.phone}</div>}
                      <div style={{ fontSize: "11px", color: lead.website === "No website" ? "#ef4444" : "#a855f7", marginBottom: "2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        🌐 {lead.website === "No website" ? "❌ No website detected" : lead.website.replace(/https?:\/\//, "")}
                      </div>
                      <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📍 {lead.address}</div>
                      {lead.rating && <div style={{ fontSize: "11px", color: "#f59e0b", marginTop: "2px" }}>⭐ {lead.rating}/5 ({lead.reviews} reviews)</div>}
                    </div>

                    {/* Weakness Tags */}
                    {lead.weaknesses && (
                      <div style={{ marginBottom: "8px" }}>
                        {lead.weaknesses.map((w, j) => (
                          <span key={j} style={{ ...S.weakTag, background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>⚠ {w}</span>
                        ))}
                      </div>
                    )}

                    <div style={S.lPain}>{lead.painPoint}</div>
                    <button style={S.vBtn} onClick={() => loadProfile(lead)}
                      onMouseEnter={e => { e.currentTarget.style.background="rgba(139,60,247,0.35)"; e.currentTarget.style.color="#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background="rgba(139,60,247,0.2)"; e.currentTarget.style.color="#c084fc"; }}>
                      Get Full Pitch Strategy →
                    </button>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {leads.length === 0 && !searching && (
          <div style={S.empty}>
            <div style={{ fontSize: "48px", marginBottom: "12px" }}>🎯</div>
            <div style={{ fontSize: "18px", fontWeight: "700", color: "rgba(255,255,255,0.6)", marginBottom: "6px" }}>Ready to hunt for leads?</div>
            <div style={{ fontSize: "13px" }}>PitchMind will find {profile.targetIndustry} businesses in {profile.location} that are weakest in what you offer.</div>
          </div>
        )}
      </div>

      {/* Intelligence Report Modal */}
      {selectedLead && (
        <div style={S.overlay} onClick={e => e.target === e.currentTarget && setSelectedLead(null)}>
          <div style={S.modal}>
            <button style={S.mClose} onClick={() => setSelectedLead(null)}>✕</button>
            <div style={{ marginBottom: "20px" }}>
              <div style={{ fontSize: "22px", fontWeight: "800", marginBottom: "3px" }}>{selectedLead.name}</div>
              <div style={{ color: "#c084fc", fontSize: "12px", marginBottom: "14px" }}>{selectedLead.type} · {selectedLead.location}</div>
              <div style={S.infoGrid}>
                <div style={S.infoBox}><div style={S.infoLbl}>📞 Phone</div><div style={S.infoVal}>{selectedLead.phone}</div></div>
                <div style={S.infoBox}><div style={S.infoLbl}>⭐ Rating</div><div style={S.infoVal}>{selectedLead.rating}/5 ({selectedLead.reviews} reviews)</div></div>
                <div style={{...S.infoBox, gridColumn:"1/-1"}}><div style={S.infoLbl}>🌐 Website</div><div style={{...S.infoVal, color: selectedLead.website==="No website"?"#ef4444":"#a855f7"}}>{selectedLead.website}</div></div>
                <div style={{...S.infoBox, gridColumn:"1/-1"}}><div style={S.infoLbl}>📍 Address</div><div style={S.infoVal}>{selectedLead.address}</div></div>
              </div>
              {selectedLead.weaknesses && (
                <div style={{ marginBottom: "4px" }}>
                  {selectedLead.weaknesses.map((w,i) => <span key={i} style={{ ...S.weakTag, background:"rgba(239,68,68,0.12)", color:"#ef4444", border:"1px solid rgba(239,68,68,0.25)" }}>⚠ {w}</span>)}
                </div>
              )}
            </div>

            {selectedLead.loading && (
              <div style={{ textAlign: "center", padding: "36px" }}>
                <div style={{ marginBottom: "10px" }}>{[0,0.2,0.4].map((d,i)=><span key={i} style={{...S.dot,animationDelay:`${d}s`}}/>)}</div>
                <div style={{ color: "#c084fc", fontWeight: "600", fontSize: "13px" }}>Building your personalized pitch strategy...</div>
              </div>
            )}
            {selectedLead.reportErr && (
              <div style={{ color:"#ef4444", padding:"14px", background:"rgba(239,68,68,0.1)", borderRadius:"10px", fontSize:"12px" }}>
                {selectedLead.reportErr}
                <button onClick={()=>loadProfile(selectedLead)} style={{ marginLeft:"10px", background:"rgba(239,68,68,0.2)", border:"1px solid rgba(239,68,68,0.4)", borderRadius:"6px", color:"#ef4444", padding:"3px 8px", cursor:"pointer", fontSize:"11px" }}>Retry</button>
              </div>
            )}
            {selectedLead.report && (() => {
              const r = selectedLead.report;
              return [
                ["🏢","Company Overview",r.companyOverview],
                ["⚠️","Weakness Analysis",r.weaknessAnalysis],
                ["👤","Decision Maker Profile",r.decisionMaker],
                ["🧠","Psychological & Emotional Profile",r.emotionalProfile],
                ["🛡️","Expected Objections & Real Reasons",r.objections],
                ["🎯","Pitch Strategy — Step by Step",r.pitchStrategy],
                ["💬","Perfect Opening Line",r.openingLine],
                ["🔑","Closing Angle",r.closingAngle],
                ["📱","Social Media Approach",r.socialApproach],
                ["✉️","Cold Email / DM Template",r.emailTemplate],
              ].map(([icon,title,content],i)=>(
                <div key={i}>
                  <div style={S.mTitle}>{icon} {title}</div>
                  <div style={S.mBox}>{content}</div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
