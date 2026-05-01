import { saveIntelligenceMemory } from "../services/memoryService.js";
import {
  scoreSignals,
  filterHighValueSignals,
} from "../services/signalScoring.js";
import express from "express";
import OpenAI from "openai";
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

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildPrompt({ query, country, region, timeframe, signals, data }) {
  return `
Assessment request:
${query}

Country:
${country || "Not specified"}

Region:
${region || "Not specified"}

Timeframe:
${timeframe || "30-90 days"}

Signals:
${JSON.stringify(signals || [], null, 2)}

Additional data:
${JSON.stringify(data || {}, null, 2)}
`;
}

async function runNemotronFramework(framework, payload) {
  try {
    const result = await callNemotron({
      systemPrompt: `${baseDoctrine}\n\n${framework}`,
      userPrompt: buildPrompt(payload),
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 2000,
    });

    return result || {
      fallback: true,
      executive_judgment: "No response from Nemotron.",
      confidence: "low",
    };

  } catch (err) {
    console.error("Nemotron agent failed:", err.message);

    return {
      fallback: true,
      executive_judgment: "Nemotron agent failed to respond.",
      confidence: "low",
      intelligence_gaps: [err.message],
    };
  }
}
async function synthesizeWithOpenAI({ query, payload, agentOutputs }) {
  const systemPrompt = `
You are Sovereign Intelligence Senior Fusion Analyst.

Your job is to fuse multi-agent intelligence outputs into one decision-grade strategic brief.

Rules:
- Do not simply summarize agents.
- Identify cross-domain relationships.
- Resolve contradictions.
- Highlight escalation pathways.
- Separate facts, judgments, assumptions, and intelligence gaps.
- Return valid JSON only.
`;

  const userPrompt = `
Original user query:
${query}

Original input:
${JSON.stringify(payload, null, 2)}

Nemotron agent outputs:
${JSON.stringify(agentOutputs, null, 2)}

Use this structure:
${fullBriefingFramework}

Add these additional fields:
{
  "cross_domain_findings": [],
  "contradictions_or_uncertainties": [],
  "priority_monitoring_requirements": [],
  "recommended_actions": []
}
`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices?.[0]?.message?.content;

  try {
    return JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { raw_text: content };
  }
}

router.post("/fusion/full-briefing", async (req, res) => {
  try {
const payload = req.body;
const { query } = payload;

const scoredSignals = scoreSignals(payload.signals || []);

const highValueSignals = filterHighValueSignals(
  payload.signals || [],
  payload.minimumScore || 6
);

// store originals
payload.raw_signals = payload.signals || [];
payload.scored_signals = scoredSignals;

// ✅ correct fallback (FINAL assignment)
payload.signals =
  highValueSignals.length > 0 ? highValueSignals : payload.raw_signals;

const geopolitical = await runNemotronFramework(
  geopoliticalFramework,
  payload
);

const security = await runNemotronFramework(
  securityFramework,
  payload
);

const energy = await runNemotronFramework(
  energyFramework,
  payload
);

const cyber = await runNemotronFramework(
  cyberFramework,
  payload
);

    const agentOutputs = {
      geopolitical,
      security,
      energy,
      cyber,
    };

    const finalBriefing = await synthesizeWithOpenAI({
      query,
      payload,
      agentOutputs,
    });

let memoryRecord = null;

try {
  memoryRecord = await saveIntelligenceMemory({
    requestType: "fusion_full_briefing",
    query: payload.query,
    country: payload.country,
    region: payload.region,
    timeframe: payload.timeframe,
    rawSignals: payload.raw_signals,
    scoredSignals: payload.scored_signals,
    filteredSignals: payload.signals,
    agentOutputs,
    finalOutput: finalBriefing,
    overallRiskScore: finalBriefing?.overall_risk_score,
    confidence: finalBriefing?.confidence,
    tags: ["fusion", "briefing", payload.country || "global"],
  });
} catch (err) {
  console.error("Memory save failed:", err.message);
}
res.json({
      engine: "sovereign_fusion",
      status: "success",
      memory_id: memoryRecord?.id || null,    
      agents_used: ["geopolitical", "security", "energy", "cyber"],
      agent_outputs: agentOutputs,
      final_briefing: finalBriefing,
    });
  } catch (err) {
    console.error("Fusion error:", err.response?.data || err.message);

    res.status(500).json({
      engine: "sovereign_fusion",
      status: "error",
      error: err.message,
    });
  }
});

export default router;
