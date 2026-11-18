// =====================================================================
// 곡 목록 텍스트 → 유튜브 검색 → (구글 로그인) 유튜브 재생목록 만들기 → 사이트 편집기로 넘기기
// admin.html 의 전역 함수/변수($, toast, openEditor, guardDirty, all, cfg, escapeHtml …)를 사용해요.
// =====================================================================
(function () {
  const YT_API = "https://www.googleapis.com/youtube/v3";
  let rows = [];          // [{ line, name, artist, title, query, risky, cands:[], pick:videoId|null, skip:false, status }]
  let busy = false;

  /* ---------------- 화면 전환 ---------------- */
  function openBuilder() {
    if (busy) return;
    if (!guardDirty()) return;
    edit = null;
    dirty = false;
    $("editor").classList.add("hidden");
    $("editorEmpty").classList.add("hidden");
    $("builder").classList.remove("hidden");
    showStep(1);
    renderItems();
    updateParsed();
    $("bTitle").focus();
  }
  function closeBuilder() {
    if (busy) return toast("재생목록을 만드는 중이에요. 끝날 때까지 기다려 주세요.");
    $("builder").classList.add("hidden");
    $("editorEmpty").classList.remove("hidden");
  }
  function showStep(n) {
    $("bStep1").classList.toggle("hidden", n !== 1);
    $("bStep2").classList.toggle("hidden", n !== 2);
  }
  $("buildBtn").onclick = openBuilder;
  $("bCancel").onclick = closeBuilder;
  $("bBack").onclick = () => { if (!busy) showStep(1); };

  /* ---------------- 1. 텍스트 분석 ----------------
     "▶ 아티스트 - 곡명 (누구 cover)" → 표시 이름은 그대로, 검색어는 규칙에 따라 만듦 */
  function parseLine(raw) {
    const line = raw.replace(/^\s*[▶►▷•\-*·]+\s*/, "").trim();
    if (!line) return null;
    const i = line.indexOf(" - ");
    let artist = i >= 0 ? line.slice(0, i).trim() : "";
    let title = i >= 0 ? line.slice(i + 3).trim() : line;
    let query, risky = false, reason = "";

    const cover = title.match(/\(([^()]*?)\s*cover\)\s*$/i);
    const work = /\b(OST|OP|ED)\b/i.test(artist);
    if (cover) {                                   // 커버곡: 커버한 사람 + 곡명
      const singers = cover[1].replace(/[,、]/g, " ").trim();
      const bare = title.replace(cover[0], "").trim();
      query = `${singers} ${bare} cover`;
      risky = true; reason = "커버곡";
    } else if (work) {                             // 작품 OST/OP/ED: 곡명 위주
      query = `${title} ${artist}`;
      risky = true; reason = "OST·OP·ED";
    } else {
      query = artist ? `${artist} ${title}` : title;
    }
    if (!artist) { risky = true; reason = reason || "아티스트 없음"; }
    return { line, name: line, artist, title, query: query.replace(/\s+/g, " ").trim(), risky, reason,
             cands: [], pick: null, skip: false, status: "" };
  }
  function parseText() {
    return $("bText").value.split(/\r?\n/).map(parseLine).filter(Boolean);
  }
  function updateParsed() {
    const n = parseText().length;
    $("bParsed").textContent = n ? `${n}곡 인식됨` : "";
  }
  $("bText").addEventListener("input", updateParsed);

  /* ---------------- 2. 유튜브 검색 (곡당 search.list 1회) ---------------- */
  const decode = s => { const t = document.createElement("textarea"); t.innerHTML = s; return t.value; };

  async function searchYouTube(q) {
    const u = new URL(YT_API + "/search");
    u.search = new URLSearchParams({ part: "snippet", type: "video", maxResults: "3", q, key: cfg.YOUTUBE_API_KEY });
    const res = await fetch(u);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = json.error && json.error.errors && json.error.errors[0] && json.error.errors[0].reason;
      const e = new Error(reason === "quotaExceeded" || reason === "rateLimitExceeded"
        ? "오늘 유튜브 검색 한도를 다 썼어요. 내일 다시 하거나, 남은 곡은 링크를 직접 넣어주세요."
        : "유튜브 검색 실패 (" + (reason || res.status) + ")");
      e.fatal = res.status === 403;
      throw e;
    }
    return (json.items || []).filter(it => it.id && it.id.videoId).map(it => ({
      videoId: it.id.videoId,
      title: decode(it.snippet.title || ""),
      channel: decode(it.snippet.channelTitle || ""),
      thumb: (it.snippet.thumbnails && it.snippet.thumbnails.default && it.snippet.thumbnails.default.url) || "",
    }));
  }

  async function runSearch(list) {
    let done = 0, stop = null;
    const total = list.length;
    $("bSummary").textContent = `검색 중… 0 / ${total}`;
    const queue = list.slice();
    async function worker() {
      while (queue.length && !stop) {
        const r = queue.shift();
        r.status = "검색 중…"; renderRow(r);
        try {
          r.cands = await searchYouTube(r.query);
          r.pick = r.cands[0] ? r.cands[0].videoId : null;
          r.status = r.cands.length ? "" : "결과 없음";
        } catch (e) {
          r.status = e.message;
          if (e.fatal) stop = e;
        }
        done++;
        $("bSummary").textContent = `검색 중… ${done} / ${total}`;
        renderRow(r);
      }
    }
    await Promise.all([worker(), worker(), worker()]);   // 동시에 3곡씩
    if (stop) toast(stop.message, 8000);
    updateSummary();
  }

  $("bSearch").onclick = async () => {
    if (busy) return;
    const title = $("bTitle").value.trim();
    rows = parseText();
    if (!title) return toast("제목을 입력해 주세요.");
    if (!rows.length) return toast("곡 목록을 붙여넣어 주세요.");
    if (rows.length > 200) return toast("한 번에 200곡까지만 만들 수 있어요.");
    rows.forEach((r, i) => r.no = i + 1);
    showStep(2);
    renderRows();
    busy = true; setButtons();
    try { await runSearch(rows); } finally { busy = false; setButtons(); }
  };

  /* ---------------- 후보 표 ---------------- */
  function renderRows() {
    const box = $("bRows");
    box.innerHTML = "";
    rows.forEach(r => { r.el = document.createElement("div"); box.appendChild(r.el); renderRow(r); });
    updateSummary();
  }
  function renderRow(r) {
    if (!r.el) return;
    const el = r.el;
    const noPick = !r.skip && !r.pick && !r.status.startsWith("검색");
    el.className = "brow" + (r.skip ? " skip" : "") + (r.risky || noPick ? " warn" : "");
    el.innerHTML = `
      <div class="brow-head">
        <span class="no">${r.no}</span>
        <span class="nm">${escapeHtml(r.name)}</span>
        ${r.reason ? `<span class="tag red">${escapeHtml(r.reason)}</span>` : ""}
        ${r.status ? `<span class="tag">${escapeHtml(r.status)}</span>` : ""}
        <label class="check" style="font-size:12px"><input type="checkbox" class="skipChk" ${r.skip ? "checked" : ""}> 빼기</label>
      </div>
      <div class="cands">${r.cands.map(c => `
        <div class="cand ${c.videoId === r.pick ? "sel" : ""}" data-v="${c.videoId}" title="${escapeHtml(c.title)}">
          ${c.thumb ? `<img src="${escapeHtml(c.thumb)}" alt="">` : `<img alt="">`}
          <div class="ct"><b>${escapeHtml(c.title)}</b><span>${escapeHtml(c.channel)}</span></div>
        </div>`).join("")}</div>
      <div class="bfoot">
        <input type="text" class="qIn" value="${escapeHtml(r.query)}" aria-label="검색어">
        <button type="button" class="btn small reBtn">다시 검색</button>
        <input type="text" class="urlIn" placeholder="또는 유튜브 링크 붙여넣기" aria-label="유튜브 링크 직접 입력">
        <a class="btn small" target="_blank" rel="noopener"
           href="https://music.youtube.com/search?q=${encodeURIComponent(r.query)}">유튜브 뮤직에서 보기</a>
      </div>`;
    el.querySelectorAll(".cand").forEach(c => c.onclick = () => { r.pick = c.dataset.v; r.skip = false; renderRow(r); updateSummary(); });
    el.querySelector(".skipChk").onchange = e => { r.skip = e.target.checked; renderRow(r); updateSummary(); };
    el.querySelector(".reBtn").onclick = async () => {
      if (busy) return;
      r.query = el.querySelector(".qIn").value.trim() || r.query;
      busy = true; setButtons();
      try { await runSearch([r]); } finally { busy = false; setButtons(); }
    };
    el.querySelector(".qIn").addEventListener("keydown", e => { if (e.key === "Enter") el.querySelector(".reBtn").click(); });
    el.querySelector(".urlIn").addEventListener("change", e => {
      const id = videoIdFrom(e.target.value);
      if (!id) return toast("유튜브 영상 링크에서 영상 ID를 찾지 못했어요.");
      r.cands = [{ videoId: id, title: "직접 넣은 링크", channel: id, thumb: `https://i.ytimg.com/vi/${id}/default.jpg` }]
        .concat(r.cands.filter(c => c.videoId !== id)).slice(0, 3);
      r.pick = id; r.skip = false; r.status = "";
      renderRow(r); updateSummary();
    });
  }
  function videoIdFrom(s) {
    s = (s || "").trim();
    try {
      const u = new URL(s);
      if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1).split("/")[0] || "";
      if (u.searchParams.get("v")) return u.searchParams.get("v");
      const m = u.pathname.match(/\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    } catch (e) { /* URL이 아니면 아래 */ }
    return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
  }
  function updateSummary() {
    if (!rows.length) return;
    const use = rows.filter(r => !r.skip && r.pick).length;
    const missing = rows.filter(r => !r.skip && !r.pick).length;
    const skipped = rows.filter(r => r.skip).length;
    $("bSummary").textContent = `전체 ${rows.length}곡 · 넣을 곡 ${use}` +
      (missing ? ` · 고를 곡 없음 ${missing}` : "") + (skipped ? ` · 뺀 곡 ${skipped}` : "");
  }
  function setButtons() {
    $("bSearch").disabled = busy;
    $("bCreate").disabled = busy;
    $("bBack").disabled = busy;
  }

  /* ---------------- 3. 구글 로그인 (Google Identity Services 토큰 방식) ---------------- */
  function getToken() {
    return new Promise((resolve, reject) => {
      if (!window.google || !google.accounts || !google.accounts.oauth2) {
        return reject(new Error("구글 로그인 도구를 불러오지 못했어요. 새로고침 후 다시 해주세요."));
      }
      if (!cfg.GOOGLE_CLIENT_ID) return reject(new Error("config.js에 GOOGLE_CLIENT_ID가 없어요."));
      const client = google.accounts.oauth2.initTokenClient({
        client_id: cfg.GOOGLE_CLIENT_ID,
        scope: "https://www.googleapis.com/auth/youtube",
        callback: resp => {
          if (resp.error) return reject(new Error("구글 로그인이 취소되었거나 실패했어요. (" + resp.error + ")"));
          if (!google.accounts.oauth2.hasGrantedAllScopes(resp, "https://www.googleapis.com/auth/youtube")) {
            return reject(new Error("유튜브 관리 권한을 허용해야 재생목록을 만들 수 있어요."));
          }
          resolve(resp.access_token);
        },
        error_callback: err => reject(new Error(err && err.type === "popup_closed"
          ? "로그인 창이 닫혔어요." : "로그인 창을 열지 못했어요. 팝업 차단을 확인해 주세요.")),
      });
      client.requestAccessToken({ prompt: "" });
    });
  }

  async function ytCall(token, path, body) {
    const res = await fetch(YT_API + path, {
      method: "POST",
      headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const reason = json.error && json.error.errors && json.error.errors[0] && json.error.errors[0].reason;
      const msg = {
        youtubeSignupRequired: "이 구글 계정에는 유튜브 채널이 없어요. 채널을 먼저 만들어 주세요.",
        quotaExceeded: "오늘 유튜브 API 사용 한도를 다 썼어요. 내일 다시 해주세요.",
        videoNotFound: "영상을 찾을 수 없어요(삭제·비공개).",
        forbidden: "이 영상은 재생목록에 넣을 수 없어요.",
      }[reason] || (res.status === 401 ? "로그인이 만료됐어요. 다시 시도해 주세요." : `오류 (${reason || res.status})`);
      const e = new Error(msg);
      e.fatal = res.status === 401 || reason === "youtubeSignupRequired" || reason === "quotaExceeded";
      throw e;
    }
    return json;
  }

  /* ---------------- 4. 재생목록 만들기 → 사이트 편집기로 ---------------- */
  function progress(text, ratio) {
    $("bProgress").classList.remove("hidden");
    $("bProgText").textContent = text;
    $("bProgBar").style.width = Math.round(ratio * 100) + "%";
  }
  function log(msg) {
    const d = document.createElement("div");
    d.textContent = msg;
    $("bLog").appendChild(d);
  }

  $("bCreate").onclick = async () => {
    if (busy) return;
    const title = $("bTitle").value.trim();
    const use = rows.filter(r => !r.skip && r.pick);
    const missing = rows.filter(r => !r.skip && !r.pick);
    if (!title) { showStep(1); return toast("제목을 입력해 주세요."); }
    if (!use.length) return toast("넣을 곡이 없어요.");
    if (missing.length && !confirm(`곡을 고르지 않은 ${missing.length}곡은 빼고 만들까요?`)) return;

    busy = true; setButtons();
    $("bLog").innerHTML = "";
    try {
      progress("구글 로그인 중…", 0);
      const token = await getToken();

      progress("유튜브 재생목록 만드는 중…", 0);
      const pl = await ytCall(token, "/playlists?part=snippet,status", {
        snippet: { title, description: "" },
        status: { privacyStatus: $("bPrivacy").value },
      });
      log(`재생목록을 만들었어요: ${title}`);

      const added = [];
      for (let i = 0; i < use.length; i++) {
        const r = use[i];
        progress(`곡 넣는 중… ${i + 1} / ${use.length}`, (i + 1) / use.length);
        try {
          await ytCall(token, "/playlistItems?part=snippet", {
            snippet: { playlistId: pl.id, resourceId: { kind: "youtube#video", videoId: r.pick } },
          });
          added.push(r);
        } catch (e) {
          log(`✕ ${r.name} — ${e.message}`);
          if (e.fatal) throw e;
        }
      }
      const failed = use.length - added.length;
      progress(`완료: ${added.length}곡을 넣었어요` + (failed ? ` (${failed}곡 실패)` : ""), 1);
      toast("유튜브 재생목록을 만들었어요. 커버와 배경색을 넣고 저장하면 사이트에 올라가요.", 7000);

      // 사이트 편집기로 넘기기 (아직 저장 전: 커버·배경색 넣고 '저장'을 눌러야 사이트에 올라감)
      busy = false; setButtons();
      $("builder").classList.add("hidden");
      openEditor({
        id: crypto.randomUUID(), isNew: true, title, yt_list_id: pl.id, cover_path: null,
        tracks: added.map(r => ({ name: r.name, videoId: r.pick })),
        is_published: true, theme: null,
        sort_order: all.length ? Math.min(...all.map(p => p.sort_order)) - 10 : 0,
        playlist_date: new Date().toLocaleDateString("sv-SE"), show_date: true,
      });
      dirty = true;
    } catch (e) {
      progress("중단됐어요: " + e.message, 0);
      toast(e.message, 8000);
    } finally {
      busy = false; setButtons();
    }
  };
})();
