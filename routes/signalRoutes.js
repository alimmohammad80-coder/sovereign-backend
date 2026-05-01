import express from "express";
import {
  scoreSignals,
  filterHighValueSignals,
} from "../services/signalScoring.js";

const router = express.Router();

router.post("/signals/score", (req, res) => {
  try {
    const { signals, minimumScore = 6 } = req.body;

    if (!Array.isArray(signals)) {
      return res.status(400).json({
        status: "error",
        error: "signals must be an array",
      });
    }

    const scored_signals = scoreSignals(signals);
    const high_value_signals = filterHighValueSignals(signals, minimumScore);

    res.json({
      engine: "sovereign_signal_scoring",
      status: "success",
      total_signals: signals.length,
      high_value_count: high_value_signals.length,
      minimum_score: minimumScore,
      scored_signals,
      high_value_signals,
    });
  } catch (err) {
    res.status(500).json({
      engine: "sovereign_signal_scoring",
      status: "error",
      error: err.message,
    });
  }
});

export default router;
