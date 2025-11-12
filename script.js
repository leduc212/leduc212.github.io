(() => {
  // ========= Game & UI constants =========
  const SIDE = 9, BASE = 3;

  const PRESETS = {
    story:  { lives: 5, bombRatio: 0.14, targetStartClues: 19, targetStartGivens: 40, maxAdjStart: 2, spreadRows: true, spreadBlocks: true, hintRows: 3, hintCols: 3 },
    normal: { lives: 3, bombRatio: 0.18, targetStartClues: 15, targetStartGivens: 32, maxAdjStart: 3, spreadRows: true, spreadBlocks: true, hintRows: 2, hintCols: 2 },
    hard:   { lives: 3, bombRatio: 0.22, targetStartClues: 9,  targetStartGivens: 20, maxAdjStart: 4, spreadRows: true, spreadBlocks: true, hintRows: 1, hintCols: 2 },
    custom: { lives: 3, bombRatio: 0.14, targetStartClues: 17, targetStartGivens: 36, maxAdjStart: 2, spreadRows: true, spreadBlocks: true, hintRows: 3, hintCols: 3 },
  };

  const LS_KEY = "runic-custom-config-v1";

  // ========= State =========
  let mode = "story";
  let solution = [], bombs = [], adj = [], revealed = [], flagged = [], flagNote = [], given = [];
  let lives = 3, bombsTotal = 0, flagsCount = 0;
  let selected = null, pickedDigit = null, gameOver = false, flagMode = false;
  let reviewMode = false, didWin = false;
  let hintedRows = [], hintedCols = [];
  let rowTotals = [], colTotals = [];
  let showAllBombs = false; // reveal bombs on loss regardless of review mode

  // ========= DOM =========
  const boardEl = document.getElementById("board");
  const livesEl = document.getElementById("lives");
  const bombsLeftEl = document.getElementById("bombsLeft");
  const flagsCntEl = document.getElementById("flagsCnt");
  const statusEl = document.getElementById("status");
  const modeEl = document.getElementById("mode");
  const newRunBtn = document.getElementById("newRun");
  const numpadEl = document.getElementById("numpad");
  const confirmBtn = document.getElementById("confirm");
  const flagBtn = document.getElementById("flagBtn");
  const removeFlagBtn = document.getElementById("removeFlagBtn");
  const asideHint = document.getElementById("asideHint");
  const activeConfigEl = document.getElementById("activeConfig");
  const saveCustomBtn = document.getElementById("saveCustom");
  const resetCustomBtn = document.getElementById("resetCustom");
  const configPanel = document.getElementById("configPanel");
  const reviewBtn = document.getElementById("reviewBtn");

  const cfgLives = document.getElementById("cfgLives");
  const cfgBombRatio = document.getElementById("cfgBombRatio");
  const cfgStartClues = document.getElementById("cfgStartClues");
  const cfgStartGivens = document.getElementById("cfgStartGivens");
  const cfgMaxAdj = document.getElementById("cfgMaxAdj");
  const cfgSpreadRows = document.getElementById("cfgSpreadRows");
  const cfgSpreadBlocks = document.getElementById("cfgSpreadBlocks");
  const valLives = document.getElementById("valLives");
  const valBombRatio = document.getElementById("valBombRatio");
  const valStartClues = document.getElementById("valStartClues");
  const valStartGivens = document.getElementById("valStartGivens");
  const valMaxAdj = document.getElementById("valMaxAdj");

  // overlays/highlights
  const boardWrapEl = document.querySelector(".boardWrap");
  const rowHL = document.createElement("div"); rowHL.id = "rowHL"; rowHL.className = "hlStripe";
  const colHL = document.createElement("div"); colHL.id = "colHL"; colHL.className = "hlStripe";
  boardWrapEl.appendChild(rowHL); boardWrapEl.appendChild(colHL);

  // ========= Review toggle (bugfix: always exits/enters cleanly) =========
  reviewBtn.addEventListener("click", () => {
    if (!gameOver) return;
    reviewMode = !reviewMode;
    reviewBtn.textContent = reviewMode ? "◼ Exit Review" : "👁 Review Board";
    renderBoard();
  });

  // ========= Global UI listeners =========
  window.addEventListener("contextmenu", (e) => e.preventDefault(), { passive: false });
  window.addEventListener("resize", () => { renderRowColHintsOverlay(); hideHL(); });
  new ResizeObserver(() => { renderRowColHintsOverlay(); hideHL(); }).observe(boardWrapEl);

  // ========= Utils =========
  const inBounds = (r, c) => r >= 0 && r < SIDE && c >= 0 && c < SIDE;
  const neighbors8 = (r, c) => {
    const res = [];
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (inBounds(rr, cc)) res.push([rr, cc]);
    }
    return res;
  };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ========= Sudoku generator =========
  function generateSudokuSolved() {
    // pattern-based Latin-square shuffling (fast + valid)
    const pattern = (r, c) => (BASE * (r % BASE) + Math.floor(r / BASE) + c) % SIDE;
    const rBase = [0, 1, 2];
    const rows = [].concat(...shuffle([0, 1, 2]).map((g) => shuffle([...rBase]).map((r) => g * BASE + r)));
    const cols = [].concat(...shuffle([0, 1, 2]).map((g) => shuffle([...rBase]).map((c) => g * BASE + c)));
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const g = Array.from({ length: SIDE }, () => Array(SIDE).fill(0));
    for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) g[rows[r]][cols[c]] = nums[pattern(r, c)];
    return g;
  }

  // ========= Bombs & adjacency =========
  function placeBombs(ratio) {
    const total = SIDE * SIDE, target = Math.max(1, Math.floor(total * ratio));
    const b = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
    const pool = []; for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) pool.push([r, c]);
    shuffle(pool);
    for (let i = 0; i < target; i++) { const [r, c] = pool[i]; b[r][c] = true; }
    return { b, count: target };
  }
  function computeAdj(b) {
    const A = Array.from({ length: SIDE }, () => Array(SIDE).fill(0));
    for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++)
      A[r][c] = neighbors8(r, c).reduce((acc, [rr, cc]) => acc + (b[rr][cc] ? 1 : 0), 0);
    return A;
  }
  function tileType(r, c) { return bombs[r][c] ? "bomb" : (solution[r][c] === adj[r][c] ? "clue" : "normal"); }

  // Encourage each bomb to have at least two neighboring clue supports (gentle nudge)
  function ensureBombHasTwoSupports(maxPasses = 2) {
    const countClueNeighbors = (r, c, A = adj) =>
      neighbors8(r, c).reduce((n, [rr, cc]) => n + (!bombs[rr][cc] && solution[rr][cc] === A[rr][cc] ? 1 : 0), 0);

    for (let pass = 0; pass < maxPasses; pass++) {
      let moved = false;
      for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) {
        if (!bombs[r][c]) continue;
        const supports = countClueNeighbors(r, c, adj);
        if (supports >= 2) continue;

        let best = null, bestScore = -1;
        for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr, cc = c + dc;
          if (!inBounds(rr, cc) || bombs[rr][cc]) continue;

          bombs[r][c] = false; bombs[rr][cc] = true;
          const A = computeAdj(bombs);
          const sup = countClueNeighbors(rr, cc, A);
          let score = sup >= 2 ? 1000 : 0;
          if (score) {
            for (let i = 0; i < SIDE; i++) for (let j = 0; j < SIDE; j++)
              if (!bombs[i][j] && solution[i][j] === A[i][j]) score++;
          }
          bombs[r][c] = true; bombs[rr][cc] = false;
          if (score > bestScore) { bestScore = score; best = [rr, cc]; }
        }
        if (best) { const [nr, nc] = best; bombs[r][c] = false; bombs[nr][nc] = true; adj = computeAdj(bombs); moved = true; }
      }
      if (!moved) break;
    }
  }

  // ========= Picking initial givens (clues + some normals) =========
  function chooseGivensPatterned(cfg) {
    // Preference list: low-adjacent clues first, then other clues, then safe normals
    const cells = [];
    for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) {
      if (bombs[r][c]) continue;
      const isClue = solution[r][c] === adj[r][c];
      const lowAdj = isClue && adj[r][c] <= (cfg.maxAdjStart ?? 2);
      const score =
        (isClue ? 1000 : 0) +
        (lowAdj ? 100 : 0) +
        // light spreading by row/col/block
        (cfg.spreadRows ? (8 - Math.abs(4 - r)) : 0) +
        (cfg.spreadBlocks ? (8 - Math.abs(4 - ((Math.floor(r/3)*3)+(Math.floor(c/3))))) : 0);
      cells.push({ r, c, isClue, score });
    }
    cells.sort((a, b) => b.score - a.score);

    const g = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
    let clues = 0, total = 0;

    // First pass: pick clues up to targetStartClues
    for (const it of cells) {
      if (total >= cfg.targetStartGivens) break;
      if (it.isClue && clues < cfg.targetStartClues) {
        g[it.r][it.c] = true;
        clues++; total++;
      }
    }
    // Second pass: fill remaining givens with non-bomb safest tiles
    for (const it of cells) {
      if (total >= cfg.targetStartGivens) break;
      if (!g[it.r][it.c]) {
        g[it.r][it.c] = true; total++;
      }
    }
    return { g, clues };
  }

  // A light sanity test to avoid pathological starts
  function passesSimpleLogicTest(g) {
    // ensure at least 1 given per row and column, and no given is a bomb
    for (let i = 0; i < SIDE; i++) {
      let rowOk = false, colOk = false;
      for (let j = 0; j < SIDE; j++) {
        if (g[i][j] && !bombs[i][j]) rowOk = true;
        if (g[j][i] && !bombs[j][i]) colOk = true;
      }
      if (!rowOk || !colOk) return false;
    }
    return true;
  }

  // ========= Row/Col hints (gutters) =========
  function getBoardMetrics() {
    const wrapRect = boardWrapEl.getBoundingClientRect();
    const boardRect = boardEl.getBoundingClientRect();
    const cs = getComputedStyle(boardEl);
    const padL = parseFloat(cs.paddingLeft);
    const padT = parseFloat(cs.paddingTop);
    const padR = parseFloat(cs.paddingRight);
    const padB = parseFloat(cs.paddingBottom);
    const innerW = boardRect.width - padL - padR;
    const innerH = boardRect.height - padT - padB;
    const originX = boardRect.left - wrapRect.left + padL;
    const originY = boardRect.top - wrapRect.top + padT;
    const cellW = innerW / SIDE;
    const cellH = innerH / SIDE;
    return { originX, originY, innerW, innerH, cellW, cellH };
  }

  function renderRowColHintsOverlay() {
    const rowEl = document.getElementById("rowHintsOverlay");
    const colEl = document.getElementById("colHintsOverlay");
    rowEl.innerHTML = ""; colEl.innerHTML = "";

    const { originX, originY, cellW, cellH } = getBoardMetrics();

    hintedRows.forEach((r) => {
      const badge = document.createElement("div");
      badge.className = "gutRow";
      badge.style.left = "8px";
      badge.style.top = originY + (r + 0.5) * cellH + "px";
      badge.textContent = `💣 ${rowTotals[r]}`;
      badge.addEventListener("mouseenter", () => showRowHL(r));
      badge.addEventListener("mouseleave", hideHL);
      rowEl.appendChild(badge);
    });

    hintedCols.forEach((c) => {
      const badge = document.createElement("div");
      badge.className = "gutCol";
      badge.style.top = "8px";
      badge.style.left = originX + (c + 0.5) * cellW + "px";
      badge.textContent = `💣 ${colTotals[c]}`;
      badge.addEventListener("mouseenter", () => showColHL(c));
      badge.addEventListener("mouseleave", hideHL);
      colEl.appendChild(badge);
    });
  }

  function renderLives() {
    livesEl.innerHTML = "";
    const maxL = getActiveConfig().lives;
    for (let i = 0; i < maxL; i++) {
      const h = document.createElement("div");
      h.className = "heart" + (i < lives ? " on" : "");
      livesEl.appendChild(h);
    }
  }

  function setStatus(msg, cls) {
    statusEl.className = "status " + (cls || "");
    statusEl.textContent = msg;
  }

  function updateStats() {
    const notFlagged = bombsTotal - countCorrectFlags();
    bombsLeftEl.textContent = "💣 " + String(Math.max(0, notFlagged));
    flagsCntEl.textContent = String(flagsCount);
  }

  function countCorrectFlags() {
    let ok = 0; for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) if (bombs[r][c] && flagged[r][c]) ok++;
    return ok;
  }

  function isWin() {
    for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) {
      if (bombs[r][c] && !flagged[r][c]) return false;
      if (!bombs[r][c] && !revealed[r][c]) return false;
    }
    return true;
  }

  function loseLife() { lives--; renderLives(); if (lives <= 0) endGame(false, "No lives left."); }

  function endGame(win, msg) {
    gameOver = true; didWin = !!win;
    if (win) {
      showAllBombs = false;
      setStatus("You win! " + (msg || ""), "win");
      reviewBtn.style.display = "none";
    } else {
      showAllBombs = true;  // reveal all bombs immediately on loss
      setStatus("You lose! " + (msg || ""), "lose");
      reviewBtn.style.display = "inline-block";
      reviewBtn.textContent = reviewMode ? "◼ Exit Review" : "👁 Review Board";
    }
    renderBoard();
  }

  // ========= Rendering =========
  function paintCell(div, r, c) {
    div.innerHTML = "";
    div.className = "cell";
    div.dataset.r = r; div.dataset.c = c;
    if (r % 3 === 0 && c % 3 === 0) { const sg = document.createElement("div"); sg.className = "subgrid"; div.appendChild(sg); }
    const isRev = revealed[r][c], isFlag = flagged[r][c], type = tileType(r, c);

    // post-loss bombs always visible (even outside review)
    if (gameOver && !didWin && showAllBombs && bombs[r][c] && !isRev) {
      div.classList.add("postHiddenBomb");
      const m = document.createElement("div"); m.className = "bombmark"; m.textContent = "💣"; div.appendChild(m);
    }

    // review mode: show everything + correctness
    if (reviewMode && gameOver) {
      if (!isRev) {
        if (bombs[r][c]) {
          div.classList.add("postHiddenBomb");
          const m = document.createElement("div"); m.className = "bombmark"; m.textContent = "💣"; div.appendChild(m);
        } else {
          const isClue = solution[r][c] === adj[r][c];
          div.classList.add(isClue ? "postHiddenClue" : "postHiddenSafe");
          div.textContent = solution[r][c];
        }
      }
      if (isFlag) {
        if (bombs[r][c]) {
          div.classList.add("flagRight");
          const note = flagNote[r]?.[c]; if (note != null) div.classList.add("flagDigitNoteOnBomb");
        } else {
          div.classList.add("flagWrong");
          const note = flagNote[r]?.[c]; if (note != null && note !== solution[r][c]) div.classList.add("flagDigitWrong");
        }
      }
    }

    if (isRev) {
      div.classList.add("revealed", type);
      if (type === "bomb") {
        const m = document.createElement("div"); m.className = "bombmark"; m.textContent = "💣"; div.appendChild(m);
      } else {
        div.textContent = solution[r][c];
        if (given[r][c]) div.classList.add("given");
      }
    } else {
      div.classList.add("covered");
      if (isFlag) {
        div.classList.add("flag");
        const note = flagNote[r]?.[c];
        if (note) { const big = document.createElement("div"); big.className = "flagDigit"; big.textContent = note; div.appendChild(big); }
      }
    }
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) {
      const div = document.createElement("div");
      paintCell(div, r, c);
      div.addEventListener("mousedown", onMouseDownCell);
      div.addEventListener("touchstart", onTouchCell, { passive: false });
      boardEl.appendChild(div);
    }
    highlightSelected();
    updateRemoveFlagButton();
    requestAnimationFrame(renderRowColHintsOverlay);
  }

  function renderCell(r, c) {
    const idx = r * SIDE + c, div = boardEl.children[idx];
    if (!div) return;
    paintCell(div, r, c);
    updateRemoveFlagButton();
  }

  // ========= Selection & input =========
  function hideHL() { rowHL.style.display = "none"; colHL.style.display = "none"; }
  function showRowHL(r) {
    const { originX, originY, innerW, cellH } = getBoardMetrics();
    rowHL.style.display = "block";
    rowHL.style.left = originX + "px"; rowHL.style.top = originY + r * cellH + "px";
    rowHL.style.width = innerW + "px"; rowHL.style.height = cellH + "px";
    colHL.style.display = "none";
  }
  function showColHL(c) {
    const { originX, originY, innerH, cellW } = getBoardMetrics();
    colHL.style.display = "block";
    colHL.style.left = originX + c * cellW + "px"; colHL.style.top = originY + "px";
    colHL.style.width = cellW + "px"; colHL.style.height = innerH + "px";
    rowHL.style.display = "none";
  }

  function setSelected(r, c) {
    if (gameOver) return;
    selected = { r, c }; highlightSelected();
    asideHint.textContent = flagMode ? "Flag mode: pick a number then Confirm to place a flag + digit." : "Reveal mode: pick a number then Confirm to reveal.";
    updateRemoveFlagButton();
  }
  function clearSelected() { selected = null; highlightSelected(); updateRemoveFlagButton(); }
  function highlightSelected() {
    for (const ch of boardEl.children) ch.classList.remove("sel");
    if (!selected) return;
    const idx = selected.r * SIDE + selected.c; const div = boardEl.children[idx];
    if (div) div.classList.add("sel");
  }
  function updateRemoveFlagButton() {
    if (!selected) { removeFlagBtn.disabled = true; return; }
    const { r, c } = selected; removeFlagBtn.disabled = !flagged[r][c];
  }

  function buildNumpad() {
    numpadEl.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
      const b = document.createElement("button");
      b.textContent = n; b.classList.add("numBtn");
      b.addEventListener("click", () => {
        pickedDigit = (pickedDigit === n) ? null : n;
        updateNumpadSelection();
      });
      numpadEl.appendChild(b);
    }
    updateNumpadSelection();
  }
  function updateNumpadSelection() {
    const btns = numpadEl.querySelectorAll(".numBtn");
    btns.forEach((btn) => btn.classList.remove("sel"));
    if (pickedDigit != null) { const idx = pickedDigit - 1; if (btns[idx]) btns[idx].classList.add("sel"); }
  }

  flagBtn.addEventListener("click", () => {
    flagMode = !flagMode; flagBtn.classList.toggle("flagModeOn", flagMode);
    setStatus(flagMode ? "Flag mode ON: choose a number then Confirm to place flag + digit (no life loss)." : "Reveal mode ON: choose a number then Confirm to reveal.", "hint");
    asideHint.textContent = flagMode ? "Flag mode: pick a number → Confirm to place a flag digit (no life loss)." : "Reveal mode: pick a number → Confirm to reveal; wrong digit costs a life.";
  });

  removeFlagBtn.addEventListener("click", () => {
    if (gameOver || !selected) return;
    const { r, c } = selected;
    if (!flagged[r][c]) return;
    flagged[r][c] = false;
    if (flagNote[r]) flagNote[r][c] = null;
    flagsCount = Math.max(0, flagsCount - 1);
    renderCell(r, c); updateStats();
    if (flagNote[r][c] == null) { pickedDigit = null; updateNumpadSelection(); }
    setStatus("Flag removed.", "hint");
  });

  confirmBtn.addEventListener("click", () => {
    if (gameOver) return;
    if (!selected) { setStatus("Select a covered tile first.", "lose"); return; }
    const { r, c } = selected;

    if (revealed[r][c]) { setStatus("Tile already revealed.", "lose"); bumpCell(r, c); return; }

    if (flagMode) {
      if (!flagged[r][c]) { flagged[r][c] = true; flagsCount++; }
      if (!flagNote[r]) flagNote[r] = [];
      flagNote[r][c] = pickedDigit ?? null;
      renderCell(r, c); updateStats();
      setStatus(flagNote[r][c] == null ? "Blank flag placed." : "Flag placed.", "hint");
      if (isWin()) endGame(true, "All bombs flagged & safe tiles revealed!");
      return;
    }

    if (!pickedDigit) { setStatus("Pick a number 1–9, then Confirm.", "lose"); bumpCell(r, c); return; }

    if (bombs[r][c]) { endGame(false, "You revealed a bomb."); return; }
    if (pickedDigit !== solution[r][c]) { loseLife(); if (!gameOver) setStatus(`Wrong digit. Life -1.`, "lose"); return; }

    revealed[r][c] = true; renderCell(r, c);
    if (isWin()) endGame(true, "All bombs flagged & safe tiles revealed!");
    else setStatus("Nice! Keep chaining logic from the anchors.");
  });

  function onMouseDownCell(e) {
    const t = e.currentTarget;
    const r = +t.dataset.r, c = +t.dataset.c;
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    if (e.button === 2) { e.preventDefault(); setStatus("Use Flag mode: click ⚑ Flag, pick a number, then Confirm.", "hint"); bumpCell(r, c); return; }
    if (!revealed[r][c]) setSelected(r, c); else clearSelected();
  }
  function onTouchCell(e) {
    e.preventDefault();
    const t = e.currentTarget; const r = +t.dataset.r, c = +t.dataset.c;
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    if (!revealed[r][c]) setSelected(r, c); else clearSelected();
  }
  function bumpCell(r, c) {
    const idx = r * SIDE + c, el = boardEl.children[idx];
    if (!el) return; el.classList.add("bad"); setTimeout(() => el.classList.remove("bad"), 200);
  }

  // ========= Row/Col hint selection =========
  function selectRowColHints(cfg) {
    rowTotals = Array.from({ length: SIDE }, (_, r) => bombs[r].reduce((s, x) => s + (x ? 1 : 0), 0));
    colTotals = Array.from({ length: SIDE }, (_, c) => { let s = 0; for (let r = 0; r < SIDE; r++) if (bombs[r][c]) s++; return s; });

    const lowAdj = (r, c) => !bombs[r][c] && solution[r][c] === adj[r][c] && adj[r][c] <= 2;

    const rowScore = (r) => {
      const info = rowTotals[r] === 0 || rowTotals[r] === 9 ? 0 : 1;
      let la = 0; for (let c = 0; c < SIDE; c++) if (lowAdj(r, c)) la++;
      return info * 10 + la;
    };
    const colScore = (c) => {
      const info = colTotals[c] === 0 || colTotals[c] === 9 ? 0 : 1;
      let la = 0; for (let r = 0; r < SIDE; r++) if (lowAdj(r, c)) la++;
      return info * 10 + la;
    };

    const rowIdx = Array.from({ length: SIDE }, (_, i) => i).sort((a, b) => rowScore(b) - rowScore(a));
    const colIdx = Array.from({ length: SIDE }, (_, i) => i).sort((a, b) => colScore(b) - colScore(a));

    function pickSpread(idxs, k) {
      const chosen = [];
      for (const i of idxs) { if (chosen.length >= k) break; if (chosen.some((x) => Math.abs(x - i) <= 1)) continue; chosen.push(i); }
      for (const i of idxs) { if (chosen.length >= k) break; if (!chosen.includes(i)) chosen.push(i); }
      return chosen.slice(0, k);
    }

    hintedRows = pickSpread(rowIdx, Math.min(cfg.hintRows || 0, SIDE));
    hintedCols = pickSpread(colIdx, Math.min(cfg.hintCols || 0, SIDE));
    renderRowColHintsOverlay();
  }

  // ========= Mode/Config helpers =========
  function loadCustomFromLS() {
    try { const raw = localStorage.getItem(LS_KEY); if (!raw) return; const cfg = JSON.parse(raw); PRESETS.custom = Object.assign({}, PRESETS.custom, cfg); } catch {}
  }
  function saveCustomToLS() { localStorage.setItem(LS_KEY, JSON.stringify(PRESETS.custom)); }
  function getActiveConfig() { return Object.assign({}, PRESETS[mode]); }
  function applyConfigInputsEnabled() {
    const enable = mode === "custom";
    [cfgLives, cfgBombRatio, cfgStartClues, cfgStartGivens, cfgMaxAdj, cfgSpreadRows, cfgSpreadBlocks].forEach((el) => (el.disabled = !enable));
    if (enable) { configPanel.open = true; }
  }
  function syncInputsFromConfig(cfg) {
    cfgLives.value = cfg.lives; valLives.textContent = cfg.lives;
    cfgBombRatio.value = cfg.bombRatio; valBombRatio.textContent = Number(cfg.bombRatio).toFixed(2);
    cfgStartClues.value = cfg.targetStartClues; valStartClues.textContent = cfg.targetStartClues;
    cfgStartGivens.value = cfg.targetStartGivens; valStartGivens.textContent = cfg.targetStartGivens;
    cfgMaxAdj.value = cfg.maxAdjStart; valMaxAdj.textContent = cfg.maxAdjStart;
    cfgSpreadRows.checked = !!cfg.spreadRows; cfgSpreadBlocks.checked = !!cfg.spreadBlocks;
  }
  function syncConfigFromInputs() {
    PRESETS.custom = {
      lives: parseInt(cfgLives.value, 10),
      bombRatio: +cfgBombRatio.value,
      targetStartClues: parseInt(cfgStartClues.value, 10),
      targetStartGivens: parseInt(cfgStartGivens.value, 10),
      maxAdjStart: parseInt(cfgMaxAdj.value, 10),
      spreadRows: !!cfgSpreadRows.checked,
      spreadBlocks: !!cfgSpreadBlocks.checked,
    };
    saveCustomToLS(); renderActiveConfigKV();
  }
  function renderActiveConfigKV() {
    const cfg = getActiveConfig();
    activeConfigEl.textContent = `mode: ${mode}
lives: ${cfg.lives}
bombRatio: ${cfg.bombRatio}
targetStartClues: ${cfg.targetStartClues}
targetStartGivens: ${cfg.targetStartGivens}
maxAdjForStart: ${cfg.maxAdjStart}
spreadByRows: ${cfg.spreadRows}
spreadByBlocks: ${cfg.spreadBlocks}`;
  }
  function updateConfigInputsUI() { const cfg = getActiveConfig(); syncInputsFromConfig(cfg); applyConfigInputsEnabled(); renderActiveConfigKV(); }

  modeEl.addEventListener("change", () => { mode = modeEl.value; updateConfigInputsUI(); });
  [[cfgLives, valLives, (v) => v],[cfgBombRatio, valBombRatio, (v) => (+v).toFixed(2)],[cfgStartClues, valStartClues, (v) => v],[cfgStartGivens, valStartGivens, (v) => v],[cfgMaxAdj, valMaxAdj, (v) => v]].forEach(([input, label, fmt]) => {
    input.addEventListener("input", () => { label.textContent = fmt(input.value); if (mode === "custom") { syncConfigFromInputs(); } });
  });
  cfgSpreadRows.addEventListener("change", () => { if (mode === "custom") { syncConfigFromInputs(); } });
  cfgSpreadBlocks.addEventListener("change", () => { if (mode === "custom") { syncConfigFromInputs(); } });

  saveCustomBtn.addEventListener("click", () => { syncConfigFromInputs(); setStatus("Custom config saved. New Run to apply.", "win"); });
  resetCustomBtn.addEventListener("click", () => {
    PRESETS.custom = { ...PRESETS.story };
    syncInputsFromConfig(PRESETS.custom); saveCustomToLS(); renderActiveConfigKV();
    setStatus("Custom config reset to defaults.", "hint");
  });

  newRunBtn.addEventListener("click", newRun);

  // ========= Board generation =========
  function newRun() {
    gameOver = false; didWin = false; reviewMode = false; showAllBombs = false;
    selected = null; pickedDigit = null; flagsCount = 0; flagMode = false; flagBtn.classList.remove("flagModeOn");
    const cfg = getActiveConfig(); lives = cfg.lives;

    const MAX_TRIES = 25;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      solution = generateSudokuSolved();
      const bp = placeBombs(cfg.bombRatio); bombs = bp.b; bombsTotal = bp.count; adj = computeAdj(bombs);
      ensureBombHasTwoSupports(2);
      const res = chooseGivensPatterned(cfg); given = res.g;
      selectRowColHints(cfg);

      revealed = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
      flagged  = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
      flagNote = Array.from({ length: SIDE }, () => Array(SIDE).fill(null));
      for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) if (given[r][c]) revealed[r][c] = true;

      if (passesSimpleLogicTest(given)) break;
      if (attempt === MAX_TRIES) console.warn("Using last attempt; couldn't guarantee progress this time.");
    }

    renderLives(); renderBoard(); updateStats(); renderActiveConfigKV();
    reviewBtn.style.display = "none";
    reviewBtn.textContent = "👁 Review Board";
    setStatus("Balanced start seeded across the board. Clue tiles always have nearby context—chain logic from the easy (low-adjacent) clusters.", "hint");
    buildNumpad();
  }

  // ========= Init =========
  loadCustomFromLS(); updateConfigInputsUI(); newRun();
})();