import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
const NVIDIA_BASE_URL =
  process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
const NEMOTRON_MODEL =
  process.env.NEMOTRON_MODEL ||
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

function safeJsonParse(text) {
  const malformedFallback = {
    executive_judgment: "Model returned malformed output.",
    risk_score: null,
    confidence: "low",
    intelligence_gaps: ["Model response was not valid JSON."],
    fallback: true,
  };

  if (!text || typeof text !== "string") {
    return malformedFallback;
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      return malformedFallback;
    }

    try {
      return JSON.parse(match[0]);
    } catch {
      return malformedFallback;
    }
  }
}

export async function callNemotron({
  systemPrompt,
  userPrompt,
  temperature = 0.2,
  maxTokens = 1800,
  jsonMode = true,
}) {
  if (!NVIDIA_API_KEY) {
    throw new Error("Missing NVIDIA_API_KEY");
  }

  try {
    const response = await axios.post(
      `${NVIDIA_BASE_URL}/chat/completions`,
      {
        model: NEMOTRON_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature,
        max_tokens: maxTokens,
      },
      {
        headers: {
          Authorization: `Bearer ${NVIDIA_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 90000,
      }
    );

    const content = response.data?.choices?.[0]?.message?.content;

    if (!content || content.trim() === "") {
      console.warn("⚠️ Nemotron returned empty response");

      return {
        executive_judgment: "Nemotron returned an empty response.",
        risk_score: null,
        confidence: "low",
        intelligence_gaps: ["Model returned no content. Retry or reduce request complexity."],
        fallback: true,
      };
    }

    return jsonMode ? safeJsonParse(content) : content;
  } catch (error) {
    console.error("Nemotron API error:", error.response?.data || error.message);

    return {
      executive_judgment: "Nemotron request failed.",
      risk_score: null,
      confidence: "low",
      intelligence_gaps: [
        error.response?.data?.error?.message ||
          error.message ||
          "Unknown Nemotron API error",
      ],
      fallback: true,
    };
  }
}
