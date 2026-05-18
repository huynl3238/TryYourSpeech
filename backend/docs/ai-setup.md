# AI setup

Backend MVP uses two AI providers:

- OpenAI for transcription and IELTS-style grammar, vocabulary, fluency/coherence feedback.
- Azure AI Speech for pronunciation assessment and word/phoneme-level pronunciation detail.

## Required environment variables

Set these values in `backend/.env`:

```env
OPENAI_API_KEY=
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=
```

Do not commit real API keys.

## Optional environment variables

These values already have local defaults:

```env
OPENAI_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe
OPENAI_FEEDBACK_MODEL=gpt-4.1-mini
AZURE_SPEECH_LANGUAGE=en-US
```

Keep `AZURE_SPEECH_LANGUAGE=en-US` for IELTS Speaking unless there is a specific reason to assess another English locale.

## Verify setup

Start the backend and call:

```text
GET /api/health
```

The response includes:

```json
{
  "services": {
    "ai": {
      "ok": true,
      "provider": {
        "transcription": "openai",
        "pronunciation": "azure",
        "feedback": "openai"
      },
      "configured": [
        "OPENAI_API_KEY",
        "AZURE_SPEECH_KEY",
        "AZURE_SPEECH_REGION"
      ],
      "missing": []
    }
  }
}
```

The health endpoint reports config names only. It never returns secret values.
