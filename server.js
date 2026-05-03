
import globalRiskRoutes from "./routes/globalRiskRoutes.js";
import riskRoutes from "./routes/riskRoutes.js";
import memoryRoutes from "./routes/memoryRoutes.js";
import signalRoutes from "./routes/signalRoutes.js";
import scenarioRoutes from "./routes/scenarioRoutes.js";
import fusionRoutes from "./routes/fusionRoutes.js";
import nemotronRoutes from "./routes/nemotronRoutes.js";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

console.log("ENV CHECK:", process.env.OPENAI_API_KEY ? "OPENAI KEY FOUND" : "OPENAI KEY MISSING");

const app = express();

app.use(cors({
  origin: "*",
}));

app.use(express.json());

/* =========================
   SAFE OPENAI INIT
========================= */
let openai;

try {
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    console.log("✅ OpenAI initialized");
  } else {
    console.log("⚠️ OpenAI key missing");
  }
} catch (err) {
  console.log("❌ OpenAI init failed:", err.message);
}

/* =========================
   SAFE SUPABASE INIT
========================= */
let supabase;

try {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
    console.log("✅ Supabase initialized");
  } else {
    console.log("⚠️ Supabase env missing");
  }
} catch (err) {
  console.log("❌ Supabase init failed:", err.message);
}

/* =========================
   SIGNAL ENGINE
========================= */
async function getAllSignals(query) {
  let news = "No news";
  let gdelt = "No gdelt";
  let market = "No market";
  let macro = "No macro";

  try {
    if (process.env.NEWS_API_KEY) {
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&apiKey=${process.env.NEWS_API_KEY}`
      );
      const data = await res.json();

      news =
        data.articles?.slice(0, 5).map((a) => "- " + a.title).join("\n") || news;
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const g = await fetch(
        "https://api.gdeltproject.org/api/v2/doc/doc?query=geopolitics&mode=artlist&maxrecords=5&format=json",
        { signal: controller.signal }
      );

      clearTimeout(timeout);

      const gd = await g.json();
      gdelt = gd.articles?.map((a) => "- " + a.title).join("\n") || gdelt;
    } catch {
      gdelt = "GDELT unavailable";
    }

    if (process.env.ALPHA_VANTAGE_API_KEY) {
      const m = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
      );
      const md = await m.json();
      market = JSON.stringify(md["Global Quote"] || {}) || market;
    }

    if (process.env.FRED_API_KEY) {
      const f = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key=${process.env.FRED_API_KEY}&file_type=json`
      );
      const fd = await f.json();

      macro =
        fd.observations?.slice(-3).map((o) => o.value).join(", ") || macro;
    }
  } catch (err) {
    console.error("Signal error:", err);
  }

  return { news, gdelt, market, macro };
}

/* =========================
   FORECAST ENGINE
========================= */
function forecastScore(text, signals) {
  let score = 5;
  const lowerText = (text || "").toLowerCase();
  const lowerNews = (signals.news || "").toLowerCase();

  if (lowerText.includes("military")) score += 1;
  if (lowerText.includes("conflict")) score += 2;
  if (lowerText.includes("war")) score += 3;
  if (lowerNews.includes("attack")) score += 1;

  return Math.min(score, 10);
}

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("✅ Backend running");
});

/* =========================
   SIMPLE TEST ENDPOINT
========================= */
app.post("/chat-agent-test", async (req, res) => {
  if (!openai) {
    return res.json({ error: "OpenAI not configured yet" });
  }

  res.json({ result: "API working" });
});

/* =========================
   CHAT AGENT
========================= */
app.post("/chat-agent", async (req, res) => {
  if (!openai) {
    return res.status(500).json({ error: "OpenAI not configured yet" });
  }

  const { message, agent } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  let systemPrompt = "";

  if (agent === "geopolitics") {
    systemPrompt = "You are a geopolitical intelligence analyst.";
  } else if (agent === "economics") {
    systemPrompt = "You are a macroeconomic analyst.";
  } else if (agent === "energy") {
    systemPrompt = "You are an energy analyst.";
  } else {
    systemPrompt = "You are an intelligence analyst.";
  }

  try {
    const signals = (await getAllSignals(message)) || {};
    const score = forecastScore(message, signals);

    const safeSignals = {
      news: signals.news || "No news",
      gdelt: signals.gdelt || "No gdelt",
      market: signals.market || "No market",
      macro: signals.macro || "No macro",
    };

    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input:
        systemPrompt +
        "\n\n=== REAL-TIME INTELLIGENCE SIGNALS ===" +
        "\n\nNEWS:\n" + safeSignals.news +
        "\n\nGDELT:\n" + safeSignals.gdelt +
        "\n\nMARKET:\n" + safeSignals.market +
        "\n\nMACRO:\n" + safeSignals.macro +
        "\n\nBASELINE FORECAST SCORE:\n" + score +
        "\n\n=== USER QUERY ===\n" + message +
        "\n\nRespond in structured intelligence format:" +
        "\n1. KEY INSIGHT" +
        "\n2. KEY ACTORS" +
        "\n3. STRATEGIC DYNAMICS" +
        "\n4. RISKS" +
        "\n5. FORECAST",
    });

    const result = response.output_text || "No response generated";

    res.json({ result, signals: safeSignals, forecastScore: score });
  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 10000;

app.use("/api", nemotronRoutes);
app.use("/api", fusionRoutes);
app.use("/api", scenarioRoutes);
app.use("/api", signalRoutes);
app.use("/api", memoryRoutes);
app.use("/api", riskRoutes);
app.use("/api", globalRiskRoutes);
app.get("/api/debug/supply-chain-counts", async (req, res) => {
  try {
    const chains = await supabase.from("supply_chains").select("*");
    const nodes = await supabase.from("supply_chain_nodes").select("*");
    const countries = await supabase.from("countries").select("*").limit(10);

    res.json({
      supply_chains: {
        count: chains.data?.length || 0,
        error: chains.error?.message || null,
        data: chains.data || [],
      },
      supply_chain_nodes: {
        count: nodes.data?.length || 0,
        error: nodes.error?.message || null,
        data: nodes.data || [],
      },
      countries: {
        count: countries.data?.length || 0,
        error: countries.error?.message || null,
        data: countries.data || [],
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/supply-chain/risk", async (req, res) => {
  try {
    const { data: nodes, error } = await supabase
      .from("supply_chain_nodes")
      .select(`
        id,
        asset_name,
        importance_score,
        country_id,
        countries(name),
        supply_chains(name)
      `);

    if (error) throw error;

    res.json({
      engine: "supply_chain_risk",
      status: "success",
      count: nodes?.length || 0,
      data: nodes || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/debug/seed-supply-chain", async (req, res) => {
  try {
    const { data: countries, error: countryError } = await supabase
      .from("countries")
      .upsert([
        { name: "Taiwan", iso2: "TW", iso3: "TWN", region: "Asia" },
        { name: "Oman", iso2: "OM", iso3: "OMN", region: "Middle East" },
        { name: "Egypt", iso2: "EG", iso3: "EGY", region: "Middle East" },
      ], { onConflict: "iso3" })
      .select();

    if (countryError) throw countryError;

    const { data: chains, error: chainError } = await supabase
      .from("supply_chains")
      .insert([
        { name: "Semiconductor Supply Chain", sector: "technology", description: "Global semiconductor production" },
        { name: "Oil & Gas Supply Chain", sector: "energy", description: "Oil and gas transport" },
        { name: "Global Shipping Routes", sector: "logistics", description: "Maritime trade routes" },
      ])
      .select();

    if (chainError) throw chainError;

    const getCountry = (iso3) => countries.find((c) => c.iso3 === iso3);
    const getChain = (name) => chains.find((c) => c.name === name);

    const { data: nodes, error: nodeError } = await supabase
      .from("supply_chain_nodes")
      .insert([
        {
          supply_chain_id: getChain("Semiconductor Supply Chain").id,
          country_id: getCountry("TWN").id,
          node_type: "hub",
          asset_name: "Taiwan Semiconductor Hub",
          importance_score: 95,
        },
        {
          supply_chain_id: getChain("Oil & Gas Supply Chain").id,
          country_id: getCountry("OMN").id,
          node_type: "chokepoint",
          asset_name: "Strait of Hormuz",
          importance_score: 100,
        },
        {
          supply_chain_id: getChain("Global Shipping Routes").id,
          country_id: getCountry("EGY").id,
          node_type: "chokepoint",
          asset_name: "Suez Canal",
          importance_score: 100,
        },
      ])
      .select();

    if (nodeError) throw nodeError;

    res.json({
      status: "seeded",
      countries,
      chains,
      nodes,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// your existing routes...

app.get("/api/supply-chain/risk", async (req, res) => {
  // your existing route
});


// 🔥 PASTE SEED ROUTE HERE
app.post("/api/debug/seed-supply-chain", async (req, res) => {
  try {
    const { data: countries } = await supabase
      .from("countries")
      .upsert([
        { name: "Taiwan", iso2: "TW", iso3: "TWN", region: "Asia" },
        { name: "Oman", iso2: "OM", iso3: "OMN", region: "Middle East" },
        { name: "Egypt", iso2: "EG", iso3: "EGY", region: "Middle East" },
      ], { onConflict: "iso3" })
      .select();

    const { data: chains } = await supabase
      .from("supply_chains")
      .insert([
        { name: "Semiconductor Supply Chain", sector: "technology", description: "Global semiconductor production" },
        { name: "Oil & Gas Supply Chain", sector: "energy", description: "Oil and gas transport" },
        { name: "Global Shipping Routes", sector: "logistics", description: "Maritime trade routes" },
      ])
      .select();

    const getCountry = (iso3) => countries.find(c => c.iso3 === iso3);
    const getChain = (name) => chains.find(c => c.name === name);

    await supabase.from("supply_chain_nodes").insert([
      {
        supply_chain_id: getChain("Semiconductor Supply Chain").id,
        country_id: getCountry("TWN").id,
        node_type: "hub",
        asset_name: "Taiwan Semiconductor Hub",
        importance_score: 95,
      },
      {
        supply_chain_id: getChain("Oil & Gas Supply Chain").id,
        country_id: getCountry("OMN").id,
        node_type: "chokepoint",
        asset_name: "Strait of Hormuz",
        importance_score: 100,
      },
      {
        supply_chain_id: getChain("Global Shipping Routes").id,
        country_id: getCountry("EGY").id,
        node_type: "chokepoint",
        asset_name: "Suez Canal",
        importance_score: 100,
      }
    ]);

    res.json({ status: "seeded" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/financial-risk/global", async (req, res) => {
  try {
    const { data: indicators, error } = await supabase
      .from("financial_indicators")
      .select(`
        id,
        indicator_name,
        indicator_value,
        unit,
        source_name,
        observation_date,
        countries(name, iso3, region)
      `);

    if (error) throw error;

    const grouped = {};

    for (const item of indicators || []) {
      const country = item.countries?.name || "Unknown";

      if (!grouped[country]) {
        grouped[country] = {
          country,
          iso3: item.countries?.iso3,
          region: item.countries?.region,
          indicators: [],
          financial_risk_score: 0,
        };
      }

      grouped[country].indicators.push({
        name: item.indicator_name,
        value: item.indicator_value,
        unit: item.unit,
        source: item.source_name,
        date: item.observation_date,
      });
    }

    const results = Object.values(grouped).map((country) => {
      const values = country.indicators.map((i) => Number(i.value || 0));
      const avg =
        values.length > 0
          ? Math.round(values.reduce((a, b) => a + b, 0) / values.length)
          : 0;

      return {
        ...country,
        financial_risk_score: avg,
        investor_signal:
          avg >= 75
            ? "high financial exposure"
            : avg >= 50
            ? "moderate financial exposure"
            : "low financial exposure",
      };
    });

    res.json({
      engine: "financial_risk",
      status: "success",
      count: results.length,
      data: results,
    });
  } catch (err) {
    console.error("Financial risk error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/investor/fusion-briefing", async (req, res) => {
  try {
    const { data: nodes, error: nodeError } = await supabase
      .from("supply_chain_nodes")
      .select(`
        id,
        asset_name,
        node_type,
        importance_score,
        country_id,
        countries(name, iso3, region),
        supply_chains(name, sector)
      `);

    if (nodeError) throw nodeError;

    const { data: indicators, error: financialError } = await supabase
      .from("financial_indicators")
      .select(`
        id,
        indicator_name,
        indicator_value,
        unit,
        source_name,
        observation_date,
        country_id,
        countries(name, iso3, region)
      `);

    if (financialError) throw financialError;

    const results = (nodes || []).map((node) => {
      const relatedIndicators = (indicators || []).filter(
        (i) => i.country_id === node.country_id
      );

      const financialAvg =
        relatedIndicators.length > 0
          ? Math.round(
              relatedIndicators.reduce(
                (sum, i) => sum + Number(i.indicator_value || 0),
                0
              ) / relatedIndicators.length
            )
          : 0;

      const supplyScore = Number(node.importance_score || 0);

      const combinedRiskScore = Math.round(
        supplyScore * 0.55 + financialAvg * 0.45
      );

      return {
        country: node.countries?.name,
        iso3: node.countries?.iso3,
        region: node.countries?.region,
        asset: node.asset_name,
        node_type: node.node_type,
        supply_chain: node.supply_chains?.name,
        sector: node.supply_chains?.sector,
        supply_chain_importance: supplyScore,
        financial_risk_score: financialAvg,
        combined_risk_score: combinedRiskScore,
        investor_signal:
          combinedRiskScore >= 85
            ? "critical investor exposure"
            : combinedRiskScore >= 70
            ? "high investor exposure"
            : combinedRiskScore >= 50
            ? "moderate investor exposure"
            : "low investor exposure",
        interpretation:
          `${node.asset_name} links ${node.supply_chains?.name} exposure with financial indicators in ${node.countries?.name}.`,
        financial_indicators: relatedIndicators.map((i) => ({
          name: i.indicator_name,
          value: i.indicator_value,
          unit: i.unit,
          source: i.source_name,
          date: i.observation_date,
        })),
      };
    });

    const topRisks = results.sort(
      (a, b) => b.combined_risk_score - a.combined_risk_score
    );

    res.json({
      engine: "investor_fusion_briefing",
      status: "success",
      count: topRisks.length,
      executive_summary:
        "This briefing connects supply-chain chokepoints with financial exposure to identify investor-relevant geopolitical risk.",
      data: topRisks,
    });
  } catch (err) {
    console.error("Investor fusion briefing error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/investor/top-risks", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 5);

    const { data: nodes, error: nodeError } = await supabase
      .from("supply_chain_nodes")
      .select(`
        id,
        asset_name,
        node_type,
        importance_score,
        country_id,
        countries(name, iso3, region),
        supply_chains(name, sector)
      `);

    if (nodeError) throw nodeError;

    const { data: indicators, error: financialError } = await supabase
      .from("financial_indicators")
      .select(`
        indicator_name,
        indicator_value,
        country_id
      `);

    if (financialError) throw financialError;

    const ranked = (nodes || []).map((node) => {
      const relatedIndicators = (indicators || []).filter(
        (i) => i.country_id === node.country_id
      );

      const financialScore =
        relatedIndicators.length > 0
          ? Math.round(
              relatedIndicators.reduce(
                (sum, i) => sum + Number(i.indicator_value || 0),
                0
              ) / relatedIndicators.length
            )
          : 0;

      const supplyScore = Number(node.importance_score || 0);
      const riskScore = Math.round(supplyScore * 0.55 + financialScore * 0.45);

      return {
        country: node.countries?.name,
        iso3: node.countries?.iso3,
        region: node.countries?.region,
        asset: node.asset_name,
        sector: node.supply_chains?.sector,
        supply_chain: node.supply_chains?.name,
        risk_score: riskScore,
        severity:
          riskScore >= 85
            ? "critical"
            : riskScore >= 70
            ? "high"
            : riskScore >= 50
            ? "moderate"
            : "low",
        investor_signal:
          riskScore >= 85
            ? "Immediate monitoring recommended"
            : riskScore >= 70
            ? "Elevated exposure"
            : riskScore >= 50
            ? "Watchlist"
            : "Low exposure",
      };
    });

    ranked.sort((a, b) => b.risk_score - a.risk_score);

    res.json({
      engine: "investor_top_risks",
      status: "success",
      count: ranked.slice(0, limit).length,
      data: ranked.slice(0, limit),
    });
  } catch (err) {
    console.error("Top risks error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/investor/forecast", async (req, res) => {
  try {
    const horizon = req.query.horizon || "30d";

    const { data: nodes, error: nodeError } = await supabase
      .from("supply_chain_nodes")
      .select(`
        id,
        asset_name,
        node_type,
        importance_score,
        country_id,
        countries(name, iso3, region),
        supply_chains(name, sector)
      `);

    if (nodeError) throw nodeError;

    const { data: indicators, error: financialError } = await supabase
      .from("financial_indicators")
      .select(`
        indicator_name,
        indicator_value,
        country_id
      `);

    if (financialError) throw financialError;

    const forecasts = (nodes || []).map((node) => {
      const relatedIndicators = (indicators || []).filter(
        (i) => i.country_id === node.country_id
      );

      const financialScore =
        relatedIndicators.length > 0
          ? Math.round(
              relatedIndicators.reduce(
                (sum, i) => sum + Number(i.indicator_value || 0),
                0
              ) / relatedIndicators.length
            )
          : 0;

      const supplyScore = Number(node.importance_score || 0);
      const currentRisk = Math.round(supplyScore * 0.55 + financialScore * 0.45);

      let projectedRisk = currentRisk;

      if (horizon === "7d") projectedRisk = Math.min(100, currentRisk + 2);
      if (horizon === "30d") projectedRisk = Math.min(100, currentRisk + 5);
      if (horizon === "90d") projectedRisk = Math.min(100, currentRisk + 8);

      const trajectory =
        projectedRisk > currentRisk + 5
          ? "rising"
          : projectedRisk > currentRisk
          ? "slightly rising"
          : "stable";

      return {
        country: node.countries?.name,
        iso3: node.countries?.iso3,
        region: node.countries?.region,
        asset: node.asset_name,
        sector: node.supply_chains?.sector,
        supply_chain: node.supply_chains?.name,
        current_risk_score: currentRisk,
        forecast_horizon: horizon,
        projected_risk_score: projectedRisk,
        trajectory,
        scenario_trigger:
          node.supply_chains?.sector === "technology"
            ? "Escalation in Taiwan Strait or semiconductor export controls"
            : node.supply_chains?.sector === "energy"
            ? "Energy shipping disruption or Hormuz security incident"
            : "Shipping disruption, insurance cost spike, or canal restriction",
        recommended_monitoring_action:
          projectedRisk >= 90
            ? "Monitor daily and trigger scenario simulation if new signals emerge"
            : projectedRisk >= 75
            ? "Monitor weekly and link to investor exposure dashboard"
            : "Keep on watchlist",
      };
    });

    forecasts.sort((a, b) => b.projected_risk_score - a.projected_risk_score);

    res.json({
      engine: "investor_forecast",
      status: "success",
      horizon,
      count: forecasts.length,
      summary:
        "Forecast estimates near-term investor exposure by combining supply-chain importance with financial risk indicators.",
      data: forecasts,
    });
  } catch (err) {
    console.error("Investor forecast error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/investor/scenario-triggers", async (req, res) => {
  try {
    const horizon = req.query.horizon || "30d";
    const minRisk = Number(req.query.minRisk || 85);

    const { data: nodes, error: nodeError } = await supabase
      .from("supply_chain_nodes")
      .select(`
        id,
        asset_name,
        node_type,
        importance_score,
        country_id,
        countries(name, iso3, region),
        supply_chains(name, sector)
      `);

    if (nodeError) throw nodeError;

    const { data: indicators, error: financialError } = await supabase
      .from("financial_indicators")
      .select(`
        indicator_name,
        indicator_value,
        country_id
      `);

    if (financialError) throw financialError;

    const scenarios = (nodes || [])
      .map((node) => {
        const relatedIndicators = (indicators || []).filter(
          (i) => i.country_id === node.country_id
        );

        const financialScore =
          relatedIndicators.length > 0
            ? Math.round(
                relatedIndicators.reduce(
                  (sum, i) => sum + Number(i.indicator_value || 0),
                  0
                ) / relatedIndicators.length
              )
            : 0;

        const supplyScore = Number(node.importance_score || 0);
        const currentRisk = Math.round(
          supplyScore * 0.55 + financialScore * 0.45
        );

        let projectedRisk = currentRisk;
        if (horizon === "7d") projectedRisk = Math.min(100, currentRisk + 2);
        if (horizon === "30d") projectedRisk = Math.min(100, currentRisk + 5);
        if (horizon === "90d") projectedRisk = Math.min(100, currentRisk + 8);

        const sector = node.supply_chains?.sector;

        const scenarioTitle =
          sector === "technology"
            ? "Taiwan Semiconductor Supply Shock"
            : sector === "energy"
            ? "Strait of Hormuz Energy Disruption"
            : "Suez Canal Shipping Disruption";

        return {
          trigger_id: node.id,
          scenario_title: scenarioTitle,
          country: node.countries?.name,
          iso3: node.countries?.iso3,
          region: node.countries?.region,
          asset: node.asset_name,
          sector,
          supply_chain: node.supply_chains?.name,
          current_risk_score: currentRisk,
          projected_risk_score: projectedRisk,
          forecast_horizon: horizon,
          should_trigger_scenario: projectedRisk >= minRisk,
          scenario_input: {
            event: scenarioTitle,
            country: node.countries?.name,
            affected_asset: node.asset_name,
            affected_sector: sector,
            supply_chain: node.supply_chains?.name,
            risk_score: projectedRisk,
            time_horizon: horizon,
            assumptions: [
              "Supply-chain disruption affects market expectations",
              "Financial exposure rises as chokepoint pressure increases",
              "Investor monitoring priority increases with projected risk score",
            ],
          },
          recommended_action:
            projectedRisk >= 90
              ? "Run full Scenario Lab simulation immediately"
              : projectedRisk >= 85
              ? "Prepare scenario simulation and monitor daily"
              : "Keep on watchlist",
        };
      })
      .filter((s) => s.should_trigger_scenario)
      .sort((a, b) => b.projected_risk_score - a.projected_risk_score);

    res.json({
      engine: "scenario_trigger_engine",
      status: "success",
      horizon,
      minRisk,
      count: scenarios.length,
      summary:
        "This endpoint converts investor risk forecasts into ready-to-run Scenario Lab inputs.",
      data: scenarios,
    });
  } catch (err) {
    console.error("Scenario trigger error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/investor/run-triggered-scenario", async (req, res) => {
  try {
    const { trigger_id, horizon = "30d" } = req.body;

    if (!trigger_id) {
      return res.status(400).json({ error: "trigger_id is required" });
    }

    const { data: node, error: nodeError } = await supabase
      .from("supply_chain_nodes")
      .select(`
        id,
        asset_name,
        node_type,
        importance_score,
        country_id,
        countries(name, iso3, region),
        supply_chains(name, sector)
      `)
      .eq("id", trigger_id)
      .single();

    if (nodeError) throw nodeError;

    const { data: indicators, error: financialError } = await supabase
      .from("financial_indicators")
      .select("indicator_name, indicator_value, country_id")
      .eq("country_id", node.country_id);

    if (financialError) throw financialError;

    const financialScore =
      indicators.length > 0
        ? Math.round(
            indicators.reduce(
              (sum, i) => sum + Number(i.indicator_value || 0),
              0
            ) / indicators.length
          )
        : 0;

    const currentRisk = Math.round(
      Number(node.importance_score || 0) * 0.55 + financialScore * 0.45
    );

    const projectedRisk =
      horizon === "7d"
        ? Math.min(100, currentRisk + 2)
        : horizon === "90d"
        ? Math.min(100, currentRisk + 8)
        : Math.min(100, currentRisk + 5);

    const sector = node.supply_chains?.sector;

    const scenarioTitle =
      sector === "technology"
        ? "Taiwan Semiconductor Supply Shock"
        : sector === "energy"
        ? "Strait of Hormuz Energy Disruption"
        : "Suez Canal Shipping Disruption";

    const scenarioInput = {
      event: scenarioTitle,
      country: node.countries?.name,
      iso3: node.countries?.iso3,
      affected_asset: node.asset_name,
      affected_sector: sector,
      supply_chain: node.supply_chains?.name,
      current_risk_score: currentRisk,
      projected_risk_score: projectedRisk,
      time_horizon: horizon,
      assumptions: [
        "Supply-chain disruption affects investor expectations",
        "Financial exposure rises as chokepoint pressure increases",
        "Scenario Lab should assess second-order market and geopolitical effects",
      ],
    };

    const projectedOutcomes = {
      market_impact:
        projectedRisk >= 90
          ? "Severe repricing risk across exposed sectors"
          : "Elevated volatility risk",
      supply_chain_impact:
        "Potential disruption to logistics, production, or delivery timelines",
      financial_impact:
        "Higher inflation, insurance, commodity, or capital exposure risk",
      investor_relevance:
        "Useful for portfolio monitoring, exposure analysis, and strategic warning",
    };

    const { data: savedScenario, error: saveError } = await supabase
      .from("scenario_runs")
      .insert({
        scenario_title: scenarioTitle,
        user_input: scenarioInput,
        affected_countries: [node.countries?.name],
        affected_companies: [],
        affected_commodities: [],
        projected_outcomes: projectedOutcomes,
        probability_score: projectedRisk,
        impact_score: projectedRisk,
      })
      .select()
      .single();

    if (saveError) throw saveError;

    res.json({
      engine: "triggered_scenario_runner",
      status: "success",
      scenario: savedScenario,
      scenario_input: scenarioInput,
      projected_outcomes: projectedOutcomes,
    });
  } catch (err) {
    console.error("Triggered scenario error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/scenario/history", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 10);

    const { data, error } = await supabase
      .from("scenario_runs")
      .select(`
        id,
        scenario_title,
        user_input,
        affected_countries,
        projected_outcomes,
        probability_score,
        impact_score,
        created_at
      `)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const formatted = (data || []).map((s) => ({
      scenario_id: s.id,
      title: s.scenario_title,
      country: s.affected_countries?.[0] || null,
      risk_score: s.probability_score,
      impact_score: s.impact_score,
      created_at: s.created_at,
      summary:
        s.projected_outcomes?.market_impact ||
        "No summary available",
      investor_signal:
        s.probability_score >= 90
          ? "critical scenario"
          : s.probability_score >= 75
          ? "high scenario"
          : "moderate scenario",
    }));

    res.json({
      engine: "scenario_history",
      status: "success",
      count: formatted.length,
      data: formatted,
    });
  } catch (err) {
    console.error("Scenario history error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/investor/corporate-exposure", async (req, res) => {
  try {
    const { data: exposures, error } = await supabase
      .from("corporate_exposures")
      .select(`
        id,
        exposure_type,
        exposure_level,
        explanation,
        companies(name, ticker, sector),
        countries(name, iso3, region)
      `);

    if (error) throw error;

    const formatted = (exposures || []).map((e) => ({
      company: e.companies?.name,
      ticker: e.companies?.ticker,
      sector: e.companies?.sector,
      country: e.countries?.name,
      iso3: e.countries?.iso3,
      region: e.countries?.region,
      exposure_type: e.exposure_type,
      exposure_level: e.exposure_level,
      severity:
        e.exposure_level >= 85
          ? "critical"
          : e.exposure_level >= 70
          ? "high"
          : e.exposure_level >= 50
          ? "moderate"
          : "low",
      explanation: e.explanation,
    }));

    res.json({
      engine: "corporate_exposure",
      status: "success",
      count: formatted.length,
      data: formatted.sort((a, b) => b.exposure_level - a.exposure_level),
    });
  } catch (err) {
    console.error("Corporate exposure error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.get("/api/scenario/:id/corporate-exposure", async (req, res) => {
  try {
    const { id } = req.params;

    const { data: scenario, error: scenarioError } = await supabase
      .from("scenario_runs")
      .select("*")
      .eq("id", id)
      .single();

    if (scenarioError) throw scenarioError;

    const countryName = scenario.affected_countries?.[0];

    const { data: country, error: countryError } = await supabase
      .from("countries")
      .select("id, name, iso3, region")
      .eq("name", countryName)
      .single();

    if (countryError) throw countryError;

    const { data: exposures, error: exposureError } = await supabase
      .from("corporate_exposures")
      .select(`
        id,
        exposure_type,
        exposure_level,
        explanation,
        companies(name, ticker, sector)
      `)
      .eq("country_id", country.id);

    if (exposureError) throw exposureError;

    const scenarioImpact = Number(scenario.impact_score || 0);

    const results = (exposures || []).map((e) => {
      const combinedScenarioExposure = Math.round(
        scenarioImpact * 0.6 + Number(e.exposure_level || 0) * 0.4
      );

      return {
        company: e.companies?.name,
        ticker: e.companies?.ticker,
        sector: e.companies?.sector,
        country: country.name,
        iso3: country.iso3,
        scenario_title: scenario.scenario_title,
        scenario_impact_score: scenarioImpact,
        corporate_exposure_level: e.exposure_level,
        combined_scenario_exposure: combinedScenarioExposure,
        severity:
          combinedScenarioExposure >= 90
            ? "critical"
            : combinedScenarioExposure >= 75
            ? "high"
            : combinedScenarioExposure >= 50
            ? "moderate"
            : "low",
        exposure_type: e.exposure_type,
        explanation: e.explanation,
      };
    });

    results.sort(
      (a, b) => b.combined_scenario_exposure - a.combined_scenario_exposure
    );

    res.json({
      engine: "scenario_corporate_exposure",
      status: "success",
      scenario_id: scenario.id,
      scenario_title: scenario.scenario_title,
      affected_country: country.name,
      count: results.length,
      data: results,
    });
  } catch (err) {
    console.error("Scenario corporate exposure error:", err);
    res.status(500).json({ error: err.message });
  }
});


app.post("/api/investor/portfolio-exposure", async (req, res) => {
  try {
    const { tickers = [] } = req.body;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({
        error: "tickers array is required, e.g. { \"tickers\": [\"NVDA\", \"AAPL\"] }",
      });
    }

    const normalizedTickers = tickers.map((t) => String(t).toUpperCase());

    const { data: exposures, error } = await supabase
      .from("corporate_exposures")
      .select(`
        id,
        exposure_type,
        exposure_level,
        explanation,
        companies(name, ticker, sector),
        countries(name, iso3, region)
      `);

    if (error) throw error;

    const matched = (exposures || [])
      .filter((e) => normalizedTickers.includes(e.companies?.ticker))
      .map((e) => ({
        company: e.companies?.name,
        ticker: e.companies?.ticker,
        sector: e.companies?.sector,
        country: e.countries?.name,
        iso3: e.countries?.iso3,
        region: e.countries?.region,
        exposure_type: e.exposure_type,
        exposure_level: e.exposure_level,
        severity:
          e.exposure_level >= 85
            ? "critical"
            : e.exposure_level >= 70
            ? "high"
            : e.exposure_level >= 50
            ? "moderate"
            : "low",
        explanation: e.explanation,
      }))
      .sort((a, b) => b.exposure_level - a.exposure_level);

    const averageExposure =
      matched.length > 0
        ? Math.round(
            matched.reduce((sum, e) => sum + Number(e.exposure_level || 0), 0) /
              matched.length
          )
        : 0;

    res.json({
      engine: "portfolio_exposure",
      status: "success",
      searched_tickers: normalizedTickers,
      matched_count: matched.length,
      portfolio_exposure_score: averageExposure,
      portfolio_signal:
        averageExposure >= 85
          ? "critical portfolio exposure"
          : averageExposure >= 70
          ? "high portfolio exposure"
          : averageExposure >= 50
          ? "moderate portfolio exposure"
          : "low or no mapped exposure",
      data: matched,
    });
  } catch (err) {
    console.error("Portfolio exposure error:", err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/investor/portfolio-stress-test", async (req, res) => {
  try {
    const { tickers = [] } = req.body;

    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({
        error: "tickers array is required, e.g. { \"tickers\": [\"NVDA\", \"AAPL\"] }",
      });
    }

    const normalizedTickers = tickers.map((t) => String(t).toUpperCase());

    const { data: scenarios, error: scenarioError } = await supabase
      .from("scenario_runs")
      .select("*")
      .order("created_at", { ascending: false });

    if (scenarioError) throw scenarioError;

    const { data: exposures, error: exposureError } = await supabase
      .from("corporate_exposures")
      .select(`
        id,
        exposure_type,
        exposure_level,
        explanation,
        companies(name, ticker, sector),
        countries(name, iso3, region)
      `);

    if (exposureError) throw exposureError;

    const portfolioExposures = (exposures || []).filter((e) =>
      normalizedTickers.includes(e.companies?.ticker)
    );

    const results = (scenarios || []).map((scenario) => {
      const affectedCountry = scenario.affected_countries?.[0];

      const matchedCompanies = portfolioExposures
        .filter((e) => e.countries?.name === affectedCountry)
        .map((e) => {
          const scenarioImpact = Number(scenario.impact_score || 0);
          const exposureLevel = Number(e.exposure_level || 0);

          const stressScore = Math.round(
            scenarioImpact * 0.6 + exposureLevel * 0.4
          );

          return {
            company: e.companies?.name,
            ticker: e.companies?.ticker,
            sector: e.companies?.sector,
            exposure_type: e.exposure_type,
            exposure_level: exposureLevel,
            scenario_stress_score: stressScore,
            severity:
              stressScore >= 90
                ? "critical"
                : stressScore >= 75
                ? "high"
                : stressScore >= 50
                ? "moderate"
                : "low",
            explanation: e.explanation,
          };
        })
        .sort((a, b) => b.scenario_stress_score - a.scenario_stress_score);

      const portfolioStressScore =
        matchedCompanies.length > 0
          ? Math.round(
              matchedCompanies.reduce(
                (sum, c) => sum + c.scenario_stress_score,
                0
              ) / matchedCompanies.length
            )
          : 0;

      return {
        scenario_id: scenario.id,
        scenario_title: scenario.scenario_title,
        affected_country: affectedCountry,
        scenario_impact_score: scenario.impact_score,
        portfolio_stress_score: portfolioStressScore,
        portfolio_signal:
          portfolioStressScore >= 90
            ? "critical stress exposure"
            : portfolioStressScore >= 75
            ? "high stress exposure"
            : portfolioStressScore >= 50
            ? "moderate stress exposure"
            : "low or no mapped stress exposure",
        exposed_holdings_count: matchedCompanies.length,
        exposed_holdings: matchedCompanies,
      };
    });

    results.sort((a, b) => b.portfolio_stress_score - a.portfolio_stress_score);

    res.json({
      engine: "portfolio_stress_test",
      status: "success",
      searched_tickers: normalizedTickers,
      scenario_count: results.length,
      data: results,
    });
  } catch (err) {
    console.error("Portfolio stress test error:", err);
    res.status(500).json({ error: err.message });
  }
});


// 🚀 ALWAYS LAST
app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log(`🚀 SERVER STARTED ON PORT ${PORT}`);
  console.log("=================================");
});

