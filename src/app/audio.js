(function (game) {
  // ----------------------------------------------------------------
  // 轻量音效系统：使用 Web Audio API 现场合成短音，避免引入外部资源。
  // 入口：game.playSound(name)
  // 浏览器要求用户首次交互后才能创建/恢复 AudioContext，因此
  // 通过 unlockAudio() 在第一次按键 / 点击 / 触摸时初始化。
  // ----------------------------------------------------------------

  let audioCtx = null;
  let masterGain = null;
  let enabled = true;
  let unlocked = false;

  function getCtx() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      audioCtx = new Ctor();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.32;
      masterGain.connect(audioCtx.destination);
    } catch (_err) {
      audioCtx = null;
    }
    return audioCtx;
  }

  function unlockAudio() {
    const ctx = getCtx();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    unlocked = true;
  }

  // 主合成函数：oscillator + 包络
  function playTone({
    type = 'sine',
    freq = 440,
    freq2 = null,
    duration = 0.12,
    attack = 0.005,
    release = 0.08,
    gain = 0.6,
    detune = 0
  }) {
    const ctx = getCtx();
    if (!ctx || !enabled) return;
    if (ctx.state === 'suspended') {
      // 还未解锁，静默跳过
      return;
    }

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freq2 != null) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), now + duration);
    }
    if (detune) osc.detune.value = detune;

    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

    osc.connect(env);
    env.connect(masterGain);
    osc.start(now);
    osc.stop(now + duration + release + 0.02);
  }

  // 噪声音色（用于打击 / 采集等）
  function playNoise({ duration = 0.12, gain = 0.4, filter = 1800, release = 0.08 }) {
    const ctx = getCtx();
    if (!ctx || !enabled) return;
    if (ctx.state === 'suspended') return;

    const now = ctx.currentTime;
    const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * (duration + release)));
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const biquad = ctx.createBiquadFilter();
    biquad.type = 'lowpass';
    biquad.frequency.value = filter;

    const env = ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);

    source.connect(biquad);
    biquad.connect(env);
    env.connect(masterGain);
    source.start(now);
    source.stop(now + duration + release + 0.02);
  }

  // 命名预设
  const SFX = {
    click() {
      playTone({ type: 'square', freq: 720, freq2: 880, duration: 0.05, gain: 0.18, release: 0.05 });
    },
    select() {
      playTone({ type: 'triangle', freq: 540, freq2: 760, duration: 0.07, gain: 0.22, release: 0.06 });
    },
    panel() {
      playTone({ type: 'triangle', freq: 480, freq2: 640, duration: 0.08, gain: 0.2, release: 0.07 });
    },
    craft() {
      playTone({ type: 'triangle', freq: 520, freq2: 880, duration: 0.12, gain: 0.28, release: 0.12 });
      setTimeout(() => playTone({ type: 'sine', freq: 880, duration: 0.1, gain: 0.22, release: 0.12 }), 70);
    },
    harvest() {
      playNoise({ duration: 0.09, gain: 0.32, filter: 1200, release: 0.1 });
      playTone({ type: 'triangle', freq: 360, freq2: 240, duration: 0.1, gain: 0.18, release: 0.08 });
    },
    hit() {
      playNoise({ duration: 0.06, gain: 0.36, filter: 2400, release: 0.06 });
      playTone({ type: 'square', freq: 220, freq2: 140, duration: 0.06, gain: 0.18, release: 0.05 });
    },
    kill() {
      playTone({ type: 'sawtooth', freq: 320, freq2: 120, duration: 0.18, gain: 0.28, release: 0.16 });
      playNoise({ duration: 0.1, gain: 0.28, filter: 900, release: 0.1 });
    },
    build() {
      playTone({ type: 'square', freq: 360, freq2: 540, duration: 0.08, gain: 0.22, release: 0.08 });
      setTimeout(() => playTone({ type: 'square', freq: 540, freq2: 720, duration: 0.08, gain: 0.2, release: 0.08 }), 60);
    },
    eat() {
      playTone({ type: 'triangle', freq: 480, freq2: 720, duration: 0.1, gain: 0.22, release: 0.1 });
    },
    drink() {
      playTone({ type: 'sine', freq: 620, freq2: 360, duration: 0.16, gain: 0.22, release: 0.12 });
    },
    fire() {
      playNoise({ duration: 0.18, gain: 0.24, filter: 700, release: 0.12 });
    },
    damage() {
      playTone({ type: 'sawtooth', freq: 220, freq2: 110, duration: 0.18, gain: 0.32, release: 0.18 });
    },
    cast() {
      playTone({ type: 'sine', freq: 880, freq2: 320, duration: 0.18, gain: 0.22, release: 0.12 });
    },
    bite() {
      playTone({ type: 'triangle', freq: 880, freq2: 1320, duration: 0.08, gain: 0.24, release: 0.1 });
      setTimeout(() => playTone({ type: 'triangle', freq: 1320, duration: 0.08, gain: 0.22, release: 0.1 }), 70);
    },
    catch() {
      playTone({ type: 'triangle', freq: 660, freq2: 1320, duration: 0.16, gain: 0.28, release: 0.14 });
      setTimeout(() => playTone({ type: 'sine', freq: 1320, freq2: 1760, duration: 0.12, gain: 0.24, release: 0.12 }), 90);
    },
    error() {
      playTone({ type: 'square', freq: 220, freq2: 160, duration: 0.1, gain: 0.18, release: 0.08 });
    },
    start() {
      playTone({ type: 'triangle', freq: 440, freq2: 660, duration: 0.12, gain: 0.26, release: 0.12 });
      setTimeout(() => playTone({ type: 'triangle', freq: 660, freq2: 880, duration: 0.12, gain: 0.24, release: 0.12 }), 90);
      setTimeout(() => playTone({ type: 'triangle', freq: 880, freq2: 1100, duration: 0.16, gain: 0.22, release: 0.14 }), 180);
    },
    gameover() {
      playTone({ type: 'sawtooth', freq: 440, freq2: 220, duration: 0.2, gain: 0.28, release: 0.18 });
      setTimeout(() => playTone({ type: 'sawtooth', freq: 330, freq2: 165, duration: 0.24, gain: 0.26, release: 0.2 }), 160);
      setTimeout(() => playTone({ type: 'sawtooth', freq: 220, freq2: 110, duration: 0.32, gain: 0.24, release: 0.24 }), 360);
    },
    drop() {
      playTone({ type: 'triangle', freq: 360, freq2: 220, duration: 0.08, gain: 0.18, release: 0.08 });
    }
  };

  function playSound(name) {
    if (!enabled) return;
    const fn = SFX[name];
    if (!fn) return;
    try {
      fn();
    } catch (_err) {
      /* ignore */
    }
  }

  function setAudioEnabled(value) {
    enabled = !!value;
  }

  function isAudioEnabled() {
    return enabled;
  }

  function bindAudioUnlock() {
    const handler = () => {
      unlockAudio();
      window.removeEventListener('pointerdown', handler, true);
      window.removeEventListener('keydown', handler, true);
      window.removeEventListener('touchstart', handler, true);
    };
    window.addEventListener('pointerdown', handler, { capture: true });
    window.addEventListener('keydown', handler, { capture: true });
    window.addEventListener('touchstart', handler, { capture: true, passive: true });
  }

  Object.assign(game, {
    playSound,
    unlockAudio,
    setAudioEnabled,
    isAudioEnabled,
    bindAudioUnlock,
    isAudioUnlocked: () => unlocked
  });
})(window.TidalIsle);
