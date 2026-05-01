import express from "express";
import { getGlobalRiskMap } from "../services/memoryService.js";

const router = express.Router();

router.get("/risk/global", async (req, res) => {
  try {
    const { limit } = req.query;

    const data = await getGlobalRiskMap({
      limit: Number(limit) || 50,
    });

    res.json({
      engine: "sovereign_global_risk",
      status: "success",
      count: data.length,
      data,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      error: err.message,
    });
  }
});

export default router;
