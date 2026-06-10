/*
 * app.js — Uygulama mantığı
 * - Web Speech API ile canlı konuşma → metin
 * - 5 kriter üzerinden otomatik puanlama (sezgisel/heuristik analiz)
 * - Öğretmenin puanları elle düzeltebilmesi
 * - Rapor: yazdırma, JSON dışa aktarma, oturum geçmişi (localStorage)
 */
(function () {
  "use strict";

  const { CRITERIA, BANDS, TASKS } = window.RUBRIC;

  /* ----------------------------- DOM kısayolları ----------------------------- */
  const $ = (id) => document.getElementById(id);
  const steps = {
    setup: $("setupStep"),
    record: $("recordStep"),
    result: $("resultStep")
  };

  /* ----------------------------- Durum (state) ------------------------------- */
  const state = {
    task: TASKS[0],
    recording: false,
    startTime: 0,
    elapsedMs: 0,        // konuşma süresi (analizde kullanılır)
    timerInt: null,
    recognizer: null,
    finalText: "",       // tanıma tarafından kesinleşmiş metin
    confidences: [],     // tanıma güven skorları (telaffuz vekili)
    audio: null,         // AudioAnalyzer örneği (akustik ses analizi)
    acoustic: null,      // ses dalgasından çıkarılan ölçümler
    audioBlob: null,     // ses kaydı (öğretmenin dinlemesi için)
    audioUrl: null,
    vizRAF: null,        // canlı ses görselleştirici animasyon kimliği
    scores: null,        // hesaplanan { criterionId: {raw, band, ...} }
    history: loadHistory(),
    mode: "single",      // "single" | "exam"
    view: "single",      // aktif sekme
    classes: loadClasses(),
    currentClassId: null,
    examClassId: null,   // sınav modunda seçili sınıf
    examStudentId: null, // sınav modunda seçili öğrenci
    examResults: {}      // { classId: { studentId: rec } } — oturum içi ilerleme
  };

  /* ============================================================ */
  /* HAZIRLIK ADIMI                                               */
  /* ============================================================ */
  function initSetup() {
    const sel = $("taskSelect");
    // Görevleri temalarına göre <optgroup> içinde grupla (her temada 3–5 konu)
    const order = [];
    const byTheme = new Map();
    TASKS.forEach((t) => {
      if (!byTheme.has(t.theme)) { byTheme.set(t.theme, []); order.push(t.theme); }
      byTheme.get(t.theme).push(t);
    });
    sel.innerHTML = order.map((th) =>
      `<optgroup label="${escapeHtml(th)}">` +
      byTheme.get(th).map((t) => `<option value="${t.id}">${escapeHtml(t.title)}</option>`).join("") +
      `</optgroup>`
    ).join("");
    sel.addEventListener("change", () => {
      state.task = TASKS.find((t) => t.id === sel.value) || TASKS[0];
      renderTaskCard();
    });
    renderTaskCard();

    // Tarayıcı uyarısı: Chromium dışı tarayıcıda güçlendir
    const isChromium = /Chrome|Chromium|Edg/.test(navigator.userAgent) && !!window.chrome;
    if (!isChromium) {
      const bn = $("browserNote");
      if (bn) {
        bn.classList.add("warn");
        bn.innerHTML = "<strong>Dikkat:</strong> Şu an Chrome/Edge dışı bir tarayıcı kullanıyor olabilirsiniz. " +
          "Otomatik konuşma tanıma, ses analizi ve Whisper düzgün çalışmayabilir. Lütfen " +
          "<strong>Google Chrome</strong> veya <strong>Microsoft Edge</strong> ile açın.";
      }
    }

    // Web Speech API desteği kontrolü
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const note = $("speechSupport");
      note.hidden = false;
      note.textContent =
        "Bu tarayıcı otomatik konuşma tanımayı desteklemiyor (Chrome/Edge gerekir). " +
        "Kayıt sırasında öğrencinin söylediklerini metin alanına elle yazarak yine de değerlendirme yapabilirsiniz.";
    }

    // Ad-soyad ve sınıf isteğe bağlıdır; doğrudan kayıt adımına geçilir.
    $("goToRecordBtn").addEventListener("click", goToRecord);
  }

  function renderTaskCard() {
    const t = state.task;
    $("taskTitle").textContent = t.title;
    $("taskPrompt").textContent = t.prompt;
    $("taskLevel").textContent = t.level;
    $("taskDuration").textContent = `Önerilen süre: ~${Math.round(t.seconds / 60 * 10) / 10} dk`;
    $("taskHints").innerHTML = t.hints.map((h) => `<li>${escapeHtml(h)}</li>`).join("");
  }

  /* ============================================================ */
  /* KAYIT ADIMI                                                  */
  /* ============================================================ */
  function goToRecord() {
    // Tekli modda Whisper seçeneği setup'taki checkbox'tan; sınav modunda state'ten gelir
    if (state.mode !== "exam") {
      state.useWhisper = !!($("useWhisper") && $("useWhisper").checked);
    }
    const ws = $("whisperStatus");
    if (state.useWhisper) {
      preloadWhisper();              // modeli arka planda erkenden indirmeye başla
    } else if (ws) {
      ws.hidden = true;
    }
    showFlow("record");
    $("recordTaskTitle").textContent = state.task.title;
    $("recordTaskPrompt").textContent = state.task.prompt;
    resetRecording();
  }

  function resetRecording() {
    stopRecognition();
    stopVisualizer();
    state.recording = false;
    state.elapsedMs = 0;
    state.finalText = "";
    state.confidences = [];
    state.acoustic = null;
    if (state.audioUrl) { URL.revokeObjectURL(state.audioUrl); state.audioUrl = null; }
    state.audioBlob = null;
    $("transcript").value = "";
    $("recTimer").textContent = "00:00";
    $("recStatusText").textContent = "Hazır";
    $("recDot").classList.remove("active");
    $("startBtn").disabled = false;
    $("stopBtn").disabled = true;
  }

  async function startRecording() {
    // Akustik ses analizini başlat (mikrofon erişimi burada istenir)
    state.acoustic = null;
    state.audio = window.AudioAnalyzer ? window.AudioAnalyzer.create() : null;
    if (state.audio) {
      try {
        await state.audio.start();
      } catch (err) {
        state.audio = null;
        $("recStatusText").textContent = "Mikrofona erişilemedi — sesi elle değerlendirin.";
        return;
      }
    }

    state.recording = true;
    state.startTime = Date.now();
    $("startBtn").disabled = true;
    $("stopBtn").disabled = false;
    $("recDot").classList.add("active");
    $("recStatusText").textContent = "Kaydediliyor…";

    // Süre sayacı
    state.timerInt = setInterval(() => {
      const ms = Date.now() - state.startTime;
      $("recTimer").textContent = formatTime(ms);
    }, 250);

    startVisualizer();
    startRecognition();
  }

  async function stopRecording() {
    if (!state.recording) return;
    state.recording = false;
    state.elapsedMs = Date.now() - state.startTime;
    clearInterval(state.timerInt);
    stopVisualizer();          // analiz bağlamı kapanmadan önce çizimi durdur
    stopRecognition();
    $("startBtn").disabled = false;
    $("stopBtn").disabled = true;
    $("recDot").classList.remove("active");
    $("recStatusText").textContent = "Ses çözümleniyor…";

    // Akustik analizi sonlandır ve ölçümleri + ses kaydını al
    if (state.audio) {
      try {
        const result = await state.audio.stop();
        state.acoustic = result.metrics;
        if (result.audioBlob) {
          state.audioBlob = result.audioBlob;
          state.audioUrl = URL.createObjectURL(result.audioBlob);
        }
      } catch (_) { /* yoksay */ }
      state.audio = null;
    }
    $("recStatusText").textContent = `Tamamlandı · ${formatTime(state.elapsedMs)}`;
  }

  function startRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return; // desteklenmiyorsa elle giriş
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    state.recognizer = rec;

    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        if (res.isFinal) {
          state.finalText += res[0].transcript + " ";
          if (typeof res[0].confidence === "number" && res[0].confidence > 0) {
            state.confidences.push(res[0].confidence);
          }
        } else {
          interim += res[0].transcript;
        }
      }
      $("transcript").value = (state.finalText + interim).replace(/\s+/g, " ").trimStart();
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        $("recStatusText").textContent = "Mikrofon izni verilmedi — metni elle girebilirsiniz.";
      }
    };

    // continuous mod bazı tarayıcılarda kendini durdurur; kayıt sürerken tekrar başlat
    rec.onend = () => {
      if (state.recording) {
        try { rec.start(); } catch (_) { /* zaten çalışıyor olabilir */ }
      }
    };

    try { rec.start(); } catch (_) { /* yoksay */ }
  }

  function stopRecognition() {
    if (state.recognizer) {
      try { state.recognizer.onend = null; state.recognizer.stop(); } catch (_) {}
      state.recognizer = null;
    }
  }

  /* ============================================================ */
  /* WHISPER — ücretsiz, tarayıcıda daha doğru yazıya dökme       */
  /* (OpenAI Whisper, transformers.js / ONNX-WASM ile)            */
  /* ============================================================ */
  const WHISPER_MODEL = "Xenova/whisper-base.en"; // İngilizce, dengeli boyut/doğruluk
  const WHISPER_READY_FLAG = "tymm_whisper_ready"; // model daha önce indirildi mi
  const WHISPER_RTF_KEY = "tymm_whisper_rtf";      // ölçülen gerçek-zaman oranı (cihaz hızı)

  // RTF = çözümleme süresi / ses süresi. Cihaz hızına göre kalibre edilir.
  function getRtf() { const v = parseFloat(localStorage.getItem(WHISPER_RTF_KEY)); return (v && v > 0) ? v : 2.0; }
  function saveRtfSample(rtf) {
    rtf = clamp(rtf, 0.2, 12);
    const prev = parseFloat(localStorage.getItem(WHISPER_RTF_KEY));
    const next = (prev && prev > 0) ? prev * 0.7 + rtf * 0.3 : rtf; // üstel hareketli ortalama
    try { localStorage.setItem(WHISPER_RTF_KEY, String(Math.round(next * 100) / 100)); } catch (_) {}
  }
  function estSecFor(audioSec) { return clamp(audioSec * getRtf() + 1.5, 4, 240); }
  let _whisperPipe = null, _whisperLoading = null;
  let _whisperWorker = null, _whisperJob = null;
  let _whisperModelReady = false; // model belleğe yüklendi mi (tahmini ilerleme için)
  const _wFiles = {}; // dosya bazında indirme ilerlemesi

  function whisperWasDownloaded() {
    try { return localStorage.getItem(WHISPER_READY_FLAG) === "1"; } catch (_) { return false; }
  }

  function setWhisperUI(pct, text, cls) {
    const box = $("whisperStatus");
    if (!box) return;
    box.hidden = false;
    box.classList.remove("ready", "error");
    if (cls) box.classList.add(cls);
    const bar = $("whisperBar");
    if (bar && pct != null) bar.style.width = clamp(pct, 0, 100) + "%";
    const t = $("whisperStatusText");
    if (t && text != null) t.textContent = text;
  }

  // İndirme ilerlemesi (worker ya da ana iş parçacığından) → durum çubuğu + yükleniyor ekranı
  function onWhisperProgress(p) {
    if (!p || !p.file) return;
    if (p.status === "progress" && p.total) {
      _wFiles[p.file] = { loaded: p.loaded || 0, total: p.total };
      let L = 0, T = 0;
      for (const k in _wFiles) { L += _wFiles[k].loaded; T += _wFiles[k].total; }
      const pct = T ? (L / T) * 100 : 0;
      if (pct < 100) {
        setWhisperUI(pct, `indiriliyor… %${Math.round(pct)} (tek seferlik)`);
        if (_loadingActive) setLoading(`Whisper modeli indiriliyor… %${Math.round(pct)}`, pct);
      }
    }
  }

  function preloadWhisper() {
    // Model bir kez indirilir; sonraki açılışlarda tarayıcı önbelleğinden gelir.
    const cached = whisperWasDownloaded();
    setWhisperUI(cached ? 100 : 0, cached ? "önbellekten yükleniyor…" : "ilk kez indiriliyor (tek seferlik)…");
    try { getWhisperWorker().postMessage({ kind: "load" }); }
    catch (_) { /* worker kurulamazsa transcribe sırasında ana iş parçacığına düşülür */ }
  }

  // Whisper'ı bir Web Worker'da çalıştır → ağır hesaplama arayüzü kilitlemez (donma yok)
  function getWhisperWorker() {
    if (_whisperWorker) return _whisperWorker;
    const cdnList = [
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",
      "https://esm.sh/@xenova/transformers@2.17.2",
      "https://unpkg.com/@xenova/transformers@2.17.2"
    ];
    const code = `
      const CDNS = ${JSON.stringify(cdnList)};
      const MODEL = ${JSON.stringify(WHISPER_MODEL)};
      let pipe = null;
      async function ensure() {
        if (pipe) return;
        let mod, err;
        for (const u of CDNS) { try { mod = await import(u); break; } catch (e) { err = e; } }
        if (!mod) throw err || new Error("transformers yüklenemedi");
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        pipe = await mod.pipeline("automatic-speech-recognition", MODEL, {
          quantized: true,
          progress_callback: (p) => self.postMessage({ kind: "progress", p: p })
        });
        self.postMessage({ kind: "ready" });
      }
      self.onmessage = async (e) => {
        const msg = e.data || {};
        try {
          await ensure();
          if (msg.kind === "transcribe") {
            const out = await pipe(msg.pcm, { chunk_length_s: 30, stride_length_s: 5 });
            self.postMessage({ kind: "result", text: (out && out.text) || "" });
          }
        } catch (err) {
          self.postMessage({ kind: "error", error: String((err && err.message) || err) });
        }
      };
    `;
    const url = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    const w = new Worker(url, { type: "module" });
    w.addEventListener("message", (e) => {
      const d = e.data || {};
      if (d.kind === "progress") onWhisperProgress(d.p);
      else if (d.kind === "ready") {
        _whisperModelReady = true;
        try { localStorage.setItem(WHISPER_READY_FLAG, "1"); } catch (_) {}
        setWhisperUI(100, "hazır ✓", "ready");
      } else if (d.kind === "result") {
        if (_whisperJob) { _whisperJob.resolve((d.text || "").replace(/\s+/g, " ").trim()); _whisperJob = null; }
      } else if (d.kind === "error") {
        if (_whisperJob) { _whisperJob.reject(new Error(d.error)); _whisperJob = null; }
      }
    });
    w.addEventListener("error", () => { if (_whisperJob) { _whisperJob.reject(new Error("worker hatası")); _whisperJob = null; } });
    _whisperWorker = w;
    return w;
  }

  function workerTranscribe(pcm) {
    const w = getWhisperWorker();
    return new Promise((resolve, reject) => {
      _whisperJob = { resolve, reject };
      const copy = new Float32Array(pcm); // transfer için kopya (orijinal yedekte kalır)
      w.postMessage({ kind: "transcribe", pcm: copy }, [copy.buffer]);
    });
  }

  // transformers.js'i birden çok CDN'den dene (biri engelliyse diğeri)
  async function importTransformers() {
    const cdns = [
      "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2",
      "https://esm.sh/@xenova/transformers@2.17.2",
      "https://unpkg.com/@xenova/transformers@2.17.2"
    ];
    let lastErr;
    for (const url of cdns) {
      try { return await import(/* @vite-ignore */ url); }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("transformers.js yüklenemedi");
  }

  // Ana iş parçacığı yedeği (worker kullanılamazsa)
  function getWhisper() {
    if (_whisperPipe) return Promise.resolve(_whisperPipe);
    if (!_whisperLoading) {
      _whisperLoading = (async () => {
        const mod = await importTransformers();
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
        const pipe = await mod.pipeline("automatic-speech-recognition", WHISPER_MODEL, {
          quantized: true, progress_callback: onWhisperProgress
        });
        _whisperPipe = pipe;
        _whisperModelReady = true;
        try { localStorage.setItem(WHISPER_READY_FLAG, "1"); } catch (_) {}
        setWhisperUI(100, "hazır ✓", "ready");
        return pipe;
      })();
    }
    return _whisperLoading;
  }

  async function mainThreadTranscribe(pcm) {
    const pipe = await getWhisper();
    const out = await pipe(pcm, { chunk_length_s: 30, stride_length_s: 5 });
    return (out && out.text ? out.text : "").replace(/\s+/g, " ").trim();
  }

  async function transcribeWithWhisper(blob) {
    const pcm = await blobToMono16k(blob);            // ses çözme (hızlı, async)
    try {
      return await workerTranscribe(pcm);             // worker → arayüz kilitlenmez
    } catch (e) {
      try { return await mainThreadTranscribe(pcm); } // yedek
      catch (_) { throw e; }
    }
  }

  // Worker'ı ve durumunu sıfırla (tekrar denemede taze başlangıç için)
  function resetWhisperWorker() {
    if (_whisperWorker) { try { _whisperWorker.terminate(); } catch (_) {} _whisperWorker = null; }
    _whisperJob = null;
    _whisperPipe = null;
    _whisperLoading = null;
    _whisperModelReady = false;
    for (const k in _wFiles) delete _wFiles[k];
  }

  // Çözümleme için tahmini ilerleme: ses süresine göre asimptotik dolan çubuk + kalan süre.
  // (Whisper inference gerçek yüzde yayınlamaz; bu yüzden tahmin gösterilir.)
  function startTranscribeProgress(estSec) {
    const tau = Math.max(estSec / 2.3, 1); // tahmini sürede ~%90'a ulaşır
    let readyAt = _whisperModelReady ? performance.now() : null;
    const tick = () => {
      if (!_loadingActive) return;
      if (!_whisperModelReady) { readyAt = null; return; } // model hazırlık fazı (indirme % gösterilir)
      if (readyAt == null) readyAt = performance.now();
      const elapsed = (performance.now() - readyAt) / 1000;
      const pct = Math.min(97, (1 - Math.exp(-elapsed / tau)) * 100); // erken "bitti" demez
      const remaining = Math.round(estSec - elapsed);
      const txt = remaining > 1 ? `Ses çözümleniyor… (~${remaining} sn kaldı)` : "Ses çözümleniyor… (neredeyse bitti)";
      setLoading(txt, pct);
    };
    const id = setInterval(tick, 200);
    tick();
    return () => clearInterval(id);
  }

  // Otomatik (1 kez) + kullanıcı onaylı tekrar deneme; "Devam et" seçilirse null döner
  async function transcribeWithRetryUI(blob) {
    // Çözümleme süresi tahmini: ses süresi × ölçülen cihaz hızı (RTF, her seferinde kalibre)
    const audioSec = (state.acoustic && state.acoustic.speechSec) || (state.elapsedMs / 1000) || 20;
    const estSec = estSecFor(audioSec);
    for (;;) {
      const wasReady = _whisperModelReady; // model zaten hazırsa süre ~saf çözümleme süresidir
      const t0 = performance.now();
      setLoading(_whisperModelReady ? `Ses çözümleniyor… (~${Math.round(estSec)} sn)` : "Whisper modeli hazırlanıyor…");
      const stopProgress = startTranscribeProgress(estSec);
      try {
        const txt = await retry(() => transcribeWithWhisper(blob), 1, 1500);
        stopProgress();
        if (wasReady) saveRtfSample(((performance.now() - t0) / 1000) / Math.max(audioSec, 1)); // ortalamayı güncelle
        setLoading("Tamamlandı", 100);
        return txt;
      } catch (e) {
        stopProgress();
        const choice = await showLoadingError("Çözümleme başarısız oldu (internet veya model hatası). Tekrar deneyebilirsin.");
        if (choice === "retry") { resetWhisperWorker(); continue; }
        return null; // tarayıcı metniyle devam
      }
    }
  }

  // Ses kaydını (webm/opus) 16 kHz mono Float32'ye çöz — Whisper bunu bekler
  async function blobToMono16k(blob) {
    const buf = await blob.arrayBuffer();
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(buf);
    try { ctx.close(); } catch (_) {}
    const ch = decoded.numberOfChannels, len = decoded.length;
    let data = decoded.getChannelData(0);
    if (ch > 1) {
      const mix = new Float32Array(len);
      for (let c = 0; c < ch; c++) {
        const d = decoded.getChannelData(c);
        for (let i = 0; i < len; i++) mix[i] += d[i] / ch;
      }
      data = mix;
    }
    if (decoded.sampleRate === 16000) return data;
    const ratio = 16000 / decoded.sampleRate;
    const outLen = Math.round(len * ratio);
    const out = new Float32Array(outLen);
    for (let i = 0; i < outLen; i++) {
      const t = i / ratio, i0 = Math.floor(t), i1 = Math.min(i0 + 1, len - 1);
      const f = t - i0;
      out[i] = data[i0] * (1 - f) + data[i1] * f;
    }
    return out;
  }

  /* ============================================================ */
  /* CANLI SES GÖRSELLEŞTİRİCİ (frekans çubukları)               */
  /* ============================================================ */
  function sizeCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 600, h = canvas.clientHeight || 60;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    return canvas.getContext("2d");
  }

  function startVisualizer() {
    const canvas = $("visualizer");
    if (!canvas || !state.audio || !state.audio.getAnalyser) return;
    const analyser = state.audio.getAnalyser();
    if (!analyser) return;
    const ctx = sizeCanvas(canvas);
    state._vizResize = () => sizeCanvas(canvas);
    window.addEventListener("resize", state._vizResize);

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const BARS = 56;
    const accent = (getComputedStyle(document.documentElement).getPropertyValue("--accent") || "#1f5132").trim();
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      state.vizRAF = requestAnimationFrame(draw);
      let data;
      try { analyser.getByteFrequencyData(bins); data = bins; } catch (_) { return; }
      const w = canvas.width, h = canvas.height, mid = h / 2;
      ctx.clearRect(0, 0, w, h);
      const used = Math.floor(data.length * 0.42); // konuşma/ses bandı
      const gap = 2 * dpr;
      const bw = (w - (BARS - 1) * gap) / BARS;
      for (let i = 0; i < BARS; i++) {
        // logaritmik dağılım: düşük frekanslara daha çok çözünürlük
        const s = Math.floor(Math.pow(i / BARS, 1.5) * used);
        const e = Math.max(s + 1, Math.floor(Math.pow((i + 1) / BARS, 1.5) * used));
        let sum = 0, n = 0;
        for (let j = s; j < e && j < data.length; j++) { sum += data[j]; n++; }
        const v = (n ? sum / n : 0) / 255;
        const bh = Math.max(v * (h * 0.9), 2 * dpr);
        const x = i * (bw + gap);
        roundBar(ctx, x, mid - bh / 2, bw, bh, Math.min(bw / 2, 3 * dpr));
        ctx.fillStyle = rgbaFromHex(accent, 0.32 + 0.68 * v);
        ctx.fill();
      }
    };
    draw();
  }

  function stopVisualizer() {
    if (state.vizRAF) { cancelAnimationFrame(state.vizRAF); state.vizRAF = null; }
    if (state._vizResize) { window.removeEventListener("resize", state._vizResize); state._vizResize = null; }
    const canvas = $("visualizer");
    if (canvas && canvas.getContext) drawIdleBaseline(canvas);
  }

  // Kayıt yokken sönük bir taban çizgisi göster
  function drawIdleBaseline(canvas) {
    const ctx = sizeCanvas(canvas);
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width, h = canvas.height, mid = h / 2;
    ctx.clearRect(0, 0, w, h);
    const BARS = 56, gap = 2 * dpr, bw = (w - (BARS - 1) * gap) / BARS;
    ctx.fillStyle = rgbaFromHex("#1f5132", 0.14);
    for (let i = 0; i < BARS; i++) {
      const x = i * (bw + gap), bh = 2 * dpr;
      roundBar(ctx, x, mid - bh / 2, bw, bh, 1 * dpr);
      ctx.fill();
    }
  }

  function roundBar(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function rgbaFromHex(hex, a) {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
    const r = parseInt(hex.substr(0, 2), 16) || 31;
    const g = parseInt(hex.substr(2, 2), 16) || 81;
    const b = parseInt(hex.substr(4, 2), 16) || 50;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  /* ============================================================ */
  /* PUANLAMA MOTORU                                              */
  /* ============================================================ */

  // Çok sık görülen "temel" sözcükler (söz dağarcığı çeşitliliği ölçümünde
  // ileri sözcükleri ayırmak için). Kısa ve genel bir liste yeterli.
  const STOPWORDS = new Set("a an the and or but so to of in on at it is am are was were be been being i you he she we they me him her us them my your his our their this that these those for with as do does did have has had will would can could should may might not no yes very really just like".split(" "));
  const FILLERS = ["uh", "um", "er", "erm", "hmm", "like", "you know", "i mean", "well"];

  function tokenize(text) {
    return (text.toLowerCase().match(/[a-z']+/g) || []);
  }

  function analyze(text) {
    const clean = text.trim().replace(/\s+/g, " ");
    const words = tokenize(clean);
    const wordCount = words.length;

    // Cümle bölme (STT noktalama koymayabilir; yine de en iyi gayretle)
    const sentences = clean.split(/[.!?]+|\n/).map((s) => s.trim()).filter(Boolean);
    const sentenceCount = Math.max(sentences.length, wordCount > 0 ? 1 : 0);
    const avgSentLen = sentenceCount ? wordCount / sentenceCount : 0;

    const uniqueWords = new Set(words);
    const ttr = wordCount ? uniqueWords.size / wordCount : 0;           // tür-belirteç oranı
    const contentWords = [...uniqueWords].filter((w) => !STOPWORDS.has(w) && w.length > 2);
    const advancedWords = contentWords.filter((w) => w.length >= 7).length;
    const structureSignals = countStructureSignals(clean);             // bağlaç/zaman çeşitliliği
    const fillerCount = countFillers(clean);

    const ac = state.acoustic;                                          // akustik ses ölçümleri (varsa)
    const speechSec = ac && ac.speechSec ? ac.speechSec : Math.max(state.elapsedMs / 1000, wordCount / 2.2);
    const wps = speechSec > 0 ? wordCount / speechSec : 0;              // tanınan kelime / konuşma sn
    const wpm = Math.round(wps * 60);

    const kw = state.task.keywords || [];
    const hits = kw.filter((k) => uniqueWords.has(k.toLowerCase())).length;
    const coverage = kw.length ? hits / kw.length : 0;

    // ---- konuşma varlığı kapısı (gürültü/sessizlik ayrımı) ----
    const intelligibleContent = clamp(wordCount / 8, 0, 1);            // metin ölçütleri için (0 kelime => 0)
    let presence = 1;                                                  // akustik ölçütler için
    if (ac) {
      const vr = clamp((ac.voicedRatio || 0) / 0.20, 0, 1);            // sesli (F0'lı) kare oranı
      const syl = clamp((ac.syllables || 0) / 10, 0, 1);              // hece yapısı
      presence = Math.max(Math.min(vr, syl), clamp(wordCount / 5, 0, 1));
    }

    // ===== 1) UYUM — göreve/konuya uygunluk =====
    const lengthPresence = map(wordCount, 8, 60, 35, 100);
    let uyum = clamp(coverage * 100 * 0.6 + lengthPresence * 0.4, 0, 100);
    uyum *= intelligibleContent;

    // ===== 2) ORGANİZASYON — düzen, bağlaçlar, giriş-gelişme-sonuç =====
    let organizasyon = clamp(
      map(sentenceCount, 1, 5, 40, 85) * 0.5 +
      map(structureSignals, 1, 7, 40, 95) * 0.5,
      0, 100
    );
    if (avgSentLen > 22) organizasyon -= 12;                           // bölünememiş, kontrolsüz akış
    organizasyon = clamp(organizasyon, 0, 100) * intelligibleContent;

    // ===== 3) SUNUM — akıcılık + telaffuz/anlaşılırlık (GERÇEK SES) =====
    let sunum;
    if (ac) {
      const intelligibility = clamp(map(wps, 0.3, 1.8, 20, 100), 0, 100);
      const confScore = state.confidences.length
        ? clamp(map(avg(state.confidences), 0.55, 0.92, 40, 100), 0, 100) : 60;
      sunum = ac.fluencyScore * 0.40 + intelligibility * 0.25 + confScore * 0.18
        + ac.intonationScore * 0.09 + ac.deliveryScore * 0.08;
      sunum -= Math.min(fillerCount * 3, 15);
      if (ac.speechSec >= 6 && wordCount < 5) sunum = Math.min(sunum, 30); // bol ses, anlaşılır kelime yok
    } else {
      // Ses analizi yoksa (elle giriş) metinden tahmin
      sunum = clamp(map(wpm, 40, 110, 35, 95), 0, 100) - Math.min(fillerCount * 4, 25);
    }
    sunum = clamp(sunum, 0, 100) * presence;

    // ===== 4) DİL — dilbilgisi + söz dağarcığı =====
    let grammarScore = clamp(map(avgSentLen, 3, 9, 45, 90) + Math.min(structureSignals * 3, 15), 0, 100);
    if (avgSentLen > 22) grammarScore -= 15;
    const vocabScore = clamp(
      map(ttr, 0.35, 0.7, 40, 95) * 0.5 + map(contentWords.length, 4, 30, 40, 100) * 0.5, 0, 100
    );
    let dil = clamp(grammarScore * 0.5 + vocabScore * 0.5, 0, 100);
    dil *= intelligibleContent;

    // ===== 5) YARATICILIK — özgünlük, ifade zenginliği (sezgisel) =====
    let yaraticilik = clamp(
      map(ttr, 0.4, 0.75, 35, 90) * 0.4 +
      map(advancedWords, 1, 8, 40, 95) * 0.3 +
      map(contentWords.length, 5, 25, 40, 95) * 0.3,
      0, 100
    );
    yaraticilik *= intelligibleContent;
    yaraticilik = Math.min(yaraticilik, 88);                           // öznel ölçüt: tavan törpülenir, öğretmen artırır

    // Gerçek konuşma yok (gürültü/sessizlik) => açıkça sıfır
    const noSpeech = (wordCount === 0) && (!ac || presence < 0.15);
    if (noSpeech) { uyum = organizasyon = sunum = dil = yaraticilik = 0; }

    const raw = {
      uyum: Math.round(clamp(uyum, 0, 100)),
      organizasyon: Math.round(clamp(organizasyon, 0, 100)),
      sunum: Math.round(clamp(sunum, 0, 100)),
      dil: Math.round(clamp(dil, 0, 100)),
      yaraticilik: Math.round(clamp(yaraticilik, 0, 100))
    };

    return {
      raw,
      metrics: {
        wordCount, wpm, sentenceCount, ttr: round2(ttr), fillerCount,
        keywordHits: hits, keywordTotal: kw.length,
        wordsPerSpeechSec: round2(wps),
        presence: round2(presence),
        noSpeech: noSpeech,
        acoustic: ac || null
      }
    };
  }

  /* puanlama yardımcıları */
  function countFillers(text) {
    const t = " " + text.toLowerCase() + " ";
    let n = 0;
    FILLERS.forEach((f) => {
      const re = new RegExp("\\b" + f.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "g");
      n += (t.match(re) || []).length;
    });
    return n;
  }
  function countImmediateRepeats(words) {
    let n = 0;
    for (let i = 1; i < words.length; i++) if (words[i] === words[i - 1]) n++;
    return n;
  }
  function countStructureSignals(text) {
    // farklı zaman/yapı işaretleri çeşitliliği
    const t = " " + text.toLowerCase() + " ";
    const patterns = [/\b\w+ed\b/, /\b\w+ing\b/, /\bwill\b/, /\bwould\b/, /\bbecause\b/, /\bif\b/, /\bwhen\b/, /\bbut\b/, /\band\b/, /\bto \w+/];
    return patterns.reduce((c, p) => c + (p.test(t) ? 1 : 0), 0);
  }

  /* kriter puanı (0-20) → düzey bandı (1-4) */
  function toBand(pts) {
    if (pts >= 17) return 4;
    if (pts >= 13) return 3;
    if (pts >= 9) return 2;
    return 1;
  }

  // Her kriter 0-20; toplam = beş kriterin toplamı (0-100)
  function computeTotal(rawByCriterion) {
    let total = 0;
    CRITERIA.forEach((c) => { total += (rawByCriterion[c.id] || 0); });
    return Math.round(total);
  }

  function totalBand(score) {
    return BANDS.find((b) => score >= b.min) || BANDS[BANDS.length - 1];
  }

  /* ============================================================ */
  /* SONUÇ ADIMI                                                  */
  /* ============================================================ */
  function runEvaluation() {
    const text = $("transcript").value.trim();
    // Metin yoksa bile akustik ses verisi varsa değerlendirme yapılabilir
    // (öğrenci konuştu ama anlaşılır kelime çıkmadıysa: bu da bir sonuçtur).
    if (text.length < 2 && !state.acoustic) {
      $("transcript").focus();
      $("transcript").classList.add("invalid");
      toast("Değerlendirme için ses kaydı veya metin gerekli.");
      return;
    }
    const { raw, metrics } = analyze(text);
    state.scores = {};
    CRITERIA.forEach((c) => {
      const pts = Math.round(raw[c.id] / 5); // dahili 0-100 ölçeği -> 0-20 puan
      state.scores[c.id] = { raw: pts, band: toBand(pts) };
    });
    state.metrics = metrics;
    state.transcriptText = text;
    renderResult();
    showFlow("result");
  }

  function renderResult() {
    $("resStudent").textContent = $("studentName").value.trim() || "—";
    $("resClass").textContent = $("studentClass").value.trim() || "—";
    $("resTask").textContent = `${state.task.title} · ${state.task.theme}`;

    renderAudioPanel();

    const list = $("criteriaList");
    list.innerHTML = "";
    CRITERIA.forEach((c) => {
      const s = state.scores[c.id];
      const row = document.createElement("div");
      row.className = "criterion";
      row.innerHTML = `
        <div class="criterion-head">
          <div>
            <strong>${c.name}</strong> <span class="crit-en">${c.en}</span>
            <p class="crit-desc">${c.desc}</p>
          </div>
          <div class="crit-score">
            <span class="band-pill band-${s.band}">Düzey ${s.band}/4</span>
            <span class="score-edit"><input type="number" min="0" max="20" value="${s.raw}" class="raw-input" data-crit="${c.id}" aria-label="${c.name} puanı" /><em>/20</em></span>
          </div>
        </div>
        <div class="meter"><div class="meter-fill band-${s.band}" style="width:${s.raw * 5}%"></div></div>
        <p class="band-desc">${c.bands[s.band]}</p>
      `;
      list.appendChild(row);
    });

    // öğretmen elle puan düzeltebilir
    list.querySelectorAll(".raw-input").forEach((inp) => {
      inp.addEventListener("input", () => {
        let v = clamp(parseInt(inp.value, 10) || 0, 0, 20);
        const cid = inp.dataset.crit;
        state.scores[cid] = { raw: v, band: toBand(v) };
        refreshScoreVisualsFor(cid, inp);
        updateTotals();
      });
    });

    updateTotals();
  }

  // Ses oynatıcı + akustik ölçüm rozetleri
  function renderAudioPanel() {
    const panel = $("audioPanel");
    const ac = state.acoustic;
    const player = $("audioPlayer");
    if (state.audioUrl) {
      player.src = state.audioUrl;
      player.hidden = false;
      $("downloadAudioBtn").hidden = false;
    } else {
      player.hidden = true;
      $("downloadAudioBtn").hidden = true;
    }
    const chips = $("acousticChips");
    if (ac) {
      const items = [
        ["Konuşma süresi", `${ac.speechSec} sn / ${ac.totalSec} sn`],
        ["Konuşma oranı", `%${Math.round(ac.speechRatio * 100)}`],
        ["Duraklama", `${ac.pauseCount} (uzun: ${ac.longPauseCount})`],
        ["Konuşma hızı", `${ac.articulationRate} hece/sn`],
        ["Tonlama değişimi", `${ac.pitchVarSemitones} yarım ton`],
        ["Ses kararlılığı", `%${Math.round(ac.loudnessStability * 100)}`]
      ];
      chips.innerHTML = items.map(([k, v]) => `<span class="achip"><b>${v}</b>${k}</span>`).join("");
    } else {
      chips.innerHTML = `<span class="achip achip-warn">Akustik ölçüm yok — ses kaydı yapılmadı (metinden değerlendirildi).</span>`;
    }
    panel.hidden = !ac && !state.audioUrl;
  }

  // Tek sayfalık yazdırma/PDF raporunu oluştur (güncel puan ve notları yansıtır)
  // Raporu bir kayıt (buildRecord çıktısı) nesnesinden üretir — hem canlı sonuç
  // hem de sonradan kaydedilmiş raporlar için aynı işlev kullanılır.
  function buildPrintReport(rec) {
    const total = rec.total != null ? rec.total : 0;
    const band = totalBand(total);
    const name = rec.student || "—";
    const cls = rec.class || "—";
    const note = (rec.teacherNote || "").trim();
    const task = rec.task || {};
    const date = new Date(rec.date || Date.now()).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

    const rows = (rec.criteria || []).map((sc) => {
      const c = CRITERIA.find((x) => x.id === sc.id) || { name: sc.name, en: "", bands: {}, advice: {} };
      const bandTxt = (c.bands && c.bands[sc.band]) || "";
      const adviceTxt = (c.advice && c.advice[sc.band]) || "";
      return `
        <tr>
          <td class="prc-name">${escapeHtml(c.name)}<small>${escapeHtml(c.en || "")}</small></td>
          <td class="prc-score"><span class="prc-band b${sc.band}">${sc.raw}</span></td>
          <td class="prc-level">Düzey ${sc.band}/4</td>
          <td class="prc-advice"><span class="prc-state">${escapeHtml(bandTxt)}</span> ${escapeHtml(adviceTxt)}</td>
        </tr>`;
    }).join("");

    const ac = rec.metrics && rec.metrics.acoustic;
    const acLine = ac
      ? `Konuşma süresi ${ac.speechSec} sn · doluluk %${Math.round(ac.speechRatio * 100)} · ${ac.pauseCount} duraklama · ${ac.articulationRate} hece/sn · tonlama ${ac.pitchVarSemitones} yarım ton`
      : "";

    // Geri bildirim: güçlü yönler + öneriler (kayıttaki kriterlerden)
    const fbEntries = (rec.criteria || []).map((sc) => {
      const c = CRITERIA.find((x) => x.id === sc.id) || { name: sc.name, bands: {}, advice: {} };
      return { c: c, raw: sc.raw, band: sc.band };
    });
    const fb = feedbackBuckets(fbEntries);
    const strongLine = fb.strengths.length
      ? fb.strengths.map((e) => escapeHtml(e.c.name)).join(", ")
      : "—";
    const improveItems = fb.improvements.length
      ? fb.improvements.map((e) => `<li><b>${escapeHtml(e.c.name)}:</b> ${escapeHtml((e.c.advice && e.c.advice[e.band]) || "")}</li>`).join("")
      : `<li>Tüm ölçütlerde iyi düzeyde; bu seviyeyi korumak için düzenli pratik önerilir.</li>`;

    $("printReport").innerHTML = `
      <div class="pr-sheet">
        <div class="pr-head">
          <div class="pr-id">
            <h1>İngilizce Konuşma Becerisi Değerlendirme Raporu</h1>
            <p>9. Sınıf · CEFR A2 · İngilizce</p>
          </div>
          <div class="pr-total b${totalToBand(total)}">
            <span class="pr-total-num">${total}</span><span class="pr-total-den">/100</span>
            <em>${escapeHtml(band.label)}</em>
          </div>
        </div>

        <div class="pr-meta">
          <div><span>Öğrenci</span><strong>${escapeHtml(name)}</strong></div>
          <div><span>Sınıf</span><strong>${escapeHtml(cls)}</strong></div>
          <div><span>Tarih</span><strong>${date}</strong></div>
          <div class="pr-meta-task"><span>Konuşma Görevi</span><strong>${escapeHtml(task.title || "")}${task.theme ? " — " + escapeHtml(task.theme) : ""}</strong></div>
        </div>

        <table class="pr-table">
          <thead><tr><th>Ölçüt</th><th>Puan (0-20)</th><th>Düzey</th><th>Durum ve yapman gerekenler</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>

        <div class="pr-summary">
          <strong>Genel değerlendirme.</strong> ${escapeHtml(rec.feedback || band.hint)}
          ${acLine ? `<div class="pr-acoustic">Ses ölçümleri: ${acLine}</div>` : ""}
        </div>

        <div class="pr-feedback">
          <div class="pr-fb strong"><strong>Güçlü yönler:</strong> ${strongLine}</div>
          <div class="pr-fb improve"><strong>Öğrenciye öneriler:</strong><ul>${improveItems}</ul></div>
        </div>

        ${note ? `<div class="pr-note"><strong>Öğretmen notu.</strong> ${escapeHtml(note)}</div>` : ""}

        <div class="pr-foot">
          <div class="pr-sign"><span></span>Öğretmen imzası</div>
          <p>Bu rapor, öğretmenin gözlemini destekleyen otomatik bir ön değerlendirmedir; nihai değerlendirme öğretmene aittir.</p>
        </div>
      </div>`;
  }

  // Verilen kayıttan PDF/yazdırma raporu üret
  function printReportFor(rec) { buildPrintReport(rec); window.print(); }

  function totalToBand(score) {
    if (score >= 85) return 4;
    if (score >= 70) return 3;
    if (score >= 50) return 2;
    return 1;
  }

  function downloadAudio() {
    if (!state.audioBlob) return;
    const ext = (state.audioBlob.type.indexOf("ogg") >= 0) ? "ogg" : (state.audioBlob.type.indexOf("mp4") >= 0 ? "mp4" : "webm");
    const safe = ($("studentName").value.trim() || "ogrenci").replace(/[^\wçğıöşü -]/gi, "").replace(/\s+/g, "_");
    const a = document.createElement("a");
    a.href = state.audioUrl;
    a.download = `kayit_${safe}_${state.task.id}.${ext}`;
    a.click();
  }

  function refreshScoreVisualsFor(cid, inp) {
    const s = state.scores[cid];
    const row = inp.closest(".criterion");
    const pill = row.querySelector(".band-pill");
    pill.className = `band-pill band-${s.band}`;
    pill.textContent = `Düzey ${s.band}/4`;
    const fill = row.querySelector(".meter-fill");
    fill.className = `meter-fill band-${s.band}`;
    fill.style.width = (s.raw * 5) + "%";
    const cdef = CRITERIA.find((c) => c.id === cid);
    row.querySelector(".band-desc").textContent = cdef.bands[s.band];
  }

  function updateTotals() {
    const rawByCrit = {};
    CRITERIA.forEach((c) => (rawByCrit[c.id] = state.scores[c.id].raw));
    const total = computeTotal(rawByCrit);
    const band = totalBand(total);
    $("totalScore").textContent = total;
    $("totalBand").textContent = band.label;
    $("scoreRing").style.setProperty("--p", total);
    $("overallFeedback").textContent = buildFeedback(total, band);
    renderFeedbackLists();
    state.total = total;
    state.totalBandLabel = band.label;
  }

  // Kriterleri güçlü yönler (düzey ≥3) ve geliştirilecek alanlar (düzey ≤2) olarak ayır
  function feedbackBuckets(entries) {
    return {
      strengths: entries.filter((e) => e.band >= 3).sort((a, b) => b.raw - a.raw),
      improvements: entries.filter((e) => e.band <= 2).sort((a, b) => a.raw - b.raw)
    };
  }

  function renderFeedbackLists() {
    const entries = CRITERIA.map((c) => ({ c: c, raw: state.scores[c.id].raw, band: state.scores[c.id].band }));
    const { strengths, improvements } = feedbackBuckets(entries);
    const noSpeech = state.metrics && state.metrics.noSpeech;
    $("fbStrengths").innerHTML = (!noSpeech && strengths.length)
      ? strengths.map((e) => `<li><strong>${escapeHtml(e.c.name)}.</strong> ${escapeHtml(e.c.bands[e.band])}</li>`).join("")
      : `<li class="fb-muted">Öne çıkan güçlü bir alan yok; aşağıdaki önerilere odaklan.</li>`;
    $("fbImprovements").innerHTML = improvements.length
      ? improvements.map((e) => `<li><strong>${escapeHtml(e.c.name)}.</strong> ${escapeHtml(e.c.advice[e.band])}</li>`).join("")
      : `<li class="fb-muted">Tüm ölçütlerde iyi bir düzeydesin. Bu seviyeyi korumak için düzenli pratik yap.</li>`;
  }

  function buildFeedback(total, band) {
    // En zayıf ve en güçlü kriteri belirleyip yapıcı geri bildirim üret.
    const entries = CRITERIA.map((c) => ({ c, raw: state.scores[c.id].raw }));
    entries.sort((a, b) => a.raw - b.raw);
    const weakest = entries[0];
    const strongest = entries[entries.length - 1];
    const m = state.metrics || {};
    const parts = [];

    // Hiç gerçek konuşma algılanmadıysa öncelikli olarak bunu bildir
    if (m.noSpeech || (m.presence !== undefined && m.presence < 0.2 && (m.wordCount || 0) === 0)) {
      return "Anlaşılır bir konuşma algılanmadı (yalnızca sessizlik veya arka plan gürültüsü). Lütfen öğrencinin mikrofona yeterince yüksek ve net konuştuğundan emin olup kaydı tekrarlayın.";
    }

    parts.push(`Genel düzey: ${band.label}. ${band.hint}`);
    if (strongest.raw >= 12) parts.push(`Güçlü yön: ${strongest.c.name.toLowerCase()}.`);
    if (weakest.raw < 14) {
      parts.push(`Geliştirilmesi gereken alan: ${weakest.c.name.toLowerCase()}. ${weakest.c.bands[Math.min(weakest.band + 1, 4)]}`);
    }
    // Çok ses var ama tanınan kelime yok => kötü İngilizce/anlaşılırlık uyarısı
    if (m.acoustic && m.acoustic.speechSec >= 5 && m.wordCount < 5) {
      parts.push("Öğrenci konuştu ancak çok az anlaşılır kelime tanındı; telaffuz/anlaşılırlık üzerinde çalışılmalı. Kaydı dinleyip puanı teyit edin.");
    }
    if (m.acoustic) {
      const a = m.acoustic;
      parts.push(`(Ses: ${a.speechSec}sn konuşma · %${Math.round(a.speechRatio * 100)} doluluk · ${a.pauseCount} duraklama · ${a.articulationRate} hece/sn · ${m.wordCount} kelime tanındı · konu kapsama ${m.keywordHits}/${m.keywordTotal})`);
    } else if (m.wordCount !== undefined) {
      parts.push(`(${m.wordCount} sözcük · ~${m.wpm} sözcük/dk · konu kapsama ${m.keywordHits}/${m.keywordTotal})`);
    }
    return parts.join(" ");
  }

  /* ============================================================ */
  /* RAPOR & KALICILIK                                            */
  /* ============================================================ */
  function buildRecord() {
    return {
      student: $("studentName").value.trim(),
      class: $("studentClass").value.trim(),
      task: { id: state.task.id, title: state.task.title, theme: state.task.theme },
      date: new Date().toISOString(),
      durationMs: state.elapsedMs,
      transcript: state.transcriptText,
      metrics: state.metrics,
      criteria: CRITERIA.map((c) => ({
        id: c.id, name: c.name, weight: c.weight,
        raw: state.scores[c.id].raw, band: state.scores[c.id].band
      })),
      total: state.total,
      level: state.totalBandLabel,
      teacherNote: $("teacherNote").value.trim(),
      feedback: ($("overallFeedback").textContent || "").trim()
    };
  }

  function finishAssessment() {
    const rec = buildRecord();
    state.history.unshift(rec);
    saveHistory(state.history);
    // Sınav modu: sonucu sınava işle, sonraki bekleyen öğrenciye geç, listeye dön
    if (state.mode === "exam" && state.examStudentId) {
      recordExamResult(rec);
      toast("Öğrenci değerlendirmesi kaydedildi.");
      resetForNew();
      showView("exam");
      return;
    }
    $("newAssessmentBtn").hidden = false;
    toast("Kaydedildi. 'Raporlar' sekmesinden istediğin zaman PDF alabilirsin.");
    resetForNew();
    showView("single");
  }

  function exportJson() {
    const rec = buildRecord();
    const blob = new Blob([JSON.stringify(rec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safe = (rec.student || "ogrenci").replace(/[^\wçğıöşü -]/gi, "").replace(/\s+/g, "_");
    a.href = url;
    a.download = `degerlendirme_${safe}_${rec.task.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function loadHistory() {
    try { return JSON.parse(localStorage.getItem("tymm_assessments") || "[]"); }
    catch (_) { return []; }
  }
  function saveHistory(h) {
    try { localStorage.setItem("tymm_assessments", JSON.stringify(h.slice(0, 200))); } catch (_) {}
  }
  // Raporlar sekmesi: tüm kayıtlı değerlendirmeler (kalıcı), sonradan PDF alınabilir
  function renderReports() {
    const q = ($("reportSearch") ? $("reportSearch").value.trim().toLowerCase() : "");
    const items = state.history.filter((r) =>
      !q || (r.student || "").toLowerCase().includes(q) || (r.class || "").toLowerCase().includes(q));
    $("noReportsHint").hidden = state.history.length > 0;
    const body = $("reportsBody");
    body.innerHTML = items.map((r, idx) => `
      <tr>
        <td>${new Date(r.date).toLocaleDateString("tr-TR")}</td>
        <td>${escapeHtml(r.student || "—")}</td>
        <td>${escapeHtml(r.class || "—")}</td>
        <td>${escapeHtml(r.task && r.task.title || "—")}</td>
        <td><strong>${r.total}</strong>/100</td>
        <td>${escapeHtml(r.level || "—")}</td>
        <td style="text-align:right; white-space:nowrap">
          <button class="btn btn-ghost btn-sm" data-prog="${idx}">Gelişim</button>
          <button class="btn btn-ghost btn-sm" data-idx="${idx}">PDF</button>
        </td>
      </tr>`).join("") || `<tr><td colspan="7" class="muted-note" style="padding:12px 0">Sonuç yok.</td></tr>`;
    body.querySelectorAll("button[data-idx]").forEach((b) =>
      b.addEventListener("click", () => printReportFor(items[parseInt(b.dataset.idx, 10)])));
    body.querySelectorAll("button[data-prog]").forEach((b) =>
      b.addEventListener("click", () => showProgress(items[parseInt(b.dataset.prog, 10)])));
  }

  /* ============================================================ */
  /* ÖĞRENCİ GELİŞİM TAKİBİ                                       */
  /* ============================================================ */
  function studentKey(r) {
    return ((r.student || "").trim().toLowerCase() + "|" + (r.class || "").trim().toLowerCase());
  }

  // Aynı öğrencinin (ad + sınıf) tüm değerlendirmelerini tarihe göre göster
  function showProgress(rec) {
    const key = studentKey(rec);
    const recs = state.history.filter((r) => studentKey(r) === key)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    $("progressTitle").textContent = `${rec.student || "—"} · ${rec.class || "—"} — Gelişim`;
    const panel = $("progressPanel");
    panel.hidden = false;

    if (recs.length < 2) {
      $("progressTimeline").innerHTML = `<p class="muted-note">Gelişim grafiği için en az iki değerlendirme gerekli. Şu an ${recs.length} kayıt var.</p>`;
      $("progressCriteria").innerHTML = "";
      panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }

    // Zaman çizelgesi: tarih · konu · toplam (mini bar)
    $("progressTimeline").innerHTML = recs.map((r) => `
      <div class="pt-row">
        <span class="pt-date">${new Date(r.date).toLocaleDateString("tr-TR")}</span>
        <span class="pt-task">${escapeHtml(r.task && r.task.title || "—")}</span>
        <i class="pt-bar"><b style="width:${clamp(r.total, 0, 100)}%"></b></i>
        <strong class="pt-score">${r.total}</strong>
      </div>`).join("");

    // Kriter bazında ilk → son karşılaştırma
    const first = recs[0], last = recs[recs.length - 1];
    const critRow = (c) => {
      const f = (first.criteria || []).find((x) => x.id === c.id);
      const l = (last.criteria || []).find((x) => x.id === c.id);
      if (!f || !l) return "";
      const d = l.raw - f.raw;
      const cls = d > 0 ? "up" : d < 0 ? "down" : "same";
      const sym = d > 0 ? "▲" : d < 0 ? "▼" : "•";
      return `<div class="pc-row"><span>${escapeHtml(c.name)}</span><em>${f.raw} → ${l.raw}</em><b class="pc-delta ${cls}">${sym} ${d > 0 ? "+" : ""}${d}</b></div>`;
    };
    const totalD = last.total - first.total;
    $("progressCriteria").innerHTML =
      `<h4>İlk değerlendirmeden bu yana (${recs.length} kayıt)</h4>` +
      CRITERIA.map(critRow).join("") +
      `<div class="pc-row pc-total"><span>Toplam</span><em>${first.total} → ${last.total}</em><b class="pc-delta ${totalD > 0 ? "up" : totalD < 0 ? "down" : "same"}">${totalD > 0 ? "▲ +" : totalD < 0 ? "▼ " : "• "}${totalD}</b></div>`;
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ============================================================ */
  /* YEDEKLE / İÇE AKTAR                                          */
  /* ============================================================ */
  function exportBackup() {
    const data = {
      app: "tymm-konusma-degerlendirme",
      version: 1,
      date: new Date().toISOString(),
      classes: state.classes,
      assessments: state.history,
      exam: { examClassId: state.examClassId, examStudentId: state.examStudentId, examResults: state.examResults }
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `yedek_konusma_degerlendirme_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast("Yedek dosyası indirildi.");
  }

  function importBackup(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try { data = JSON.parse(reader.result); } catch (_) { toast("Dosya okunamadı: geçerli bir JSON değil."); return; }
      if (!data || !Array.isArray(data.classes) || !Array.isArray(data.assessments)) {
        toast("Bu dosya geçerli bir yedek değil.");
        return;
      }
      const ok = confirm(
        `Yedek: ${data.classes.length} sınıf, ${data.assessments.length} değerlendirme` +
        (data.date ? ` (${new Date(data.date).toLocaleDateString("tr-TR")})` : "") +
        `\n\nMevcut tüm veriler bu yedekle DEĞİŞTİRİLECEK. Devam edilsin mi?`
      );
      if (!ok) return;
      state.classes = data.classes;
      state.history = data.assessments;
      saveClasses();
      saveHistory(state.history);
      if (data.exam) {
        state.examClassId = data.exam.examClassId || null;
        state.examStudentId = data.exam.examStudentId || null;
        state.examResults = data.exam.examResults || {};
        saveExam();
      }
      $("progressPanel").hidden = true;
      renderReports();
      toast("Yedek geri yüklendi.");
    };
    reader.readAsText(file);
  }

  function resetForNew() {
    $("teacherNote").value = "";
    $("transcript").classList.remove("invalid");
    resetRecording();
  }

  /* ============================================================ */
  /* SINIF YÖNETİMİ (localStorage)                               */
  /* ============================================================ */
  function loadClasses() {
    try { return JSON.parse(localStorage.getItem("tymm_classes") || "[]"); }
    catch (_) { return []; }
  }
  function saveClasses() {
    try { localStorage.setItem("tymm_classes", JSON.stringify(state.classes)); } catch (_) {}
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function currentClass() { return state.classes.find((c) => c.id === state.currentClassId) || null; }
  function studentNo(s, i) { return (s.no != null && s.no !== "") ? String(s.no) : String(i + 1); }

  function addClass() {
    const inp = $("newClassName");
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    const cls = { id: uid(), name: name, students: [] };
    state.classes.push(cls);
    saveClasses();
    inp.value = "";
    state.currentClassId = cls.id;
    renderClasses();
  }

  function deleteCurrentClass() {
    const cls = currentClass();
    if (!cls) return;
    if (!confirm(`"${cls.name}" sınıfı ve tüm öğrencileri silinsin mi?`)) return;
    state.classes = state.classes.filter((c) => c.id !== cls.id);
    state.currentClassId = null;
    saveClasses();
    renderClasses();
  }

  function addStudentSingle() {
    const cls = currentClass(); if (!cls) return;
    const inp = $("newStudentName");
    const noInp = $("newStudentNo");
    const name = inp.value.trim();
    if (!name) { inp.focus(); return; }
    cls.students.push({ id: uid(), no: noInp.value.trim(), name: name });
    saveClasses();
    noInp.value = ""; inp.value = "";
    noInp.focus();
    renderClassDetail();
  }

  function bulkAddStudents() {
    const cls = currentClass(); if (!cls) return;
    const lines = $("bulkStudents").value.split(/\n+/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    lines.forEach((line) => {
      // "101 Ayşe Yılmaz" / "101. Ad" / "101) Ad" / "101- Ad" → no + ad; numarasız satır = sadece ad
      const m = line.match(/^(\d+)[\s.\-)]+(.+)$/);
      const no = m ? m[1] : "";
      const name = m ? m[2].trim() : line;
      if (name) cls.students.push({ id: uid(), no: no, name: name });
    });
    saveClasses();
    $("bulkStudents").value = "";
    toast(`${lines.length} öğrenci eklendi.`);
    renderClassDetail();
  }

  function deleteStudent(studentId) {
    const cls = currentClass(); if (!cls) return;
    cls.students = cls.students.filter((s) => s.id !== studentId);
    saveClasses();
    renderClassDetail();
  }

  function renderClasses() {
    const list = $("classList");
    $("noClassesHint").hidden = state.classes.length > 0;
    list.innerHTML = state.classes.map((c) =>
      `<div class="class-row ${c.id === state.currentClassId ? "is-active" : ""}" data-id="${c.id}">
         <strong>${escapeHtml(c.name)}</strong>
         <span class="count">${c.students.length} öğrenci</span>
       </div>`).join("");
    list.querySelectorAll(".class-row").forEach((row) => {
      row.addEventListener("click", () => { state.currentClassId = row.dataset.id; renderClasses(); });
    });
    renderClassDetail();
  }

  function renderClassDetail() {
    const cls = currentClass();
    const box = $("classDetail");
    if (!cls) { box.hidden = true; return; }
    box.hidden = false;
    $("classDetailName").textContent = cls.name;
    $("classStudentCount").textContent = `${cls.students.length} öğrenci`;
    const body = $("studentList");
    body.innerHTML = cls.students.map((s, i) =>
      `<tr><td>${escapeHtml(studentNo(s, i))}</td><td>${escapeHtml(s.name)}</td>
         <td style="text-align:right"><button class="link-danger" data-id="${s.id}">Sil</button></td></tr>`).join("")
      || `<tr><td colspan="3" class="muted-note" style="padding:12px 0">Henüz öğrenci yok.</td></tr>`;
    body.querySelectorAll(".link-danger").forEach((b) => b.addEventListener("click", () => deleteStudent(b.dataset.id)));
  }

  /* ============================================================ */
  /* SINAV MODU                                                  */
  /* ============================================================ */
  // Temaya göre gruplu görev <option> listesi (seçili olanı işaretler)
  function taskOptionsHtml(selectedId) {
    const order = []; const byTheme = new Map();
    TASKS.forEach((t) => { if (!byTheme.has(t.theme)) { byTheme.set(t.theme, []); order.push(t.theme); } byTheme.get(t.theme).push(t); });
    return order.map((th) =>
      `<optgroup label="${escapeHtml(th)}">` +
      byTheme.get(th).map((t) => `<option value="${t.id}"${t.id === selectedId ? " selected" : ""}>${escapeHtml(t.title)}</option>`).join("") +
      `</optgroup>`).join("");
  }

  // Sınav durumu: seçili sınıf/öğrenci + sınıf bazında sonuçlar
  function examClass() { return state.classes.find((c) => c.id === state.examClassId) || null; }
  function examResultsMap() {
    if (!state.examResults[state.examClassId]) state.examResults[state.examClassId] = {};
    return state.examResults[state.examClassId];
  }

  /* Sınav ilerlemesi kalıcıdır: sayfa yenilense bile kaldığı yerden devam eder */
  function saveExam() {
    try {
      localStorage.setItem("tymm_exam", JSON.stringify({
        examClassId: state.examClassId,
        examStudentId: state.examStudentId,
        examResults: state.examResults
      }));
    } catch (_) {}
  }
  function loadExam() {
    try {
      const d = JSON.parse(localStorage.getItem("tymm_exam") || "null");
      if (!d) return;
      // Silinmiş sınıflara ait sonuçları ayıkla
      const valid = new Set(state.classes.map((c) => c.id));
      state.examResults = {};
      Object.keys(d.examResults || {}).forEach((cid) => { if (valid.has(cid)) state.examResults[cid] = d.examResults[cid]; });
      if (valid.has(d.examClassId)) {
        state.examClassId = d.examClassId;
        state.examStudentId = d.examStudentId;
      }
    } catch (_) {}
  }
  function resetExamForClass() {
    const cls = examClass(); if (!cls) return;
    if (!confirm(`"${cls.name}" sınavındaki tüm sonuçlar sıfırlansın mı? (Raporlar arşivi silinmez)`)) return;
    delete state.examResults[cls.id];
    saveExam();
    renderExamView();
    toast("Sınav ilerlemesi sıfırlandı.");
  }

  function currentExamStudent() {
    const cls = examClass();
    return cls ? (cls.students.find((s) => s.id === state.examStudentId) || null) : null;
  }
  function studentTaskId(s) { return (s && s.taskId) || (TASKS[0] && TASKS[0].id); }

  function renderExamView() {
    const hasStudents = state.classes.some((c) => c.students.length);
    $("examNoClass").hidden = hasStudents;
    $("examPicker").hidden = !hasStudents;
    $("examRosterWrap").hidden = !hasStudents;
    $("examSummary").hidden = true;
    if (!hasStudents) return;
    // Geçerli sınıf seçili değilse öğrencisi olan ilk sınıfı seç
    if (!examClass() || !examClass().students.length) {
      const c = state.classes.find((x) => x.students.length) || state.classes[0];
      state.examClassId = c.id;
      state.examStudentId = null;
    }
    $("examClass").innerHTML = state.classes.map((c) =>
      `<option value="${c.id}"${c.id === state.examClassId ? " selected" : ""}>${escapeHtml(c.name)} (${c.students.length})</option>`).join("");
    populateExamStudents();
    renderExamRoster();
  }

  function populateExamStudents() {
    const cls = examClass(); if (!cls) return;
    if (!cls.students.some((s) => s.id === state.examStudentId)) {
      state.examStudentId = cls.students[0] ? cls.students[0].id : null;
    }
    $("examStudent").innerHTML = cls.students.map((s, i) =>
      `<option value="${s.id}"${s.id === state.examStudentId ? " selected" : ""}>${escapeHtml(studentNo(s, i))} · ${escapeHtml(s.name)}</option>`).join("");
    syncExamTopic();
  }

  function syncExamTopic() {
    $("examTaskSel").innerHTML = taskOptionsHtml(studentTaskId(currentExamStudent()));
  }

  function renderExamRoster() {
    const cls = examClass(); if (!cls) return;
    $("examRosterClass").textContent = cls.name;
    const results = examResultsMap();
    const done = cls.students.filter((s) => results[s.id]).length, total = cls.students.length;
    $("examProgressText").textContent = `${done}/${total} değerlendirildi`;
    $("examProgressBar").style.width = (total ? done / total * 100 : 0) + "%";
    $("examStudentList").innerHTML = cls.students.map((s, i) => {
      const rec = results[s.id];
      const task = TASKS.find((t) => t.id === studentTaskId(s));
      const status = rec
        ? `<span class="status-chip status-done">Tamamlandı</span>`
        : `<span class="status-chip status-pending">Bekliyor</span>`;
      const selCls = s.id === state.examStudentId ? ' class="is-sel"' : "";
      return `<tr data-id="${s.id}"${selCls}><td>${escapeHtml(studentNo(s, i))}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(task ? task.title : "—")}</td><td>${status}</td><td>${rec ? "<strong>" + rec.total + "</strong>/100" : "—"}</td></tr>`;
    }).join("");
    $("examStudentList").querySelectorAll("tr[data-id]").forEach((tr) =>
      tr.addEventListener("click", () => { state.examStudentId = tr.dataset.id; populateExamStudents(); renderExamRoster(); }));
  }

  function examEvaluate() {
    const cls = examClass(), s = currentExamStudent();
    if (!cls || !s) { toast("Önce sınıf ve öğrenci seçin."); return; }
    s.taskId = $("examTaskSel").value;            // bu öğrencinin konusunu kaydet
    saveClasses();
    state.mode = "exam";
    state.examStudentId = s.id;
    state.task = TASKS.find((t) => t.id === s.taskId) || TASKS[0];
    state.useWhisper = $("examWhisper").checked;
    $("studentName").value = s.name;
    $("studentClass").value = cls.name;
    goToRecord(); // mevcut kayıt/değerlendirme akışını yeniden kullan
  }

  // Değerlendirme bitince sınava işle ve bir sonraki bekleyen öğrenciye geç
  function recordExamResult(rec) {
    examResultsMap()[state.examStudentId] = rec;
    const cls = examClass();
    if (cls) {
      const results = examResultsMap();
      const next = cls.students.find((s) => !results[s.id]);
      if (next) state.examStudentId = next.id;
    }
    saveExam();
  }

  function renderExamSummary() {
    const cls = examClass();
    $("examSummaryClass").textContent = cls.name;
    $("examSummaryTask").textContent = "Öğrenci bazlı konular — sınıf özeti";
    const results = examResultsMap();
    let sum = 0, n = 0;
    $("examSummaryBody").innerHTML = cls.students.map((s, i) => {
      const rec = results[s.id];
      const cell = (id) => { const c = rec && rec.criteria.find((x) => x.id === id); return c ? c.raw : "—"; };
      const task = rec ? rec.task : TASKS.find((t) => t.id === studentTaskId(s));
      if (rec) { sum += rec.total; n++; }
      return `<tr><td>${escapeHtml(studentNo(s, i))}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(task ? task.title : "—")}</td>
        <td>${cell("uyum")}</td><td>${cell("organizasyon")}</td><td>${cell("sunum")}</td><td>${cell("dil")}</td><td>${cell("yaraticilik")}</td>
        <td><strong>${rec ? rec.total : "—"}</strong></td><td>${rec ? escapeHtml(rec.level) : "—"}</td></tr>`;
    }).join("");
    const avg = n ? Math.round(sum / n) : 0;
    $("examAvg").textContent = avg;
    $("examAvgRing").style.setProperty("--p", avg);
  }

  function exportExamCsv() {
    const cls = examClass();
    const results = examResultsMap();
    const csv = (s) => { s = String(s == null ? "" : s); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const lines = [["No", "Ogrenci", "Konu", "Uyum", "Organizasyon", "Sunum", "Dil", "Yaraticilik", "Toplam", "Duzey"].join(";")];
    cls.students.forEach((s, i) => {
      const rec = results[s.id];
      const cell = (id) => { const c = rec && rec.criteria.find((x) => x.id === id); return c ? c.raw : ""; };
      const task = rec ? rec.task : TASKS.find((t) => t.id === studentTaskId(s));
      lines.push([csv(studentNo(s, i)), csv(s.name), csv(task ? task.title : ""), cell("uyum"), cell("organizasyon"), cell("sunum"), cell("dil"), cell("yaraticilik"), rec ? rec.total : "", rec ? csv(rec.level) : ""].join(";"));
    });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `sinav_${String(cls.name).replace(/\s+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /* ============================================================ */
  /* ARAYÜZ YARDIMCILARI                                          */
  /* ============================================================ */
  // Kayıt/sonuç akışı: sekmeleri ve tüm görünümleri gizle, yalnız akışı göster
  function showFlow(step) {
    $("tabs").hidden = true;
    ["setupStep", "view-exam", "view-classes", "view-reports"].forEach((id) => {
      const e = $(id); if (e) e.hidden = true;
    });
    steps.record.hidden = step !== "record";
    steps.result.hidden = step !== "result";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Üst sekmeler: single / exam / classes / reports
  function showView(view) {
    state.view = view;
    $("tabs").hidden = false;
    steps.record.hidden = true;
    steps.result.hidden = true;
    $("setupStep").hidden = view !== "single";
    $("view-exam").hidden = view !== "exam";
    $("view-classes").hidden = view !== "classes";
    $("view-reports").hidden = view !== "reports";
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("is-active", t.dataset.view === view));
    if (view === "exam") renderExamView();
    if (view === "classes") renderClasses();
    if (view === "reports") renderReports();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toast(msg) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(el._t);
    el._t = setTimeout(() => el.classList.remove("show"), 2600);
  }

  /* Tam ekran yükleniyor katmanı (uzun işlemler için) */
  let _loadingActive = false;
  function showLoading(text) {
    _loadingActive = true;
    const o = $("loadingOverlay");
    if (!o) return;
    o.hidden = false;
    $("loadingError").hidden = true;
    $("loadingMain").hidden = false;
    $("loadingText").textContent = text || "Lütfen bekleyin…";
    $("loadingBarWrap").hidden = true;
    $("loadingBar").style.width = "0%";
  }
  function setLoading(text, pct) {
    if (!_loadingActive) return;
    $("loadingError").hidden = true;
    $("loadingMain").hidden = false;
    if (text != null) $("loadingText").textContent = text;
    if (pct != null) { $("loadingBarWrap").hidden = false; $("loadingBar").style.width = clamp(pct, 0, 100) + "%"; }
  }
  function hideLoading() {
    _loadingActive = false;
    const o = $("loadingOverlay");
    if (o) o.hidden = true;
  }
  // Hata durumunu göster; kullanıcı "Tekrar Dene" ya da "Devam et" seçer
  function showLoadingError(msg) {
    _loadingActive = true;
    const o = $("loadingOverlay");
    if (o) o.hidden = false;
    $("loadingMain").hidden = true;
    $("loadingError").hidden = false;
    $("loadingErrorText").textContent = msg || "Bir hata oluştu.";
    return new Promise((resolve) => {
      const onRetry = () => { cleanup(); resolve("retry"); };
      const onCont = () => { cleanup(); resolve("continue"); };
      function cleanup() {
        $("loadingRetryBtn").removeEventListener("click", onRetry);
        $("loadingContinueBtn").removeEventListener("click", onCont);
        $("loadingError").hidden = true;
        $("loadingMain").hidden = false;
      }
      $("loadingRetryBtn").addEventListener("click", onRetry);
      $("loadingContinueBtn").addEventListener("click", onCont);
    });
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  // Bir işlevi hata durumunda otomatik olarak yeniden dener (artan beklemeyle)
  async function retry(fn, times, delay) {
    let last;
    for (let i = 0; i <= times; i++) {
      try { return await fn(); }
      catch (e) { last = e; if (i < times) await sleep(delay * (i + 1)); }
    }
    throw last;
  }

  /* matematiksel/biçim yardımcıları */
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function map(v, inLo, inHi, outLo, outHi) {
    if (inHi === inLo) return outLo;
    const t = (v - inLo) / (inHi - inLo);
    return outLo + clamp(t, 0, 1) * (outHi - outLo);
  }
  function avg(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }
  function round2(n) { return Math.round(n * 100) / 100; }
  function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  /* ============================================================ */
  /* OLAY BAĞLAMALARI                                             */
  /* ============================================================ */
  function bindEvents() {
    $("startBtn").addEventListener("click", startRecording);
    $("stopBtn").addEventListener("click", stopRecording);
    $("backToSetupBtn").addEventListener("click", async () => {
      await stopRecording();
      showView(state.mode === "exam" ? "exam" : "single");
    });
    $("evaluateBtn").addEventListener("click", async () => {
      const btn = $("evaluateBtn");
      btn.disabled = true;
      showLoading("Ses çözümleniyor…");
      try {
        await stopRecording();         // ses analizinin bitmesini bekle
        // İsteğe bağlı: Whisper ile daha doğru yazıya dökme (worker'da; hata olursa tekrar denenir)
        if (state.useWhisper && state.audioBlob) {
          const txt = await transcribeWithRetryUI(state.audioBlob);
          if (txt) { $("transcript").value = txt; $("transcript").classList.remove("invalid"); }
          $("recStatusText").textContent = `Tamamlandı · ${formatTime(state.elapsedMs)}`;
        }
        setLoading("Puanlanıyor…");
        runEvaluation();
      } finally {
        hideLoading();
        btn.disabled = false;
      }
    });
    $("backToRecordBtn").addEventListener("click", () => showFlow("record"));
    $("printBtn").addEventListener("click", () => printReportFor(buildRecord()));
    $("reportSearch").addEventListener("input", renderReports);
    $("backupBtn").addEventListener("click", exportBackup);
    $("restoreBtn").addEventListener("click", () => $("restoreFile").click());
    $("restoreFile").addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = ""; // aynı dosya tekrar seçilebilsin
    });
    $("progressCloseBtn").addEventListener("click", () => { $("progressPanel").hidden = true; });
    $("downloadAudioBtn").addEventListener("click", downloadAudio);
    $("exportBtn").addEventListener("click", exportJson);
    $("finishBtn").addEventListener("click", finishAssessment);
    $("newAssessmentBtn").addEventListener("click", () => { state.mode = "single"; resetForNew(); showView("single"); });
    $("transcript").addEventListener("input", (e) => e.target.classList.remove("invalid"));

    // Sekmeler
    document.querySelectorAll(".tab").forEach((t) => {
      t.addEventListener("click", () => { state.mode = t.dataset.view === "exam" ? state.mode : "single"; showView(t.dataset.view); });
    });

    // Sınıf yönetimi
    $("addClassBtn").addEventListener("click", addClass);
    $("newClassName").addEventListener("keydown", (e) => { if (e.key === "Enter") addClass(); });
    $("deleteClassBtn").addEventListener("click", deleteCurrentClass);
    $("addStudentBtn").addEventListener("click", addStudentSingle);
    $("newStudentNo").addEventListener("keydown", (e) => { if (e.key === "Enter") $("newStudentName").focus(); });
    $("newStudentName").addEventListener("keydown", (e) => { if (e.key === "Enter") addStudentSingle(); });
    $("bulkAddBtn").addEventListener("click", bulkAddStudents);

    // Sınav modu
    $("examClass").addEventListener("change", () => { state.examClassId = $("examClass").value; state.examStudentId = null; populateExamStudents(); renderExamRoster(); saveExam(); });
    $("examStudent").addEventListener("change", () => { state.examStudentId = $("examStudent").value; syncExamTopic(); renderExamRoster(); saveExam(); });
    $("examResetBtn").addEventListener("click", resetExamForClass);
    $("examTaskSel").addEventListener("change", () => { const s = currentExamStudent(); if (s) { s.taskId = $("examTaskSel").value; saveClasses(); renderExamRoster(); } });
    $("examEvaluateBtn").addEventListener("click", examEvaluate);
    $("examSummaryBtn").addEventListener("click", () => { renderExamSummary(); $("examPicker").hidden = true; $("examRosterWrap").hidden = true; $("examSummary").hidden = false; });
    $("examSummaryBackBtn").addEventListener("click", () => { $("examSummary").hidden = true; $("examPicker").hidden = false; $("examRosterWrap").hidden = false; });
    $("examCsvBtn").addEventListener("click", exportExamCsv);
    $("examPrintBtn").addEventListener("click", () => window.print());
  }

  /* ----------------------------- başlat ----------------------------- */
  initSetup();
  bindEvents();
  loadExam(); // yarım kalan sınav ilerlemesini geri yükle

  // PWA: uygulama kabuğunu çevrimdışı kullanım için kaydet
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => { /* http/eski tarayıcı: sessizce geç */ });
  }
})();
