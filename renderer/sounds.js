// Efectos de sonido sintetizados con Web Audio (sin ficheros): no hace falta tocar la CSP ni empaquetar audio.
// sfx.play(nombre) suena una vez; si ya sonó otro efecto hace un instante se ignora, así un clic con sonido
// propio (p. ej. marcar una carta) no se pisa con el "clic" genérico de los botones.
const sfx = (() => {
  const STORAGE_KEY = 'sfx-muted';
  let ctx = null;
  let master = null;
  let lastPlayed = 0;
  let lastHover = 0;
  let muted = false;
  try { muted = localStorage.getItem(STORAGE_KEY) === '1'; } catch { /* sin almacenamiento: con sonido */ }

  const audio = () => {
    if (!ctx) {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  // Golpe grave muy corto (un "toc" de madera o de ficha sobre la mesa), sin nota musical reconocible.
  const thump = ({ freq = 180, dur = 0.04, gain = 0.15, delay = 0 }) => {
    const c = audio();
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
    env.gain.setValueAtTime(gain, t);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(env).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  // Ruido blanco compartido (1 s): cada efecto toma un trozo al azar, así no suenan todos idénticos.
  let noiseBuffer = null;
  const noiseSource = (c) => {
    if (!noiseBuffer) {
      noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const src = c.createBufferSource();
    src.buffer = noiseBuffer;
    return src;
  };

  // Ruido filtrado: con dur de pocos ms es un clic seco; más largo y con barrido (`to`), el roce de una carta.
  // attack: fracción de dur que tarda en llegar al máximo (0 = golpe instantáneo).
  const noise = ({ freq = 3000, to, q = 1, dur = 0.01, gain = 0.2, attack = 0, delay = 0, type = 'bandpass' }) => {
    const c = audio();
    const t = c.currentTime + delay;
    const src = noiseSource(c);
    const filter = c.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(freq, t);
    if (to) filter.frequency.exponentialRampToValueAtTime(to, t + dur);
    const env = c.createGain();
    if (attack) {
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(gain, t + dur * attack);
    } else {
      env.gain.setValueAtTime(gain, t);
    }
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(env).connect(master);
    src.start(t, Math.random() * 0.8);
    src.stop(t + dur + 0.02);
  };

  const SOUNDS = {
    hover: () => noise({ freq: 5000, q: 2, dur: 0.006, gain: 0.05 }),
    // Clic de ratón / interruptor: chasquido agudo con un pequeño cuerpo grave.
    click: () => { noise({ freq: 3500, q: 1.5, dur: 0.012, gain: 0.25 }); thump({ freq: 900, dur: 0.012, gain: 0.05 }); },
    // Abrir: una carta que se saca y se deja (roce de papel + toque al apoyarla).
    open: () => {
      noise({ freq: 1500, to: 4000, q: 0.8, dur: 0.09, gain: 0.08, attack: 0.4 });
      noise({ freq: 2500, q: 1.5, dur: 0.015, gain: 0.18, delay: 0.08 });
    },
    back: () => {
      noise({ freq: 4000, to: 1500, q: 0.8, dur: 0.08, gain: 0.07, attack: 0.4 });
      noise({ freq: 2000, q: 1.5, dur: 0.015, gain: 0.15, delay: 0.07 });
    },
    // Añadir: dos fichas que chocan ("clac-clac") y quedan sobre la mesa.
    add: () => {
      noise({ freq: 3200, q: 4, dur: 0.02, gain: 0.25 });
      noise({ freq: 3800, q: 4, dur: 0.025, gain: 0.2, delay: 0.035 });
      thump({ freq: 220, dur: 0.035, gain: 0.1 });
    },
    // Quitar: un único toque, más apagado.
    remove: () => { noise({ freq: 1400, q: 2, dur: 0.02, gain: 0.22 }); thump({ freq: 150, dur: 0.04, gain: 0.1 }); },
    // Filtros: "tic" de casilla, nítido al marcar y más grave y suave al desmarcar.
    check: () => { noise({ freq: 4500, q: 3, dur: 0.008, gain: 0.2 }); noise({ freq: 3000, q: 3, dur: 0.01, gain: 0.12, delay: 0.018 }); },
    uncheck: () => noise({ freq: 2200, q: 3, dur: 0.012, gain: 0.15 }),
    zoom: () => noise({ freq: 800, to: 3000, q: 0.7, dur: 0.14, gain: 0.08, attack: 0.5 }),
  };

  return {
    get muted() { return muted; },
    setMuted(value) {
      muted = value;
      try { localStorage.setItem(STORAGE_KEY, value ? '1' : '0'); } catch { /* no se recuerda, da igual */ }
    },
    play(name) {
      if (muted || !SOUNDS[name]) return;
      const now = performance.now();
      if (name === 'hover') {
        // Al barrer el ratón por una cuadrícula de cartas, como mucho un "tic" cada 50 ms.
        if (now - lastHover < 50) return;
        lastHover = now;
      } else {
        if (now - lastPlayed < 60) return;
        lastPlayed = now;
      }
      try { SOUNDS[name](); } catch { /* sin audio disponible: la app sigue igual */ }
    },
  };
})();
