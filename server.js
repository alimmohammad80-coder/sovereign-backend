import globalRiskRoutes from "./routes/globalRiskRoutes.js";
import riskRoutes from "./routes/riskRoutes.js";
import memoryRoutes from "./routes/memoryRoutes.js";
import signalRoutes from "./routes/signalRoutes.js";
import scenarioRoutes from "./routes/scenarioRoutes.js";
import fusionRoutes from "./routes/fusionRoutes.js";
import nemotronRoutes from "./routes/nemotronRoutes.js";
import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

console.log("ENV CHECK:", process.env.OPENAI_API_KEY ? "OPENAI KEY FOUND" : "OPENAI KEY MISSING");

const app = express();
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
app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log(`🚀 SERVER STARTED ON PORT ${PORT}`);
  console.log("=================================");
});
