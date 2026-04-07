require("dotenv").config();
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

console.log("Starting news ingestion...");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const query = [
  "geopolitics",
  "protest",
  "sanctions",
  "security",
  "cyber",
  "oil",
  "Middle East",
  "Pakistan",
  "Iran"
].join(" OR ");

function getDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

async function run() {
  try {
    const res = await axios.get("https://newsapi.org/v2/everything", {
      params: {
        q: query,
        language: "en",
        sortBy: "publishedAt",
        pageSize: 25,
        apiKey: process.env.NEWS_API_KEY
      },
      timeout: 20000
    });

    if (res.data.status !== "ok") {
      console.log("News API response not ok:", res.data);
      return;
    }

    const articles = res.data.articles || [];

    const rows = articles
      .map((a) => ({
        source_name: a.source?.name || "NewsAPI",
        source_type: "news",
        source_domain: a.url ? getDomain(a.url) : null,
        title: a.title,
        summary: a.description,
        url: a.url,
        language: "en",
        published_at: a.publishedAt
      }))
      .filter((row) => row.title && row.url);

    console.log("Rows prepared for insert:", rows.length);

    if (!rows.length) {
      console.log("No news data fetched.");
      return;
    }

    const { data, error } = await supabase
      .from("raw_news_items")
      .insert(rows)
      .select();

    if (error) {
      console.error("Insert error:", error.message || error);
      return;
    }

    console.log("Inserted news data:", data.length);
  } catch (err) {
    if (err.response) {
      console.error("News fetch failed:", err.response.status, err.response.data);
    } else {
      console.error("News fetch failed:", err.message);
    }
  }
}

run();