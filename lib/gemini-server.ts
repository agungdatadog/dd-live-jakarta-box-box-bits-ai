import { GoogleGenAI } from '@google/genai';

let _client: GoogleGenAI | null = null;

export function getServerGeminiClient(): GoogleGenAI {
  if (_client) return _client;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not set. Add it to .env.local for local dev ' +
      'or to the Cloud Run service environment variables for production.'
    );
  }

  _client = new GoogleGenAI({ apiKey });
  return _client;
}
