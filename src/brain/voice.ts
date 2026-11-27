/**
 * INDAY's voice.
 *
 * edge-tts is free, needs no key and no account, so nothing billable and
 * nothing secret is involved. The browser cannot reach Microsoft's speech
 * endpoint directly, so audio comes from the notebook's /tts proxy.
 *
 * When no tunnel is configured we fall back to the browser's own
 * speechSynthesis, which always exists. INDAY should never go silent.
 */

export type VoiceProvider = 'browser' | 'edge';

export interface VoiceConfig {
  provider: VoiceProvider;
  /** Notebook tunnel base URL; audio comes from `${baseUrl}/tts`. */
  baseUrl: string;
  /** edge-tts voice name, forwarded to the proxy. */
  referenceId: string;
  format: 'mp3' | 'wav';
}

const STORAGE_KEY = 'sariswerte.voice';

export const DEFAULT_VOICE: VoiceConfig = {
  provider: 'browser',
  baseUrl: '',
  // Filipino female, friendly and positive. Closest free match to INDAY.
  referenceId: 'fil-PH-BlessicaNeural',
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
    provider: cfg.baseUrl.trim() ? (saved.provider ?? 'edge') : 'browser',
  };
}

export function saveVoiceConfig(cfg: VoiceConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}

export function isEdgeConfigured(cfg: VoiceConfig): boolean {
  return cfg.provider === 'edge' && Boolean(cfg.baseUrl);
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

async function edgeAudio(text: string, cfg: VoiceConfig, timeoutMs: number): Promise<Blob> {
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
  /** Set when edge-tts was configured but failed, so the HUD can show why. */
  fellBackReason?: string;
}

/**
 * Speak a line. Tries edge-tts when configured, always resolves, and reports
 * which provider actually produced audio so the UI never lies about it.
 */
export async function speakWithVoice(
  text: string,
  cfg: VoiceConfig,
  opts: { timeoutMs?: number } = {},
): Promise<SpeakResult> {
  if (!isEdgeConfigured(cfg)) {
    await speakWithBrowser(text);
    return { used: 'browser' };
  }
  try {
    const blob = await edgeAudio(text, cfg, opts.timeoutMs ?? 30000);
    await playBlob(blob);
    return { used: 'edge' };
  } catch (err) {
    await speakWithBrowser(text);
    return { used: 'browser', fellBackReason: (err as Error).message };
  }
}
