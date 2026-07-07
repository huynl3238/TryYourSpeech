import { createJsonChatCompletion } from './openaiClient.js';

// Condensed public IELTS Speaking band descriptors for the three criteria the LLM
// grades. Pronunciation is graded separately from Azure acoustic data, so it is
// intentionally excluded here. These anchors keep the model's judgement aligned
// with the official rubric an IELTS examiner would defend.
const BAND_DESCRIPTORS = `
Fluency and Coherence (FC):
- Band 8: speaks fluently with only occasional repetition/self-correction; hesitation is content-related; develops topics coherently and appropriately.
- Band 7: speaks at length without noticeable effort; some hesitation, repetition or self-correction; uses a range of connectives and discourse markers flexibly.
- Band 6: willing to speak at length though may lose coherence at times due to repetition, self-correction or hesitation; uses a range of connectives but not always appropriately.
- Band 5: usually maintains flow but uses repetition, self-correction and/or slow speech to keep going; overuses certain connectives; some breakdowns in coherence.
- Band 4: cannot respond without noticeable pauses; speech may be slow with frequent repetition and self-correction; links only basic sentences.

Lexical Resource (LR):
- Band 8: wide vocabulary to convey precise meaning; uses less common and idiomatic vocabulary skilfully; effective paraphrase.
- Band 7: uses vocabulary flexibly to discuss a variety of topics; uses some less common and idiomatic vocabulary with some awareness of style/collocation; effective paraphrase.
- Band 6: has enough vocabulary to discuss topics at length and make meaning clear despite inappropriacies; generally paraphrases successfully.
- Band 5: manages to talk about familiar and unfamiliar topics but uses vocabulary with limited flexibility; attempts paraphrase with mixed success.
- Band 4: able to talk about familiar topics but conveys only basic meaning on unfamiliar ones; frequent errors in word choice; rarely paraphrases.

Grammatical Range and Accuracy (GRA):
- Band 8: wide range of structures flexibly; majority of sentences error-free; only occasional inappropriacies or non-systematic errors.
- Band 7: range of complex structures with some flexibility; frequent error-free sentences though some grammatical mistakes persist.
- Band 6: mix of simple and complex structures with limited flexibility; may make frequent mistakes with complex structures, though these rarely cause comprehension problems.
- Band 5: produces basic sentence forms with reasonable accuracy; limited range of complex structures, usually containing errors and causing some comprehension problems.
- Band 4: produces basic sentence forms and some short utterances; subordinate clauses are rare; errors are frequent and can lead to misunderstanding.
`.trim();

const VALID_BANDS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9];

const CRITERIA = [
  { key: 'fluencyCoherence', score: 'fluency' },
  { key: 'lexicalResource', score: 'lexical' },
  { key: 'grammaticalRangeAccuracy', score: 'grammar' },
];

function clampBand(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  const rounded = Math.round(value * 2) / 2;
  if (rounded < 4) {
    return 4;
  }

  if (rounded > 9) {
    return 9;
  }

  return rounded;
}

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function asStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(asText).filter((item) => item.length > 0);
}

function normalizeCriterion(rawCriterion) {
  const criterion = rawCriterion && typeof rawCriterion === 'object' ? rawCriterion : {};

  return {
    band: clampBand(criterion.band),
    evidence: asText(criterion.evidence),
    feedback: asText(criterion.feedback),
  };
}

// Turns the raw LLM JSON into a validated, predictable shape. Exported so it can be
// unit-tested without hitting the network.
export function normalizeFeedbackResponse(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const criteria = {};
  const scores = {};

  for (const { key, score } of CRITERIA) {
    const normalized = normalizeCriterion(source[key]);
    criteria[key] = normalized;
    scores[score] = normalized.band;
  }

  const overall = source.overall && typeof source.overall === 'object' ? source.overall : {};

  return {
    scores,
    criteria,
    overall: {
      summary: asText(overall.summary),
      strengths: asStringList(overall.strengths),
      improvements: asStringList(overall.improvements),
    },
  };
}

function buildPeerNotesText(peerNotes) {
  if (!Array.isArray(peerNotes) || peerNotes.length === 0) {
    return 'None provided.';
  }

  return peerNotes
    .map((note) => {
      const seconds = Number.isFinite(note?.timestampMs) ? (note.timestampMs / 1000).toFixed(1) : '?';
      const type = note?.errorType || 'note';
      const text = asText(note?.noteText);
      return `- [${seconds}s] ${type}${text ? `: ${text}` : ''}`;
    })
    .join('\n');
}

function buildPronunciationContext(pronunciation) {
  if (!pronunciation) {
    return 'Not available.';
  }

  const parts = [
    ['overall', pronunciation.pronunciationScore],
    ['accuracy', pronunciation.accuracyScore],
    ['fluency', pronunciation.fluencyScore],
    ['prosody', pronunciation.prosodyScore],
  ]
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .map(([label, value]) => `${label}=${value}`);

  return parts.length > 0 ? parts.join(', ') : 'Not available.';
}

function buildMessages({ turn, transcript, pronunciation }) {
  const cueCard = asText(turn?.cue_card);
  const systemPrompt = [
    'You are a certified IELTS Speaking examiner. Grade a single spoken answer against the official band descriptors.',
    'Grade only Fluency & Coherence, Lexical Resource, and Grammatical Range & Accuracy. Do NOT grade pronunciation (assessed separately).',
    'Judge holistically against the descriptors below — do not count features mechanically. Bands range 4.0 to 9.0 in 0.5 steps.',
    'Base every judgement strictly on the transcript provided. Be fair but rigorous, as a real examiner would be.',
    'Respond ONLY with JSON matching exactly this shape:',
    '{"fluencyCoherence":{"band":number,"evidence":string,"feedback":string},',
    '"lexicalResource":{"band":number,"evidence":string,"feedback":string},',
    '"grammaticalRangeAccuracy":{"band":number,"evidence":string,"feedback":string},',
    '"overall":{"summary":string,"strengths":[string],"improvements":[string]}}',
    'Write "feedback", "summary", "strengths" and "improvements" in Vietnamese so the learner can understand. Keep "evidence" as short quotes from the transcript.',
    '',
    'Official band descriptors:',
    BAND_DESCRIPTORS,
  ].join('\n');

  const userPrompt = [
    `IELTS Speaking Part ${turn?.part_number ?? '?'}.`,
    `Question: ${asText(turn?.question_text) || 'N/A'}`,
    cueCard ? `Cue card: ${cueCard}` : null,
    '',
    'Candidate transcript:',
    asText(transcript) || '(empty)',
    '',
    `Acoustic pronunciation reference (context only, do not grade): ${buildPronunciationContext(pronunciation)}`,
    '',
    'Listener (peer) notes captured live:',
    buildPeerNotesText(turn?.peer_notes),
  ]
    .filter((line) => line !== null)
    .join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

export async function generateSpeakingFeedback({ turn, transcript, pronunciation, model }) {
  const messages = buildMessages({ turn, transcript, pronunciation });
  const raw = await createJsonChatCompletion({ model, messages });

  return normalizeFeedbackResponse(raw);
}

export { VALID_BANDS };
