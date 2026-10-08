// ==============================================================================
// JUDE PROCEDURAL SFX & AMBIENT SYNTHESIZER (WEB AUDIO API)
// High-tech Iron Man HUD procedural acoustics - No external audio files needed.
// ==============================================================================

class SoundEngine {
  private ctx: AudioContext | null = null;
  private ambientGain: GainNode | null = null;
  private ambientOscillators: OscillatorNode[] = [];
  private isAmbientPlaying = false;

  private getContext(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  // 1. Chime de activación al escuchar "Yud" (doble armónico ascendente)
  playWakeChime() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";

      osc1.frequency.setValueAtTime(587.33, now); // D5
      osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.14); // D6

      osc2.frequency.setValueAtTime(880.0, now + 0.05); // A5
      osc2.frequency.exponentialRampToValueAtTime(1760.0, now + 0.18); // A6

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now + 0.05);
      osc1.stop(now + 0.28);
      osc2.stop(now + 0.28);
    } catch {}
  }

  // 2. Pulso de procesamiento / computación cuántica
  playProcessingHum() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.linearRampToValueAtTime(520, now + 0.08);
      osc.frequency.linearRampToValueAtTime(440, now + 0.16);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  }

  // 3. Confirmación afirmativa de acción (Iron Man HUD ping)
  playActionConfirm() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const notes = [659.25, 880.0, 1318.51]; // E5, A5, E6
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + idx * 0.06);

        gain.gain.setValueAtTime(0.001, now + idx * 0.06);
        gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.06 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.24);
      });
    } catch {}
  }

  // 4. Interrupción inmediata / Desactivación / Mute
  playCancelChirp() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.12);
    } catch {}
  }

  // 5. Alarma de temporizador (aviso cíclico de alta tecnología)
  playTimerAlarm() {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [0, 0.2, 0.4].forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(987.77, now + offset); // B5

        gain.gain.setValueAtTime(0.001, now + offset);
        gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.14);
      });
    } catch {}
  }

  // 6. Generador de ruido ambiental espacial / concentración profunda
  toggleAmbient(enable?: boolean): boolean {
    const ctx = this.getContext();
    if (!ctx) return false;

    const shouldPlay = enable !== undefined ? enable : !this.isAmbientPlaying;

    if (!shouldPlay) {
      if (this.ambientGain) {
        this.ambientGain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
        setTimeout(() => {
          this.ambientOscillators.forEach((osc) => {
            try {
              osc.stop();
            } catch {}
          });
          this.ambientOscillators = [];
          this.ambientGain = null;
        }, 500);
      }
      this.isAmbientPlaying = false;
      return false;
    }

    try {
      const now = ctx.currentTime;
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.001, now);
      masterGain.gain.linearRampToValueAtTime(0.04, now + 1.2);

      // Oscilador armónico subgrave (40Hz)
      const subOsc = ctx.createOscillator();
      subOsc.type = "sine";
      subOsc.frequency.setValueAtTime(40, now);

      // Oscilador binaural suave (108Hz + 112Hz = 4Hz Theta)
      const oscA = ctx.createOscillator();
      oscA.type = "sine";
      oscA.frequency.setValueAtTime(108, now);

      const oscB = ctx.createOscillator();
      oscB.type = "sine";
      oscB.frequency.setValueAtTime(112, now);

      subOsc.connect(masterGain);
      oscA.connect(masterGain);
      oscB.connect(masterGain);

      masterGain.connect(ctx.destination);

      subOsc.start(now);
      oscA.start(now);
      oscB.start(now);

      this.ambientGain = masterGain;
      this.ambientOscillators = [subOsc, oscA, oscB];
      this.isAmbientPlaying = true;
      return true;
    } catch {
      return false;
    }
  }

  isAmbientActive() {
    return this.isAmbientPlaying;
  }
}

export const soundEngine = new SoundEngine();
