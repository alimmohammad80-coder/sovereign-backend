console.log("THIS IS THE ACTIVE SERVER FILE");

import express from "express";
import dotenv from "dotenv";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";


dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 📰 NEWS
async function getNews(country) {
  const url = `https://newsapi.org/v2/everything?q=${country}&apiKey=${process.env.NEWS_API_KEY}}
  } else if (agent === "economics") {`;
  const res = await fetch(url);
  const data = await res.json();

  return data.articles.slice(0, 5).map(a => a.title).join("\n");
}

// 📈 MARKET
async function getMarketData() {
  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=SPY&apikey=${process.env.ALPHA_VANTAGE_KEY}}
  } else if (agent === "economics") {`;
  const res = await fetch(url);
  const data = await res.json();

  return JSON.stringify(data["Global Quote"]);
}

// 🏦 MACRO
async function getMacroData() {
  const url = `https://api.stlouisfed.org/fred/series/observations?series_id=GDP&api_key=${process.env.FRED_API_KEY}&file_type=json`;
  const res = await fetch(url);
  const data = await res.json();

  return data.observations.slice(-3).map(o => o.value).join(", ");
}

// 🌐 ROOT
app.get("/", (req, res) => {
  res.send("Server is running");
});

// 🌍 COUNTRY AGENT
app.post("/country-agent", async (req, res) => {
  const { country } = req.body;

  try {
    const news = await getNews(country);
    const market = await getMarketData();
    const macro = await getMacroData();

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: `
Country: ${country}

Recent News:
${news}

Market Data:
${market}

Macro Data:
${macro}

Provide geopolitical intelligence analysis including:
- Political risks
- Economic outlook
- Security dynamics
- Forecast
- Confidence level
`,
    });

    const result = response.output[0].content[0].text;

    // SAVE TO SUPABASE
    await supabase.from("intelligence_reports").insert([
      {
        type: "country",
        target: country,
        content: result,
      },
    ]);

    res.json({ result });

  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

app.post("/chat-agent", async (req, res) => {
  const { message, agent } = req.body;

  let systemPrompt = "";

  if (agent === "geopolitics") {
    systemPrompt =
      "You are a senior geopolitical intelligence analyst. Provide structured, actor-based analysis including key actors, dynamics, risks, and forecast.";
  } else if (agent === "economics") {
    systemPrompt = "You are a macroeconomic intelligence analyst.";
  } else if (agent === "energy") {
    systemPrompt = "You are an energy security intelligence analyst.";
  }

  try {
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input:
        systemPrompt +
        "\n\nUser query:\n" +
        message +
        "\n\nProvide:\n" +
        "1. Key Insight\n" +
        "2. Key Actors\n" +
        "3. Analysis\n" +
        "4. Risks\n" +
        "5. Forecast\n",
    });

    const result = response.output[0].content[0].text;

    res.json({ result });
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
    });

    const result = response.output[0].content[0].text;

    res.json({ result });

  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

    const result = response.output[0].content[0].text;

    res.json({ result });

  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});


} else if (agent === "economics") {
  systemPrompt = "You are a macroeconomic intelligence analyst.";
} else if (agent === "energy") {
  systemPrompt = "You are an energy security intelligence analyst.";
}


1. Identify ALL key actors:
   - States
   - Non-state actors
   - Alliances

2. Explain their objectives

3. Map relationships:
   - Allies
   - Adversaries

4. Identify drivers:
   - Political
   - Economic
   - Military
   - Energy

5. Highlight CURRENT signals

6. Focus on what is changing NOW

7. Always identify at least 3–5 actors

Be concise, analytical, and decisive.
`;

} else if (agent === "economics") {
  systemPrompt = "You are a macroeconomic intelligence analyst.";
} else if (agent === "energy") {
  systemPrompt = "You are an energy security intelligence analyst.";}

Your job is NOT to give generic explanations.
Your job is to produce structured, actor-based, strategic intelligence.

Follow this methodology:

1. Identify ALL key actors involved:
   - States
   - Non-state actors
   - Alliances

2. Explain their objectives:
   - What does each actor want?

3. Map relationships:
   - Allies
   - Adversaries
   - Dependencies

4. Identify drivers of conflict:
   - Political
   - Economic
   - Military
   - Energy

5. Use CURRENT signals (news, markets, macro data)

6. Highlight what is changing NOW (not historical summary)

7. Always identify at least 3–5 actors and their interactions.

Be concise, analytical, and decisive.

Avoid:
- generic explanations
- "as of my last update"
- vague statements
`;
}
  } else if (agent === "economics") {
    systemPrompt = "You are a macroeconomic analyst.";
  } else if (agent === "energy") {
    systemPrompt = "You are an energy security analyst.";
  }

  try {
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: `${systemPrompt}\nUser: ${message}`,
    });

    const result = response.output[0].content[0].text;

    res.json({ result });

  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

// 🚀 START SERVER
app.listen(3001, () => {
  console.log("🚀 Backend running on port 3001");
});

app.post("/chat-agent", async (req, res) => {
  const { message, agent } = req.body;

  let systemPrompt = "";
if (agent === "geopolitics") {
  systemPrompt = `
You are a senior geopolitical intelligence analyst.

Your job is to produce structured, actor-based, strategic intelligence.

Follow this methodology:

1. Identify ALL key actors:
   - States
   - Non-state actors
   - Alliances

2. Explain their objectives

3. Map relationships:
   - Allies
   - Adversaries

4. Identify drivers:
   - Political
   - Economic
   - Military
   - Energy

5. Highlight CURRENT signals

6. Focus on what is changing NOW

7. Always identify at least 3–5 actors

Be concise, analytical, and decisive.
`;
}

} else if (agent === "economics") {
  systemPrompt = "You are a macroeconomic analyst.";
}

  } else if (agent === "energy") {
    systemPrompt = `
You are an energy security analyst.
Focus on oil, gas, renewables, supply chains, and geopolitical energy risks.
`;
  }

  try {
    const response = await client.responses.create({
      model: "gpt-4o-mini",
      input: `
${systemPrompt}

User question:
${message}
`,
    });

    const result = response.output[0].content[0].text;

    // Save chat to Supabase
    await supabase.from("intelligence_reports").insert([
      {
        type: agent,
        target: "chat",
        content: result,
      },
    ]);

    res.json({ result });

  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});
