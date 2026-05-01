import express from "express";
import OpenAI from "openai";
import { callNemotron } from "../services/nemotronClient.js";

import {
  baseDoctrine,
  geopoliticalFramework,
  securityFramework,
  energyFramework,
  cyberFramework,
} from "../frameworks/agentFrameworks.js";

const router = express.Router();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function buildScenarioPrompt(payload) {
  const {
    scenario,
    country,
    region,
    timeframe,
    assumptions,
    signals,
    data,
  } = payload;

  return `
Scenario to simulate:
${scenario}

Country:
${country || "Not specified"}

Region:
${region || "Not specified"}

Timeframe:
${timeframe || "30-90 days"}

Assumptions:
${JSON.stringify(assumptions || [], null, 2)}

Current signals:
${JSON.stringify(signals || [], null, 2)}

Additional data:
${JSON.stringify(data || {}, null, 2)}
`;
}

async function runScenarioAgent(framework, payload) {
  return callNemotron({
    systemPrompt: `
${baseDoctrine}

You are running a forward-looking scenario simulation.
Assess how this hypothetical development could affect your domain.

${framework}
`,
    userPrompt: buildScenarioPrompt(payload),
    jsonMode: true,
    temperature: 0.25,
    maxTokens: 2200,
  });
}

async function synthesizeScenario(payload, agentOutputs) {
  const systemPrompt = `
You are Sovereign Intelligence Scenario Simulation Lab.

Your job is to convert multi-agent analysis into structured strategic scenarios.

Rules:
- Do not predict with certainty.
- Build plausible pathways.
- Distinguish assumptions from judgments.
- Identify triggers, consequences, warning indicators, and decision options.
- Return valid JSON only.
`;

  const userPrompt = `
Scenario input:
${JSON.stringify(payload, null, 2)}

Domain agent outputs:
${JSON.stringify(agentOutputs, null, 2)}

Return this JSON:

{
  "scenario_title": "",
  "baseline_assessment": "",
  "overall_risk_score": 0,
  "timeframe": "",
  "core_assumptions": [],
  "scenario_paths": [
    {
      "name": "Best case / limited escalation",
      "probability": "",
      "risk_score": 0,
      "description": "",
      "key_triggers": [],
      "likely_sequence": [],
      "geopolitical_effects": [],
      "security_effects": [],
      "energy_effects": [],
      "cyber_effects": [],
      "economic_effects": [],
      "decision_implications": []
    },
    {
      "name": "Most likely scenario",
      "probability": "",
      "risk_score": 0,
      "description": "",
      "key_triggers": [],
      "likely_sequence": [],
      "geopolitical_effects": [],
      "security_effects": [],
      "energy_effects": [],
      "cyber_effects": [],
      "economic_effects": [],
      "decision_implications": []
    },
    {
      "name": "Worst case / severe escalation",
      "probability": "",
      "risk_score": 0,
      "description": "",
      "key_triggers": [],
      "likely_sequence": [],
      "geopolitical_effects": [],
      "security_effects": [],
      "energy_effects": [],
      "cyber_effects": [],
      "economic_effects": [],
      "decision_implications": []
    }
  ],
  "early_warning_indicators": [],
  "monitoring_priorities": [],
  "strategic_recommendations": [],
  "intelligence_gaps": [],
  "confidence": "low | medium | high"
}
`;

  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
    temperature: 0.25,
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

router.post("/scenario/simulate", async (req, res) => {
  try {
    const payload = req.body;

    if (!payload.scenario) {
      return res.status(400).json({
        status: "error",
        error: "Missing scenario field",
      });
    }

    const [geopolitical, security, energy, cyber] = await Promise.all([
      runScenarioAgent(geopoliticalFramework, payload),
      runScenarioAgent(securityFramework, payload),
      runScenarioAgent(energyFramework, payload),
      runScenarioAgent(cyberFramework, payload),
    ]);

    const agentOutputs = {
      geopolitical,
      security,
      energy,
      cyber,
    };

    const simulation = await synthesizeScenario(payload, agentOutputs);

    res.json({
      engine: "sovereign_scenario_lab",
      status: "success",
      agents_used: ["geopolitical", "security", "energy", "cyber"],
      agent_outputs: agentOutputs,
      simulation,
    });
  } catch (err) {
    console.error("Scenario Lab error:", err.response?.data || err.message);

    res.status(500).json({
      engine: "sovereign_scenario_lab",
      status: "error",
      error: err.message,
    });
  }
});

export default router;
