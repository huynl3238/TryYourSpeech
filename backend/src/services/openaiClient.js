import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';

const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

function getBaseUrl() {
  const value = process.env.OPENAI_BASE_URL;
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim().replace(/\/$/, '');
  }

  return DEFAULT_BASE_URL;
}

function getApiKey() {
  const value = process.env.OPENAI_API_KEY;
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('OPENAI_API_KEY is required');
  }

  return value.trim();
}

async function readErrorDetail(response) {
  try {
    return (await response.text()).slice(0, 500);
  } catch {
    return '';
  }
}

function getAudioContentType(filePath) {
  const extension = extname(filePath).toLowerCase();
  const contentTypes = {
    '.wav': 'audio/wav',
    '.webm': 'audio/webm',
    '.mp4': 'audio/mp4',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.mp3': 'audio/mpeg',
  };

  return contentTypes[extension] || 'application/octet-stream';
}

export async function transcribeAudioFile({ filePath, model, language }) {
  const buffer = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: getAudioContentType(filePath) }), basename(filePath));
  form.append('model', model);
  form.append('response_format', 'json');
  if (language) {
    form.append('language', language);
  }

  const response = await fetch(`${getBaseUrl()}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getApiKey()}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`OpenAI transcription failed (${response.status}): ${await readErrorDetail(response)}`);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('OpenAI transcription returned invalid JSON');
  }

  if (typeof data?.text !== 'string' || data.text.trim().length === 0) {
    throw new Error('OpenAI transcription returned no transcript');
  }

  return data.text.trim();
}

// `onUsage` is optional and receives the token counts OpenAI billed for this
// call. It is a callback rather than part of the return value so existing
// callers (and the eval scripts) keep working unchanged.
export async function createJsonChatCompletion({ model, messages, temperature = 0, onUsage }) {
  const response = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${getApiKey()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI feedback failed (${response.status}): ${await readErrorDetail(response)}`);
  }

  const data = await response.json();

  // Reported before the content check on purpose: a reply that fails to parse
  // was still billed, so it has to land in the cost total.
  if (typeof onUsage === 'function') {
    onUsage({
      model: data?.model || model,
      inputTokens: data?.usage?.prompt_tokens ?? 0,
      outputTokens: data?.usage?.completion_tokens ?? 0,
    });
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('OpenAI feedback returned an empty response');
  }

  return JSON.parse(content);
}
