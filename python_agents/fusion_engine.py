from supabase import create_client
from dotenv import load_dotenv
import os
from collections import defaultdict

load_dotenv()

supabase = create_client(
    os.getenv("SUPABASE_URL"),
    os.getenv("SUPABASE_KEY")
)

# FETCH RECENT AGENT OUTPUTS
response = supabase.table("agent_outputs") \
    .select("*") \
    .order("created_at", desc=True) \
    .limit(50) \
    .execute()

data = response.data
print(data)

country_groups = defaultdict(list)

# GROUP BY COUNTRY
for item in data:
    countries = item.get("countries", [])
    for c in countries:
        country_groups[c].append(item)

fusion_results = []

for country, signals in country_groups.items():

    avg_risk = int(sum(
        s.get("risk_score", 0) for s in signals
    ) / len(signals))

    avg_confidence = int(sum(
        s.get("confidence_score", 0) for s in signals
    ) / len(signals))

    linked_agents = list(set([
        s.get("category")
        for s in signals
    ]))

    fusion = {
        "title": f"{country} Multi-Agent Fusion Briefing",
        "summary": f"{country} shows converging geopolitical, economic, cyber, security, or supply-chain risk signals.",
        "overall_risk_score": avg_risk,
        "confidence_score": avg_confidence,
        "affected_countries": [country],
        "affected_regions": [],
        "affected_sectors": [],
        "affected_companies": [],
        "escalation_probability": avg_risk,
        "linked_signals": signals,
        "linked_agents": linked_agents,
        "recommended_actions": [
            "Monitor escalation indicators",
            "Run scenario simulation",
            "Review investor exposure"
        ],
        "raw_fusion": signals
    }

    fusion_results.append(fusion)

# STORE
for result in fusion_results:

    response = supabase.table("fusion_briefings") \
        .insert(result) \
        .execute()

    print(response)
