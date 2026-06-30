// Sponsored Code — the terminal UI kit. Strips to plain text under NO_COLOR or when piped.

declare const __PKG_VERSION__: string;
export const VERSION = typeof __PKG_VERSION__ !== "undefined" ? __PKG_VERSION__ : "dev";

const isTTY = !!process.stdout.isTTY;
const noColor = !!process.env.NO_COLOR || !isTTY;
const truecolor = /truecolor|24bit/i.test(process.env.COLORTERM ?? "");

type RGB = readonly [number, number, number];
const BRAND: RGB = [31, 111, 214];
const BRAND_HI: RGB = [42, 131, 226];
const BRAND_LO: RGB = [14, 75, 178];
const SLATE: RGB = [148, 163, 184];

const fg = (rgb: RGB): string => (noColor ? "" : truecolor ? `\x1b[38;2;${rgb[0]};${rgb[1]};${rgb[2]}m` : "\x1b[38;5;33m");
const bg = (rgb: RGB): string => (noColor ? "" : truecolor ? `\x1b[48;2;${rgb[0]};${rgb[1]};${rgb[2]}m` : "\x1b[48;5;25m");
const sgr = (code: string): string => (noColor ? "" : code);
const RESET = sgr("\x1b[0m");
const BOLD = sgr("\x1b[1m");
const DIM = sgr("\x1b[2m");
const WHITE = sgr("\x1b[97m");
const GREEN = sgr("\x1b[38;5;42m");
const RED = sgr("\x1b[38;5;203m");
const AMBER = sgr("\x1b[38;5;214m");

export const brand = (s: string): string => `${fg(BRAND)}${s}${RESET}`;
export const brandBold = (s: string): string => `${BOLD}${fg(BRAND)}${s}${RESET}`;
export const dim = (s: string): string => `${DIM}${s}${RESET}`;
export const bold = (s: string): string => `${BOLD}${s}${RESET}`;
export const green = (s: string): string => `${GREEN}${s}${RESET}`;
export const red = (s: string): string => `${RED}${s}${RESET}`;
export const amber = (s: string): string => `${AMBER}${s}${RESET}`;

// The brand icon as a small gradient-blue square; plain `■` with color off.
export const mark = (): string => (noColor ? "■" : `${bg(BRAND_HI)} ${bg(BRAND_LO)} ${RESET}`);
/** The wordmark: Sponsored (slate) Code (blue). */
export const wordmark = (): string => `${BOLD}${fg(SLATE)}Sponsored${RESET}${BOLD}${fg(BRAND)} Code${RESET}`;

const TAGLINE = "USDC for the thinking-word in Claude Code";

/** The full header — mark · wordmark · version, then a subtitle. For the home + help screens. */
export function banner(subtitle?: string): void {
  console.log(`\n  ${mark()}  ${wordmark()}  ${dim("·")}  ${dim("v" + VERSION)}`);
  console.log(`  ${dim(subtitle ?? TAGLINE)}\n`);
}

/** A compact one-line header for data commands — mark · wordmark · subtitle (no version/tagline). */
export function head(subtitle?: string): void {
  console.log(`\n  ${mark()}  ${wordmark()}${subtitle ? `   ${dim(subtitle)}` : ""}\n`);
}

export const okGlyph = (s: string): string => `${green("✔")} ${s}`;
export const badGlyph = (s: string): string => `${red("✖")} ${s}`;
export const warnGlyph = (s: string): string => `${amber("▲")} ${s}`;

export const success = (s: string): void => console.log(`  ${okGlyph(s)}`);
export const fail = (s: string): void => console.error(`  ${badGlyph(s)}`);
export const warn = (s: string): void => console.log(`  ${warnGlyph(s)}`);
/** A brand-bulleted hint/next-step line. */
export const note = (s: string): void => console.log(`  ${brand("›")} ${s}`);
export const blank = (): void => console.log();

/** A section heading (brand, bold) — groups a block of rows. */
export const section = (title: string): void => console.log(`  ${brandBold(title)}`);

/** Aligned label→value rows — the spine of status / wallet / earnings. */
export function rows(pairs: Array<[string, string]>): void {
  const w = Math.max(0, ...pairs.map(([k]) => k.length));
  for (const [k, v] of pairs) console.log(`  ${dim(k.padEnd(w))}   ${v}`);
}

/** A command-reference row: `cmd  —  description`, aligned. Used by help. */
export function commands(pairs: Array<[string, string]>): void {
  const w = Math.max(0, ...pairs.map(([k]) => k.length));
  for (const [cmd, desc] of pairs) console.log(`    ${bold(cmd.padEnd(w))}   ${dim(desc)}`);
}

export type FunnelLevel = "anonymous" | "authenticated" | "verified-dev";

/** One terse nudge line toward the next sign-in step; verified-dev sees nothing. */
export function funnel(current: FunnelLevel): void {
  if (current === "verified-dev") return;
  if (current === "anonymous") {
    note(`Reach more campaigns — ${bold("sign in")}: ${brand("scode login")}`);
  } else {
    note(`Become ${bold("verified-dev")} — connect GitHub: ${brand("scode earnings")}`);
  }
}
