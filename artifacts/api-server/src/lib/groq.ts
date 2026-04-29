import Groq from "groq-sdk";
import { logger } from "./logger";

const apiKey = process.env["GROQ_API_KEY"];

if (!apiKey) {
  logger.warn(
    "GROQ_API_KEY not set — agent will run with deterministic fallback only.",
  );
}

export const groq = apiKey ? new Groq({ apiKey }) : null;

export const GROQ_MODEL = process.env["GROQ_MODEL"] ?? "gemma2-9b-it";

export function isGroqEnabled(): boolean {
  return groq !== null;
}

interface ChatCallOptions {
  system: string;
  user: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

export async function callGroq({
  system,
  user,
  temperature = 0.2,
  maxTokens = 1024,
  jsonMode = false,
}: ChatCallOptions): Promise<string> {
  if (!groq) {
    throw new Error("GROQ_API_KEY is not configured");
  }

  const response = await groq.chat.completions.create({
    model: GROQ_MODEL,
    temperature,
    max_tokens: maxTokens,
    ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

/**
 * Try to extract a JSON object from an arbitrary LLM response.
 * Returns null if no JSON could be parsed.
 */
export function safeParseJson<T = unknown>(raw: string): T | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  const tryParse = (s: string): T | null => {
    try {
      return JSON.parse(s) as T;
    } catch {
      return null;
    }
  };

  const direct = tryParse(trimmed);
  if (direct) return direct;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced && fenced[1]) {
    const inFence = tryParse(fenced[1].trim());
    if (inFence) return inFence;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const slice = trimmed.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(slice);
    if (parsed) return parsed;
  }

  return null;
}
