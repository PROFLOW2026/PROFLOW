/**
 * TEMPORARY proof-of-concept page (level A: photo overlay on live camera for locating
 * infrastructure behind a closed wall). Self-contained: no data, no storage, no auth, no server
 * state - the photo never leaves the browser. Remove this route after the field trial.
 */
const PAGE_HTML = `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="robots" content="noindex, nofollow">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
<title>EXLFY PoC – שכבת תשתיות על קיר סגור (רמה A)</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  html, body { margin: 0; height: 100%; background: #111; color: #fff; font-family: system-ui, sans-serif; overscroll-behavior: none; }
  .screen { display: none; position: fixed; inset: 0; }
  .screen.on { display: block; }
  .pad { padding: 16px; max-width: 560px; margin: 0 auto; }
  h1 { font-size: 18px; margin: 0 0 8px; }
  p, li { font-size: 14px; line-height: 1.5; color: #ddd; }
  button, label.btn { display: inline-block; min-height: 44px; padding: 10px 16px; margin: 4px 0; border-radius: 8px; border: 0; background: #2f6fed; color: #fff; font-size: 15px; cursor: pointer; }
  button.sec { background: #444; }
  button:disabled { opacity: .4; }
  #stagePhoto { touch-action: none; }
  #photoWrap { position: absolute; inset: 56px 0 0 0; display: flex; align-items: center; justify-content: center; background: #000; }
  #photoBox { position: relative; display: inline-block; }
  #photoImg { max-width: 100vw; max-height: calc(100vh - 56px); display: block; user-select: none; -webkit-user-drag: none; }
  .bar { position: absolute; top: 0; left: 0; right: 0; min-height: 56px; padding: 6px 12px; background: rgba(0,0,0,.75); display: flex; gap: 8px; align-items: center; justify-content: space-between; z-index: 5; }
  .bar span { font-size: 14px; }
  .pin { position: absolute; width: 26px; height: 26px; margin: -13px 0 0 -13px; border-radius: 50%; border: 2px solid #ffeb3b; background: rgba(255,235,59,.25); color: #ffeb3b; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; pointer-events: none; }
  #stageLive { background: #000; touch-action: none; overflow: hidden; }
  #video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  #layer { position: absolute; left: 0; top: 0; transform-origin: 0 0; opacity: .5; pointer-events: none; will-change: transform; display: none; }
  #livePins { position: absolute; inset: 0; pointer-events: none; }
  #ctrl { position: absolute; left: 0; right: 0; bottom: 0; padding: 8px 12px calc(8px + env(safe-area-inset-bottom)); background: rgba(0,0,0,.7); z-index: 5; }
  #ctrl .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  #ctrl input[type=range] { flex: 1; min-width: 120px; }
  #warn { position: absolute; top: 56px; left: 0; right: 0; text-align: center; background: rgba(200,60,0,.85); font-size: 13px; padding: 4px; z-index: 4; }
  textarea { width: 100%; height: 160px; background: #222; color: #ddd; border: 1px solid #555; border-radius: 8px; font-size: 12px; direction: ltr; }
</style>
</head>
<body>

<!-- Screen 1: intro + choose before-photo -->
<section id="sIntro" class="screen on">
  <div class="pad">
    <h1>ניסוי הוכחה – רמה A</h1>
    <p>הדף מקומי בלבד: אין שרת, אין העלאה ואין שמירה. התמונה נשארת בזיכרון הדפדפן.</p>
    <ol>
      <li>בחר או צלם תמונת "לפני סגירה" (פרונטלית, עם 2–4 נקודות קבועות בפריים: משקוף, פינה, קו רצפה/תקרה, לוחית חשמל).</li>
      <li>סמן על התמונה 2–4 נקודות קבועות.</li>
      <li>פתח מצלמה אחרי הסגירה והקש על אותן נקודות בתצוגה החיה.</li>
      <li>כוונן ידנית אם צריך, סמן בעיפרון, ושמור את נתוני המדידה.</li>
    </ol>
    <label class="btn">צילום / בחירת תמונה
      <input id="file" type="file" accept="image/*" capture="environment" hidden>
    </label>
    <label class="btn sec">בחירה מהגלריה
      <input id="fileGallery" type="file" accept="image/*" hidden>
    </label>
    <p id="introErr" style="color:#ff8a80"></p>
  </div>
</section>

<!-- Screen 2: tap landmarks on photo -->
<section id="sPhoto" class="screen">
  <div class="bar">
    <span id="photoMsg">הקש על נקודה קבועה 1</span>
    <span>
      <button class="sec" id="photoUndo">בטל</button>
      <button id="photoDone" disabled>המשך למצלמה</button>
    </span>
  </div>
  <div id="photoWrap"><div id="photoBox"><img id="photoImg" alt=""></div></div>
</section>

<!-- Screen 3: live camera + overlay -->
<section id="sLive" class="screen">
  <div id="stageLive" class="screen on" style="display:block">
    <video id="video" playsinline muted autoplay></video>
    <img id="layer" alt="">
    <div id="livePins"></div>
  </div>
  <div class="bar">
    <span id="liveMsg">מכין מצלמה…</span>
    <button class="sec" id="liveBack">חזרה</button>
  </div>
  <div id="warn">משוער בלבד – לא מיקום מדויק. החזק את הטלפון יציב.</div>
  <div id="ctrl">
    <div class="row">
      <span>שקיפות</span><input id="opacity" type="range" min="0.1" max="0.9" step="0.05" value="0.5">
    </div>
    <div class="row">
      <button class="sec" id="liveUndo">בטל נקודה</button>
      <button class="sec" id="liveReset">יישור מחדש</button>
      <button id="liveSave">שמור מדידה</button>
    </div>
  </div>
</section>

<!-- Screen 4: log -->
<section id="sLog" class="screen">
  <div class="pad">
    <h1>נתוני מדידה</h1>
    <p>העתק והדבק לקובץ הניסוי. מדוד ידנית את הסטייה בס״מ של סימוני העיפרון מול המידות שתועדו לפני הסגירה.</p>
    <textarea id="logOut" readonly></textarea>
    <button id="logCopy">העתק</button>
    <button class="sec" id="logBack">חזרה למצלמה</button>
  </div>
</section>

<script>
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const screens = ['sIntro', 'sPhoto', 'sLive', 'sLog'];
  const show = (id) => screens.forEach((s) => $(s).classList.toggle('on', s === id));

  const state = {
    photoUrl: null, natW: 0, natH: 0,
    photoPts: [],        // [{x,y}] in photo natural px
    livePts: [],         // [{x,y}] in live container px
    H: null,             // 3x3 photo px -> container px
    user: { tx: 0, ty: 0, s: 1, r: 0 }, // screen-space manual adjustment about container center
    stream: null,
    t0: null,            // start of live alignment
    tAligned: null,
    events: [],
  };
  const log = (type, data) => state.events.push(Object.assign({ t: Math.round(performance.now()), type }, data || {}));

  // ---------- Matrix helpers (3x3, row-major arrays of 9) ----------
  const mul = (A, B) => {
    const C = new Array(9).fill(0);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) C[i * 3 + j] += A[i * 3 + k] * B[k * 3 + j];
    return C;
  };

  // Solve A x = b by Gaussian elimination with partial pivoting.
  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-9) return null;
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = c + 1; r < n; r++) {
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    const x = new Array(n);
    for (let r = n - 1; r >= 0; r--) {
      let s = M[r][n];
      for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
      x[r] = s / M[r][r];
    }
    return x;
  }

  // 2 points -> similarity; 3 -> affine; 4 -> homography. src: photo px, dst: container px.
  function computeTransform(src, dst) {
    const n = src.length;
    if (n === 2) {
      // complex: z' = a*z + b
      const pz = { x: src[1].x - src[0].x, y: src[1].y - src[0].y };
      const qz = { x: dst[1].x - dst[0].x, y: dst[1].y - dst[0].y };
      const d = pz.x * pz.x + pz.y * pz.y;
      if (d < 1e-9) return null;
      const ar = (qz.x * pz.x + qz.y * pz.y) / d;
      const ai = (qz.y * pz.x - qz.x * pz.y) / d;
      const tx = dst[0].x - (ar * src[0].x - ai * src[0].y);
      const ty = dst[0].y - (ai * src[0].x + ar * src[0].y);
      return [ar, -ai, tx, ai, ar, ty, 0, 0, 1];
    }
    if (n === 3) {
      const A = [], b = [];
      for (let i = 0; i < 3; i++) {
        A.push([src[i].x, src[i].y, 1, 0, 0, 0]); b.push(dst[i].x);
        A.push([0, 0, 0, src[i].x, src[i].y, 1]); b.push(dst[i].y);
      }
      const h = solve(A, b);
      return h ? [h[0], h[1], h[2], h[3], h[4], h[5], 0, 0, 1] : null;
    }
    if (n === 4) {
      const A = [], b = [];
      for (let i = 0; i < 4; i++) {
        const { x, y } = src[i], { x: u, y: v } = dst[i];
        A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
        A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
      }
      const h = solve(A, b);
      return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
    }
    return null;
  }

  function userMatrix(cx, cy) {
    const { tx, ty, s, r } = state.user;
    const c = Math.cos(r) * s, sn = Math.sin(r) * s;
    // translate(-c) -> scale/rotate -> translate(+c + t)
    const T1 = [1, 0, -cx, 0, 1, -cy, 0, 0, 1];
    const SR = [c, -sn, 0, sn, c, 0, 0, 0, 1];
    const T2 = [1, 0, cx + tx, 0, 1, cy + ty, 0, 0, 1];
    return mul(T2, mul(SR, T1));
  }

  function applyLayer() {
    const layer = $('layer');
    if (!state.H) { layer.style.display = 'none'; return; }
    const stage = $('stageLive').getBoundingClientRect();
    const M = mul(userMatrix(stage.width / 2, stage.height / 2), state.H);
    layer.style.width = state.natW + 'px';
    layer.style.height = state.natH + 'px';
    // CSS matrix3d is column-major.
    layer.style.transform =
      'matrix3d(' + [M[0], M[3], 0, M[6], M[1], M[4], 0, M[7], 0, 0, 1, 0, M[2], M[5], 0, M[8]].join(',') + ')';
    layer.style.display = 'block';
  }

  function drawPins(container, pts, color) {
    container.innerHTML = '';
    pts.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'pin';
      d.textContent = String(i + 1);
      d.style.left = p.x + 'px';
      d.style.top = p.y + 'px';
      if (color) { d.style.borderColor = color; d.style.color = color; }
      container.appendChild(d);
    });
  }

  // ---------- Screen 1: photo choice ----------
  function onFile(ev) {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    $('introErr').textContent = '';
    if (state.photoUrl) URL.revokeObjectURL(state.photoUrl);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      state.photoUrl = url; state.natW = img.naturalWidth; state.natH = img.naturalHeight;
      state.photoPts = []; state.livePts = []; state.H = null;
      $('photoImg').src = url; $('layer').src = url;
      log('photo_loaded', { w: state.natW, h: state.natH, bytes: f.size, type: f.type });
      updatePhotoUi(); show('sPhoto');
    };
    img.onerror = () => {
      $('introErr').textContent = 'הדפדפן לא מצליח לפענח את התמונה (ייתכן HEIC). נסה לצלם שוב או לבחור JPEG.';
      log('photo_decode_error', { type: f.type });
    };
    img.src = url;
  }
  $('file').addEventListener('change', onFile);
  $('fileGallery').addEventListener('change', onFile);

  // ---------- Screen 2: landmarks on photo ----------
  function updatePhotoUi() {
    const n = state.photoPts.length;
    $('photoMsg').textContent = n < 4 ? 'הקש על נקודה קבועה ' + (n + 1) + ' (עד 4; מינימום 2)' : 'סומנו 4 נקודות';
    $('photoDone').disabled = n < 2;
    const box = $('photoBox'), img = $('photoImg');
    box.querySelectorAll('.pin').forEach((e) => e.remove());
    const r = img.getBoundingClientRect();
    state.photoPts.forEach((p, i) => {
      const d = document.createElement('div');
      d.className = 'pin'; d.textContent = String(i + 1);
      d.style.left = (p.x * r.width / state.natW) + 'px';
      d.style.top = (p.y * r.height / state.natH) + 'px';
      box.appendChild(d);
    });
  }
  $('photoImg').addEventListener('click', (e) => {
    if (state.photoPts.length >= 4) return;
    const r = e.target.getBoundingClientRect();
    state.photoPts.push({ x: (e.clientX - r.left) * state.natW / r.width, y: (e.clientY - r.top) * state.natH / r.height });
    log('photo_pin', { n: state.photoPts.length });
    updatePhotoUi();
  });
  $('photoUndo').addEventListener('click', () => { state.photoPts.pop(); updatePhotoUi(); });
  window.addEventListener('resize', () => { if ($('sPhoto').classList.contains('on')) updatePhotoUi(); });
  $('photoDone').addEventListener('click', startLive);

  // ---------- Screen 3: live camera ----------
  async function startLive() {
    show('sLive');
    state.livePts = []; state.H = null; state.user = { tx: 0, ty: 0, s: 1, r: 0 };
    state.t0 = performance.now(); state.tAligned = null;
    drawPins($('livePins'), []); applyLayer();
    $('liveMsg').textContent = 'מבקש הרשאת מצלמה…';
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('getUserMedia לא זמין (נדרש HTTPS)');
      if (state.stream) state.stream.getTracks().forEach((t) => t.stop());
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      const v = $('video');
      v.srcObject = state.stream;
      await v.play().catch(() => {});
      const s = state.stream.getVideoTracks()[0].getSettings();
      log('camera_ok', { w: s.width, h: s.height, fps: s.frameRate });
      updateLiveMsg();
    } catch (err) {
      log('camera_error', { name: err && err.name, message: String(err && err.message) });
      $('liveMsg').textContent = 'שגיאת מצלמה: ' + (err && err.name ? err.name : err);
    }
  }
  function updateLiveMsg() {
    const need = state.photoPts.length, got = state.livePts.length;
    $('liveMsg').textContent = got < need
      ? 'הקש בתצוגה החיה על נקודה ' + (got + 1) + ' מתוך ' + need
      : 'יושר. אפשר לגרור/לצבוט לכוונון';
  }
  function stopCamera() {
    if (state.stream) { state.stream.getTracks().forEach((t) => t.stop()); state.stream = null; }
  }

  // Pointer handling: tap = landmark (until aligned); drag/pinch = manual fine-tune (after aligned).
  const pointers = new Map();
  let gesture = null, moved = false, downAt = 0;
  const stageEl = $('stageLive');
  stageEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.bar, #ctrl')) return;
    stageEl.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved = false; downAt = performance.now();
    gesture = { user: Object.assign({}, state.user), pts: Array.from(pointers.values()).map((p) => ({ x: p.x, y: p.y })) };
  });
  stageEl.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId) || !gesture || !state.H) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const cur = Array.from(pointers.values());
    if (cur.length === 1 && gesture.pts.length === 1) {
      const dx = cur[0].x - gesture.pts[0].x, dy = cur[0].y - gesture.pts[0].y;
      if (Math.hypot(dx, dy) > 6) moved = true;
      state.user.tx = gesture.user.tx + dx; state.user.ty = gesture.user.ty + dy;
    } else if (cur.length === 2 && gesture.pts.length === 2) {
      moved = true;
      const d0 = Math.hypot(gesture.pts[1].x - gesture.pts[0].x, gesture.pts[1].y - gesture.pts[0].y);
      const d1 = Math.hypot(cur[1].x - cur[0].x, cur[1].y - cur[0].y);
      const a0 = Math.atan2(gesture.pts[1].y - gesture.pts[0].y, gesture.pts[1].x - gesture.pts[0].x);
      const a1 = Math.atan2(cur[1].y - cur[0].y, cur[1].x - cur[0].x);
      state.user.s = gesture.user.s * (d1 / d0);
      state.user.r = gesture.user.r + (a1 - a0);
    }
    applyLayer();
  });
  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    const wasSingle = pointers.size === 1;
    pointers.delete(e.pointerId);
    if (wasSingle && !moved && performance.now() - downAt < 600 && state.livePts.length < state.photoPts.length) {
      const r = stageEl.getBoundingClientRect();
      state.livePts.push({ x: e.clientX - r.left, y: e.clientY - r.top });
      log('live_pin', { n: state.livePts.length });
      drawPins($('livePins'), state.livePts, '#00e5ff');
      if (state.livePts.length === state.photoPts.length) {
        state.H = computeTransform(state.photoPts, state.livePts);
        state.tAligned = performance.now();
        log('aligned', { points: state.livePts.length, ms: Math.round(state.tAligned - state.t0), ok: !!state.H });
        applyLayer();
      }
      updateLiveMsg();
    }
    gesture = pointers.size ? { user: Object.assign({}, state.user), pts: Array.from(pointers.values()).map((p) => ({ x: p.x, y: p.y })) } : null;
  }
  stageEl.addEventListener('pointerup', endPointer);
  stageEl.addEventListener('pointercancel', endPointer);

  $('opacity').addEventListener('input', (e) => { $('layer').style.opacity = e.target.value; });
  $('liveUndo').addEventListener('click', () => {
    state.livePts.pop(); state.H = null; state.user = { tx: 0, ty: 0, s: 1, r: 0 };
    drawPins($('livePins'), state.livePts, '#00e5ff'); applyLayer(); updateLiveMsg();
  });
  $('liveReset').addEventListener('click', () => {
    state.livePts = []; state.H = null; state.user = { tx: 0, ty: 0, s: 1, r: 0 };
    state.t0 = performance.now(); state.tAligned = null;
    drawPins($('livePins'), []); applyLayer(); updateLiveMsg(); log('realign');
  });
  $('liveBack').addEventListener('click', () => { stopCamera(); show('sPhoto'); updatePhotoUi(); });

  // ---------- Screen 4: log ----------
  $('liveSave').addEventListener('click', () => {
    log('saved', { user: state.user, H: state.H });
    const out = {
      note: 'EXLFY PoC level A - manual measurement needed: cm deviation of pencil marks vs. documented offsets',
      when: new Date().toISOString(),
      ua: navigator.userAgent,
      standalone: !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches)),
      screen: { w: screen.width, h: screen.height, dpr: window.devicePixelRatio },
      photo: { w: state.natW, h: state.natH },
      landmarks: { photo: state.photoPts, live: state.livePts },
      alignMs: state.tAligned ? Math.round(state.tAligned - state.t0) : null,
      transformKind: ({ 2: 'similarity', 3: 'affine', 4: 'homography' })[state.livePts.length] || null,
      manualAdjust: state.user,
      events: state.events,
      TODO_measure: { wall: '', materialType: '', distanceM: '', deviationCm_perPoint: [], driftAfter30cmMoveCm: '' },
    };
    $('logOut').value = JSON.stringify(out, null, 2);
    stopCamera(); show('sLog');
  });
  $('logCopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('logOut').value); } catch (_) { $('logOut').select(); document.execCommand('copy'); }
  });
  $('logBack').addEventListener('click', startLive);
})();
</script>
</body>
</html>
`;

export function GET(): Response {
  return new Response(PAGE_HTML, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
