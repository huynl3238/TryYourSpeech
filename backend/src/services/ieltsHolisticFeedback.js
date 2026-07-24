import { createJsonChatCompletion } from './openaiClient.js';
import { BAND_DESCRIPTORS, normalizeFeedbackResponse } from './ieltsSpeakingFeedback.js';

// Holistic (whole-test) IELTS scoring — the counterpart to the per-turn grader in
// ieltsSpeakingFeedback.js. A real examiner scores a candidate's WHOLE performance
// once against the descriptors, not each answer in isolation. Grading short Part 1
// answers individually and averaging systematically under-scores strong speakers;
// this grader takes every answer at once and judges demonstrated ability across the
// entire test. Pronunciation is still assessed acoustically elsewhere (Azure).

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

// Renders all answers grouped by part into a single transcript block for the model.
// `parts` is [{ partNumber, question, cueCard, transcript }] in test order.
function buildPerformanceText(parts) {
  const lines = [];
  let lastPart = null;

  for (const part of parts) {
    if (part.partNumber !== lastPart) {
      lines.push('', `=== Part ${part.partNumber} ===`);
      lastPart = part.partNumber;
    }
    const cueCard = asText(part.cueCard);
    if (cueCard) {
      lines.push(`Cue card: ${cueCard}`);
    } else {
      lines.push(`Examiner: ${asText(part.question) || 'N/A'}`);
    }
    lines.push(`Candidate: ${asText(part.transcript) || '(empty)'}`);
  }

  return lines.join('\n').trim();
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

function buildMessages({ parts, pronunciation }) {
  const systemPrompt = [
    'You are a certified IELTS Speaking examiner scoring a candidate\'s ENTIRE speaking test holistically.',
    'Grade only Fluency & Coherence, Lexical Resource, and Grammatical Range & Accuracy. Do NOT grade pronunciation (assessed separately).',
    'Judge the candidate\'s demonstrated ability across the WHOLE test as a real examiner does — not each answer in isolation, and not by averaging individual answers.',
    'Part 1 answers are naturally brief and Part 3 answers more developed; this is expected. Do not penalise the candidate for short Part 1 responses. Weight the more extended Part 2 and Part 3 answers, where range and complexity actually show, more heavily.',
    'Judge holistically against the descriptors below. Bands range 4.0 to 9.0 in 0.5 steps. Base every judgement strictly on the transcripts provided.',
    'Respond ONLY with JSON matching exactly this shape:',
    '{"fluencyCoherence":{"band":number,"evidence":string,"feedback":string},',
    '"lexicalResource":{"band":number,"evidence":string,"feedback":string},',
    '"grammaticalRangeAccuracy":{"band":number,"evidence":string,"feedback":string},',
    '"overall":{"summary":string,"strengths":[string],"improvements":[string]}}',
    'Write "feedback", "summary", "strengths" and "improvements" in Vietnamese so the learner can understand. Keep "evidence" as short quotes from the transcripts.',
    '',
    'Official band descriptors:',
    BAND_DESCRIPTORS,
  ].join('\n');

  const userPrompt = [
    'Full IELTS Speaking test transcript (all parts):',
    buildPerformanceText(parts),
    '',
    `Acoustic pronunciation reference across the test (context only, do not grade): ${buildPronunciationContext(pronunciation)}`,
  ].join('\n');

  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ];
}

// parts: [{ partNumber, question, cueCard, transcript }] — every answer in the test.
// pronunciation: optional aggregated acoustic scores (context only).
export async function generateHolisticFeedback({ parts, pronunciation, model }) {
  const messages = buildMessages({ parts, pronunciation });
  const raw = await createJsonChatCompletion({ model, messages });

  return normalizeFeedbackResponse(raw);
}
