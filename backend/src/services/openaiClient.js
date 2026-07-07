import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

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

export async function transcribeAudioFile({ filePath, model, language }) {
  const buffer = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buffer]), basename(filePath));
  form.append('model', model);
  form.append('response_format', 'text');
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

  return (await response.text()).trim();
}

export async function createJsonChatCompletion({ model, messages, temperature = 0 }) {
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
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || content.trim().length === 0) {
    throw new Error('OpenAI feedback returned an empty response');
  }

  return JSON.parse(content);
}
