require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const indicators = [
  {
    series_id: "CPIAUCSL",
    indicator_code: "CPI",
    indicator_name: "Consumer Price Index",
    unit: "index"
  },
  {
    series_id: "FEDFUNDS",
    indicator_code: "FED_RATE",
    indicator_name: "Federal Funds Rate",
    unit: "percent"
  },
  {
    series_id: "UNRATE",
    indicator_code: "UNEMP_RATE",
    indicator_name: "Unemployment Rate",
    unit: "percent"
  }
];

async function fetchSeries(ind) {
  try {
    const res = await axios.get(
      "https://api.stlouisfed.org/fred/series/observations",
      {
        params: {
          series_id: ind.series_id,
          api_key: process.env.FRED_API_KEY,
          file_type: "json",
          sort_order: "desc",
          limit: 5
        },
        timeout: 15000
      }
    );

    const observations = res.data.observations || [];
    const latest = observations.find((o) => o.value !== ".");

    if (!latest) {
      console.log(`No usable data for ${ind.series_id}`);
      return null;
    }

    return {
      source_name: "FRED",
      source_type: "macro",
      country_code: "US",
      country_name: "United States",
      indicator_code: ind.indicator_code,
      indicator_name: ind.indicator_name,
      raw_value: Number(latest.value),
      raw_unit: ind.unit,
observed_at: new Date(latest.date).toISOString()    };
  } catch (err) {
    console.error(`Fetch failed for ${ind.series_id}:`, err.message);
    return null;
  }
}

async function run() {
  const rows = [];

  for (const ind of indicators) {
    const row = await fetchSeries(ind);
    if (row) rows.push(row);
  }

  console.log("Rows prepared for insert:", rows);

  if (!rows.length) {
    console.log("No macro data fetched.");
    return;
  }

  const { data, error } = await supabase
    .from("raw_macro_indicators")
    .insert(rows)
    .select();

  if (error) {
    console.error("Insert error:", error.message || error);
    return;
  }

  console.log("Inserted macro data:", data.length);
}

run();