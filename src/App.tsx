import { useCallback, useEffect, useRef, useState } from 'react';
import { Stage } from './scene/Stage';
import type { AvatarCapabilities } from './inday/inday';
import { LipSyncPlayer } from './inday/lipsync';
import {
  askSeaLLM,
  isBrainConfigured,
  loadBrainConfig,
  probeBrain,
  saveBrainConfig,
  BrainOfflineError,
  type BrainConfig,
} from './brain/seallm';
import { answerLocally } from './brain/local';
import {
  loadVoiceConfig,
  saveVoiceConfig,
  speakWithVoice,
  isEdgeConfigured,
  type VoiceConfig,
} from './brain/voice';
import {
  START_BLOCK_NUMBER,
  STORY_BLOCK_COUNT,
  blockByNumber,
} from './inday/convai/inday-story';
import './ui.css';

type Turn = { role: 'user' | 'assistant'; content: string };
type LogLine = { id: number; who: 'inday' | 'you' | 'sys'; text: string };

let nextId = 1;

export default function App() {
  const mouthRef = useRef(0);
  const lipPlayer = useRef(new LipSyncPlayer());
  const logRef = useRef<HTMLDivElement>(null);
  const speechActive = useRef(false);

  const [caps, setCaps] = useState<AvatarCapabilities | null>(null);
  const [ready, setReady] = useState(false);
  const [brain, setBrain] = useState<BrainConfig>(() => loadBrainConfig());
  const [online, setOnline] = useState<boolean | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<BrainConfig>(brain);
  const [voice, setVoice] = useState<VoiceConfig>(() => loadVoiceConfig());
  const [voiceDraft, setVoiceDraft] = useState<VoiceConfig>(voice);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [log, setLog] = useState<LogLine[]>([
    { id: nextId++, who: 'inday', text: 'Magandang araw! Ako si INDAY, ang tindera ng SariSwerte. Ano ang maitutulong ko?' },
  ]);
  const [notice, setNotice] = useState(true);

  const pushLog = useCallback((who: LogLine['who'], text: string) => {
    setLog((prev) => [...prev, { id: nextId++, who, text }]);
  }, []);

  // Probe the tunnel whenever the configuration changes.
  useEffect(() => {
    let cancelled = false;
    if (!isBrainConfigured(brain)) {
      setOnline(false);
      return;
    }
    setOnline(null);
    probeBrain(brain).then((ok) => {
      if (!cancelled) setOnline(ok);
    });
    return () => {
      cancelled = true;
    };
  }, [brain]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [log]);

  // The render loop reads mouthRef; this frame loop feeds it from the lip-sync track.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const player = lipPlayer.current;
      if (player.isPlaying) {
        mouthRef.current = player.update(performance.now());
      } else if (mouthRef.current !== 0) {
        // Ease the jaw closed instead of snapping.
        mouthRef.current = mouthRef.current > 0.02 ? mouthRef.current * 0.72 : 0;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  /**
   * Speak a line: drive the lips from the same text, and the audio in parallel.
   * edge-tts is tried first; the browser voice covers network failures so
   * INDAY is never silent.
   */
  const say = useCallback(
    async (text: string) => {
      lipPlayer.current.play(text);
      speechActive.current = true;
      try {
        const result = await speakWithVoice(text, voice);
        if (result.fellBackReason) {
          pushLog('sys', `Boses: browser na muna (${result.fellBackReason})`);
        }
      } finally {
        speechActive.current = false;
        // Let the lip track finish naturally; it stops itself.
      }
    },
    [voice, pushLog],
  );

  // INDAY's narrative state comes from the Convai avatar, not from a local script.
  const [storyN, setStoryN] = useState(START_BLOCK_NUMBER);
  const storyBlock = blockByNumber(storyN);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    pushLog('you', text);
    setTurns((prev) => [...prev, { role: 'user', content: text }]);

    try {
      const reply = await askSeaLLM(brain, text, turns, 60000, storyN);
      setOnline(true);
      setTurns((prev) => [...prev, { role: 'assistant', content: reply.text }]);
      pushLog('inday', reply.text);

      // Follow the Convai decision graph: pick the first rule whose criteria the
      // user's message plausibly matches, exactly as Convai routes story blocks.
      const lower = text.toLowerCase();
      const hit = (storyBlock?.decisions ?? []).find((d) => {
        if (!d.goto || d.goto === storyN) return false;
        const words = d.when.toLowerCase().match(/[a-z]{4,}/g) ?? [];
        return words.some((w) => lower.includes(w));
      });
      if (hit?.goto) {
        setStoryN(hit.goto);
        const nb = blockByNumber(hit.goto);
        pushLog('sys', `Story block ${storyN} → ${hit.goto}${nb ? ` (${nb.name})` : ''}`);
      }

      await say(reply.text);
    } catch (err) {
      const message = err instanceof BrainOfflineError ? err.message : (err as Error).message;
      setOnline(false);
      pushLog('sys', `SeaLLM offline — local na muna ang utak ni INDAY (${message})`);

      // A cold or missing tunnel must not leave INDAY silent. Answer from the
      // operator's own story blocks and speak it, so she still works.
      const local = answerLocally(text, storyN);
      setTurns((prev) => [...prev, { role: 'assistant', content: local.text }]);
      pushLog('inday', local.text);
      await say(local.text);
    } finally {
      setBusy(false);
    }
  }, [brain, busy, input, pushLog, say, turns]);

  const applySettings = () => {
    const cleaned: BrainConfig = {
      baseUrl: draft.baseUrl.trim().replace(/\/+$/, ''),
      model: draft.model.trim() || 'SeaLLM-7B-v2',
      token: draft.token.trim(),
    };
    saveBrainConfig(cleaned);
    setBrain(cleaned);

    const cleanedVoice: VoiceConfig = {
      ...voiceDraft,
      baseUrl: voiceDraft.baseUrl.trim(),
      referenceId: voiceDraft.referenceId.trim(),
      provider: voiceDraft.provider,
    };
    saveVoiceConfig(cleanedVoice);
    setVoice(cleanedVoice);
    setShowSettings(false);
    pushLog(
      'sys',
      isEdgeConfigured(cleanedVoice)
        ? 'Boses: edge-tts na si INDAY (libre, walang key).'
        : 'Boses: browser muna — walang tunnel para sa /tts.',
    );
    pushLog('sys', cleaned.baseUrl ? `Brain set to ${cleaned.baseUrl}` : 'Brain cleared — INDAY has no SeaLLM tunnel.');
  };

  const brainPill = !isBrainConfigured(brain)
    ? { cls: 'off', label: 'BRAIN OFFLINE' }
    : online === null
      ? { cls: 'warn', label: 'BRAIN CHECKING' }
      : online
        ? { cls: 'on', label: 'SEALLM ONLINE' }
        : { cls: 'off', label: 'BRAIN OFFLINE' };

  const lipPill = caps
    ? caps.lipSync === 'none'
      ? { cls: 'off', label: 'LIPS: NO RIG' }
      : caps.lipSync === 'visemes'
        ? { cls: 'on', label: 'LIPS: VISEMES' }
        : caps.lipSync === 'arkit'
          ? { cls: 'on', label: 'LIPS: ARKIT' }
          : { cls: 'warn', label: 'LIPS: JAW BONE' }
    : { cls: 'warn', label: 'LIPS: LOADING' };

  const avatarPill = caps
    ? caps.source === 'glb'
      ? { cls: 'on', label: 'INDAY: GLB' }
      : { cls: 'warn', label: 'INDAY: STAND-IN' }
    : { cls: 'warn', label: 'INDAY: LOADING' };

  return (
    <div className="app">
      <Stage
        mouthRef={mouthRef}
        speakingRef={speechActive}
        onCapabilities={setCaps}
        onReady={() => setReady(true)}
        onError={(m) => pushLog('sys', m)}
      />

      <header className="topbar">
        <div className="wordmark">
          SariSwerte
          <small>Tindahan • Essentials • Daily Needs</small>
        </div>
        <div className="pills">
          <span className={`pill ${avatarPill.cls}`}>
            <i className="dot" />
            {avatarPill.label}
          </span>
          <span className={`pill ${lipPill.cls}`}>
            <i className="dot" />
            {lipPill.label}
          </span>
          <span className={`pill ${brainPill.cls}`}>
            <i className="dot" />
            {brainPill.label}
          </span>
          <span className="pill on" title="Convai story block driving INDAY">
            <i className="dot" />
            BLOCK {storyN}/{STORY_BLOCK_COUNT}
          </span>
        </div>
      </header>

      {notice && caps && (
        <aside className={`notice ${caps.lipSync === 'none' ? 'warn' : ''}`}>
          <button className="icon-btn close" onClick={() => setNotice(false)} aria-label="Dismiss">×</button>
          <strong>{caps.source === 'glb' ? 'INDAY loaded' : 'INDAY stand-in active'}</strong>
          {caps.note}
          {caps.source === 'glb' && (
            <>
              {' '}
              <span style={{ opacity: 0.75 }}>
                ({caps.bones} bones, {caps.morphTargets.length} morph targets)
              </span>
            </>
          )}
        </aside>
      )}

      <section className="dock">
        <div className="dock-head">
          <div className="avatar-chip">IN</div>
          <div>
            <div className="dock-title">INDAY</div>
            <div className="dock-sub">
              {ready ? 'Store assistant · SeaLLM' : 'Loading the store…'}
            </div>
          </div>
          <div className="grow" />
          <button className="icon-btn" onClick={() => { setDraft(brain); setVoiceDraft(voice); setShowSettings(true); }} aria-label="Brain settings">
            ⚙
          </button>
        </div>

        <div className="log" ref={logRef}>
          {log.map((l) => (
            <div key={l.id} className={`msg ${l.who}`}>
              <span className="who">{l.who === 'inday' ? 'IN' : l.who === 'you' ? 'KA' : '!'}</span>
              <div className="bubble">{l.text}</div>
            </div>
          ))}
          {busy && (
            <div className="msg inday">
              <span className="who">IN</span>
              <div className="bubble" style={{ opacity: 0.6 }}>nag-iisip si INDAY…</div>
            </div>
          )}
        </div>

        <div className="composer">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void send(); }}
            placeholder="Magtanong kay INDAY…"
            aria-label="Message INDAY"
          />
          <button className="send" onClick={() => void send()} disabled={busy || !input.trim()}>
            Send
          </button>
        </div>
      </section>

      {showSettings && (
        <div className="sheet-backdrop" onClick={() => setShowSettings(false)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            <h2>SeaLLM Brain</h2>
            <p className="hint">
              Paste your Cloudflare tunnel URL for the standalone SeaLLM notebook
              (<code>seallm/</code>, Rexmay/SeaLLM-7B-v2-gguf-bucket). INDAY calls{' '}
              <code>/v1/chat/completions</code> on it.
            </p>
            <label className="field">
              <span>Tunnel base URL</span>
              <input
                value={draft.baseUrl}
                onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })}
                placeholder="https://xxxx-yyyy.trycloudflare.com"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Model</span>
              <input
                value={draft.model}
                onChange={(e) => setDraft({ ...draft, model: e.target.value })}
                placeholder="SeaLLM-7B-v2"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Bearer token (optional)</span>
              <input
                value={draft.token}
                onChange={(e) => setDraft({ ...draft, token: e.target.value })}
                placeholder="leave blank if the tunnel is open"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <h2 style={{ marginTop: 22 }}>Boses ni INDAY</h2>
            <p className="hint">
              Libre ang <strong>edge-tts</strong> at walang key, kaya wala nang
              bayad at walang sekretong nakalagay. Hindi lang kayang tawagan ng
              browser nang direkta, kaya dumadaan sa <code>/tts</code> ng notebook.
              Kapag walang tunnel, browser voice muna.
            </p>
            <label className="field">
              <span>Tunnel URL para sa /tts</span>
              <input
                value={voiceDraft.baseUrl}
                onChange={(e) => setVoiceDraft({ ...voiceDraft, baseUrl: e.target.value })}
                placeholder="https://xxxx-yyyy.trycloudflare.com"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Voice</span>
              <input
                value={voiceDraft.referenceId}
                onChange={(e) => setVoiceDraft({ ...voiceDraft, referenceId: e.target.value })}
                placeholder="fil-PH-BlessicaNeural"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="field">
              <span>Provider</span>
              <select
                value={voiceDraft.provider}
                onChange={(e) =>
                  setVoiceDraft({ ...voiceDraft, provider: e.target.value as VoiceConfig['provider'] })
                }
              >
                <option value="edge">edge-tts (libre)</option>
                <option value="browser">Browser voice (free fallback)</option>
              </select>
            </label>

            <div className="sheet-actions">
              <button className="btn-ghost" onClick={() => setShowSettings(false)}>Cancel</button>
              <button className="btn-solid" onClick={applySettings}>Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
