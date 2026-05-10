import os
import json
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv
from supabase import create_client
from openai import OpenAI

load_dotenv("../.env")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
NEWS_API_KEY = os.getenv("NEWS_API_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
client = OpenAI(api_key=OPENAI_API_KEY)

COUNTRY_MAP = {
    "Taiwan": "TWN",
    "China": "CHN",
    "Iran": "IRN",
    "Oman": "OMN",
    "Egypt": "EGY",
    "Russia": "RUS",
    "Ukraine": "UKR",
    "Israel": "ISR",
    "United States": "USA",
}

AGENT_QUERIES = {
    "geopolitical": [
        "Taiwan Strait escalation",
        "China Taiwan military activity",
        "Iran regional escalation",
        "Russia Ukraine war",
    ],
    "security": [
        "terrorist attack political violence",
        "armed conflict insurgency",
        "border clashes military escalation",
        "civil unrest protests",
    ],
    "energy": [
        "Strait of Hormuz oil disruption",
        "Red Sea shipping energy risk",
        "LNG disruption energy markets",
        "pipeline attack energy infrastructure",
    ],
    "cyber": [
        "critical infrastructure cyber attack",
        "ransomware attack supply chain",
        "state sponsored cyber attack",
        "CISA exploited vulnerability",
    ],
}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def infer_country(text):
    text = (text or "").lower()

    for country, iso3 in COUNTRY_MAP.items():
        if country.lower() in text:
            return country, iso3

    return "Global", None


def get_country_id(iso3):
    if not iso3:
        return None

    result = (
        supabase.table("countries")
        .select("id")
        .eq("iso3", iso3)
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]["id"]

    return None


def severity_score(text, category):
    text = (text or "").lower()

    score = 50

    high_terms = [
        "attack",
        "strike",
        "war",
        "escalation",
        "ransomware",
        "missile",
        "sanctions",
        "breach",
        "shutdown",
        "exploit",
    ]

    medium_terms = [
        "risk",
        "warning",
        "tension",
        "pressure",
        "threat",
        "alert",
        "volatility",
    ]

    if any(t in text for t in high_terms):
        score = 85

    elif any(t in text for t in medium_terms):
        score = 65

    if category == "cyber" and (
        "ransomware" in text or "exploit" in text
    ):
        score = 90

    return min(score, 100)


def fetch_gdelt(query, maxrecords=5):
    url = "https://api.gdeltproject.org/api/v2/doc/doc"

    params = {
        "query": query,
        "mode": "ArtList",
        "format": "json",
        "maxrecords": maxrecords,
        "sort": "HybridRel",
    }

    try:
        r = requests.get(url, params=params, timeout=20)
        r.raise_for_status()

        return r.json().get("articles", [])

    except Exception as e:
        print(f"GDELT ERROR: {e}")
        return []


def fetch_newsapi(query, page_size=5):
    if not NEWS_API_KEY:
        return []

    url = "https://newsapi.org/v2/everything"

    params = {
        "q": query,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": page_size,
        "apiKey": NEWS_API_KEY,
    }

    try:
        r = requests.get(url, params=params, timeout=20)
        r.raise_for_status()

        return r.json().get("articles", [])

    except Exception as e:
        print(f"NEWSAPI ERROR: {e}")
        return []


def save_signal(title, summary, source, url, category, subcategory):
    country, iso3 = infer_country(f"{title} {summary}")

    country_id = get_country_id(iso3)

    severity = severity_score(
        f"{title} {summary}",
        category
    )

    payload = {
        "title": title[:500],
        "summary": summary[:2000] if summary else "",
        "source_name": source,
        "source_url": url,
        "country_id": country_id,
        "category": category,
        "subcategory": subcategory,
        "severity": severity,
        "confidence": "medium",
        "relevance_score": severity,
        "event_date": now_iso(),
    }

    try:
        supabase.table("risk_signals").insert(payload).execute()

    except Exception as e:
        print(f"risk_signals insert skipped: {e}")

    return {
        "title": title,
        "summary": summary,
        "country": country,
        "iso3": iso3,
        "source": source,
        "source_url": url,
        "severity": severity,
        "category": category,
    }


def ingest_category(category):
    signals = []

    for query in AGENT_QUERIES.get(category, []):

        gdelt_articles = fetch_gdelt(query)

        for article in gdelt_articles:
            title = article.get("title") or "Untitled"

            summary = (
                article.get("domain", "")
                + " "
                + article.get("seendate", "")
            )

            url = article.get("url")

            signals.append(
                save_signal(
                    title,
                    summary,
                    "GDELT",
                    url,
                    category,
                    query,
                )
            )

        news_articles = fetch_newsapi(query)

        for article in news_articles:
            title = article.get("title") or "Untitled"

            summary = (
                article.get("description")
                or article.get("content")
                or ""
            )

            url = article.get("url")

            source = article.get(
                "source",
                {}
            ).get(
                "name",
                "NewsAPI"
            )

            signals.append(
                save_signal(
                    title,
                    summary,
                    source,
                    url,
                    category,
                    query,
                )
            )

    return signals


def run_agent(category, signals):

    if not signals:
        signals = [
            {
                "title": f"No recent {category} signals found",
                "summary": "No current signals available.",
                "country": "Global",
                "severity": 40,
                "source": "system",
            }
        ]

    prompt = f"""
You are the Sovereign Intelligence {category.upper()} Agent.

Analyze the latest signals and return ONLY valid JSON.

Required JSON schema:

{{
  "title": "...",
  "summary": "...",
  "risk_score": 0,
  "confidence_score": 0,
  "severity": "...",
  "countries": [],
  "regions": [],
  "sectors": [],
  "companies": [],
  "commodities": [],
  "early_warning_indicators": [],
  "recommended_actions": [],
  "sources": []
}}

Signals:
{json.dumps(signals, indent=2)}
"""

    response = client.chat.completions.create(
        model="gpt-5.5",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a senior geopolitical "
                    "and strategic intelligence analyst. "
                    "Return ONLY valid JSON."
                ),
            },
            {
                "role": "user",
                "content": prompt,
            },
        ],
    )

    content = response.choices[0].message.content

    try:
        output = json.loads(content)

    except Exception:
        output = {
            "title": f"{category.capitalize()} Intelligence Update",
            "summary": content,
            "risk_score": 70,
            "confidence_score": 70,
            "severity": "moderate",
            "countries": ["Global"],
            "regions": [],
            "sectors": [],
            "companies": [],
            "commodities": [],
            "early_warning_indicators": [],
            "recommended_actions": [],
            "sources": [],
        }

    agent_output = {
        "category": category,
        "title": output.get(
            "title",
            f"{category.capitalize()} Intelligence Update"
        ),
        "summary": output.get("summary", ""),
        "risk_score": output.get("risk_score", 70),
        "confidence_score": output.get(
            "confidence_score",
            75
        ),
        "severity": output.get(
            "severity",
            "moderate"
        ),
        "countries": output.get(
            "countries",
            ["Global"]
        ),
        "regions": output.get("regions", []),
        "sectors": output.get("sectors", []),
        "companies": output.get("companies", []),
        "commodities": output.get(
            "commodities",
            []
        ),
        "early_warning_indicators": output.get(
            "early_warning_indicators",
            []
        ),
        "recommended_actions": output.get(
            "recommended_actions",
            []
        ),
        "sources": output.get("sources", []),
        "raw_output": output,
    }

    try:
        response = (
            supabase.table("agent_outputs")
            .insert(agent_output)
            .execute()
        )

        print("AGENT INSERT RESPONSE:", response)

    except Exception as e:
        print(f"AGENT OUTPUT INSERT ERROR: {e}")

    return agent_output


def main():
    print("Starting Sovereign Intelligence ingestion...")

    for category in [
        "geopolitical",
        "security",
        "energy",
        "cyber",
    ]:

        print(f"Ingesting {category} signals...")

        signals = ingest_category(category)

        print(f"Running {category} agent...")

        run_agent(category, signals)

    print("Done.")


if __name__ == "__main__":
    main()
