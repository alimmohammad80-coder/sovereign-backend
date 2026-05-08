import express from "express";
import axios from "axios";

const router = express.Router();

const INDICATORS = {
  "NY.GDP.MKTP.CD": "GDP current US$",
  "NY.GDP.MKTP.KD.ZG": "GDP growth annual %",
  "FP.CPI.TOTL.ZG": "Inflation consumer prices annual %",
  "SL.UEM.TOTL.ZS": "Unemployment total % of labor force",
  "SP.POP.TOTL": "Population total",
  "SI.POV.GINI": "Gini index",
  "BN.CAB.XOKA.GD.ZS": "Current account balance % of GDP",
};

async function fetchWorldBankIndicator(countryCode, indicatorCode) {
  const url = `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicatorCode}?format=json&per_page=60`;

  const response = await axios.get(url, { timeout: 20000 });
  const data = response.data;

  if (!Array.isArray(data) || !data[1]) return null;

  const latestValid = data[1].find((item) => item.value !== null);
  if (!latestValid) return null;

  return {
    indicator_code: indicatorCode,
    indicator_name: INDICATORS[indicatorCode],
    country_code: latestValid.countryiso3code,
    country_name: latestValid.country?.value,
    year: latestValid.date,
    value: latestValid.value,
    source: "World Bank",
  };
}

router.get("/worldbank/:countryCode", async (req, res) => {
  const countryCode = req.params.countryCode.toUpperCase();
  const results = [];

  for (const indicatorCode of Object.keys(INDICATORS)) {
    try {
      const item = await fetchWorldBankIndicator(countryCode, indicatorCode);
      if (item) results.push(item);
    } catch (error) {
      results.push({
        indicator_code: indicatorCode,
        indicator_name: INDICATORS[indicatorCode],
        error: error.message,
      });
    }
  }

  res.json({
    status: "success",
    module: "macro_indicators",
    country_code: countryCode,
    source: "World Bank Indicators API V2",
    fetched_at: new Date().toISOString(),
    indicator_count: results.length,
    data: results,
  });
});

router.get("/country-risk/:countryCode", async (req, res) => {
  const countryCode = req.params.countryCode.toUpperCase();
  const rawData = [];

  for (const indicatorCode of Object.keys(INDICATORS)) {
    try {
      const item = await fetchWorldBankIndicator(countryCode, indicatorCode);
      if (item) rawData.push(item);
    } catch (error) {
      console.error(`Failed to fetch ${indicatorCode}:`, error.message);
    }
  }

  let riskScore = 50;
  const drivers = [];

  for (const item of rawData) {
    const code = item.indicator_code;
    const value = Number(item.value);

    if (code === "FP.CPI.TOTL.ZG") {
      if (value > 15) {
        riskScore += 15;
        drivers.push("High inflation pressure");
      } else if (value > 8) {
        riskScore += 8;
        drivers.push("Elevated inflation");
      }
    }

    if (code === "NY.GDP.MKTP.KD.ZG") {
      if (value < 0) {
        riskScore += 15;
        drivers.push("Negative GDP growth");
      } else if (value < 2) {
        riskScore += 7;
        drivers.push("Weak GDP growth");
      }
    }

    if (code === "SL.UEM.TOTL.ZS") {
      if (value > 15) {
        riskScore += 10;
        drivers.push("High unemployment");
      } else if (value > 8) {
        riskScore += 5;
        drivers.push("Elevated unemployment");
      }
    }

    if (code === "BN.CAB.XOKA.GD.ZS") {
      if (value < -8) {
        riskScore += 10;
        drivers.push("Large current account deficit");
      } else if (value < -4) {
        riskScore += 5;
        drivers.push("External account vulnerability");
      }
    }
  }

  riskScore = Math.max(0, Math.min(100, riskScore));

  let riskLevel = "low";
  if (riskScore >= 80) riskLevel = "severe";
  else if (riskScore >= 65) riskLevel = "high";
  else if (riskScore >= 50) riskLevel = "elevated";
  else if (riskScore >= 35) riskLevel = "moderate";

  res.json({
    status: "success",
    module: "macro_country_risk",
    country_code: countryCode,
    macro_risk_score: riskScore,
    risk_level: riskLevel,
    drivers,
    source: "World Bank Indicators API V2",
    fetched_at: new Date().toISOString(),
    raw_indicators: rawData,
  });
});

export default router;
