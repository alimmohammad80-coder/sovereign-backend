import express from "express";
import { getIntelligenceMemory } from "../services/memoryService.js";

const router = express.Router();

router.get("/memory", async (req, res) => {
  try {
    const { country, region, requestType, limit } = req.query;

    const records = await getIntelligenceMemory({
      country,
      region,
      requestType,
      limit: Number(limit) || 10,
    });

    res.json({
      engine: "sovereign_memory",
      status: "success",
      count: records.length,
      records,
    });
  } catch (err) {
    res.status(500).json({
      engine: "sovereign_memory",
      status: "error",
      error: err.message,
    });
  }
});

export default router;
