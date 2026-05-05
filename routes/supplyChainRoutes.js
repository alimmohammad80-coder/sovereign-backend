import express from "express";
import { callNemotron } from "../services/nemotronClient.js";
import { baseDoctrine } from "../frameworks/agentFrameworks.js";

const router = express.Router();

const supplyChainFramework = `
FRAMEWORK: CHOKEPOINT → COMMODITY → ROUTE → EXPOSURE → CASCADING IMPACT

Analyze:
1. Chokepoint risk
2. Commodity exposure
3. Route disruption
4. Sanctions/export control exposure
5. Second-order economic and security effects

Return valid JSON only:

{
  "executive_judgment": "",
  "supply_chain_risk_score": 0,
  "risk_level": "low | moderate | elevated | critical",
  "affected_chokepoints": [],
  "affected_commodities": [],
  "exposed_routes": [],
  "sanctions_or_export_control_risk": "",
  "cascading_effects": [],
  "early_warning_indicators": [],
  "business_implications": [],
  "intelligence_gaps": [],
  "confidence": "low | medium | high"
}
`;

router.post("/supply-chain/run-agent", async (req, res) => {
  try {
    const {
      selected_country,
      selected_region,
      selected_chokepoint,
      selected_commodity,
      selected_route,
      time_horizon = "30 days",
      signals = [],
      data = {},
    } = req.body;

    const userPrompt = `
Supply Chain Assessment Request

Country:
${selected_country || "Not specified"}

Region:
${selected_region || "Not specified"}

Chokepoint:
${selected_chokepoint || "Not specified"}

Commodity:
${selected_commodity || "Not specified"}

Route:
${selected_route || "Not specified"}

Time Horizon:
${time_horizon}

Signals:
${JSON.stringify(signals, null, 2)}

Additional Data:
${JSON.stringify(data, null, 2)}
`;

    const result = await callNemotron({
      systemPrompt: `${baseDoctrine}\n\n${supplyChainFramework}`,
      userPrompt,
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 2200,
    });

    res.json({
      engine: "sovereign_supply_chain_command",
      status: "success",
      agent: "energy_supply_chain",
      result,
    });
  } catch (err) {
    res.status(500).json({
      engine: "sovereign_supply_chain_command",
      status: "error",
      error: err.message,
    });
  }
});

export default router;
