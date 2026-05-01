import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

console.log("SUPABASE_URL FOUND:", Boolean(supabaseUrl));
console.log("SUPABASE KEY FOUND:", Boolean(supabaseKey));

const supabase = createClient(supabaseUrl, supabaseKey);

// =======================
// HELPERS
// =======================

function normalizeCountries(countryField) {
  if (!countryField) return [];

  if (Array.isArray(countryField)) {
    return countryField.map((c) => String(c).trim()).filter(Boolean);
  }

  return String(countryField)
    .split(/[\/,]/)
    .map((c) => c.trim())
    .filter(Boolean);
}

// =======================
// SAVE MEMORY
// =======================

export async function saveIntelligenceMemory({
  requestType,
  query,
  country,
  region,
  timeframe,
  rawSignals,
  scoredSignals,
  filteredSignals,
  agentOutputs,
  finalOutput,
  overallRiskScore,
  confidence,
  tags = [],
}) {
  const countries = normalizeCountries(country);

  const { data, error } = await supabase
    .from("intelligence_memory")
    .insert([
      {
        request_type: requestType,
        query,
        country: countries,
        region,
        timeframe,
        raw_signals: rawSignals || [],
        scored_signals: scoredSignals || [],
        filtered_signals: filteredSignals || [],
        agent_outputs: agentOutputs || {},
        final_output: finalOutput || {},
        overall_risk_score: overallRiskScore || null,
        confidence: confidence || null,
        tags,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("Memory save error:", error.message);
    return null;
  }

  return data;
}

// =======================
// GLOBAL MAP
// =======================

export async function getGlobalRiskMap({ limit = 150 } = {}) {
  const { data, error } = await supabase
    .from("intelligence_memory")
    .select("country, overall_risk_score, confidence")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Global risk error:", error.message);
    return { count: 0, data: [] };
  }

  const map = {};

  for (const row of data) {
    const countries = row.country || [];

    for (const c of countries) {
      if (!map[c]) {
        map[c] = {
          country: c,
          risk_score: row.overall_risk_score || 0,
          confidence: row.confidence || "low",
          data_points: 1,
        };
      } else {
        map[c].data_points += 1;
      }
    }
  }

  return {
    count: Object.keys(map).length,
    data: Object.values(map).slice(0, limit),
  };
}

// =======================
// COUNTRY RISK
// =======================

export async function getCountryRisk(country) {
  const { data, error } = await supabase
    .from("intelligence_memory")
    .select("overall_risk_score, confidence, country")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("Country risk error:", error.message);
    return { status: "success" };
  }

  const filtered = data.filter((row) =>
    (row.country || []).includes(country)
  );

  if (filtered.length === 0) {
    return { status: "success" };
  }

  return {
    engine: "sovereign_risk_engine",
    status: "success",
    country,
    risk_score: filtered[0].overall_risk_score || 0,
    confidence: filtered[0].confidence || "low",
    data_points: filtered.length,
  };
}

// =======================
// TIMELINE
// =======================

export async function getCountryRiskTimeline({ country, limit = 30 }) {
  const { data, error } = await supabase
    .from("intelligence_memory")
    .select("created_at, overall_risk_score, confidence, country")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Timeline error:", error.message);
    return { country, count: 0, timeline: [] };
  }

  const timeline = data
    .filter((row) => (row.country || []).includes(country))
    .map((row) => ({
      date: row.created_at,
      country,
      risk_score: row.overall_risk_score || 0,
      confidence: row.confidence || "low",
    }));

  return {
    country,
    count: timeline.length,
    timeline,
  };
}

// =======================
// MEMORY RETRIEVAL
// =======================

export async function getIntelligenceMemory({
  country,
  region,
  requestType,
  limit = 10,
}) {
  let query = supabase
    .from("intelligence_memory")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (country) query = query.contains("country", [country]);
  if (region) query = query.ilike("region", `%${region}%`);
  if (requestType) query = query.eq("request_type", requestType);

  const { data, error } = await query;

  if (error) {
    console.error("Memory retrieval error:", error.message);
    return [];
  }

  return data || [];
}
