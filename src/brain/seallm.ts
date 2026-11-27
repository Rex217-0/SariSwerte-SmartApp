/**
 * The SeaLLM brain.
 *
 * INDAY's intelligence comes from the operator's own SeaLLM model
 * (Rexmay/SeaLLM-7B-v2-gguf-bucket) served by the standalone notebook in
 * `seallm/`, exposed through a Cloudflare tunnel that speaks the OpenAI
 * chat-completions API:
 *
 *   POST {baseUrl}/v1/chat/completions
 *   Authorization: Bearer {token}   (optional)
 *
 * The persona, voice metadata and story blocks come from the operator's own
 * Convai avatar; only the language model is SeaLLM.
 *
 * The tunnel URL changes every time the Kaggle session restarts, so it is read
 * from the URL (?brain=...) or localStorage at runtime instead of being baked in.
 * When it is unset or unreachable the app reports BRAIN OFFLINE — it never
 * fabricates a reply.
 */

import { INDAY_IDENTITY, OPENING_BLOCK, blockByNumber } from '../inday/convai/inday-story';

export interface BrainConfig {
  baseUrl: string;
  model: string;
  token: string;
}

export interface BrainReply {
  text: string;
  source: 'seallm';
  latencyMs: number;
  model: string;
}

export class BrainOfflineError extends Error {
  readonly code = 'BRAIN_OFFLINE';
  constructor(message: string) {
    super(message);
    this.name = 'BrainOfflineError';
  }
}

const STORAGE_KEY = 'sariswerte.brain';
export const DEFAULT_MODEL = 'SeaLLM-7B-v2-q4_0';

/**
 * INDAY's persona is not written here: it is the operator's own Convai avatar.
 * The objective text of each story block is the exact prompt Convai sends, so
 * the SeaLLM prompt is assembled from those blocks rather than paraphrased.
 */
export function systemPromptFor(blockNumber?: number): string {
  const block = blockNumber ? blockByNumber(blockNumber) : OPENING_BLOCK;
  const lines = [
    block ? block.objective : '',
    `Personality (Convai traits, 1-5): ${Object.entries(INDAY_IDENTITY.traits.personality_traits)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ')}.`,
    'You are INDAY of SariSwerte sari-sari store. Store stocks: Century Tuna, Lucky Me, Piattos, Nova, Skyflakes, Coke, Sprite, pandesal (tinapay), eggs, and 5kg Sinandomeng rice.',
    'The store accepts cash, GCash and Maya. Never invent prices. Keep replies short enough to speak aloud.',
  ];
  return lines.filter(Boolean).join(' ');
}

/** Backwards-compatible name: the opening block's prompt. */
export const INDAY_SYSTEM_PROMPT = systemPromptFor();

export function loadBrainConfig(): BrainConfig {
  const params = new URLSearchParams(window.location.search);
  let saved: Partial<BrainConfig> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    saved = {};
  }
  return {
    baseUrl: (params.get('brain') || saved.baseUrl || '').replace(/\/+$/, ''),
    model: params.get('model') || saved.model || DEFAULT_MODEL,
    token: params.get('token') || saved.token || '',
  };
}

export function saveBrainConfig(cfg: BrainConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function isBrainConfigured(cfg: BrainConfig): boolean {
  return /^https?:\/\//i.test(cfg.baseUrl);
}

/** Quick liveness probe so the HUD can show ONLINE/OFFLINE before the first chat. */
export async function probeBrain(cfg: BrainConfig, timeoutMs = 8000): Promise<boolean> {
  if (!isBrainConfigured(cfg)) return false;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl}/health`, {
      headers: cfg.token ? { Authorization: `Bearer ${cfg.token}` } : undefined,
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function askSeaLLM(
  cfg: BrainConfig,
  message: string,
  history: { role: 'user' | 'assistant'; content: string }[] = [],
  timeoutMs = 180000,
  blockNumber?: number,
): Promise<BrainReply> {
  if (!isBrainConfigured(cfg)) {
    throw new BrainOfflineError(
      'No SeaLLM tunnel is configured. Open Brain settings and paste your Cloudflare tunnel URL (e.g. https://xxxx.trycloudflare.com).',
    );
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const started = performance.now();

  try {
    const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token
          ? { Authorization: `Bearer ${cfg.token}`, 'X-Seller-Token': cfg.token }
          : {}),
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.7,
        max_tokens: 160,
        story_block: blockNumber ?? 1,
        messages: [
          { role: 'system', content: systemPromptFor(blockNumber) },
          ...history.slice(-6),
          { role: 'user', content: message },
        ],
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new BrainOfflineError(
        `SeaLLM returned HTTP ${res.status}. ${detail.slice(0, 180) || 'Check that the Kaggle notebook is running and the tunnel is public.'}`,
      );
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      model?: string;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) throw new BrainOfflineError('SeaLLM replied with an empty message.');

    return {
      text,
      source: 'seallm',
      latencyMs: Math.round(performance.now() - started),
      model: data.model || cfg.model,
    };
  } catch (err) {
    if (err instanceof BrainOfflineError) throw err;
    if ((err as Error).name === 'AbortError') {
      throw new BrainOfflineError(`SeaLLM timed out after ${Math.round(timeoutMs / 1000)}s. The Kaggle GPU may be cold-starting.`);
    }
    throw new BrainOfflineError(
      `Cannot reach the SeaLLM tunnel at ${cfg.baseUrl}. Is the SeaLLM notebook running and the Cloudflare tunnel open? (${(err as Error).message})`,
    );
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Speech out. The browser's own speechSynthesis is free and needs no key, which
 * keeps the "libre lang, walang bayad" rule. Returns when speech ends.
 */
export function speak(text: string, opts: { rate?: number; pitch?: number; lang?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      resolve();
      return;
    }
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = opts.rate ?? 0.98;
    u.pitch = opts.pitch ?? 1.06;
    u.lang = opts.lang ?? 'fil-PH';

    // Prefer a Filipino or English voice when the device has one.
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /fil|tl|ph/i.test(v.lang)) ||
      voices.find((v) => /en-PH|en-GB|en-US/i.test(v.lang));
    if (preferred) u.voice = preferred;

    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
