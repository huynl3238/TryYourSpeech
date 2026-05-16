const REQUIRED_METRIC_NAMES = [
  'grammarErrors',
  'collocationsCorrect',
  'advancedVocabularyItems',
  'idiomsUsed',
  'pauses',
  'falseStarts',
  'connectors',
  'complexSentences',
  'unclearWords',
];

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

function isValidPartNumber(partNumber) {
  return partNumber === 1 || partNumber === 2 || partNumber === 3;
}

function isNonNegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function getMissingMetricNames(metrics) {
  return REQUIRED_METRIC_NAMES.filter((name) => !isNonNegativeNumber(metrics?.[name]));
}

function getFluencyBand(partNumber, metrics) {
  const strongConnectors = partNumber === 1 ? 5 : partNumber === 2 ? 7 : 8;
  const goodConnectors = partNumber === 1 ? 3 : partNumber === 2 ? 4 : 5;

  if (metrics.pauses <= 2 && metrics.falseStarts <= 1 && metrics.connectors >= strongConnectors) {
    return 8;
  }

  if (metrics.pauses <= 5 && metrics.falseStarts <= 3 && metrics.connectors >= goodConnectors) {
    return 7;
  }

  if (metrics.pauses <= 8 && metrics.falseStarts <= 5 && metrics.connectors >= 2) {
    return 6;
  }

  return 5;
}

function getLexicalBand(partNumber, metrics) {
  const strongCollocations = partNumber === 3 ? 9 : 8;
  const strongAdvancedVocabulary = partNumber === 3 ? 10 : 8;
  const strongIdioms = partNumber === 3 ? 4 : 3;
  const goodCollocations = partNumber === 3 ? 5 : 4;
  const goodAdvancedVocabulary = partNumber === 3 ? 6 : 5;
  const goodIdioms = partNumber === 3 ? 2 : 1;

  if (
    metrics.collocationsCorrect >= strongCollocations
    && metrics.advancedVocabularyItems >= strongAdvancedVocabulary
    && metrics.idiomsUsed >= strongIdioms
  ) {
    return 8;
  }

  if (
    metrics.collocationsCorrect >= goodCollocations
    && metrics.advancedVocabularyItems >= goodAdvancedVocabulary
    && metrics.idiomsUsed >= goodIdioms
  ) {
    return 7;
  }

  if (metrics.collocationsCorrect >= 2 && metrics.advancedVocabularyItems >= 3) {
    return 6;
  }

  return 5;
}

function getGrammarBand(partNumber, metrics) {
  const strongComplexSentences = partNumber === 1 ? 5 : partNumber === 2 ? 6 : 8;
  const goodComplexSentences = partNumber === 3 ? 4 : 3;

  if (metrics.grammarErrors <= 2 && metrics.complexSentences >= strongComplexSentences) {
    return 8;
  }

  if (metrics.grammarErrors <= 5 && metrics.complexSentences >= goodComplexSentences) {
    return 7;
  }

  if (metrics.grammarErrors <= 8 && metrics.complexSentences >= 1) {
    return 6;
  }

  return 5;
}

function getPronunciationBand(partNumber, metrics) {
  const goodUnclearLimit = partNumber === 3 ? 2 : 3;

  if (metrics.unclearWords <= 1) {
    return 8;
  }

  if (metrics.unclearWords <= goodUnclearLimit) {
    return 7;
  }

  if (metrics.unclearWords <= 6) {
    return 6;
  }

  return 5;
}

function buildCriterionScores(partNumber, metrics) {
  return {
    fluency: getFluencyBand(partNumber, metrics),
    lexical: getLexicalBand(partNumber, metrics),
    grammar: getGrammarBand(partNumber, metrics),
    pronunciation: getPronunciationBand(partNumber, metrics),
  };
}

function getRawBand(scores) {
  return (scores.fluency + scores.lexical + scores.grammar + scores.pronunciation) / 4;
}

export function scoreSpeakingTurn({ partNumber, metrics }) {
  if (!isValidPartNumber(partNumber)) {
    throw new Error('partNumber must be 1, 2, or 3');
  }

  const missingMetricNames = getMissingMetricNames(metrics);
  if (missingMetricNames.length > 0) {
    return {
      ok: false,
      reason: `Missing scoring metrics: ${missingMetricNames.join(', ')}`,
      scores: null,
      rawBand: null,
      roundedBand: null,
    };
  }

  const scores = buildCriterionScores(partNumber, metrics);
  const rawBand = getRawBand(scores);

  return {
    ok: true,
    reason: null,
    scores,
    rawBand,
    roundedBand: roundToHalf(rawBand),
  };
}

export function getRequiredScoringMetricNames() {
  return [...REQUIRED_METRIC_NAMES];
}
