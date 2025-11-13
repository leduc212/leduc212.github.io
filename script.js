(() => {
  // ========= Game & UI constants =========
  const SIDE = 9, BASE = 3;

  const PRESETS = {
    story: { lives: 5, bombRatio: 0.16, targetStartClues: 19, targetStartGivens: 40, maxAdjStart: 2, spreadRows: true, spreadBlocks: true, hintRows: 4, hintCols: 4 },
    normal: { lives: 4, bombRatio: 0.18, targetStartClues: 15, targetStartGivens: 32, maxAdjStart: 3, spreadRows: true, spreadBlocks: true, hintRows: 3, hintCols: 3 },
    hard: { lives: 3, bombRatio: 0.22, targetStartClues: 9, targetStartGivens: 20, maxAdjStart: 4, spreadRows: true, spreadBlocks: true, hintRows: 2, hintCols: 2 },
    custom: { lives: 3, bombRatio: 0.14, targetStartClues: 17, targetStartGivens: 36, maxAdjStart: 2, spreadRows: true, spreadBlocks: true, hintRows: 3, hintCols: 3 },
  };

  const LS_KEY = "runic-custom-config-v1";

  // ========= State =========
  let mode = "story";
  let solution = [], bombs = [], adj = [], revealed = [], flagged = [], flagNote = [], given = [];
  let markNote = []; // NEW: stores yellow "mark" digits per tile
  let lives = 3, bombsTotal = 0, flagsCount = 0;
  let selected = null, pickedDigit = null, gameOver = false, flagMode = false, markMode = false;
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
  const markBtn = document.getElementById("markBtn");
  const removeFlagBtn = document.getElementById("removeFlagBtn");
  const removeMarkBtn = document.getElementById("removeMarkBtn");
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

  // ========= Review toggle (bugfix: always exits/enters) =========
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
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ========= Sudoku generator =========
  function generateSudokuSolved() {
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

  // Encourage each bomb to have at least two neighboring clue supports
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

  // ========= Picking initial givens (clues + some normals) — stratified blue-noise with quotas =========
  function chooseGivensPatterned(cfg) {
    const totalTarget = Math.min(cfg.targetStartGivens || 27, SIDE * SIDE - 1);
    const clueTarget = Math.min(cfg.targetStartClues || 15, totalTarget);

    // Build candidate pools
    const clueCells = [];
    const safeCells = [];
    for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) {
      if (bombs[r][c]) continue;
      const isClue = solution[r][c] === adj[r][c];
      (isClue ? clueCells : safeCells).push({ r, c, isClue });
    }

    // Pre-shuffle to avoid deterministic tie bias (e.g., row 0 winning ties)
    shuffle(clueCells);
    shuffle(safeCells);

    const blockId = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);

    // Hard caps (start strict, relax if needed)
    const rowCapBase = Math.floor(totalTarget / SIDE);           // even share
    const colCapBase = rowCapBase;
    const blockCapBase = Math.ceil(totalTarget / 9);               // per 3x3 block

    let rowCap = rowCapBase + 1; // allow slight slack from start
    let colCap = colCapBase + 1;
    let blockCap = Math.max(2, blockCapBase); // avoid too strict blocks

    const perRow = Array(SIDE).fill(0);
    const perCol = Array(SIDE).fill(0);
    const perBlk = Array(9).fill(0);

    // Distance helper
    const dist = (a, b) => {
      const dr = a.r - b.r, dc = a.c - b.c;
      return Math.hypot(dr, dc);
    };

    const picked = [];

    // ---- Quadrant seeding: prefer clues in each quadrant, else safe ----
    const quads = [
      { r0: 0, c0: 0 }, { r0: 0, c0: 3 }, { r0: 0, c0: 6 },
      { r0: 3, c0: 0 }, { r0: 3, c0: 3 }, { r0: 3, c0: 6 },
      { r0: 6, c0: 0 }, { r0: 6, c0: 3 }, { r0: 6, c0: 6 }
    ];
    // We’ll take up to 4 diverse seeds (one per far-apart blocks)
    const seedBlocks = shuffle([0, 2, 6, 8]); // corners by block index
    for (const b of seedBlocks) {
      const r0 = Math.floor(b / 3) * 3, c0 = (b % 3) * 3;
      const inBlock = (arr) => arr.filter(p => Math.floor(p.r / 3) === Math.floor(r0 / 3) && Math.floor(p.c / 3) === Math.floor(c0 / 3));
      let cand = inBlock(clueCells);
      if (cand.length === 0) cand = inBlock(safeCells);
      if (cand.length) {
        const p = cand[0];
        picked.push(p);
        perRow[p.r]++; perCol[p.c]++; perBlk[blockId(p.r, p.c)]++;
        // remove from candidate pools
        const rm = (arr, q) => { const i = arr.findIndex(x => x.r === q.r && x.c === q.c); if (i >= 0) arr.splice(i, 1); };
        rm(clueCells, p); rm(safeCells, p);
        if (picked.length >= Math.min(4, totalTarget)) break;
      }
    }

    // ---- Scored selection with quotas & blue-noise spread ----
    function takeFromPool(pool, need, allowRelax = true) {
      let taken = 0;
      const W_DIST = 10;               // distance importance
      const W_ISCLUE = 2.0;            // prefer clues slightly (pool will be clue first)
      const W_LOWADJ = 0.8;            // gentle nudge for “easy” clues
      const ROW_BIAS = 0.6;            // penalize overused row/col
      const COL_BIAS = 0.6;
      const BLK_BIAS = 0.8;

      while (taken < need && pool.length) {
        let bestIdx = -1, bestScore = -1;

        for (let i = 0; i < pool.length; i++) {
          const cand = pool[i];
          const r = cand.r, c = cand.c, b = blockId(r, c);

          // hard caps
          if (perRow[r] >= rowCap) continue;
          if (perCol[c] >= colCap) continue;
          if (perBlk[b] >= blockCap) continue;

          const dmin = picked.length ? Math.min(...picked.map(p => dist(p, cand))) : 99;
          const lowAdj = !bombs[r][c] && (solution[r][c] === adj[r][c]) && adj[r][c] <= 2;
          const eps = Math.random() * 0.05; // break ties randomly

          const score =
            W_DIST * dmin +
            (cand.isClue ? W_ISCLUE : 0) +
            (lowAdj ? W_LOWADJ : 0) -
            ROW_BIAS * perRow[r] -
            COL_BIAS * perCol[c] -
            BLK_BIAS * perBlk[b] +
            eps;

          if (score > bestScore) { bestScore = score; bestIdx = i; }
        }

        if (bestIdx === -1) {
          // Couldn’t place due to caps; relax gradually and retry
          if (!allowRelax) break;
          rowCap++; colCap++;
          if (blockCap < 6) blockCap++; // limited relaxation for blocks
          continue;
        }

        const pick = pool.splice(bestIdx, 1)[0];
        picked.push(pick);
        perRow[pick.r]++; perCol[pick.c]++; perBlk[blockId(pick.r, pick.c)]++;
        taken++;
      }
      return taken;
    }

    // 1) Take spread-out clues up to clueTarget (but not exceeding totalTarget)
    const needClues = Math.min(clueTarget, totalTarget) - picked.length;
    if (needClues > 0) takeFromPool(clueCells, needClues);

    // 2) Fill remaining with safe cells, spread too
    const remaining = Math.max(0, totalTarget - picked.length);
    if (remaining > 0) takeFromPool(safeCells, remaining);

    // Build givens matrix
    const g = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
    for (const p of picked) g[p.r][p.c] = true;
    const clues = picked.filter(p => p.isClue).length;

    return { g, clues };
  }


  function passesSimpleLogicTest(g) {
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

    // District borders (thick lines every 3 cells)
    if ((c + 1) % 3 === 0 && c !== SIDE - 1) div.classList.add("bRight");
    if ((r + 1) % 3 === 0 && r !== SIDE - 1) div.classList.add("bBottom");

    const isRev = revealed[r][c], isFlag = flagged[r][c], type = tileType(r, c);

    // post-loss bombs always visible (even outside review)
    if (gameOver && !didWin && showAllBombs && bombs[r][c] && !isRev) {
      const m = document.createElement("div"); m.className = "bombmark"; m.textContent = "💣"; div.appendChild(m);
    }

    // review mode: show everything + correctness
    if (reviewMode && gameOver) {
      if (!isRev) {
        if (bombs[r][c]) {
          const m = document.createElement("div"); m.className = "bombmark"; m.textContent = "💣"; div.appendChild(m);
        } else {
          const isClue = solution[r][c] === adj[r][c];
          div.classList.add(isClue ? "postHiddenClue" : "postHiddenSafe");
          div.textContent = solution[r][c];
        }
      }
      if (isFlag) {
        if (bombs[r][c]) div.classList.add("flagRight");
        else div.classList.add("flagWrong");
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

      // Flag (takes precedence over mark visual)
      if (isFlag) {
        div.classList.add("flag");
        const note = flagNote[r]?.[c];
        if (note) { const big = document.createElement("div"); big.className = "flagDigit"; big.textContent = note; div.appendChild(big); }
      } else {
        // Mark (yellow)
        const m = markNote[r]?.[c];
        if (m != null) {
          div.classList.add("mark");
          const md = document.createElement("div");
          md.className = "markDigit";
          md.textContent = m;
          div.appendChild(md);
        }
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
    updateRemoveButtons();
    requestAnimationFrame(renderRowColHintsOverlay);
  }

  function renderCell(r, c) {
    const idx = r * SIDE + c, div = boardEl.children[idx];
    if (!div) return;
    paintCell(div, r, c);
    updateRemoveButtons();
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
    updateHintText();
    updateRemoveButtons();
  }
  function clearSelected() { selected = null; highlightSelected(); updateRemoveButtons(); }
  function highlightSelected() {
    for (const ch of boardEl.children) ch.classList.remove("sel");
    if (!selected) return;
    const idx = selected.r * SIDE + selected.c; const div = boardEl.children[idx];
    if (div) div.classList.add("sel");
  }
  function updateRemoveButtons() {
    if (!selected) {
      removeFlagBtn.disabled = true; removeMarkBtn.disabled = true; return;
    }
    const { r, c } = selected;
    removeFlagBtn.disabled = !flagged[r][c];
    removeMarkBtn.disabled = !(markNote[r] && markNote[r][c] != null);
  }

  function updateHintText() {
    if (flagMode) asideHint.textContent = "Flag mode: pick a number → Confirm to place a flag digit (no life loss).";
    else if (markMode) asideHint.textContent = "Mark mode: pick a number → Confirm to pencil the digit in yellow (no effect on lives).";
    else asideHint.textContent = "Reveal mode: pick a number → Confirm to reveal (wrong digit costs a life; bomb loses instantly).";
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

  // Mode toggles
  flagBtn.addEventListener("click", () => {
    flagMode = !flagMode; if (flagMode) markMode = false;
    flagBtn.classList.toggle("flagModeOn", flagMode);
    markBtn.classList.remove("markModeOn");
    setStatus(flagMode ? "Flag mode ON." : "Flag mode OFF.", "hint");
    updateHintText();
  });

  markBtn.addEventListener("click", () => {
    markMode = !markMode; if (markMode) flagMode = false;
    markBtn.classList.toggle("markModeOn", markMode);
    flagBtn.classList.remove("flagModeOn");
    setStatus(markMode ? "Mark mode ON." : "Mark mode OFF.", "hint");
    updateHintText();
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

  removeMarkBtn.addEventListener("click", () => {
    if (gameOver || !selected) return;
    const { r, c } = selected;
    if (!(markNote[r] && markNote[r][c] != null)) return;
    markNote[r][c] = null;
    renderCell(r, c);
    setStatus("Mark removed.", "hint");
  });

  // Confirm button: acts based on current mode
  confirmBtn.addEventListener("click", () => {
    if (gameOver) return;
    if (!selected) { setStatus("Select a covered tile first.", "lose"); return; }
    const { r, c } = selected;

    if (revealed[r][c]) { setStatus("Tile already revealed.", "lose"); bumpCell(r, c); return; }

    // MARK MODE
    if (markMode) {
      if (!pickedDigit) { setStatus("Pick a number 1–9, then Confirm to mark.", "lose"); bumpCell(r, c); return; }
      if (!markNote[r]) markNote[r] = [];
      markNote[r][c] = pickedDigit;
      renderCell(r, c);
      setStatus("Digit marked in yellow (no life effect).", "hint");
      return;
    }

    // FLAG MODE
    if (flagMode) {
      if (!flagged[r][c]) { flagged[r][c] = true; flagsCount++; }
      if (!flagNote[r]) flagNote[r] = [];
      flagNote[r][c] = pickedDigit ?? null; // allow blank flag
      // clear any mark if present
      if (markNote[r]) markNote[r][c] = null;
      renderCell(r, c); updateStats();
      setStatus(flagNote[r][c] == null ? "Blank flag placed." : "Flag placed.", "hint");
      if (isWin()) endGame(true, "All bombs flagged & safe tiles revealed!");
      return;
    }

    // REVEAL MODE
    if (!pickedDigit) { setStatus("Pick a number 1–9, then Confirm.", "lose"); bumpCell(r, c); return; }

    if (bombs[r][c]) { endGame(false, "You revealed a bomb."); return; }
    if (pickedDigit !== solution[r][c]) { loseLife(); if (!gameOver) setStatus(`Wrong digit. Life -1.`, "lose"); return; }

    revealed[r][c] = true;
    // clear any mark on reveal
    if (markNote[r]) markNote[r][c] = null;
    renderCell(r, c);
    if (isWin()) endGame(true, "All bombs flagged & safe tiles revealed!");
    else setStatus("Nice! Keep chaining logic from the anchors.");
  });

  function onMouseDownCell(e) {
    const t = e.currentTarget;
    const r = +t.dataset.r, c = +t.dataset.c;
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    if (e.button === 2) { e.preventDefault(); setStatus("Use Flag/Mark modes with the buttons above.", "hint"); bumpCell(r, c); return; }
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

  // ========= Row/Col hints (gutters) — prioritize lines with bombs lacking adjacent clues =========
  function selectRowColHints(cfg) {
    // Precompute totals
    rowTotals = Array.from({ length: SIDE }, (_, r) => bombs[r].reduce((s, x) => s + (x ? 1 : 0), 0));
    colTotals = Array.from({ length: SIDE }, (_, c) => { let s = 0; for (let r = 0; r < SIDE; r++) if (bombs[r][c]) s++; return s; });

    // Identify "hard bombs": bombs with NO adjacent clue cells
    const isClue = (r, c) => !bombs[r][c] && (solution[r][c] === adj[r][c]);
    const hasAdjacentClue = (r, c) => neighbors8(r, c).some(([rr, cc]) => isClue(rr, cc));

    const hardBombRowCount = Array(SIDE).fill(0);
    const hardBombColCount = Array(SIDE).fill(0);

    for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) {
      if (!bombs[r][c]) continue;
      if (!hasAdjacentClue(r, c)) {
        hardBombRowCount[r]++; hardBombColCount[c]++;
      }
    }

    // Also reward lines that have many low-adjacent clues (good anchors)
    const lowAdjClueRow = Array(SIDE).fill(0);
    const lowAdjClueCol = Array(SIDE).fill(0);
    for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) {
      if (isClue(r, c) && adj[r][c] <= 2) { lowAdjClueRow[r]++; lowAdjClueCol[c]++; }
    }

    const infoWeight = 10;          // base reward for non-trivial totals
    const hardWeight = 6;           // prioritize lines with “hard bombs”
    const lowAdjWeight = 1.5;       // helpful but secondary
    const trivialPenalty = -6;      // penalize lines with 0 or 9 bombs

    const rowScore = (r) => {
      const trivial = (rowTotals[r] === 0 || rowTotals[r] === SIDE) ? trivialPenalty : infoWeight;
      return trivial + hardWeight * hardBombRowCount[r] + lowAdjWeight * lowAdjClueRow[r];
    };
    const colScore = (c) => {
      const trivial = (colTotals[c] === 0 || colTotals[c] === SIDE) ? trivialPenalty : infoWeight;
      return trivial + hardWeight * hardBombColCount[c] + lowAdjWeight * lowAdjClueCol[c];
    };

    const rowIdx = Array.from({ length: SIDE }, (_, i) => i).sort((a, b) => rowScore(b) - rowScore(a));
    const colIdx = Array.from({ length: SIDE }, (_, i) => i).sort((a, b) => colScore(b) - colScore(a));

    // Keep some spread so we don’t pick adjacent lines only
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
    try { const raw = localStorage.getItem(LS_KEY); if (!raw) return; const cfg = JSON.parse(raw); PRESETS.custom = Object.assign({}, PRESETS.custom, cfg); } catch { }
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
  [[cfgLives, valLives, (v) => v], [cfgBombRatio, valBombRatio, (v) => (+v).toFixed(2)], [cfgStartClues, valStartClues, (v) => v], [cfgStartGivens, valStartGivens, (v) => v], [cfgMaxAdj, valMaxAdj, (v) => v]].forEach(([input, label, fmt]) => {
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
    selected = null; pickedDigit = null; flagsCount = 0; flagMode = false; markMode = false;
    flagBtn.classList.remove("flagModeOn");
    markBtn.classList.remove("markModeOn");
    const cfg = getActiveConfig(); lives = cfg.lives;

    const MAX_TRIES = 25;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      solution = generateSudokuSolved();
      const bp = placeBombs(cfg.bombRatio); bombs = bp.b; bombsTotal = bp.count; adj = computeAdj(bombs);
      ensureBombHasTwoSupports(2);
      const res = chooseGivensPatterned(cfg); given = res.g;
      selectRowColHints(cfg);

      revealed = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
      flagged = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
      flagNote = Array.from({ length: SIDE }, () => Array(SIDE).fill(null));
      markNote = Array.from({ length: SIDE }, () => Array(SIDE).fill(null));
      for (let r = 0; r < SIDE; r++) for (let c = 0; c < SIDE; c++) if (given[r][c]) revealed[r][c] = true;

      if (passesSimpleLogicTest(given)) break;
      if (attempt === MAX_TRIES) console.warn("Using last attempt; couldn't guarantee progress this time.");
    }

    renderLives(); renderBoard(); updateStats(); renderActiveConfigKV();
    reviewBtn.style.display = "none";
    reviewBtn.textContent = "👁 Review Board";
    setStatus("Balanced start. Use yellow ✎ Marks to pencil digits you're not ready to reveal.", "hint");
    buildNumpad();
  }

  // ========= Init =========
  loadCustomFromLS(); updateConfigInputsUI(); newRun();
})();
