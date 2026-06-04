/*
 * audio.js — Gerçek SES analizi (metin değil)
 *
 * Web Audio API ile mikrofondan gelen ses dalgasını doğrudan inceler ve
 * konuşmaya dair akustik ölçümler üretir:
 *   • Konuşma/sessizlik oranı, duraklama sayısı ve uzunluğu  -> akıcılık
 *   • Konuşma hızı (hece/sn, enerji zarfı tepe sayımıyla)    -> akıcılık
 *   • Tonlama (pitch / temel frekans değişimi)               -> telaffuz/prozodi
 *   • Ses şiddeti ve kararlılığı                              -> sunum netliği
 *
 * Bu ölçümler YAZIDAN BAĞIMSIZDIR: öğrenci çok kötü İngilizce konuşsa, hatta
 * tanınır hiç kelime çıkmasa bile, sesin akustik özellikleri yine ölçülür.
 * Ayrıca ses MediaRecorder ile kaydedilir; öğretmen dinleyip puanı düzeltebilir.
 */
(function () {
  "use strict";

  function createAnalyzer() {
    let audioCtx, analyser, source, stream, recorder, chunks = [];
    let buf, running = false, intervalId = null;
    let sampleRate = 44100;
    const frames = []; // { t, rms, f0 }

    async function start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      sampleRate = audioCtx.sampleRate;
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser);
      buf = new Float32Array(analyser.fftSize);

      // Ses kaydı (öğretmenin dinlemesi için)
      chunks = [];
      try {
        recorder = new MediaRecorder(stream);
        recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
        recorder.start();
      } catch (_) { recorder = null; }

      frames.length = 0;
      running = true;
      // ~30 ms aralıkla örnekle (sekme görünürken kararlı)
      intervalId = setInterval(sample, 30);
    }

    function sample() {
      if (!running || !analyser) return;
      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      let f0 = 0;
      if (rms > 0.012) f0 = autoCorrelate(buf, sampleRate); // yalnız sesli kareler
      frames.push({ t: performance.now(), rms: rms, f0: f0 });
    }

    function stop() {
      running = false;
      if (intervalId) clearInterval(intervalId);
      return new Promise((resolve) => {
        const finish = () => {
          const type = (chunks[0] && chunks[0].type) || "audio/webm";
          const blob = chunks.length ? new Blob(chunks, { type: type }) : null;
          const metrics = computeMetrics();
          cleanup();
          resolve({ metrics: metrics, audioBlob: blob });
        };
        if (recorder && recorder.state !== "inactive") {
          recorder.onstop = finish;
          try { recorder.stop(); } catch (_) { finish(); }
        } else {
          finish();
        }
      });
    }

    function cleanup() {
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { if (audioCtx && audioCtx.state !== "closed") audioCtx.close(); } catch (_) {}
    }

    /* --------------------- ölçüm hesaplama --------------------- */
    function computeMetrics() {
      if (frames.length < 4) return null;

      // Gürültü tabanı: en sessiz %20'nin medyanı; eşik bunun üstünde.
      const rmsSorted = frames.map((f) => f.rms).sort((a, b) => a - b);
      const noiseFloor = rmsSorted[Math.floor(rmsSorted.length * 0.2)] || 0.005;
      const speechTh = Math.max(noiseFloor * 2.2, 0.012);

      const t0 = frames[0].t, tEnd = frames[frames.length - 1].t;
      const totalSec = Math.max((tEnd - t0) / 1000, 0.001);

      // Her kareye süre payı ver (komşu kareler arası fark)
      let speechMs = 0;
      const voiced = [];
      for (let i = 0; i < frames.length; i++) {
        const dt = i < frames.length - 1 ? frames[i + 1].t - frames[i].t : 30;
        const isVoiced = frames[i].rms > speechTh;
        voiced.push(isVoiced);
        if (isVoiced) speechMs += dt;
      }
      const speechSec = speechMs / 1000;
      const speechRatio = clamp(speechSec / totalSec, 0, 1);

      // Duraklamalar: konuşma içindeki sessizlik koşuları
      let pauseCount = 0, longPauseCount = 0, pauseMsTotal = 0;
      let firstVoiced = voiced.indexOf(true);
      let lastVoiced = voiced.lastIndexOf(true);
      if (firstVoiced >= 0) {
        let run = 0;
        for (let i = firstVoiced; i <= lastVoiced; i++) {
          const dt = frames[i + 1] ? frames[i + 1].t - frames[i].t : 30;
          if (!voiced[i]) {
            run += dt;
          } else if (run > 0) {
            if (run >= 300) { pauseCount++; pauseMsTotal += run; if (run >= 800) longPauseCount++; }
            run = 0;
          }
        }
      }
      const avgPauseSec = pauseCount ? (pauseMsTotal / pauseCount) / 1000 : 0;

      // Hece tahmini: yumuşatılmış enerji zarfında tepe (onset) sayımı
      const syllables = countSyllables(frames, speechTh);
      const articulationRate = speechSec > 0.3 ? syllables / speechSec : 0; // hece/sn

      // Tonlama: sesli karelerin temel frekansları (70–400 Hz)
      const pitches = frames.map((f) => f.f0).filter((p) => p >= 70 && p <= 400);
      let pitchMeanHz = 0, pitchVarSemitones = 0, pitchRangeSemitones = 0;
      if (pitches.length >= 5) {
        pitchMeanHz = mean(pitches);
        const semis = pitches.map((p) => 12 * Math.log2(p / pitchMeanHz));
        pitchVarSemitones = std(semis);
        pitchRangeSemitones = percentile(semis, 0.95) - percentile(semis, 0.05);
      }

      // Ses şiddeti ve kararlılığı (sesli karelerde)
      const loud = frames.filter((_, i) => voiced[i]).map((f) => f.rms);
      const loudnessMean = loud.length ? mean(loud) : 0;
      const loudnessStability = loud.length > 3 ? clamp(1 - std(loud) / (loudnessMean || 1), 0, 1) : 0.5;

      /* ---- akustik ham alt-puanlar (0–100) ---- */
      // Akıcılık: konuşma oranı + uzun duraklama cezası + hız bandı (~3–5 hece/sn ideal)
      let fluencyScore = map(speechRatio, 0.25, 0.78, 35, 95);
      fluencyScore -= Math.min(longPauseCount * 8, 30);
      fluencyScore -= Math.min(Math.max(pauseCount - 4, 0) * 3, 15);
      fluencyScore += rateBonus(articulationRate); // ideal hız için +/-
      if (speechSec < 3) fluencyScore = Math.min(fluencyScore, 35);
      fluencyScore = clamp(fluencyScore, 0, 100);

      // Tonlama/prozodi: tek düze (monoton) düşük, makul değişim yüksek
      let intonationScore = pitches.length >= 5 ? map(pitchVarSemitones, 0.6, 3.2, 45, 95) : 55;
      intonationScore = clamp(intonationScore, 0, 100);

      // Sunum netliği: yeterli ve kararlı ses şiddeti
      let deliveryScore = clamp(
        map(loudnessMean, 0.02, 0.12, 45, 90) * 0.6 + loudnessStability * 100 * 0.4,
        0, 100
      );

      return {
        totalSec: round1(totalSec),
        speechSec: round1(speechSec),
        speechRatio: round2(speechRatio),
        pauseCount: pauseCount,
        longPauseCount: longPauseCount,
        avgPauseSec: round1(avgPauseSec),
        syllables: syllables,
        articulationRate: round1(articulationRate),
        pitchMeanHz: Math.round(pitchMeanHz),
        pitchVarSemitones: round1(pitchVarSemitones),
        pitchRangeSemitones: round1(pitchRangeSemitones),
        loudnessMean: round2(loudnessMean),
        loudnessStability: round2(loudnessStability),
        fluencyScore: Math.round(fluencyScore),
        intonationScore: Math.round(intonationScore),
        deliveryScore: Math.round(deliveryScore)
      };
    }

    return { start: start, stop: stop };
  }

  /* ===================== yardımcılar ===================== */

  // İdeal artikülasyon hızı ~3–5 hece/sn: bandın içinde +8, dışında ceza
  function rateBonus(r) {
    if (r === 0) return -15;
    if (r >= 3 && r <= 5) return 8;
    if (r >= 2 && r < 3) return 0;
    if (r > 5 && r <= 6.5) return 0;
    return -10; // çok yavaş veya aşırı hızlı/ezber
  }

  // Yumuşatılmış enerji zarfında tepe (hece çekirdeği) sayımı
  function countSyllables(frames, speechTh) {
    const env = [];
    const win = 3;
    for (let i = 0; i < frames.length; i++) {
      let s = 0, n = 0;
      for (let j = i - win; j <= i + win; j++) if (frames[j]) { s += frames[j].rms; n++; }
      env.push(s / n);
    }
    const hi = speechTh * 1.5, lo = speechTh * 1.05;
    let count = 0, armed = true;
    for (let i = 1; i < env.length - 1; i++) {
      if (armed && env[i] > hi && env[i] >= env[i - 1] && env[i] >= env[i + 1]) {
        count++; armed = false;
      } else if (!armed && env[i] < lo) {
        armed = true; // bir sonraki tepeye hazır
      }
    }
    return count;
  }

  // Otokorelasyonla temel frekans (pitch) tespiti; bulunamazsa 0
  function autoCorrelate(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return 0;

    let r1 = 0, r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
    for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
    const b = buf.slice(r1, r2);
    const n = b.length;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) c[i] += b[j] * b[j + i];

    let d = 0;
    while (d < n - 1 && c[d] > c[d + 1]) d++;
    let maxval = -1, maxpos = -1;
    for (let i = d; i < n; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
    let T0 = maxpos;
    if (T0 <= 0) return 0;
    // parabolik enterpolasyon
    const x1 = c[T0 - 1] || 0, x2 = c[T0], x3 = c[T0 + 1] || 0;
    const a = (x1 + x3 - 2 * x2) / 2, bb = (x3 - x1) / 2;
    if (a) T0 = T0 - bb / (2 * a);
    const freq = sampleRate / T0;
    return (freq >= 60 && freq <= 500) ? freq : 0;
  }

  /* sayısal yardımcılar */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function map(v, iL, iH, oL, oH) { if (iH === iL) return oL; const t = (v - iL) / (iH - iL); return oL + clamp(t, 0, 1) * (oH - oL); }
  function mean(a) { return a.reduce((x, y) => x + y, 0) / a.length; }
  function std(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) * (x - m), 0) / a.length); }
  function percentile(a, p) { const s = a.slice().sort((x, y) => x - y); return s[clamp(Math.floor(p * s.length), 0, s.length - 1)]; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }

  window.AudioAnalyzer = { create: createAnalyzer };
})();
