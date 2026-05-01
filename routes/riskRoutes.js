import express from "express";

import {
  getCountryRisk,
  getCountryRiskTimeline,
} from "../services/memoryService.js";

const router = express.Router();

router.get("/risk/country", async (req, res) => {
  try {
    const { country } = req.query;

    if (!country) {
      return res.status(400).json({
        status: "error",
        error: "country is required",
      });
    }

    const risk = await getCountryRisk({ country });

    res.json({
      engine: "sovereign_risk_engine",
      status: "success",
      ...risk,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: err.message,
    });
  }
});

export default router;

router.get("/risk/timeline", async (req, res) => {
  try {
    const { country, limit } = req.query;

    if (!country) {
      return res.status(400).json({
        status: "error",
        error: "country is required",
      });
    }

    const timeline = await getCountryRiskTimeline({
      country,
      limit: Number(limit) || 30,
    });

    res.json({
      engine: "sovereign_risk_timeline",
      status: "success",
      country,
      count: timeline.length,
      timeline,
    });
  } catch (err) {
    res.status(500).json({
      engine: "sovereign_risk_timeline",
      status: "error",
      error: err.message,
    });
  }
});
