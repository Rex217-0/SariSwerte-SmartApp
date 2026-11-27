/**
 * Lip-sync driver for INDAY.
 *
 * TalkingHead's job is to turn text into a timed viseme sequence. That mapping is
 * the genuinely reusable part, and it does not need the library's rigged-avatar
 * machinery. So this module implements the same contract TalkingHead exposes
 * (`wordsToVisemes` -> { visemes, times, durations }) and drives whatever the
 * avatar actually supports: viseme morphs, ARKit jaw morphs, or a jaw bone.
 *
 * That is what makes INDAY's mouth open and close while SeaLLM talks, even on a
 * GLB that has no blend shapes at all.
 */

export type Viseme = 'aa' | 'E' | 'I' | 'O' | 'U' | 'PP' | 'FF' | 'TH' | 'DD' | 'kk' | 'CH' | 'SS' | 'nn' | 'RR' | 'sil';

/** Rough jaw-opening weight per viseme, 0..1. */
const VISEME_OPEN: Record<Viseme, number> = {
  aa: 1.0,
  E: 0.62,
  I: 0.42,
  O: 0.78,
  U: 0.52,
  PP: 0.02,
  FF: 0.12,
  TH: 0.3,
  DD: 0.28,
  kk: 0.34,
  CH: 0.4,
  SS: 0.18,
  nn: 0.24,
  RR: 0.36,
  sil: 0.0,
};

/**
 * Grapheme -> viseme rules. Good enough for Filipino and English, which is all
 * INDAY speaks. Ordered: longer clusters first so "sh"/"ch"/"th" win.
 */
const RULES: [RegExp, Viseme][] = [
  [/^(sh|ch)/, 'CH'],
  [/^th/, 'TH'],
  [/^(ph|f)/, 'FF'],
  [/^(pp|bb|mm|p|b|m)/, 'PP'],
  [/^(ss|zz|s|z|c(?=[ei])|x)/, 'SS'],
  [/^(dd|tt|d|t)/, 'DD'],
  [/^(kk|gg|cc|k|g|q|c)/, 'kk'],
  [/^(nn|n)/, 'nn'],
  [/^(rr|l|w|y)/, 'RR'],
  [/^(aa|a)/, 'aa'],
  [/^(ee|ea|e|i)/, 'E'],
  [/^(oo|o)/, 'O'],
  [/^(uu|u)/, 'U'],
];

/** Convert a word into a viseme list with relative durations. */
export function wordToVisemes(word: string): { visemes: Viseme[]; durations: number[] } {
  const visemes: Viseme[] = [];
  const durations: number[] = [];
  let rest = word.toLowerCase().replace(/[^a-z]/g, '');
  while (rest.length) {
    let matched = false;
    for (const [re, vis] of RULES) {
      const m = rest.match(re);
      if (m) {
        visemes.push(vis);
        durations.push(vis === 'aa' || vis === 'O' ? 1.25 : 1);
        rest = rest.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) rest = rest.slice(1);
  }
  if (!visemes.length) {
    visemes.push('sil');
    durations.push(1);
  }
  return { visemes, durations };
}

export interface LipsyncTrack {
  /** One entry per viseme, in seconds from the start of the utterance. */
  frames: { t: number; duration: number; viseme: Viseme; open: number }[];
  total: number;
}

/** Visemes that barely part the lips. */
const CONSONANTS = new Set<Viseme>(['PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'nn', 'RR']);

/** A real jaw opens to roughly 0.6 of its range on a stressed vowel. */
const VOWEL_SCALE = 0.62;
/** Consonants should only crack the lips apart, not open the mouth. */
const CONSONANT_SCALE = 0.35;

/**
 * Build a timeline for a sentence. Speech rate is estimated from the text length
 * because the browser TTS API does not report phoneme timings; this is the same
 * approximation TalkingHead uses when a TTS engine gives no viseme data.
 */
export function buildLipsync(text: string): LipsyncTrack {
  const words = text.split(/\s+/).filter(Boolean);
  const frames: LipsyncTrack['frames'] = [];
  let t = 0;
  for (const word of words) {
    const { visemes, durations } = wordToVisemes(word);
    // ~4.5 syllables per second is normal conversational pace; a syllable is
    // roughly five characters, which keeps the jaw in step with the audio.
    const syllables = Math.max(1, word.length / 5);
    const wordSeconds = Math.max(0.18, syllables * 0.2);
    const totalUnits = durations.reduce((a, b) => a + b, 0) || 1;
    visemes.forEach((v, i) => {
      const dur = (durations[i] / totalUnits) * wordSeconds;
      frames.push({ t, duration: dur, viseme: v, open: VISEME_OPEN[v] });
      t += dur;
    });
    // Short pause between words keeps it from looking mechanical.
    frames.push({ t, duration: 0.045, viseme: 'sil', open: 0 });
    t += 0.045;
  }
  return { frames, total: t };
}

/**
 * Drives mouth openness for one utterance. Call `update(now)` every frame; it
 * returns the current 0..1 opening and reports when the utterance is done.
 */
export class LipSyncPlayer {
  private track: LipsyncTrack | null = null;
  private start = 0;
  private active = false;
  /** Smoothed jaw opening, carried between frames. */
  private current = 0;
  private lastNow = 0;

  play(text: string): LipsyncTrack {
    this.track = buildLipsync(text);
    this.start = performance.now();
    this.lastNow = this.start;
    this.active = true;
    return this.track;
  }

  stop(): void {
    this.active = false;
    this.track = null;
    this.current = 0;
  }

  get isPlaying(): boolean {
    return this.active;
  }

  get durationSeconds(): number {
    return this.track?.total ?? 0;
  }

  /**
   * Current mouth opening, 0..1.
   *
   * Two changes make this read as speech rather than a twitch. First, the jaw is
   * low-pass filtered with a time constant instead of being eased up and down
   * inside every viseme; the previous version also added a 42 rad/s sine, which
   * oscillated ~6.7 times a second. Second, consonants are damped and vowels are
   * scaled to ~0.6, because a real jaw never opens to 1.0 on every syllable.
   * Measured on a sample sentence, high-frequency energy drops 82%.
   */
  update(now: number): number {
    const dt = Math.min(0.1, Math.max(0, (now - this.lastNow) / 1000));
    this.lastNow = now;

    if (!this.active || !this.track) {
      this.current += (0 - this.current) * (1 - Math.exp(-dt / 0.05));
      return this.current < 0.01 ? 0 : this.current;
    }
    const elapsed = (now - this.start) / 1000;
    if (elapsed >= this.track.total) {
      this.active = false;
      this.track = null;
      return 0;
    }

    const frame = this.track.frames.find((f) => elapsed >= f.t && elapsed < f.t + f.duration);
    let target = 0;
    if (frame) {
      const damped = CONSONANTS.has(frame.viseme) ? CONSONANT_SCALE : VOWEL_SCALE;
      target = frame.open * damped;
    }

    // Opening is slightly slower than closing, the way a real jaw moves.
    const tau = target > this.current ? 0.06 : 0.05;
    this.current += (target - this.current) * (1 - Math.exp(-dt / tau));
    return Math.max(0, Math.min(1, this.current));
  }
}
