import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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
        country: countries,   // ✅ THIS is correct
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

  if (country) query = query.ilike("country", `%${country}%`);
  if (region) query = query.ilike("region", `%${region}%`);
  if (requestType) query = query.eq("request_type", requestType);

  const { data, error } = await query;

  if (error) {
    console.error("Memory retrieval error:", error.message);
    return [];
  }

  return data;
}

export async function getCountryRisk({ country, limit = 20 }) {
  const { data, error } = await supabase
    .from("intelligence_memory")
    .select("overall_risk_score, confidence, created_at")
    .ilike("country", `%${country}%`)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Country risk error:", error.message);
    return null;
  }

  if (!data || data.length === 0) {
    return {
      country,
      risk_score: null,
      trend: "unknown",
      confidence: "low",
      data_points: 0,
    };
  }

  // average risk
  const scores = data
    .map((d) => d.overall_risk_score)
    .filter((v) => typeof v === "number");

  const avg =
    scores.reduce((a, b) => a + b, 0) / (scores.length || 1);

  // trend (simple)
  const recent = scores.slice(0, 3);
  const older = scores.slice(3, 6);

  let trend = "stable";
  if (recent.length && older.length) {
    const rAvg =
      recent.reduce((a, b) => a + b, 0) / recent.length;
    const oAvg =
      older.reduce((a, b) => a + b, 0) / older.length;

    if (rAvg > oAvg + 5) trend = "rising";
    else if (rAvg < oAvg - 5) trend = "declining";
  }

  // confidence aggregation
  const confidenceMap = { low: 1, medium: 2, high: 3 };

  const confAvg =
    data.reduce(
      (sum, d) => sum + (confidenceMap[d.confidence] || 1),
      0
    ) / data.length;

  const confidence =
    confAvg > 2.3 ? "high" : confAvg > 1.6 ? "medium" : "low";

  return {
    country,
    risk_score: Math.round(avg),
    trend,
    confidence,
    data_points: data.length,
  };
}

export async function getGlobalRiskMap({ limit = 50 }) {
  const { data, error } = await supabase
    .from("intelligence_memory")
    .select("country, overall_risk_score, confidence")
    .not("country", "is", null);

  if (error) {
    console.error("Global risk error:", error.message);
    return [];
  }

  const map = {};

  for (const row of data) {
    if (!row.country) continue;

    const countries = Array.isArray(row.country)
      ? row.country
      : String(row.country).split(/[\/,]/).map((c) => c.trim()).filter(Boolean);

    for (const c of countries) {
      if (!map[c]) {
        map[c] = { scores: [], confidence: [] };
      }

      if (typeof row.overall_risk_score === "number") {
        map[c].scores.push(row.overall_risk_score);
      }

      if (row.confidence) {
        map[c].confidence.push(row.confidence);
      }
    }
  }

  const confidenceMap = { low: 1, medium: 2, high: 3 };

  const result = Object.entries(map).map(([country, val]) => {
    const avg =
      val.scores.reduce((a, b) => a + b, 0) / (val.scores.length || 1);

    const confAvg =
      val.confidence.reduce((a, c) => a + (confidenceMap[String(c).toLowerCase()] || 1), 0) /
      (val.confidence.length || 1);

    const confidence =
      confAvg > 2.3 ? "high" : confAvg > 1.6 ? "medium" : "low";

    return {
      country,
      risk_score: Math.round(avg),
      confidence,
      data_points: val.scores.length,
    };
  });

  return result
    .sort((a, b) => b.risk_score - a.risk_score)
    .slice(0, limit);
}

export async function getCountryRiskTimeline({ country, limit = 30 }) {
  const { data, error } = await supabase
    .from("intelligence_memory")
    .select("country, overall_risk_score, confidence, created_at")
    .contains("country", [country])
    .order("created_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("Risk timeline error:", error.message);
    return [];
  }

  return data.map((row) => ({
    date: row.created_at,
    country,
    risk_score: row.overall_risk_score,
    confidence: row.confidence,
  }));
}
