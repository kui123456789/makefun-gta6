// All sound is synthesized with WebAudio: no audio files, no network. Engine hum,
// sirens, gunshots, explosions, pickups and a small bass-driven music loop are built from
// oscillators and filtered noise. Everything is guarded: if the browser has no audio (or
// the user has not interacted yet) every call is a silent no-op.
const NOTE = { C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47, C3: 130.81, D3: 146.83, E3: 164.81, G3: 196.0, A3: 220.0 };

// A laid-back bass line for the cruise: one bar of eight eighth-notes, looped.
const BASS_LINE = [NOTE.C2, 0, NOTE.C2, NOTE.E2, NOTE.G2, 0, NOTE.A2, NOTE.G2,
  NOTE.F2, 0, NOTE.F2, NOTE.A2, NOTE.G2, 0, NOTE.E2, NOTE.D2];
const HAT_LINE = [1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 0, 1, 1, 0];

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;
  let noiseBuffer = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  /** Call from any user gesture: browsers only allow audio after one. */
  function unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ensure() || muted) return;
    try {
      const t = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch { /* sound is decoration; never break the game */ }
  }

  function noise(dur, vol, filterFreq, when = 0) {
    if (!ensure() || muted) return;
    try {
      const t = ctx.currentTime + when;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(master);
      src.start(t);
      src.stop(t + dur + 0.02);
    } catch { /* sound is decoration */ }
  }

  return {
    unlock,
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    click() { blip(660, 0.07, 'square', 0.12); },
    confirm() { blip(520, 0.09, 'sine', 0.2); blip(780, 0.12, 'sine', 0.2, 0.08); },
    shot() { noise(0.14, 0.5, 2400); blip(180, 0.08, 'square', 0.25); },
    enemyShot() { noise(0.12, 0.25, 1800); },
    hit() { blip(140, 0.1, 'sawtooth', 0.3); noise(0.08, 0.25, 900); },
    explosion() { noise(0.9, 0.8, 500); blip(55, 0.7, 'sine', 0.5); },
    pickup() { blip(880, 0.08, 'sine', 0.22); blip(1320, 0.14, 'sine', 0.22, 0.07); },
    cash() { blip(990, 0.07, 'triangle', 0.2); blip(1480, 0.1, 'triangle', 0.2, 0.06); },
    mission() { [523, 659, 784, 1047].forEach((f, i) => blip(f, 0.16, 'triangle', 0.22, i * 0.09)); },
    fail() { [392, 330, 262].forEach((f, i) => blip(f, 0.2, 'sawtooth', 0.15, i * 0.12)); },
    wantedUp() { blip(440, 0.12, 'square', 0.2); blip(440, 0.12, 'square', 0.2, 0.15); },
    engine(speed01, on) {
      if (!ensure() || muted) return;
      try {
        if (!engineOsc) {
          engineOsc = ctx.createOscillator();
          engineOsc.type = 'sawtooth';
          engineFilter = ctx.createBiquadFilter();
          engineFilter.type = 'lowpass';
          engineFilter.frequency.value = 420;
          engineGain = ctx.createGain();
          engineGain.gain.value = 0;
          engineOsc.connect(engineFilter);
          engineFilter.connect(engineGain);
          engineGain.connect(master);
          engineOsc.start();
        }
        const target = on ? 0.05 + speed01 * 0.09 : 0;
        engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
        engineOsc.frequency.setTargetAtTime(52 + speed01 * 130, ctx.currentTime, 0.08);
        engineFilter.frequency.setTargetAtTime(320 + speed01 * 900, ctx.currentTime, 0.1);
      } catch { /* ignore */ }
    },
    siren(on) {
      if (!ensure() || muted) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenOsc.type = 'sine';
          sirenGain = ctx.createGain();
          sirenGain.gain.value = 0.045;
          sirenOsc.connect(sirenGain);
          sirenGain.connect(master);
          sirenOsc.start();
          sirenTimer = 0;
        } else if (!on && sirenOsc) {
          sirenOsc.stop();
          sirenOsc = null;
          sirenGain = null;
        }
        if (sirenOsc) {
          sirenTimer += 1;
          // Two-tone wail: alternate every ~24 frames.
          sirenOsc.frequency.value = Math.floor(sirenTimer / 24) % 2 === 0 ? 715 : 950;
        }
      } catch { /* ignore */ }
    },
    music(on) {
      if (!ensure()) return;
      if (on && !musicTimer) {
        musicStep = 0;
        musicTimer = window.setInterval(() => {
          if (muted) return;
          const bass = BASS_LINE[musicStep % BASS_LINE.length];
          if (bass) blip(bass, 0.22, 'triangle', 0.16);
          if (HAT_LINE[musicStep % HAT_LINE.length]) noise(0.03, 0.05, 6000);
          if (musicStep % 32 === 0) blip(NOTE.C3, 0.4, 'sine', 0.05);
          musicStep += 1;
        }, 190);
      } else if (!on && musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
  };
}
