/**
 * INDAY's voice.
 *
 * Boss wants Fish Audio (model s2.1-pro-free) while it is free, falling back to
 * the browser's own speechSynthesis when the quota runs out or no key is set.
 * Fish sends no CORS headers, so the browser cannot call it directly. Audio is
 * fetched from the notebook's /tts proxy, which holds FISH_API_KEY in .env and
 * never sends it to the page.
 *
 * The Fish endpoint shape is configurable because the service is in flux; if a
 * request fails for any reason we degrade to the browser voice rather than
 * leaving INDAY silent.
 */

export type VoiceProvider = 'browser' | 'fish';

export interface VoiceConfig {
  provider: VoiceProvider;
  /** Notebook tunnel base URL; audio comes from `${baseUrl}/tts`. */
  baseUrl: string;
  /** Fish voice id, forwarded to the proxy. */
  referenceId: string;
  format: 'mp3' | 'wav';
}

const STORAGE_KEY = 'sariswerte.voice';

export const DEFAULT_VOICE: VoiceConfig = {
  provider: 'browser',
  baseUrl: '',
  // Fish's own "Masiglang Tagalog": young, cheerful, conversational, tl+en.
  referenceId: 'c9ee32e569964531b5d612b938929098',
  format: 'mp3',
};

export function loadVoiceConfig(): VoiceConfig {
  let saved: Partial<VoiceConfig> = {};
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    saved = {};
  }
  const cfg = { ...DEFAULT_VOICE, ...saved };
  // No tunnel means no proxy, so the browser voice is the only option left.
  return {
    ...cfg,
    baseUrl: cfg.baseUrl.trim(),
    provider: cfg.baseUrl.trim() ? (saved.provider ?? 'fish') : 'browser',
  };
}

export function saveVoiceConfig(cfg: VoiceConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function isFishConfigured(cfg: VoiceConfig): boolean {
  return cfg.provider === 'fish' && Boolean(cfg.baseUrl);
}

/** Browser speechSynthesis. Free, needs no key, always available as a floor. */
export function speakWithBrowser(
  text: string,
  opts: { rate?: number; pitch?: number; lang?: string } = {},
): Promise<void> {
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

async function fishAudio(text: string, cfg: VoiceConfig, timeoutMs: number): Promise<Blob> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, '')}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        text,
        ...(cfg.referenceId ? { voice_id: cfg.referenceId } : {}),
      }),
    });
    if (!res.ok) {
      throw new Error(`TTS ${res.status}: ${(await res.text()).slice(0, 120)}`);
    }
    return await res.blob();
  } finally {
    clearTimeout(timer);
  }
}

let currentAudio: HTMLAudioElement | null = null;

function playBlob(blob: Blob): Promise<void> {
  return new Promise((resolve) => {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    currentAudio = audio;
    const done = () => {
      URL.revokeObjectURL(url);
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(done);
  });
}

export interface SpeakResult {
  used: VoiceProvider;
  /** Set when Fish was configured but failed, so the HUD can show why. */
  fellBackReason?: string;
}

/**
 * Speak a line. Tries Fish when configured, always resolves, and reports which
 * provider actually produced audio so the UI never lies about it.
 */
export async function speakWithVoice(
  text: string,
  cfg: VoiceConfig,
  opts: { timeoutMs?: number } = {},
): Promise<SpeakResult> {
  if (!isFishConfigured(cfg)) {
    await speakWithBrowser(text);
    return { used: 'browser' };
  }
  try {
    const blob = await fishAudio(text, cfg, opts.timeoutMs ?? 30000);
    await playBlob(blob);
    return { used: 'fish' };
  } catch (err) {
    await speakWithBrowser(text);
    return { used: 'browser', fellBackReason: (err as Error).message };
  }
}
