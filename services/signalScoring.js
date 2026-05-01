export function scoreSignal(signal = {}) {
  const relevance = Number(signal.relevance ?? 5);
  const reliability = Number(signal.reliability ?? 5);
  const severity = Number(signal.severity ?? 5);
  const recency = Number(signal.recency ?? 5);
  const corroboration = Number(signal.corroboration ?? 3);
  const novelty = Number(signal.novelty ?? 3);

  const score =
    relevance * 0.25 +
    reliability * 0.2 +
    severity * 0.2 +
    recency * 0.15 +
    corroboration * 0.1 +
    novelty * 0.1;

  let priority = "low";

  if (score >= 7.5) priority = "critical";
  else if (score >= 6) priority = "high";
  else if (score >= 4) priority = "medium";

  return {
    ...signal,
    signal_score: Number(score.toFixed(2)),
    priority,
  };
}

export function scoreSignals(signals = []) {
  return signals
    .map(scoreSignal)
    .sort((a, b) => b.signal_score - a.signal_score);
}

export function filterHighValueSignals(signals = [], minimumScore = 6) {
  return scoreSignals(signals).filter(
    (signal) => signal.signal_score >= minimumScore
  );
}
