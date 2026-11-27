/**
 * The SeaLLM brain.
 *
 * INDAY's intelligence comes from the operator's own SeaLLM model
 * (Rexmay/SeaLLM-7B-v2-gguf-bucket) running on Kaggle, exposed through a
 * Cloudflare tunnel that speaks the OpenAI chat-completions API:
 *
 *   POST {baseUrl}/v1/chat/completions
 *   Authorization: Bearer {token}   (optional)
 *
 * No Gemini, no Google AI Studio, no Convai, no hosted avatar service.
 *
 * The tunnel URL changes every time the Kaggle session restarts, so it is read
 * from the URL (?brain=...) or localStorage at runtime instead of being baked in.
 * When it is unset or unreachable the app reports BRAIN OFFLINE — it never
 * fabricates a reply.
 */

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
export const DEFAULT_MODEL = 'SeaLLM-7B-v2';

export const INDAY_SYSTEM_PROMPT = [
  'You are INDAY, the friendly store assistant of SariSwerte, a modern sari-sari store in the Philippines.',
  'You speak warmly and briefly, mixing Filipino and English the way a real tindera does.',
  'You know the store stocks: Century Tuna, Lucky Me, Piattos, Nova, Skyflakes, Coke, Sprite, pandesal (tinapay), eggs, and 5kg Sinandomeng rice.',
  'The store accepts cash, GCash and Maya. Keep answers under 60 words so the 3D avatar can speak them naturally.',
  'Never invent prices you were not given. If you do not know, say so and offer to check.',
].join(' ');

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
    const res = await fetch(`${cfg.baseUrl}/v1/models`, {
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
  timeoutMs = 60000,
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
        ...(cfg.token ? { Authorization: `Bearer ${cfg.token}` } : {}),
      },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.7,
        max_tokens: 220,
        messages: [
          { role: 'system', content: INDAY_SYSTEM_PROMPT },
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
      `Cannot reach the SeaLLM tunnel at ${cfg.baseUrl}. Is the Kaggle notebook running and the Cloudflare tunnel open? (${(err as Error).message})`,
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
