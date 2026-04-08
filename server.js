console.log("ENV CHECK:", process.env.OPENAI_API_KEY);

import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

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
   BASIC ROUTE (TEST)
========================= */
app.get("/", (req, res) => {
  res.send("✅ Backend running");
});

/* =========================
   TEST ENDPOINT
========================= */
app.post("/chat-agent", async (req, res) => {
  if (!openai) {
    return res.json({ error: "OpenAI not configured yet" });
  }

  res.json({ result: "API working" });
});

// ===== SIGNAL ENGINE =====
async function getAllSignals(query) {
  let news = "No news";
  let gdelt = "No gdelt";
  let market = "No market";
  let macro = "No macro";

  try {
    // NEWS
    if (process.env.NEWS_API_KEY) {
      const res = await fetch(
        `https://newsapi.org/v2/everything?q=${query}&apiKey=${process.env.NEWS_API_KEY}`
      );
      const data = await res.json();

      news =
        data.articles
          ?.slice(0, 5)
          .map((a) => "- " + a.title)
          .join("\n") || news;
    }

    // GDELT (safe)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const g = await fetch(
        "https://api.gdeltproject.org/api/v2/doc/doc?query=geopolitics&mode=artlist&maxrecords=5&format=json",
        { signal: controller.signal }
      );

      clearTimeout(timeout);

      const gd = await g.json();

      gdelt =
        gd.articles?.map((a) => "- " + a.title).join("\n") || gdelt;
    } catch {
      gdelt = "GDELT unavailable";
    }

    // MARKET
    if (process.env.ALPHA_VANTAGE_API_KEY) {
      const m = await fetch(
        `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${process.env.ALPHA_VANTAGE_API_KEY}`
      );
      const md = await m.json();

      market = JSON.stringify(md["Global Quote"]) || market;
    }

    // MACRO
    if (process.env.FRED_API_KEY) {
      const f = await fetch(
        `https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key=${process.env.FRED_API_KEY}&file_type=json`
      );
      const fd = await f.json();

      macro =
        fd.observations
          ?.slice(-3)
          .map((o) => o.value)
          .join(", ") || macro;
    }
  } catch (err) {
    console.error("Signal error:", err);
  }

  return { news, gdelt, market, macro };
}

// ===== FORECAST ENGINE =====
function forecastScore(text, signals) {
  let score = 5;

  if (text.includes("military")) score += 1;
  if (text.includes("conflict")) score += 2;
  if (text.includes("war")) score += 3;

  if (signals.news?.includes("attack")) score += 1;

  return Math.min(score, 10);
}

// ===== HEALTH CHECK =====
app.get("/", (req, res) => {
  res.send("✅ Backend running");
});

app.get("/", (req, res) => {
  res.send("✅ Backend running");
});

// ===== CHAT AGENT =====
app.post("/chat-agent", async (req, res) => {
  const { message, agent } = req.body;

  let systemPrompt = "";

  if (agent === "geopolitics") {
    systemPrompt = "You are a geopolitical intelligence analyst.";
  } else if (agent === "economics") {
    systemPrompt = "You are a macroeconomic analyst.";
  } else if (agent === "energy") {
    systemPrompt = "You are an energy analyst.";
  }

  try {
    const signals = (await getAllSignals(message)) || {};

    const safeSignals = {
      news: signals.news || "No news",
      gdelt: signals.gdelt || "No gdelt",
      market: signals.market || "No market",
      macro: signals.macro || "No macro",
    };

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input:
        systemPrompt +
        "\n\n=== REAL-TIME INTELLIGENCE SIGNALS ===\n" +
        "\nNEWS:\n" + safeSignals.news +
        "\n\nGDELT:\n" + safeSignals.gdelt +
        "\n\nMARKET:\n" + safeSignals.market +
        "\n\nMACRO:\n" + safeSignals.macro +
        "\n\n=== USER QUERY ===\n" + message +
        "\n\nRespond in structured intelligence format:\n" +
        "\n1. KEY INSIGHT" +
        "\n2. KEY ACTORS" +
        "\n3. STRATEGIC DYNAMICS" +
        "\n4. RISKS" +
        "\n5. FORECAST\n",
    });

    const result = response.output[0].content[0].text;

    res.json({ result });

  } catch (error) {
    console.error("ERROR:", error);
    res.status(500).json({ error: error.message });
  }
});

import express from "express";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(express.json());

// other routes here...

// ===== START SERVER =====
const PORT = process.env.PORT || 10000;

app.get("/", (req, res) => {
  res.send("✅ Backend running");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log(`🚀 SERVER STARTED ON PORT ${PORT}`);
  console.log("=================================");
});
