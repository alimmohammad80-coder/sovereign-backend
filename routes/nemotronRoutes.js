import express from "express";
import { callNemotron } from "../services/nemotronClient.js";

import {
  baseDoctrine,
  geopoliticalFramework,
  securityFramework,
  energyFramework,
  cyberFramework,
  fullBriefingFramework,
} from "../frameworks/agentFrameworks.js";

const router = express.Router();

function buildUserPrompt({ query, country, region, timeframe, signals, data }) {
  return `
Assessment request:
${query}

Country:
${country || "Not specified"}

Region:
${region || "Not specified"}

Timeframe:
${timeframe || "Near-term"}

Signals:
${JSON.stringify(signals || [], null, 2)}

Additional data:
${JSON.stringify(data || {}, null, 2)}
`;
}

async function runAgent(req, res, framework, agentName) {
  try {
    const { query, country, region, timeframe, signals, data } = req.body;

    const systemPrompt = `
${baseDoctrine}

${framework}
`;

    const userPrompt = buildUserPrompt({
      query,
      country,
      region,
      timeframe,
      signals,
      data,
    });

    const result = await callNemotron({
      systemPrompt,
      userPrompt,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 2000,
    });

    res.json({
      engine: "nemotron",
      agent: agentName,
      status: "success",
      result,
    });
  } catch (err) {
    console.error(`${agentName} error:`, err.response?.data || err.message);

    res.status(500).json({
      engine: "nemotron",
      agent: agentName,
      status: "error",
      error: err.message,
    });
  }
}

router.post("/nemotron-agent", async (req, res) => {
  return runAgent(req, res, geopoliticalFramework, "general_geopolitical");
});

router.post("/agent/geopolitical", async (req, res) => {
  return runAgent(req, res, geopoliticalFramework, "geopolitical");
});

router.post("/agent/security", async (req, res) => {
  return runAgent(req, res, securityFramework, "security");
});

router.post("/agent/energy", async (req, res) => {
  return runAgent(req, res, energyFramework, "energy");
});

router.post("/agent/cyber", async (req, res) => {
  return runAgent(req, res, cyberFramework, "cyber");
});

router.post("/agent/full-briefing", async (req, res) => {
  return runAgent(req, res, fullBriefingFramework, "full_briefing");
});

export default router;
