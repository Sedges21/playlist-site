// 시청자 화면과 관리 페이지가 같이 쓰는 코드
(function () {
  const cfg = window.APP_CONFIG;
  const db = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY);

  /** covers 저장소 안의 경로 → 이미지 주소 */
  function coverUrl(path) {
    if (!path) return "";
    return db.storage.from("covers").getPublicUrl(path).data.publicUrl;
  }

  /** 유튜브 / 유튜브 뮤직 링크나 ID → 재생목록 ID */
  function parsePlaylistId(input) {
    const s = (input || "").trim();
    try {
      const u = new URL(s);
      const id = u.searchParams.get("list");
      if (id) return id;
    } catch (e) { /* URL이 아니면 아래로 */ }
    return /^[A-Za-z0-9_-]{10,}$/.test(s) ? s : "";
  }

  /** tracks 칸을 항상 [{name, videoId}] 형태로 맞춤 (예전 문자열 형식도 허용) */
  function normalizeTracks(tracks) {
    if (!Array.isArray(tracks)) return [];
    return tracks
      .map(t => (typeof t === "string" ? { name: t, videoId: null } : { name: t.name || "", videoId: t.videoId || null }))
      .filter(t => t.name);
  }

  function fmtTime(s) {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function toast(msg, ms = 3500) {
    let t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast";
      t.className = "toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  /* ===================== 플레이리스트 배경 색 (theme) =====================
     theme = { grid: [[좌상, 중상, 우상], [좌중, 가운데, 우중], [좌하, 중하, 우하]] }  (#rrggbb)
     완성된 플리 사진에서 글자·커버가 없는 9곳의 색을 뽑아, 부드럽게 섞어 배경을 다시 그려요. */
  const SAMPLE_X = [0.03, 0.52, 0.975];
  const SAMPLE_Y = [0.04, 0.5, 0.96];
  // 플리 사진(16:9) 안에서 커버가 놓이는 위치 (비율)
  const COVER_BOX = { x0: 0.18, y0: 0.157, x1: 0.447, y1: 0.636 };

  const toHex = rgb => "#" + rgb.map(v => v.toString(16).padStart(2, "0")).join("");
  const fromHex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));

  function isValidTheme(t) {
    return t && Array.isArray(t.grid) && t.grid.length === 3 &&
      t.grid.every(r => Array.isArray(r) && r.length === 3 && r.every(c => /^#[0-9a-f]{6}$/i.test(c)));
  }

  /** 완성된 플리 사진 → 배경 색 9개 (각 지점 주변 15×15px의 중앙값) */
  function extractTheme(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const r = Math.max(3, Math.round(Math.min(w, h) / 100));
    const grid = SAMPLE_Y.map(fy => SAMPLE_X.map(fx => {
      const cx = Math.round(fx * w), cy = Math.round(fy * h);
      const x0 = Math.max(0, cx - r), y0 = Math.max(0, cy - r);
      const d = ctx.getImageData(x0, y0, Math.min(w - x0, 2 * r + 1), Math.min(h - y0, 2 * r + 1)).data;
      const ch = [[], [], []];
      for (let i = 0; i < d.length; i += 4) { ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); }
      return toHex(ch.map(a => a.sort((p, q) => p - q)[a.length >> 1]));
    }));
    return { grid };
  }

  /** 완성된 플리 사진 → 커버 부분만 잘라낸 PNG (원본 해상도 그대로) */
  function cropCover(img) {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    const sx = Math.round(COVER_BOX.x0 * w), sy = Math.round(COVER_BOX.y0 * h);
    const size = Math.round(Math.min((COVER_BOX.x1 - COVER_BOX.x0) * w, (COVER_BOX.y1 - COVER_BOX.y0) * h));
    const c = document.createElement("canvas");
    c.width = size; c.height = size;
    c.getContext("2d").drawImage(img, sx, sy, size, size, 0, 0, size, size);
    return new Promise((res, rej) => c.toBlob(b => (b ? res({ blob: b, size }) : rej()), "image/png"));
  }

  /** theme → 배경 이미지(data URL). 9색을 이웃끼리 부드럽게 섞음 */
  function themeImage(theme) {
    if (!isValidTheme(theme)) return "";
    const s = document.createElement("canvas");
    s.width = 3; s.height = 3;
    const sctx = s.getContext("2d");
    const px = sctx.createImageData(3, 3);
    theme.grid.flat().forEach((hex, i) => {
      const [r, g, b] = fromHex(hex);
      px.data.set([r, g, b, 255], i * 4);
    });
    sctx.putImageData(px, 0, 0);
    const c = document.createElement("canvas");
    c.width = 480; c.height = 270;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(s, 0, 0, 3, 3, -80, -45, 640, 360);   // 가장자리 색이 화면 끝까지 닿도록 살짝 크게
    return c.toDataURL("image/png");
  }

  function loadImageFile(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }

  window.App = { cfg, db, coverUrl, parsePlaylistId, normalizeTracks, fmtTime, escapeHtml, toast,
                 isValidTheme, extractTheme, cropCover, themeImage, loadImageFile };
})();
