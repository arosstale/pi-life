/**
 * pi-life — Conway's Game of Life. /life [pattern]
 * Patterns: random, glider, pulsar, gosper, acorn, rpentomino, spaceship
 */
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { visibleWidth } from "@mariozechner/pi-tui";

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const RST = "\x1b[0m";

const THEMES = [
  { name: "Matrix",  alive: "38;2;0;255;80",   dying: "38;2;0;80;30",   born: "38;2;100;255;150", bg: "38;2;5;10;5" },
  { name: "Coral",   alive: "38;2;255;100;80",  dying: "38;2;100;40;30", born: "38;2;255;180;100",  bg: "38;2;10;5;5" },
  { name: "Ocean",   alive: "38;2;50;180;255",  dying: "38;2;20;60;100", born: "38;2;150;220;255",  bg: "38;2;5;5;15" },
  { name: "Plasma",  alive: "38;2;200;80;255",  dying: "38;2;80;30;100", born: "38;2;255;150;255",  bg: "38;2;8;3;10" },
  { name: "Gold",    alive: "38;2;255;200;50",  dying: "38;2;100;80;20", born: "38;2;255;240;150",  bg: "38;2;10;8;3" },
  { name: "Mono",    alive: "38;2;220;220;230", dying: "38;2;60;60;70",  born: "38;2;255;255;255",  bg: "38;2;8;8;10" },
];

// ─── PATTERNS ────────────────────────────────────────────────────────────────

type Pattern = number[][]; // [y, x] offsets

const PATTERNS: Record<string, Pattern> = {
  glider: [[0,1],[1,2],[2,0],[2,1],[2,2]],
  pulsar: (() => {
    const p: Pattern = [];
    const rows = [2,3,4,8,9,10]; const cols = [0,5,7,12];
    for (const r of rows) for (const c of [0,5]) p.push([r,c]);
    for (const r of [0,5,7,12]) for (const c of rows) p.push([c,r]);
    return p;
  })(),
  gosper: [ // Gosper glider gun
    [0,24],[1,22],[1,24],[2,12],[2,13],[2,20],[2,21],[2,34],[2,35],
    [3,11],[3,15],[3,20],[3,21],[3,34],[3,35],[4,0],[4,1],[4,10],
    [4,16],[4,20],[4,21],[5,0],[5,1],[5,10],[5,14],[5,16],[5,17],
    [5,22],[5,24],[6,10],[6,16],[6,24],[7,11],[7,15],[8,12],[8,13],
  ],
  acorn: [[0,1],[1,3],[2,0],[2,1],[2,4],[2,5],[2,6]],
  rpentomino: [[0,1],[0,2],[1,0],[1,1],[2,1]],
  spaceship: [[0,1],[0,4],[1,0],[2,0],[2,4],[3,0],[3,1],[3,2],[3,3]], // LWSS
};

function placePattern(grid: Uint8Array, w: number, h: number, pat: Pattern, cx: number, cy: number) {
  for (const [dy, dx] of pat) {
    const y = (cy + dy) % h, x = (cx + dx) % w;
    grid[y * w + x] = 1;
  }
}

function randomGrid(grid: Uint8Array, density = 0.3) {
  for (let i = 0; i < grid.length; i++) grid[i] = Math.random() < density ? 1 : 0;
}

function step(curr: Uint8Array, next: Uint8Array, w: number, h: number) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dy === 0 && dx === 0) continue;
      const ny = (y + dy + h) % h, nx = (x + dx + w) % w;
      n += curr[ny * w + nx];
    }
    const alive = curr[y * w + x];
    next[y * w + x] = (alive && (n === 2 || n === 3)) || (!alive && n === 3) ? 1 : 0;
  }
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────

class LifeComponent {
  private w: number; private h: number;
  private grid: Uint8Array; private next: Uint8Array; private prev: Uint8Array;
  private timer: ReturnType<typeof setInterval> | null = null;
  private paused = false;
  private gen = 0; private pop = 0;
  private theme = 0;
  private speed = 100; // ms
  private version = 0;
  private drawing = false;
  private curX = 0; private curY = 0;

  constructor(private tui: any, private done: (v: undefined) => void, pattern: string) {
    this.w = 80; this.h = 30;
    this.grid = new Uint8Array(this.w * this.h);
    this.next = new Uint8Array(this.w * this.h);
    this.prev = new Uint8Array(this.w * this.h);
    this.curX = Math.floor(this.w / 2);
    this.curY = Math.floor(this.h / 2);

    if (pattern === "random" || !PATTERNS[pattern]) {
      randomGrid(this.grid, 0.25);
    } else {
      placePattern(this.grid, this.w, this.h, PATTERNS[pattern], Math.floor(this.w / 2) - 5, Math.floor(this.h / 2) - 5);
    }

    this.scheduleStep();
  }

  private scheduleStep() {
    if (this.timer) clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (!this.paused && !this.drawing) {
        this.prev.set(this.grid);
        step(this.grid, this.next, this.w, this.h);
        [this.grid, this.next] = [this.next, this.grid];
        this.gen++;
        this.pop = 0; for (let i = 0; i < this.grid.length; i++) this.pop += this.grid[i];
        this.version++;
        this.tui.requestRender();
      }
    }, this.speed);
  }

  handleInput(data: string) {
    if (data === "q" || data === "Q" || data === "\x03") { this.dispose(); this.done(undefined); return; }
    if (data === " " || data === "p" || data === "P") { this.paused = !this.paused; this.version++; this.tui.requestRender(); return; }
    if (data === "t" || data === "T") { this.theme = (this.theme + 1) % THEMES.length; this.version++; this.tui.requestRender(); }
    if (data === "c" || data === "C") { this.grid.fill(0); this.gen = 0; this.pop = 0; this.version++; this.tui.requestRender(); }
    if (data === "r" || data === "R") { randomGrid(this.grid, 0.25); this.gen = 0; this.version++; this.tui.requestRender(); }
    if (data === "n" || data === "N") { // single step
      this.prev.set(this.grid);
      step(this.grid, this.next, this.w, this.h);
      [this.grid, this.next] = [this.next, this.grid];
      this.gen++;
      this.pop = 0; for (let i = 0; i < this.grid.length; i++) this.pop += this.grid[i];
      this.version++; this.tui.requestRender();
    }
    // Speed
    if (data === "+" || data === "=") { this.speed = Math.max(20, this.speed - 20); this.scheduleStep(); }
    if (data === "-") { this.speed = Math.min(500, this.speed + 20); this.scheduleStep(); }
    // Draw mode
    if (data === "d" || data === "D") { this.drawing = !this.drawing; this.paused = this.drawing; this.version++; this.tui.requestRender(); }
    if (this.drawing) {
      if (data === "\x1b[A") this.curY = Math.max(0, this.curY - 1);
      if (data === "\x1b[B") this.curY = Math.min(this.h - 1, this.curY + 1);
      if (data === "\x1b[C") this.curX = Math.min(this.w - 1, this.curX + 1);
      if (data === "\x1b[D") this.curX = Math.max(0, this.curX - 1);
      if (data === "\r" || data === "x" || data === "X") {
        const i = this.curY * this.w + this.curX;
        this.grid[i] = this.grid[i] ? 0 : 1;
      }
      this.version++; this.tui.requestRender();
    }
    // Place patterns with number keys
    const patKeys: Record<string, string> = { "1": "glider", "2": "pulsar", "3": "gosper", "4": "acorn", "5": "rpentomino", "6": "spaceship" };
    if (patKeys[data]) {
      placePattern(this.grid, this.w, this.h, PATTERNS[patKeys[data]], this.curX, this.curY);
      this.version++; this.tui.requestRender();
    }
  }

  invalidate() {}

  render(width: number): string[] {
    const th = THEMES[this.theme];
    const lines: string[] = [];
    const dispW = Math.min(this.w, Math.floor((width - 4) / 2));
    const dispH = Math.min(this.h, 30);
    const totalW = dispW * 2;

    // Header
    lines.push(dim(` ╭${"─".repeat(totalW + 2)}╮`));
    const hdr = ` ${bold(green("LIFE"))} │ Gen ${yellow(String(this.gen))} │ Pop ${cyan(String(this.pop))} │ ${this.speed}ms │ ${dim(THEMES[this.theme].name)}${this.drawing ? ` │ ${bold("\x1b[33mDRAW\x1b[0m")}` : ""}`;
    const hVis = visibleWidth(hdr);
    lines.push(dim(" │") + hdr + " ".repeat(Math.max(0, totalW + 2 - hVis)) + dim("│"));
    lines.push(dim(` ├${"─".repeat(totalW + 2)}┤`));

    // Grid — use half blocks for 2x vertical resolution
    for (let row = 0; row < dispH; row += 2) {
      let line = "";
      for (let x = 0; x < dispW; x++) {
        const top = this.grid[row * this.w + x];
        const bot = (row + 1 < this.h) ? this.grid[(row + 1) * this.w + x] : 0;
        const wasTop = this.prev[row * this.w + x];
        const wasBot = (row + 1 < this.h) ? this.prev[(row + 1) * this.w + x] : 0;

        // Cursor in draw mode
        if (this.drawing && x === this.curX && (row === this.curY || row + 1 === this.curY)) {
          line += `\x1b[7m\x1b[${th.alive}m▐▌${RST}`;
          continue;
        }

        if (top && bot) {
          const born = !wasTop || !wasBot;
          line += `\x1b[${born ? th.born : th.alive}m██${RST}`;
        } else if (top) {
          const born = !wasTop;
          line += `\x1b[${born ? th.born : th.alive}m▀▀${RST}`;
        } else if (bot) {
          const born = !wasBot;
          line += `\x1b[${born ? th.born : th.alive}m▄▄${RST}`;
        } else if (wasTop || wasBot) {
          line += `\x1b[${th.dying}m░░${RST}`;
        } else {
          line += `\x1b[${th.bg}m· ${RST}`;
        }
      }
      lines.push(dim(" │ ") + line + dim(" │"));
    }

    // Footer
    lines.push(dim(` ├${"─".repeat(totalW + 2)}┤`));
    const footer = this.drawing
      ? `${bold("DRAW:")} ←→↑↓ move  X=toggle  1-6=patterns  D=exit draw`
      : `SPACE=pause  N=step  +-=speed  R=rand  C=clear  D=draw  T=theme  Q=quit`;
    const fVis = visibleWidth(footer);
    lines.push(dim(" │") + ` ${footer}` + " ".repeat(Math.max(0, totalW + 1 - fVis)) + dim("│"));
    lines.push(dim(` ╰${"─".repeat(totalW + 2)}╯`));

    return lines.map(l => l + " ".repeat(Math.max(0, width - visibleWidth(l))));
  }

  dispose() { if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

// ─── EXTENSION ───────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  pi.registerCommand("life", {
    description: [
      "Conway's Game of Life. /life [pattern]",
      "Patterns: random glider pulsar gosper acorn rpentomino spaceship",
      "Controls: SPACE=pause N=step D=draw +-=speed R=random C=clear T=theme",
      "Draw mode: arrows + X to toggle cells, 1-6 to stamp patterns",
    ].join("\n"),
    handler: async (args, ctx) => {
      if (!ctx.hasUI) { ctx.ui.notify("Life requires interactive mode", "error"); return; }
      const pattern = (args || "").trim().toLowerCase() || "random";
      await ctx.ui.custom((tui: any, _t: any, _k: any, done: (v: undefined) => void) => new LifeComponent(tui, done, pattern));
    },
  });
}
