import { createRequire } from 'node:module';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAiRuntimeConfig } from '../config/ai.js';
import { convertWebmToWav } from './audioConversion.js';

const require = createRequire(import.meta.url);
const speechSdk = require('microsoft-cognitiveservices-speech-sdk');

const continuousModeMinimumDurationMs = 30000;
const uploadsDirectory = fileURLToPath(new URL('../../uploads', import.meta.url));
const tempDirectory = join(uploadsDirectory, 'tmp');

function getRequiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function isSafeUploadPath(filePath) {
  const normalizedUploads = normalize(uploadsDirectory);
  const normalizedFilePath = normalize(filePath);

  return normalizedFilePath.startsWith(normalizedUploads);
}

function resolveAudioPath(audioUrl) {
  if (typeof audioUrl !== 'string' || !audioUrl.startsWith('/uploads/audio/')) {
    throw new Error('audioUrl is invalid');
  }

  const filePath = join(uploadsDirectory, audioUrl.replace('/uploads/', ''));
  if (!isSafeUploadPath(filePath)) {
    throw new Error('audioUrl is invalid');
  }

  return filePath;
}

async function prepareWavAudio(audioPath) {
  if (extname(audioPath).toLowerCase() === '.wav') {
    return { wavPath: audioPath, shouldDelete: false };
  }

  await mkdir(tempDirectory, { recursive: true });
  const wavPath = join(tempDirectory, `azure-${randomUUID()}.wav`);
  await convertWebmToWav(audioPath, wavPath);

  return { wavPath, shouldDelete: true };
}

function createSpeechConfig() {
  const speechConfig = speechSdk.SpeechConfig.fromSubscription(
    getRequiredEnv('AZURE_SPEECH_KEY'),
    getRequiredEnv('AZURE_SPEECH_REGION')
  );
  const runtimeConfig = getAiRuntimeConfig();
  speechConfig.speechRecognitionLanguage = runtimeConfig.azureSpeechLanguage;

  return speechConfig;
}

async function createRecognizer(wavPath) {
  const audioBuffer = await readFile(wavPath);
  const audioConfig = speechSdk.AudioConfig.fromWavFileInput(audioBuffer);

  return new speechSdk.SpeechRecognizer(createSpeechConfig(), audioConfig);
}

function createPronunciationConfig(referenceText) {
  const config = new speechSdk.PronunciationAssessmentConfig(
    referenceText || '',
    speechSdk.PronunciationAssessmentGradingSystem.HundredMark,
    speechSdk.PronunciationAssessmentGranularity.Phoneme,
    false
  );
  const runtimeConfig = getAiRuntimeConfig();

  if (
    runtimeConfig.azureSpeechLanguage === 'en-US' &&
    typeof config.enableProsodyAssessment === 'function'
  ) {
    config.enableProsodyAssessment();
  }

  return config;
}

function recognizeOnce(recognizer) {
  return new Promise((resolve, reject) => {
    recognizer.recognizeOnceAsync(resolve, reject);
  });
}

function startContinuousRecognition(recognizer) {
  return new Promise((resolve, reject) => {
    recognizer.startContinuousRecognitionAsync(resolve, reject);
  });
}

function stopContinuousRecognition(recognizer) {
  return new Promise((resolve, reject) => {
    recognizer.stopContinuousRecognitionAsync(resolve, reject);
  });
}

function getJsonResult(result) {
  const jsonText = result.properties.getProperty(
    speechSdk.PropertyId.SpeechServiceResponse_JsonResult
  );

  if (!jsonText) {
    return null;
  }

  return JSON.parse(jsonText);
}

async function assessWithRecognizeOnce(recognizer) {
  const result = await recognizeOnce(recognizer);
  return [getJsonResult(result)].filter(Boolean);
}

async function assessWithContinuousRecognition(recognizer) {
  const jsonResults = [];

  recognizer.recognized = (_sender, event) => {
    const jsonResult = getJsonResult(event.result);
    if (jsonResult) {
      jsonResults.push(jsonResult);
    }
  };

  return new Promise((resolve, reject) => {
    recognizer.canceled = async (_sender, event) => {
      try {
        await stopContinuousRecognition(recognizer);
      } catch {
        // The recognizer may already be stopped after cancellation.
      }

      reject(new Error(event.errorDetails || 'Azure pronunciation assessment was canceled'));
    };

    recognizer.sessionStopped = async () => {
      try {
        await stopContinuousRecognition(recognizer);
        resolve(jsonResults);
      } catch (err) {
        reject(err);
      }
    };

    startContinuousRecognition(recognizer).catch(reject);
  });
}

function getBestResult(jsonResult) {
  return jsonResult?.NBest?.[0] || null;
}

function getAssessment(jsonResult) {
  return getBestResult(jsonResult)?.PronunciationAssessment || {};
}

function getWords(jsonResult) {
  return getBestResult(jsonResult)?.Words || [];
}

function getWordWeight(jsonResult) {
  const wordCount = getWords(jsonResult).length;
  return wordCount > 0 ? wordCount : 1;
}

function getWeightedAverage(jsonResults, scoreName) {
  let total = 0;
  let weightTotal = 0;

  for (const jsonResult of jsonResults) {
    const score = getAssessment(jsonResult)[scoreName];
    if (typeof score !== 'number') {
      continue;
    }

    const weight = getWordWeight(jsonResult);
    total += score * weight;
    weightTotal += weight;
  }

  if (weightTotal === 0) {
    return null;
  }

  return Math.round((total / weightTotal) * 10) / 10;
}

function mapWord(word) {
  const assessment = word.PronunciationAssessment || {};

  return {
    word: word.Word,
    offset: word.Offset,
    duration: word.Duration,
    accuracyScore: assessment.AccuracyScore ?? null,
    errorType: assessment.ErrorType || null,
    syllables: word.Syllables || [],
    phonemes: word.Phonemes || [],
  };
}

export function summarizePronunciationResults(jsonResults) {
  const validResults = jsonResults.filter((jsonResult) => getBestResult(jsonResult));
  const words = validResults.flatMap((jsonResult) => getWords(jsonResult).map(mapWord));
  const recognizedText = validResults
    .map((jsonResult) => jsonResult.DisplayText || jsonResult.RecognitionStatus || '')
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    pronunciationScore: getWeightedAverage(validResults, 'PronScore'),
    accuracyScore: getWeightedAverage(validResults, 'AccuracyScore'),
    fluencyScore: getWeightedAverage(validResults, 'FluencyScore'),
    prosodyScore: getWeightedAverage(validResults, 'ProsodyScore'),
    detail: words,
    raw: validResults,
    recognizedText,
  };
}

export function shouldUseContinuousMode(durationMs) {
  return Number.isFinite(durationMs) && durationMs >= continuousModeMinimumDurationMs;
}

export async function assessAzurePronunciation({ audioUrl, durationMs, referenceText }) {
  const audioPath = resolveAudioPath(audioUrl);
  const { wavPath, shouldDelete } = await prepareWavAudio(audioPath);
  const recognizer = await createRecognizer(wavPath);
  const pronunciationConfig = createPronunciationConfig(referenceText);

  try {
    pronunciationConfig.applyTo(recognizer);
    const jsonResults = shouldUseContinuousMode(durationMs)
      ? await assessWithContinuousRecognition(recognizer)
      : await assessWithRecognizeOnce(recognizer);

    return summarizePronunciationResults(jsonResults);
  } finally {
    recognizer.close();
    if (shouldDelete) {
      await rm(wavPath, { force: true });
    }
  }
}
