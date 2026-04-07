require("dotenv").config();

console.log("SUPABASE_URL:", process.env.SUPABASE_URL);
console.log("ALPHA_VANTAGE_API_KEY:", process.env.ALPHA_VANTAGE_API_KEY ? "loaded" : "missing");
console.log("FRED_API_KEY:", process.env.FRED_API_KEY ? "loaded" : "missing");
console.log("NEWS_API_KEY:", process.env.NEWS_API_KEY ? "loaded" : "missing");
