(() => {
  // ========= Game & UI constants =========
  const SIDE = 9,
    BASE = 3;

  // ========= Seeded RNG =========
  let currentSeed = null;
  let rngState = 1;

  function seedFromString(str) {
    // simple string -> 32-bit hash
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h >>>= 0;
    return h || 1;
  }

  function setSeed(seedValue) {
    currentSeed = String(seedValue);
    rngState = seedFromString(currentSeed);
  }

  function rand() {
    // xorshift32
    let x = rngState;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    rngState = x >>> 0;
    return rngState / 4294967296;
  }

  // Per-mode logic controls
  const PRESETS = {
    story: {
      lives: 0,
      bombRatio: 0.16,
      minStartClues: 14,
      targetStartGivens: 40,
      maxAdjStart: 2,
      spreadRows: true,
      spreadBlocks: true,
      hintRows: 5,
      hintCols: 5,
      logicEnforcement: "hybrid",
      maxResidualUnknownCells: 0,
      clusterize: true,
      minClusters: 6,
      clusterSizeMin: 3,
      clusterSizeMax: 5,
      supportPasses: 2,
      bootstrapSteps: 2,
      clueGivenRatio: 2 / 3,
    },
    normal: {
      lives: 0,
      bombRatio: 0.18,
      minStartClues: 12,
      targetStartGivens: 36,
      maxAdjStart: 3,
      spreadRows: true,
      spreadBlocks: true,
      hintRows: 4,
      hintCols: 4,
      logicEnforcement: "sudoku_only",
      maxResidualUnknownCells: 2,
      clusterize: true,
      minClusters: 5,
      clusterSizeMin: 3,
      clusterSizeMax: 5,
      supportPasses: 2,
      bootstrapSteps: 1,
      clueGivenRatio: 0.5,
    },
    hard: {
      lives: 0,
      bombRatio: 0.22,
      minStartClues: 10,
      targetStartGivens: 32,
      maxAdjStart: 4,
      spreadRows: true,
      spreadBlocks: true,
      hintRows: 3,
      hintCols: 3,
      logicEnforcement: "sudoku_only",
      maxResidualUnknownCells: 4,
      clusterize: true,
      minClusters: 4,
      clusterSizeMin: 2,
      clusterSizeMax: 4,
      supportPasses: 2,
      bootstrapSteps: 1,
      clueGivenRatio: 0.5,
    },
    custom: {
      lives: 0,
      bombRatio: 0.14,
      minStartClues: 9,
      targetStartGivens: 36,
      maxAdjStart: 2,
      spreadRows: true,
      spreadBlocks: true,
      hintRows: 3,
      hintCols: 3,
      logicEnforcement: "sudoku_only",
      maxResidualUnknownCells: 2,
      clusterize: true,
      minClusters: 5,
      clusterSizeMin: 3,
      clusterSizeMax: 5,
      supportPasses: 2,
      bootstrapSteps: 1,
      clueGivenRatio: 2 / 3,
    },
  };
  const LS_KEY = "runic-custom-config-v2";

  // ========= State =========
  let mode = "story";
  let solution = [],
    bombs = [],
    adj = [];
  // entry = player's committed digits; revealed = tile has any committed digit (or given)
  let entry = [],
    revealed = [],
    flagged = [],
    flagNote = [],
    given = [],
    noteText = [];
  let bombsTotal = 0,
    flagsCount = 0;
  let selected = null,
    pickedDigit = null,
    gameOver = false,
    flagMode = false,
    noteMode = false;
  let reviewMode = false,
    didWin = false,
    showAllBombs = false;
  let hintedRows = [],
    hintedCols = [];
  let rowTotals = [],
    colTotals = [];

  // Note composition buffer (per selection)
  let noteBuffer = "";

  // Per-tile live preview (not committed)
  // { kind: 'number'|'note'|'flag'|null, value: string|number|null, r:number, c:number }
  let preview = { kind: null, value: null, r: -1, c: -1 };

  // ========= DOM =========
  const boardEl = document.getElementById("board");
  const livesEl = document.getElementById("lives"); // unused visually
  const bombsLeftEl = document.getElementById("bombsLeft");
  const flagsCntEl = document.getElementById("flagsCnt");
  const statusEl = document.getElementById("status");
  const modeEl = document.getElementById("mode");
  const newRunBtn = document.getElementById("newRun");
  const numpadEl = document.getElementById("numpad");
  const confirmBtn = document.getElementById("confirm");
  const flagBtn = document.getElementById("flagBtn");
  const markBtn = document.getElementById("markBtn"); // Note mode toggle
  const removeFlagBtn = document.getElementById("removeFlagBtn");
  const removeMarkBtn = document.getElementById("removeMarkBtn");
  const asideHint = document.getElementById("asideHint");
  const activeConfigEl = document.getElementById("activeConfig");
  const saveCustomBtn = document.getElementById("saveCustom");
  const resetCustomBtn = document.getElementById("resetCustom");
  const configPanel = document.getElementById("configPanel");
  const reviewBtn = document.getElementById("reviewBtn");
  const seedDisplay = document.getElementById("seedDisplay");
  const seedInput = document.getElementById("seedInput");
  const themeToggleBtn = document.getElementById("themeToggle");
  const THEME_KEY = "runic-theme";

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
  const rowHL = document.createElement("div");
  rowHL.id = "rowHL";
  rowHL.className = "hlStripe";
  const colHL = document.createElement("div");
  colHL.id = "colHL";
  colHL.className = "hlStripe";
  boardWrapEl.appendChild(rowHL);
  boardWrapEl.appendChild(colHL);

  function applyTheme(theme) {
    const root = document.documentElement;
    const normalized = theme === "light" ? "light" : "dark";

    root.setAttribute("data-theme", normalized);

    if (themeToggleBtn) {
      // Icon: show sun when currently dark, moon when currently light
      themeToggleBtn.textContent = normalized === "light" ? "🌙" : "☀️";
    }
  }

  // ========= Review toggle =========
  reviewBtn.addEventListener("click", () => {
    if (!gameOver) return;
    reviewMode = !reviewMode;
    reviewBtn.textContent = reviewMode ? "◼ Exit Review" : "👁 Review Board";
    renderBoard();
  });

  // ========= Global UI listeners =========
  window.addEventListener("contextmenu", (e) => e.preventDefault(), {
    passive: false,
  });
  window.addEventListener("resize", () => {
    renderRowColHintsOverlay();
    hideHL();
  });
  new ResizeObserver(() => {
    renderRowColHintsOverlay();
    hideHL();
  }).observe(boardWrapEl);

  // ========= Utils =========
  const inBounds = (r, c) => r >= 0 && r < SIDE && c >= 0 && c < SIDE;
  const neighbors8 = (r, c) => {
    const res = [];
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const rr = r + dr,
          cc = c + dc;
        if (inBounds(rr, cc)) res.push([rr, cc]);
      }
    return res;
  };
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // ========= Sudoku generator =========
  function generateSudokuSolved() {
    const pattern = (r, c) =>
      (BASE * (r % BASE) + Math.floor(r / BASE) + c) % SIDE;
    const rBase = [0, 1, 2];
    const rows = [].concat(
      ...shuffle([0, 1, 2]).map((g) =>
        shuffle([...rBase]).map((r) => g * BASE + r)
      )
    );
    const cols = [].concat(
      ...shuffle([0, 1, 2]).map((g) =>
        shuffle([...rBase]).map((c) => g * BASE + c)
      )
    );
    const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const g = Array.from({ length: SIDE }, () => Array(SIDE).fill(0));
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++) g[rows[r]][cols[c]] = nums[pattern(r, c)];
    return g;
  }

  // ========= Bombs & adjacency =========
  function placeBombs(ratio) {
    const total = SIDE * SIDE,
      target = Math.max(1, Math.floor(total * ratio));
    const b = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
    const pool = [];
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++) pool.push([r, c]);
    shuffle(pool);
    for (let i = 0; i < target; i++) {
      const [r, c] = pool[i];
      b[r][c] = true;
    }
    return { b, count: target };
  }
  function computeAdj(b) {
    const A = Array.from({ length: SIDE }, () => Array(SIDE).fill(0));
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++)
        A[r][c] = neighbors8(r, c).reduce(
          (acc, [rr, cc]) => acc + (b[rr][cc] ? 1 : 0),
          0
        );
    return A;
  }
  function tileType(r, c) {
    return bombs[r][c]
      ? "bomb"
      : solution[r][c] === adj[r][c]
      ? "clue"
      : "normal";
  }

  function ensureBombHasTwoSupports(maxPasses = 1) {
    const countClueNeighbors = (r, c, A = adj) =>
      neighbors8(r, c).reduce(
        (n, [rr, cc]) =>
          n + (!bombs[rr][cc] && solution[rr][cc] === A[rr][cc] ? 1 : 0),
        0
      );
    for (let pass = 0; pass < maxPasses; pass++) {
      let moved = false;
      for (let r = 0; r < SIDE; r++)
        for (let c = 0; c < SIDE; c++) {
          if (!bombs[r][c]) continue;
          const supports = countClueNeighbors(r, c, adj);
          if (supports >= 2) continue;
          let best = null,
            bestScore = -1;
          for (let dr = -2; dr <= 2; dr++)
            for (let dc = -2; dc <= 2; dc++) {
              const rr = r + dr,
                cc = c + dc;
              if (!inBounds(rr, cc) || bombs[rr][cc]) continue;
              bombs[r][c] = false;
              bombs[rr][cc] = true;
              const A = computeAdj(bombs);
              const sup = countClueNeighbors(rr, cc, A);
              let score = sup >= 2 ? 1000 : 0;
              if (score) {
                for (let i = 0; i < SIDE; i++)
                  for (let j = 0; j < SIDE; j++)
                    if (!bombs[i][j] && solution[i][j] === A[i][j]) score++;
              }
              bombs[r][c] = true;
              bombs[rr][cc] = false;
              if (score > bestScore) {
                bestScore = score;
                best = [rr, cc];
              }
            }
          if (best) {
            const [nr, nc] = best;
            bombs[r][c] = false;
            bombs[nr][nc] = true;
            adj = computeAdj(bombs);
            moved = true;
          }
        }
      if (!moved) break;
    }
  }

  function countAllClues() {
    let n = 0;
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++)
        if (!bombs[r][c] && solution[r][c] === adj[r][c]) n++;
    return n;
  }

  // ========= Starting givens (spread + clusters) =========
  function chooseGivensPatterned(cfg) {
    const totalTarget = Math.min(cfg.targetStartGivens || 27, SIDE * SIDE - 1);
    const minClues = Math.max(0, Math.min(cfg.minStartClues || 0, totalTarget));

    const clueCellsAll = [],
      safeCells = [];
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++) {
        if (bombs[r][c]) continue;
        const isClue = solution[r][c] === adj[r][c];
        (isClue ? clueCellsAll : safeCells).push({
          r,
          c,
          isClue,
          adj: adj[r][c],
        });
      }

    // --- ORIGINAL CLUE SELECTION ---
    const preferredClues = clueCellsAll.filter(
      (p) => p.adj <= (cfg.maxAdjStart ?? 2)
    );
    const relaxedClues = clueCellsAll
      .filter((p) => p.adj > (cfg.maxAdjStart ?? 2))
      .sort((a, b) => a.adj - b.adj);

    // --- NEW: apply clueGivenRatio ---
    const totalClues = clueCellsAll.length;
    const maxClueGivens = Math.max(
      minClues,
      Math.floor(totalClues * (cfg.clueGivenRatio ?? 1))
    );

    // Build cluePool with ratio
    const cluePool = [];
    for (const p of preferredClues) {
      if (cluePool.length >= maxClueGivens) break;
      cluePool.push(p);
    }
    for (const p of relaxedClues) {
      if (cluePool.length >= maxClueGivens) break;
      cluePool.push(p);
    }

    shuffle(cluePool);
    shuffle(safeCells);

    const blockId = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
    const dist = (a, b) => Math.hypot(a.r - b.r, a.c - b.c);

    const rowCapBase = Math.floor(totalTarget / SIDE);
    const colCapBase = rowCapBase;
    const blockCapBase = Math.ceil(totalTarget / 9);

    let rowCap = rowCapBase + 1,
      colCap = colCapBase + 1,
      blockCap = Math.max(2, blockCapBase);
    const perRow = Array(SIDE).fill(0),
      perCol = Array(SIDE).fill(0),
      perBlk = Array(9).fill(0);
    const picked = [];

    // seed across distant blocks
    for (const b of shuffle([0, 2, 6, 8])) {
      const inBlk = (arr) => arr.filter((p) => blockId(p.r, p.c) === b);
      let cand = inBlk(cluePool);
      if (!cand.length) cand = inBlk(safeCells);
      if (cand.length) {
        const p = cand[0];
        picked.push(p);
        perRow[p.r]++;
        perCol[p.c]++;
        perBlk[blockId(p.r, p.c)]++;
        const rm = (arr, q) => {
          const i = arr.findIndex((x) => x.r === q.r && x.c === q.c);
          if (i >= 0) arr.splice(i, 1);
        };
        rm(cluePool, p);
        rm(safeCells, p);
        if (picked.length >= Math.min(4, totalTarget)) break;
      }
    }

    function takeWithSpread(
      pool,
      need,
      preferClues = false,
      allowRelax = true
    ) {
      let taken = 0;
      const W_DIST = 10,
        W_ISCLUE = preferClues ? 2.0 : 0.0,
        W_LOWADJ = 0.8;
      const ROW_BIAS = 0.6,
        COL_BIAS = 0.6,
        BLK_BIAS = 0.8;
      while (taken < need && pool.length) {
        let bestIdx = -1,
          bestScore = -1;
        for (let i = 0; i < pool.length; i++) {
          const cand = pool[i],
            r = cand.r,
            c = cand.c,
            b = blockId(r, c);
          if (
            perRow[r] >= rowCap ||
            perCol[c] >= colCap ||
            perBlk[b] >= blockCap
          )
            continue;
          const dmin = picked.length
            ? Math.min(...picked.map((p) => dist(p, cand)))
            : 99;
          const lowAdj = cand.isClue && cand.adj <= 2;
          const score =
            10 * dmin +
            (cand.isClue ? (preferClues ? 2 : 0) : 0) +
            (lowAdj ? 0.8 : 0) -
            0.6 * perRow[r] -
            0.6 * perCol[c] -
            0.8 * perBlk[b] +
            rand() * 0.05;
          if (score > bestScore) {
            bestScore = score;
            bestIdx = i;
          }
        }
        if (bestIdx === -1) {
          if (!allowRelax) break;
          rowCap++;
          colCap++;
          if (blockCap < 6) blockCap++;
          continue;
        }
        const p = pool.splice(bestIdx, 1)[0];
        picked.push(p);
        perRow[p.r]++;
        perCol[p.c]++;
        perBlk[blockId(p.r, p.c)]++;
        taken++;
      }
      return taken;
    }

    const needClues = Math.max(
      0,
      minClues - picked.filter((p) => p.isClue).length
    );
    if (needClues > 0) takeWithSpread(cluePool, needClues, true);

    const remaining = Math.max(0, totalTarget - picked.length);
    if (remaining > 0) {
      const takeClues = Math.min(remaining, cluePool.length);
      if (takeClues > 0) takeWithSpread(cluePool, takeClues, true);
      const left2 = Math.max(0, totalTarget - picked.length);
      if (left2 > 0) takeWithSpread(safeCells, left2, false);
    }

    // ---------- NEW: clusterization – Minesweeper-friendly local patterns for all modes ----------
    if (cfg.clusterize) {
      const blockId2 = (r, c) => Math.floor(r / 3) * 3 + Math.floor(c / 3);
      const perRow2 = Array.from(perRow);
      const perCol2 = Array.from(perCol);
      const perBlk2 = Array.from(perBlk);

      const allClues = [];
      for (let r = 0; r < SIDE; r++)
        for (let c = 0; c < SIDE; c++) {
          if (!bombs[r][c]) {
            const isClue = solution[r][c] === adj[r][c];
            if (isClue) allClues.push({ r, c, adj: adj[r][c] });
          }
        }
      const isPicked = (r, c) => picked.some((p) => p.r === r && p.c === c);
      const freeClues = allClues.filter((p) => !isPicked(p.r, p.c));
      const lowAdj = freeClues.filter(
        (p) => p.adj >= 1 && p.adj <= (cfg.maxAdjStart ?? 2)
      );
      const pool = lowAdj.length ? lowAdj.slice() : freeClues.slice();
      shuffle(pool);

      const wantClusters = Math.min(
        cfg.minClusters ?? 0,
        Math.max(0, (cfg.targetStartGivens || 27) - picked.length)
      );

      function canAdd(p) {
        const b = blockId2(p.r, p.c);
        const rowCap2 = Math.ceil((cfg.targetStartGivens || 27) / SIDE) + 2;
        const colCap2 = rowCap2;
        const blkCap2 = Math.max(
          4,
          Math.ceil((cfg.targetStartGivens || 27) / 9) + 1
        );
        return (
          perRow2[p.r] < rowCap2 &&
          perCol2[p.c] < colCap2 &&
          perBlk2[b] < blkCap2
        );
      }

      const cheby1 = (r, c) => {
        const out = [];
        for (let rr = r - 1; rr <= r + 1; rr++)
          for (let cc = c - 1; cc <= c + 1; cc++)
            if (
              rr >= 0 &&
              rr < SIDE &&
              cc >= 0 &&
              cc < SIDE &&
              !(rr === r && cc === c)
            )
              out.push([rr, cc]);
        return out;
      };

      let made = 0;
      while (
        made < wantClusters &&
        pool.length &&
        picked.length < (cfg.targetStartGivens || 27)
      ) {
        // choose a seed that is near already-picked to encourage local groups
        let seedIdx = -1,
          bestScore = -1;
        for (let i = 0; i < Math.min(pool.length, 40); i++) {
          const cand = pool[i];
          const nearPicked = picked.some(
            (p) => Math.max(Math.abs(p.r - cand.r), Math.abs(p.c - cand.c)) <= 2
          );
          const score =
            (nearPicked ? 2 : 0) + (cand.adj <= 2 ? 1 : 0) + rand() * 0.1;
          if (score > bestScore && canAdd(cand)) {
            bestScore = score;
            seedIdx = i;
          }
        }
        if (seedIdx < 0) break;

        const seed = pool.splice(seedIdx, 1)[0];
        picked.push(seed);
        perRow2[seed.r]++;
        perCol2[seed.c]++;
        perBlk2[blockId2(seed.r, seed.c)]++;
        made++;

        // grow cluster around seed
        let tgtSize = Math.min(
          (cfg.clusterSizeMin || 3) +
            Math.floor(
              rand() *
                ((cfg.clusterSizeMax || 5) - (cfg.clusterSizeMin || 3) + 1)
            ),
          (cfg.targetStartGivens || 27) - picked.length
        );
        const nbrs = cheby1(seed.r, seed.c)
          .map(([r, c]) => ({
            r,
            c,
            adj: adj[r][c],
            isClue: solution[r][c] === adj[r][c],
          }))
          .filter((x) => x.isClue && !isPicked(x.r, x.c));
        nbrs.sort((a, b) => a.adj - b.adj); // prefer low-adj

        for (const q of nbrs) {
          if (picked.length >= (cfg.targetStartGivens || 27)) break;
          if (!canAdd(q)) continue;
          picked.push(q);
          perRow2[q.r]++;
          perCol2[q.c]++;
          perBlk2[blockId2(q.r, q.c)]++;
          if (--tgtSize <= 0) break;
        }
      }
    }

    // finalize the givens grid
    const g = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
    for (const p of picked) g[p.r][p.c] = true;

    // --- NEW: enforce clueGivenRatio on final givens ---
    // --- FINAL: enforce clueGivenRatio on final givens ---
    if (cfg.clueGivenRatio != null && cfg.clueGivenRatio < 1) {
      // total clue cells on the board, regardless of given/hidden
      const totalClues = clueCellsAll.length;

      // target number of *given* clue cells
      let maxClueGivens = Math.floor(totalClues * cfg.clueGivenRatio);
      maxClueGivens = Math.max(0, Math.min(maxClueGivens, totalClues));

      // collect all clue cells that are currently givens
      const givenClues = [];
      for (let r = 0; r < SIDE; r++) {
        for (let c = 0; c < SIDE; c++) {
          if (!bombs[r][c] && solution[r][c] === adj[r][c] && g[r][c]) {
            givenClues.push({ r, c });
          }
        }
      }

      // randomly turn off clue-givens until we hit the cap
      while (givenClues.length > maxClueGivens) {
        const idx = Math.floor(rand() * givenClues.length);
        const { r, c } = givenClues.splice(idx, 1)[0];
        g[r][c] = false; // still a clue cell internally, just not shown at start
      }
    }

    return { g };
  }

  // ========= Gutters =========
  function selectRowColHints(cfg) {
    rowTotals = Array.from({ length: SIDE }, (_, r) =>
      bombs[r].reduce((s, x) => s + (x ? 1 : 0), 0)
    );
    colTotals = Array.from({ length: SIDE }, (_, c) => {
      let s = 0;
      for (let r = 0; r < SIDE; r++) if (bombs[r][c]) s++;
      return s;
    });

    const isClueCell = (r, c) => !bombs[r][c] && solution[r][c] === adj[r][c];
    const hasAdjacentClue = (r, c) =>
      neighbors8(r, c).some(([rr, cc]) => isClueCell(rr, cc));

    const hardBombRowCount = Array(SIDE).fill(0);
    const hardBombColCount = Array(SIDE).fill(0);
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++)
        if (bombs[r][c] && !hasAdjacentClue(r, c)) {
          hardBombRowCount[r]++;
          hardBombColCount[c]++;
        }

    const lowAdjClueRow = Array(SIDE).fill(0);
    const lowAdjClueCol = Array(SIDE).fill(0);
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++)
        if (isClueCell(r, c) && adj[r][c] <= 2) {
          lowAdjClueRow[r]++;
          lowAdjClueCol[c]++;
        }

    const infoWeight = 10,
      hardWeight = 6,
      lowAdjWeight = 1.5,
      trivialPenalty = -6;
    const rowScore = (r) =>
      (rowTotals[r] === 0 || rowTotals[r] === SIDE
        ? trivialPenalty
        : infoWeight) +
      hardWeight * hardBombRowCount[r] +
      lowAdjWeight * lowAdjClueRow[r];
    const colScore = (c) =>
      (colTotals[c] === 0 || colTotals[c] === SIDE
        ? trivialPenalty
        : infoWeight) +
      hardWeight * hardBombColCount[c] +
      lowAdjWeight * lowAdjClueCol[c];

    const rowIdx = Array.from({ length: SIDE }, (_, i) => i).sort(
      (a, b) => rowScore(b) - rowScore(a)
    );
    const colIdx = Array.from({ length: SIDE }, (_, i) => i).sort(
      (a, b) => colScore(b) - colScore(a)
    );

    function pickSpread(idxs, k) {
      const chosen = [];
      for (const i of idxs) {
        if (chosen.length >= k) break;
        if (chosen.some((x) => Math.abs(x - i) <= 1)) continue;
        chosen.push(i);
      }
      for (const i of idxs) {
        if (chosen.length >= k) break;
        if (!chosen.includes(i)) chosen.push(i);
      }
      return chosen.slice(0, k);
    }

    hintedRows = pickSpread(rowIdx, Math.min(cfg.hintRows || 0, SIDE));
    hintedCols = pickSpread(colIdx, Math.min(cfg.hintCols || 0, SIDE));
    renderRowColHintsOverlay();
  }

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
    rowEl.innerHTML = "";
    colEl.innerHTML = "";
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

  // ========= Rendering helpers =========
  function renderLives() {
    livesEl.innerHTML = "";
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
    let ok = 0;
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++) if (bombs[r][c] && flagged[r][c]) ok++;
    return ok;
  }

  // NEW: win condition checks committed entries & flagged bomb digits
  function isWin() {
    // 1) Safe cells: must be revealed AND entry equals solution
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++) {
        if (!bombs[r][c]) {
          if (!revealed[r][c]) return false;
          if ((entry[r][c] | 0) !== solution[r][c]) return false;
        }
      }
    // 2) Bomb cells: must be flagged AND flagNote equals the Sudoku digit for that cell
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++) {
        if (bombs[r][c]) {
          if (!flagged[r][c]) return false;
          const want = solution[r][c];
          const got = flagNote[r]?.[c] ?? null;
          if (got !== want) return false;
        }
      }
    return true;
  }

  function endGame(win, msg) {
    gameOver = true;
    didWin = !!win;
    if (win) {
      showAllBombs = false;
      setStatus("You win! " + (msg || ""), "win");
      reviewBtn.style.display = "none";
    } else {
      showAllBombs = true;
      setStatus("You lose! " + (msg || ""), "lose");
      reviewBtn.style.display = "inline-block";
      reviewBtn.textContent = reviewMode ? "◼ Exit Review" : "👁 Review Board";
    }
    renderBoard();
  }

  // ========= PREVIEW helpers =========
  function clearPreview() {
    const had = preview && preview.kind && preview.r >= 0 && preview.c >= 0;
    const pr = had ? { r: preview.r, c: preview.c } : null;
    preview = { kind: null, value: null, r: -1, c: -1 };
    if (pr) renderCell(pr.r, pr.c);
  }
  function setPreviewForSelected() {
    if (!selected || gameOver) {
      clearPreview();
      return;
    }
    const { r, c } = selected;
    if (revealed[r][c] && given[r][c]) {
      clearPreview();
      return;
    } // givens locked

    if (noteMode && noteBuffer) {
      preview = { kind: "note", value: noteBuffer, r, c };
    } else if (flagMode) {
      preview = { kind: "flag", value: pickedDigit ?? null, r, c };
    } else if (!noteMode && !flagMode && pickedDigit != null) {
      preview = { kind: "number", value: pickedDigit, r, c };
    } else {
      clearPreview();
      return;
    }
    renderCell(r, c);
    highlightSelected();
  }

  // ========= Painting =========
  function paintCell(div, r, c) {
    div.innerHTML = "";
    div.className = "cell";
    div.dataset.r = r;
    div.dataset.c = c;
    if ((c + 1) % 3 === 0 && c !== SIDE - 1) div.classList.add("bRight");
    if ((r + 1) % 3 === 0 && r !== SIDE - 1) div.classList.add("bBottom");

    const isRev = revealed[r][c];
    const isFlag = flagged[r][c];
    const type = tileType(r, c);

    const isSelected = selected && selected.r === r && selected.c === c;
    const hasPreview = !gameOver && isSelected && preview.kind;

    // Show all bombs on loss
    if (gameOver && !didWin && showAllBombs && bombs[r][c] && !isRev) {
      const m = document.createElement("div");
      m.className = "bombmark";
      m.textContent = "💣";
      div.appendChild(m);
    }

    // Review mode shows hidden infos
    if (reviewMode && gameOver) {
      if (!isRev) {
        if (bombs[r][c]) {
          div.classList.add("postHiddenBomb");

          const m = document.createElement("div");
          m.className = "bombmark";
          m.textContent = "💣";
          div.appendChild(m);

          // ✅ Show the bomb's Sudoku digit too
          const d = document.createElement("div");
          d.className = "bombDigitOverlay";
          d.textContent = solution[r][c];
          div.appendChild(d);
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

    // 🔥 GLOBAL OVERRIDE FOR FLAG / NOTE PREVIEW
    // If we're previewing a flag or note on this cell, show ONLY that,
    // even if it's currently revealed with a digit.
    if (hasPreview && (preview.kind === "flag" || preview.kind === "note")) {
      div.classList.add("covered", "preview");

      if (preview.kind === "flag") {
        const pfIcon = document.createElement("div");
        pfIcon.className = "preview__flagIcon";
        pfIcon.textContent = "⚑";
        div.appendChild(pfIcon);

        if (preview.value != null) {
          const pfNum = document.createElement("div");
          pfNum.className = "preview__digit";
          pfNum.textContent = preview.value;
          div.appendChild(pfNum);
        }
      } else if (preview.kind === "note") {
        const pn = document.createElement("div");
        pn.className = "preview__note";
        pn.textContent = preview.value;

        const icon = document.createElement("div");
        icon.className = "preview__noteIcon";
        icon.textContent = "✎";

        div.appendChild(icon);
        div.appendChild(pn);
      }

      return; // 👈 don't draw the old digit/flag/note underneath
    }

    // ========= REVEALED CELLS =========
    if (isRev) {
      div.classList.add("revealed", type);

      if (type === "bomb") {
        const m = document.createElement("div");
        m.className = "bombmark";
        m.textContent = "💣";
        div.appendChild(m);
      } else {
        if (given[r][c]) {
          // Given tiles (locked)
          div.textContent = solution[r][c];
          div.classList.add("given");
        } else {
          // Player-entered tiles (editable)
          const committed = entry[r][c] || "";
          div.classList.add("entered");

          const wantsNumberPreview =
            hasPreview && preview.kind === "number" && preview.value != null;

          if (wantsNumberPreview) {
            // 👻 only ghost digit, hide committed one
            div.classList.add("preview");
            const pd = document.createElement("div");
            pd.className = "preview__digit";
            pd.textContent = preview.value;
            div.appendChild(pd);
          } else {
            div.textContent = committed;
          }

          // In review mode, also show the correct digit
          if (reviewMode && gameOver) {
            const correct = solution[r][c];
            const committedStr = String(committed);

            if (committedStr !== "" && committedStr !== String(correct)) {
              // Only for wrong entries
              const overlay = document.createElement("div");
              overlay.className = "correctDigitOverlay wrong";
              overlay.textContent = correct;
              div.appendChild(overlay);
              div.classList.add("enteredWrong");
            }
          }
        }
      }
      return;
    }

    // ========= COVERED CELLS =========
    div.classList.add("covered");
    if (type === "clue") {
      div.classList.add("clue"); // ADD THIS
    }
    // Number preview on covered tiles (flag/note already handled above)
    if (hasPreview && preview.kind === "number") {
      div.classList.add("preview");
      const pd = document.createElement("div");
      pd.className = "preview__digit";
      pd.textContent = preview.value;
      div.appendChild(pd);
      return;
    }

    // No preview: show committed decorations (flag / note)
    if (isFlag) {
      div.classList.add("flag");
      const note = flagNote[r]?.[c];
      if (note != null) {
        const big = document.createElement("div");
        big.className = "flagDigit";
        big.textContent = note;
        div.appendChild(big);
      }
    } else {
      const m = noteText[r]?.[c];
      if (m) {
        div.classList.add("mark");
        const md = document.createElement("div");
        md.className = "markDigit";
        md.textContent = m;
        div.appendChild(md);
      }
    }
  }

  function renderBoard() {
    boardEl.innerHTML = "";
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++) {
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
    const idx = r * SIDE + c,
      div = boardEl.children[idx];
    if (!div) return;
    paintCell(div, r, c);
    updateRemoveButtons();
    highlightSelected(); // keep selection visible after repaint
  }

  // ========= Selection & input =========
  function hideHL() {
    rowHL.style.display = "none";
    colHL.style.display = "none";
  }
  function showRowHL(r) {
    const { originX, originY, innerW, cellH } = getBoardMetrics();
    rowHL.style.display = "block";
    rowHL.style.left = originX + "px";
    rowHL.style.top = originY + r * cellH + "px";
    rowHL.style.width = innerW + "px";
    rowHL.style.height = cellH + "px";
    colHL.style.display = "none";
  }
  function showColHL(c) {
    const { originX, originY, innerH, cellW } = getBoardMetrics();
    colHL.style.display = "block";
    colHL.style.left = originX + c * cellW + "px";
    colHL.style.top = originY + "px";
    colHL.style.width = cellW + "px";
    colHL.style.height = innerH + "px";
    rowHL.style.display = "none";
  }

  function setSelected(r, c) {
    if (gameOver) return;

    // Clear any old preview from previous tile
    clearPreview();

    // Move selection
    selected = { r, c };

    // Reset in-progress inputs for the new tile
    pickedDigit = null;
    noteBuffer = "";

    highlightSelected();
    updateHintText();
    updateRemoveButtons();

    // Set (empty) preview now; will render when user picks something
    setPreviewForSelected();
  }
  function clearSelected() {
    selected = null;
    clearPreview();
    highlightSelected();
    updateRemoveButtons();
  }

  function highlightSelected() {
    for (const ch of boardEl.children) ch.classList.remove("sel");
    if (!selected) return;
    const idx = selected.r * SIDE + selected.c;
    const div = boardEl.children[idx];
    if (div) div.classList.add("sel");
  }
  function updateRemoveButtons() {
    if (!selected) {
      removeFlagBtn.disabled = true;
      removeMarkBtn.disabled = true;
      return;
    }
    const { r, c } = selected;
    removeFlagBtn.disabled = !flagged[r][c];
    removeMarkBtn.disabled = !(noteText[r] && noteText[r][c]);
  }
  function updateHintText() {
    if (flagMode)
      asideHint.textContent =
        "Flag mode: optionally add a digit to the flag; Confirm to commit.";
    else if (noteMode)
      asideHint.textContent = `Note mode: tap digits and '/' to compose (e.g. 2/3); Confirm to place.`;
    else
      asideHint.textContent =
        "Number mode: pick a digit; Confirm to commit. Bombs lose instantly.";
  }

  // Build numpad (NOTE: add "/" when noteMode)
  function buildNumpad() {
    numpadEl.innerHTML = "";
    for (let n = 1; n <= 9; n++) {
      const b = document.createElement("button");
      b.textContent = n;
      b.classList.add("numBtn");
      b.addEventListener("click", () => {
        if (!selected) return;
        if (noteMode) {
          if (noteBuffer.length && !noteBuffer.endsWith("/")) noteBuffer += "/";
          noteBuffer += String(n);
        } else {
          pickedDigit = pickedDigit === n ? null : n;
        }
        setPreviewForSelected();
      });
      numpadEl.appendChild(b);
    }
    const slashBtn = document.createElement("button");
    slashBtn.textContent = "/";
    slashBtn.addEventListener("click", () => {
      if (!selected || !noteMode) return;
      if (noteBuffer.length && !noteBuffer.endsWith("/")) noteBuffer += "/";
      setPreviewForSelected();
    });
    slashBtn.style.fontWeight = "900";
    if (noteMode) numpadEl.appendChild(slashBtn);
  }

  flagBtn.addEventListener("click", () => {
    flagMode = !flagMode;
    if (flagMode) {
      noteMode = false;
    }
    flagBtn.classList.toggle("flagModeOn", flagMode);
    markBtn.classList.remove("markModeOn");
    setStatus(flagMode ? "Flag mode ON." : "Flag mode OFF.", "hint");
    pickedDigit = null;
    noteBuffer = "";
    setPreviewForSelected();
    updateHintText();
    buildNumpad();
  });
  markBtn.addEventListener("click", () => {
    noteMode = !noteMode;
    if (noteMode) {
      flagMode = false;
    }
    markBtn.classList.toggle("markModeOn", noteMode);
    flagBtn.classList.remove("flagModeOn");
    setStatus(noteMode ? "Note mode ON." : "Note mode OFF.", "hint");
    pickedDigit = null;
    noteBuffer = "";
    setPreviewForSelected();
    updateHintText();
    buildNumpad();
  });

  removeFlagBtn.addEventListener("click", () => {
    if (gameOver || !selected) return;
    const { r, c } = selected;
    if (!flagged[r][c]) return;
    flagged[r][c] = false;
    if (flagNote[r]) flagNote[r][c] = null;
    flagsCount = Math.max(0, flagsCount - 1);
    renderCell(r, c);
    updateStats();
    setStatus("Flag removed.", "hint");
    if (!gameOver && isWin())
      endGame(
        true,
        "All safe digits correct and bombs flagged with correct digits!"
      );
  });
  removeMarkBtn.addEventListener("click", () => {
    if (gameOver || !selected) return;
    const { r, c } = selected;
    if (!(noteText[r] && noteText[r][c])) return;
    noteText[r][c] = "";
    renderCell(r, c);
    setStatus("Note cleared.", "hint");
  });

  confirmBtn.addEventListener("click", () => {
    if (gameOver) return;
    if (!selected) {
      setStatus("Select a tile first.", "lose");
      return;
    }
    const { r, c } = selected;

    if (given[r][c]) {
      setStatus("This tile is a given.", "lose");
      bumpCell(r, c);
      return;
    }

    // NOTE MODE: commit note (e.g., "2/3")
    if (noteMode) {
      if (!noteBuffer) {
        setStatus("Compose a note with digits and '/'.", "lose");
        bumpCell(r, c);
        return;
      }

      // 🔄 Exclusivity: switching to note clears digit + flag
      if (entry[r][c] != null && entry[r][c] !== "") {
        entry[r][c] = null;
        revealed[r][c] = false; // treat notes as 'covered with note'
      }
      if (flagged[r][c]) {
        flagged[r][c] = false;
        flagsCount = Math.max(0, flagsCount - 1);
        if (flagNote[r]) flagNote[r][c] = null;
      }

      if (!noteText[r]) noteText[r] = [];
      noteText[r][c] = noteBuffer;
      noteBuffer = "";
      setStatus("Note placed.", "hint");
      clearPreview();
      renderCell(r, c);
      updateStats();
      return;
    }

    // FLAG MODE: commit flag (with optional digit label)
    if (flagMode) {
      // 🔄 Exclusivity: switching to flag clears digit + note
      if (entry[r][c] != null && entry[r][c] !== "") {
        entry[r][c] = null;
        revealed[r][c] = false; // flag lives on a covered tile
      }
      if (noteText[r]) {
        noteText[r][c] = "";
      }

      if (!flagged[r][c]) {
        flagged[r][c] = true;
        flagsCount++;
      }

      if (!flagNote[r]) flagNote[r] = [];
      flagNote[r][c] = pickedDigit ?? null; // can be null; must match bomb digit to win

      setStatus(
        flagNote[r][c] == null ? "Blank flag placed." : "Flag placed.",
        "hint"
      );
      clearPreview();
      renderCell(r, c);
      updateStats();
      if (isWin())
        endGame(
          true,
          "All safe digits correct and bombs flagged with correct digits!"
        );
      return;
    }

    // NUMBER MODE: committing to a digit on this tile (trial & error allowed)
    if (bombs[r][c]) {
      endGame(false, "You touched a bomb.");
      return;
    }

    if (pickedDigit == null) {
      setStatus("Pick a number 1–9, then Confirm.", "lose");
      bumpCell(r, c);
      return;
    }

    // Commit the user's digit (even if it's wrong). Can overwrite later.
    entry[r][c] = pickedDigit;
    revealed[r][c] = true;

    // 🔄 Exclusivity: clear notes + flag when placing a digit
    if (noteText[r]) {
      noteText[r][c] = "";
    }
    if (flagged[r][c]) {
      flagged[r][c] = false;
      flagsCount = Math.max(0, flagsCount - 1);
      if (flagNote[r]) flagNote[r][c] = null;
    }

    setStatus("Digit placed.", "hint");
    clearPreview();
    renderCell(r, c);
    if (isWin())
      endGame(
        true,
        "All safe digits correct and bombs flagged with correct digits!"
      );
  });

  function onMouseDownCell(e) {
    const t = e.currentTarget;
    const r = +t.dataset.r,
      c = +t.dataset.c;
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    if (e.button === 2) {
      e.preventDefault();
      setStatus("Use Flag/Note with the buttons above.", "hint");
      bumpCell(r, c);
      return;
    }
    setSelected(r, c);
  }
  function onTouchCell(e) {
    e.preventDefault();
    const t = e.currentTarget;
    const r = +t.dataset.r,
      c = +t.dataset.c;
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    setSelected(r, c);
  }
  function bumpCell(r, c) {
    const idx = r * SIDE + c,
      el = boardEl.children[idx];
    if (!el) return;
    el.classList.add("bad");
    setTimeout(() => el.classList.remove("bad"), 200);
  }

  // ========= Logic solvability evaluator =========
  function evaluateLogicalSolvability(cfg) {
    const MODE = cfg.logicEnforcement ?? "sudoku_only";
    const knownRevealed = Array.from({ length: SIDE }, () =>
      Array(SIDE).fill(false)
    );
    const knownFlagged = Array.from({ length: SIDE }, () =>
      Array(SIDE).fill(false)
    );
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++)
        if (given[r][c]) knownRevealed[r][c] = true;

    const cand = Array.from({ length: SIDE }, () =>
      Array.from({ length: SIDE }, () => new Set())
    );
    const recompute = () => {
      for (let r = 0; r < SIDE; r++)
        for (let c = 0; c < SIDE; c++) {
          if (bombs[r][c]) {
            cand[r][c].clear();
            continue;
          }
          if (knownRevealed[r][c]) {
            cand[r][c] = new Set([solution[r][c]]);
            continue;
          }
          const s = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]);
          for (let cc = 0; cc < SIDE; cc++)
            if (knownRevealed[r][cc]) s.delete(solution[r][cc]);
          for (let rr = 0; rr < SIDE; rr++)
            if (knownRevealed[rr][c]) s.delete(solution[rr][c]);
          const r0 = Math.floor(r / 3) * 3,
            c0 = Math.floor(c / 3) * 3;
          for (let rr = r0; rr < r0 + 3; rr++)
            for (let cc = c0; cc < c0 + 3; cc++)
              if (knownRevealed[rr][cc]) s.delete(solution[rr][cc]);
          cand[r][c] = s;
        }
    };
    const reveal = (r, c) => {
      if (!bombs[r][c]) knownRevealed[r][c] = true;
    };
    const flag = (r, c) => {
      if (!knownRevealed[r][c]) knownFlagged[r][c] = true;
    };
    const neighbors8Eval = (r, c) => {
      const res = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr,
            cc = c + dc;
          if (rr >= 0 && rr < SIDE && cc >= 0 && cc < SIDE) res.push([rr, cc]);
        }
      return res;
    };
    const getUnknownN = (r, c) => {
      const u = [],
        f = [];
      for (const [rr, cc] of neighbors8Eval(r, c)) {
        if (knownFlagged[rr][cc]) f.push([rr, cc]);
        else if (!knownRevealed[rr][cc]) u.push([rr, cc]);
      }
      return { u, f };
    };

    function sudokuSingles() {
      let changed = false;
      for (let r = 0; r < SIDE; r++)
        for (let c = 0; c < SIDE; c++) {
          if (bombs[r][c] || knownRevealed[r][c]) continue;
          const s = cand[r][c];
          if (s.size === 1) {
            reveal(r, c);
            changed = true;
          }
        }
      for (let r = 0; r < SIDE; r++)
        for (let n = 1; n <= 9; n++) {
          const spots = [];
          for (let c = 0; c < SIDE; c++)
            if (!bombs[r][c] && !knownRevealed[r][c] && cand[r][c].has(n))
              spots.push([r, c]);
          if (spots.length === 1) {
            reveal(spots[0][0], spots[0][1]);
            changed = true;
          }
        }
      for (let c = 0; c < SIDE; c++)
        for (let n = 1; n <= 9; n++) {
          const spots = [];
          for (let r = 0; r < SIDE; r++)
            if (!bombs[r][c] && !knownRevealed[r][c] && cand[r][c].has(n))
              spots.push([r, c]);
          if (spots.length === 1) {
            reveal(spots[0][0], spots[0][1]);
            changed = true;
          }
        }
      for (let br = 0; br < 3; br++)
        for (let bc = 0; bc < 3; bc++)
          for (let n = 1; n <= 9; n++) {
            const spots = [];
            for (let r = br * 3; r < br * 3 + 3; r++)
              for (let c = bc * 3; c < bc * 3; c++)
                if (!bombs[r][c] && !knownRevealed[r][c] && cand[r][c].has(n))
                  spots.push([r, c]);
            if (spots.length === 1) {
              reveal(spots[0][0], spots[0][1]);
              changed = true;
            }
          }
      return changed;
    }

    let steps = 0;
    for (; steps < 1000; steps++) {
      recompute();
      if (!sudokuSingles()) break;
    }
    const sudokuSolved = (() => {
      for (let r = 0; r < SIDE; r++)
        for (let c = 0; c < SIDE; c++)
          if (!bombs[r][c] && !knownRevealed[r][c]) return false;
      return true;
    })();
    if (!sudokuSolved) return { solvable: false, steps };
    if ((cfg.logicEnforcement ?? "sudoku_only") === "sudoku_only")
      return { solvable: true, steps };

    const rowHintAvail = new Set(hintedRows);
    const colHintAvail = new Set(hintedCols);
    function clueAdj() {
      let changed = false;
      for (let r = 0; r < SIDE; r++)
        for (let c = 0; c < SIDE; c++) {
          if (!knownRevealed[r][c]) continue;
          if (solution[r][c] !== adj[r][c]) continue;
          const num = solution[r][c];
          const { u, f } = getUnknownN(r, c);
          const F = f.length,
            U = u.length;
          if (!U) continue;
          if (F === num) {
            for (const [rr, cc] of u) {
              reveal(rr, cc);
              changed = true;
            }
          } else if (F + U === num) {
            for (const [rr, cc] of u) {
              flag(rr, cc);
              changed = true;
            }
          }
        }
      return changed;
    }
    function gutters() {
      let changed = false;
      for (const r of rowHintAvail) {
        let covered = [],
          F = 0;
        for (let c = 0; c < SIDE; c++) {
          if (knownFlagged[r][c]) F++;
          else if (!knownRevealed[r][c]) covered.push([r, c]);
        }
        const need = rowTotals[r],
          U = covered.length;
        if (!U) continue;
        if (F === need) {
          for (const [rr, cc] of covered) {
            reveal(rr, cc);
            changed = true;
          }
        } else if (F + U === need) {
          for (const [rr, cc] of covered) {
            flag(rr, cc);
            changed = true;
          }
        }
      }
      for (const c of colHintAvail) {
        let covered = [],
          F = 0;
        for (let r = 0; r < SIDE; r++) {
          if (knownFlagged[r][c]) F++;
          else if (!knownRevealed[r][c]) covered.push([r, c]);
        }
        const need = colTotals[c],
          U = covered.length;
        if (!U) continue;
        if (F === need) {
          for (const [rr, cc] of covered) {
            reveal(rr, cc);
            changed = true;
          }
        } else if (F + U === need) {
          for (const [rr, cc] of covered) {
            flag(rr, cc);
            changed = true;
          }
        }
      }
      return changed;
    }

    for (let i = 0; i < 1000; i++) {
      recompute();
      const p = sudokuSingles() || clueAdj() || gutters();
      if (!p) break;
    }
    let residualUnknown = 0;
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++)
        if (!knownRevealed[r][c] && !knownFlagged[r][c]) residualUnknown++;
    const allowResidual = cfg.maxResidualUnknownCells ?? 0;
    if ((cfg.logicEnforcement ?? "sudoku_only") === "hybrid")
      return { solvable: residualUnknown === 0, steps };
    return { solvable: residualUnknown <= allowResidual, steps };
  }

  // ========= Bootstrap: apply a few logical steps to the real board =========
  function runLogicalBootstrap(cfg, rounds = 1) {
    if (!rounds) return;

    // local copies that we mutate and then apply
    const knownRevealed = revealed.map((row) => row.slice());
    const knownFlagged = flagged.map((row) => row.slice());

    const neighbors8Eval = (r, c) => {
      const res = [];
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const rr = r + dr,
            cc = c + dc;
          if (rr >= 0 && rr < SIDE && cc >= 0 && cc < SIDE) res.push([rr, cc]);
        }
      return res;
    };
    const getUnknownN = (r, c) => {
      const u = [],
        f = [];
      for (const [rr, cc] of neighbors8Eval(r, c)) {
        if (knownFlagged[rr][cc]) f.push([rr, cc]);
        else if (!knownRevealed[rr][cc]) u.push([rr, cc]);
      }
      return { u, f };
    };

    const rowHintAvail = new Set(hintedRows);
    const colHintAvail = new Set(hintedCols);

    function stepOnce() {
      let changed = false;

      // clue adjacency rules
      for (let r = 0; r < SIDE; r++)
        for (let c = 0; c < SIDE; c++) {
          if (!knownRevealed[r][c]) continue;
          if (solution[r][c] !== adj[r][c]) continue;
          const num = solution[r][c];
          const { u, f } = getUnknownN(r, c);
          if (!u.length) continue;
          if (f.length === num) {
            for (const [rr, cc] of u) {
              if (!bombs[rr][cc]) {
                knownRevealed[rr][cc] = true;
                changed = true;
              }
            }
          } else if (f.length + u.length === num) {
            for (const [rr, cc] of u) {
              if (!knownRevealed[rr][cc]) {
                knownFlagged[rr][cc] = true;
                changed = true;
              }
            }
          }
        }

      // row/col gutter rules
      for (const r of rowHintAvail) {
        let covered = [],
          F = 0;
        for (let c = 0; c < SIDE; c++) {
          if (knownFlagged[r][c]) F++;
          else if (!knownRevealed[r][c]) covered.push([r, c]);
        }
        const need = rowTotals[r],
          U = covered.length;
        if (!U) continue;
        if (F === need) {
          for (const [rr, cc] of covered) {
            if (!bombs[rr][cc]) {
              knownRevealed[rr][cc] = true;
              changed = true;
            }
          }
        } else if (F + U === need) {
          for (const [rr, cc] of covered) {
            knownFlagged[rr][cc] = true;
            changed = true;
          }
        }
      }
      for (const c of colHintAvail) {
        let covered = [],
          F = 0;
        for (let r = 0; r < SIDE; r++) {
          if (knownFlagged[r][c]) F++;
          else if (!knownRevealed[r][c]) covered.push([r, c]);
        }
        const need = colTotals[c],
          U = covered.length;
        if (!U) continue;
        if (F === need) {
          for (const [rr, cc] of covered) {
            if (!bombs[rr][cc]) {
              knownRevealed[rr][cc] = true;
              changed = true;
            }
          }
        } else if (F + U === need) {
          for (const [rr, cc] of covered) {
            knownFlagged[rr][cc] = true;
            changed = true;
          }
        }
      }

      return changed;
    }

    for (let r = 0; r < rounds; r++) {
      if (!stepOnce()) break;
    }

    // apply to real board as auto-moves (like the player already deduced them)
    let didAny = false;
    for (let r = 0; r < SIDE; r++)
      for (let c = 0; c < SIDE; c++) {
        if (knownRevealed[r][c] && !revealed[r][c] && !bombs[r][c]) {
          revealed[r][c] = true;
          entry[r][c] = solution[r][c];
          didAny = true;
        }
        if (knownFlagged[r][c] && !flagged[r][c]) {
          flagged[r][c] = true;
          flagsCount++;
          didAny = true;
        }
      }
    if (didAny) updateStats();
  }

  // ========= Mode/Config helpers =========
  function loadCustomFromLS() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      PRESETS.custom = Object.assign({}, PRESETS.custom, cfg);
    } catch {}
  }
  function saveCustomToLS() {
    localStorage.setItem(LS_KEY, JSON.stringify(PRESETS.custom));
  }
  function getActiveConfig() {
    return Object.assign({}, PRESETS[mode]);
  }
  function applyConfigInputsEnabled() {
    const enable = mode === "custom";
    [
      cfgLives,
      cfgBombRatio,
      cfgStartClues,
      cfgStartGivens,
      cfgMaxAdj,
      cfgSpreadRows,
      cfgSpreadBlocks,
    ].forEach((el) => (el.disabled = !enable));
    if (enable) {
      configPanel.open = true;
    }
  }
  function syncInputsFromConfig(cfg) {
    cfgLives.value = cfg.lives;
    valLives.textContent = cfg.lives;
    cfgBombRatio.value = cfg.bombRatio;
    valBombRatio.textContent = Number(cfg.bombRatio).toFixed(2);
    cfgStartClues.value = cfg.minStartClues;
    valStartClues.textContent = cfg.minStartClues;
    cfgStartGivens.value = cfg.targetStartGivens;
    valStartGivens.textContent = cfg.targetStartGivens;
    cfgMaxAdj.value = cfg.maxAdjStart;
    valMaxAdj.textContent = cfg.maxAdjStart;
    cfgSpreadRows.checked = !!cfg.spreadRows;
    cfgSpreadBlocks.checked = !!cfg.spreadBlocks;
  }
  function syncConfigFromInputs() {
    PRESETS.custom = {
      lives: parseInt(cfgLives.value, 10),
      bombRatio: +cfgBombRatio.value,
      minStartClues: parseInt(cfgStartClues.value, 10),
      targetStartGivens: parseInt(cfgStartGivens.value, 10),
      maxAdjStart: parseInt(cfgMaxAdj.value, 10),
      spreadRows: !!cfgSpreadRows.checked,
      spreadBlocks: !!cfgSpreadBlocks.checked,
      hintRows: PRESETS.custom.hintRows ?? 3,
      hintCols: PRESETS.custom.hintCols ?? 3,
      logicEnforcement: PRESETS.custom.logicEnforcement ?? "sudoku_only",
      maxResidualUnknownCells: PRESETS.custom.maxResidualUnknownCells ?? 2,

      clusterize: PRESETS.custom.clusterize ?? true,
      minClusters: PRESETS.custom.minClusters ?? 5,
      clusterSizeMin: PRESETS.custom.clusterSizeMin ?? 3,
      clusterSizeMax: PRESETS.custom.clusterSizeMax ?? 5,
      supportPasses: PRESETS.custom.supportPasses ?? 2,
      bootstrapSteps: PRESETS.custom.bootstrapSteps ?? 1,
    };
    saveCustomToLS();
    renderActiveConfigKV();
  }
  function renderActiveConfigKV() {
    const cfg = getActiveConfig();
    activeConfigEl.textContent = `mode: ${mode}
bombRatio: ${cfg.bombRatio}
minStartClues: ${cfg.minStartClues}
targetStartGivens: ${cfg.targetStartGivens}
maxAdjForStart: ${cfg.maxAdjStart}
spreadByRows: ${cfg.spreadRows}
spreadByBlocks: ${cfg.spreadBlocks}
logicEnforcement: ${cfg.logicEnforcement}
maxResidualUnknownCells: ${cfg.maxResidualUnknownCells}
clusterize: ${cfg.clusterize}
minClusters: ${cfg.minClusters}
clusterSizeMin: ${cfg.clusterSizeMin}
clusterSizeMax: ${cfg.clusterSizeMax}
supportPasses: ${cfg.supportPasses}
bootstrapSteps: ${cfg.bootstrapSteps}`;
  }
  function updateConfigInputsUI() {
    const cfg = getActiveConfig();
    syncInputsFromConfig(cfg);
    applyConfigInputsEnabled();
    renderActiveConfigKV();
  }

  modeEl.addEventListener("change", () => {
    mode = modeEl.value;
    updateConfigInputsUI();
  });
  [
    [cfgLives, valLives, (v) => v],
    [cfgBombRatio, valBombRatio, (v) => (+v).toFixed(2)],
    [cfgStartClues, valStartClues, (v) => v],
    [cfgStartGivens, valStartGivens, (v) => v],
    [cfgMaxAdj, valMaxAdj, (v) => v],
  ].forEach(([input, label, fmt]) => {
    input.addEventListener("input", () => {
      label.textContent = fmt(input.value);
      if (mode === "custom") {
        syncConfigFromInputs();
      }
    });
  });
  cfgSpreadRows.addEventListener("change", () => {
    if (mode === "custom") {
      syncConfigFromInputs();
    }
  });
  cfgSpreadBlocks.addEventListener("change", () => {
    if (mode === "custom") {
      syncConfigFromInputs();
    }
  });

  saveCustomBtn.addEventListener("click", () => {
    syncConfigFromInputs();
    setStatus("Custom config saved. New Run to apply.", "win");
  });
  resetCustomBtn.addEventListener("click", () => {
    PRESETS.custom = {
      ...PRESETS.story,
      lives: 0,
      bombRatio: 0.14,
      minStartClues: 9,
      targetStartGivens: 36,
      maxAdjStart: 2,
      hintRows: 3,
      hintCols: 3,
      logicEnforcement: "sudoku_only",
      maxResidualUnknownCells: 2,
      clusterize: true,
      minClusters: 5,
      clusterSizeMin: 3,
      clusterSizeMax: 5,
      supportPasses: 2,
      bootstrapSteps: 1,
    };
    syncInputsFromConfig(PRESETS.custom);
    saveCustomToLS();
    renderActiveConfigKV();
    setStatus("Custom config reset to defaults.", "hint");
  });

  newRunBtn.addEventListener("click", newRun);

  // ========= New game =========
  function newRun() {
    gameOver = false;
    didWin = false;
    reviewMode = false;
    showAllBombs = false;

    selected = null;
    pickedDigit = null;
    flagsCount = 0;
    flagMode = false;
    noteMode = false;
    noteBuffer = "";
    clearPreview();
    flagBtn.classList.remove("flagModeOn");
    markBtn.classList.remove("markModeOn");

    const cfg = getActiveConfig();

    // Handle board seed
    let seed;
    if (seedInput && seedInput.value.trim() !== "") {
      seed = seedInput.value.trim();
    } else {
      seed = Math.floor(Math.random() * 1e9).toString();
    }
    setSeed(seed);
    if (seedDisplay) seedDisplay.textContent = seed;

    const MAX_BOARD_TRIES = 250;
    let foundEnoughClues = false,
      lastClueCount = 0,
      passedLogic = false;

    for (let attempt = 1; attempt <= MAX_BOARD_TRIES; attempt++) {
      // --- full reset for this attempt ---
      solution = generateSudokuSolved();
      bombs = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
      adj = Array.from({ length: SIDE }, () => Array(SIDE).fill(0));
      entry = Array.from({ length: SIDE }, () => Array(SIDE).fill(0));
      revealed = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
      flagged = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
      flagNote = Array.from({ length: SIDE }, () => Array(SIDE).fill(null));
      noteText = Array.from({ length: SIDE }, () => Array(SIDE).fill(""));
      given = Array.from({ length: SIDE }, () => Array(SIDE).fill(false));
      // -----------------------------------

      const bp = placeBombs(cfg.bombRatio);
      bombs = bp.b;
      bombsTotal = bp.count;
      adj = computeAdj(bombs);
      ensureBombHasTwoSupports(cfg.supportPasses ?? 1);
      adj = computeAdj(bombs);

      lastClueCount = countAllClues();
      if (lastClueCount < (cfg.minStartClues || 0)) continue;
      foundEnoughClues = true;

      selectRowColHints(cfg);

      const res = chooseGivensPatterned(cfg);
      given = res.g;

      // now mark givens as revealed and copy solution into entry
      for (let r = 0; r < SIDE; r++) {
        for (let c = 0; c < SIDE; c++) {
          if (given[r][c]) {
            revealed[r][c] = true;
            entry[r][c] = solution[r][c];
          }
        }
      }

      const evalRes = evaluateLogicalSolvability(cfg);
      if (evalRes.solvable) {
        passedLogic = true;
        break;
      }
    }

    renderLives();
    renderBoard();
    updateStats();
    renderActiveConfigKV();

    reviewBtn.style.display = "none";
    reviewBtn.textContent = "👁 Review Board";

    buildNumpad();
  }

  // ========= Init =========
  loadCustomFromLS();
  updateConfigInputsUI();

  // Theme init
  const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
  applyTheme(savedTheme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", () => {
      const current =
        document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem(THEME_KEY, next);
      applyTheme(next);
    });
  }

  newRun();
})();
