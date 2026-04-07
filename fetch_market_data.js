require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

console.log("Starting market ingestion...");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const symbols = [
  { symbol: "SPY", name: "S&P 500 ETF" }
];

async function fetchQuote(symbolObj) {
  try {
    console.log(`Fetching ${symbolObj.symbol}...`);

    const res = await axios.get("https://www.alphavantage.co/query", {
      params: {
        function: "GLOBAL_QUOTE",
        symbol: symbolObj.symbol,
        apikey: process.env.ALPHA_VANTAGE_API_KEY
      },
      timeout: 15000
    });

    if (res.data.Note) {
      console.log("Alpha Vantage note:", res.data.Note);
      return null;
    }

    if (res.data["Error Message"]) {
      console.log("Alpha Vantage error:", res.data["Error Message"]);
      return null;
    }

    const q = res.data["Global Quote"];

    if (!q || !q["05. price"]) {
      console.log(`No usable data for ${symbolObj.symbol}`);
      console.log("Raw response:", JSON.stringify(res.data));
      return null;
    }

    return {
      source_name: "Alpha Vantage",
      source_type: "market",
      symbol: symbolObj.symbol,
      asset_name: symbolObj.name,
      raw_price: Number(q["05. price"]),
      raw_change_value: Number(q["09. change"]),
      raw_change_percent: Number(String(q["10. change percent"]).replace("%", "")),
      observed_at: new Date().toISOString()
    };
  } catch (err) {
    console.error(`Fetch failed for ${symbolObj.symbol}:`, err.message);
    return null;
  }
}

async function run() {
  try {
    const rows = [];

    for (const s of symbols) {
      const data = await fetchQuote(s);
      if (data) rows.push(data);
    }

    console.log("Rows prepared for insert:", rows);

    if (!rows.length) {
      console.log("No data fetched.");
      return;
    }

    const { data, error } = await supabase
      .from("raw_market_prices")
      .insert(rows)
      .select();

    if (error) {
      console.error("Insert error:", error.message || error);
      return;
    }

    console.log("Inserted market data:", data.length);
  } catch (err) {
    console.error("Run failed:", err.message);
  }
}

run();