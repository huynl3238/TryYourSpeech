import { createRequire } from 'node:module';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAiRuntimeConfig } from '../config/ai.js';
import { convertAudioToWav } from './audioConversion.js';

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
  await convertAudioToWav(audioPath, wavPath);

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

  // Request prosody (intonation/stress/rhythm) for any English locale.
  //
  // `enableProsodyAssessment` là một SETTER, không phải hàm — và nó không có
  // getter, nên `typeof config.enableProsodyAssessment` luôn trả về 'undefined'.
  // Bản trước đây canh bằng `typeof ... === 'function'` rồi gọi như một hàm, nên
  // điều kiện KHÔNG BAO GIỜ đúng và prosody chưa từng được bật lần nào. Hậu quả
  // im lặng: Azure luôn trả ProsodyScore = null, khiến azureToPronunciationBand
  // luôn chặn điểm phát âm ở mức 7 — người phát âm tốt thật không bao giờ vượt
  // được, mà người phát âm yếu lại được PronScore (tính thiếu prosody) đẩy lên
  // cao. Đúng hai triệu chứng "band cao chấm thấp, band thấp chấm cao".
  //
  // Gán thẳng là an toàn kể cả với bản SDK không có thuộc tính này: JavaScript
  // chỉ thêm một field vô hại thay vì ném lỗi.
  if (runtimeConfig.azureSpeechLanguage.toLowerCase().startsWith('en')) {
    config.enableProsodyAssessment = true;
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
      // Reaching the end of a finite audio file fires `canceled` with reason
      // EndOfStream — this is the normal terminator, not a failure. Only a genuine
      // Error should reject; otherwise let `sessionStopped` resolve the results.
      if (event.reason !== speechSdk.CancellationReason.Error) {
        return;
      }

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

export async function assessAzurePronunciation({ audioUrl, audioPath, durationMs, referenceText }) {
  const sourcePath = audioPath || resolveAudioPath(audioUrl);
  if (!isSafeUploadPath(sourcePath)) {
    throw new Error('audio path is invalid');
  }

  const { wavPath, shouldDelete } = await prepareWavAudio(sourcePath);
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
