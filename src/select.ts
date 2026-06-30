import * as readline from "node:readline";

// Interactive arrow-key picker with grouped items; non-TTY falls back to a numbered prompt.
const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", brand: "\x1b[38;5;39m", green: "\x1b[32m" };

export type Choice<T> = { label: string; value: T; group?: string; hint?: string };

/** Show an interactive, grouped menu and resolve with the chosen value. Non-TTY → a numbered prompt. */
export async function select<T>(title: string, choices: Choice<T>[]): Promise<T> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return selectFallback(title, choices);

  return new Promise<T>((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;
    let index = 0;
    let lastLines = 0;

    const render = () => {
      stdout.write("\x1b[?25l");
      let lines = 0;
      stdout.write(`\n  ${C.bold}${title}${C.reset}\n`); lines += 2;
      let group: string | undefined | null = null; // null = before the first item
      choices.forEach((ch, i) => {
        if (ch.group !== group) {
          group = ch.group;
          if (group) { stdout.write(`\n  ${C.dim}${group}${C.reset}\n`); lines += 2; }
          else { stdout.write("\n"); lines += 1; }
        }
        const on = i === index;
        const prefix = on ? `${C.brand}›${C.reset} ` : "  ";
        const label = on ? `${C.bold}${ch.label}${C.reset}` : `${C.dim}${ch.label}${C.reset}`;
        const hint = on && ch.hint ? `  ${C.dim}${ch.hint}${C.reset}` : "";
        stdout.write(`    ${prefix}${label}${hint}\n`); lines += 1;
      });
      stdout.write(`\n  ${C.dim}↑↓ move · enter select · esc quit${C.reset}\n`); lines += 2;
      lastLines = lines;
    };

    const clear = () => {
      stdout.write(`\x1b[${lastLines}A`);
      for (let i = 0; i < lastLines; i++) stdout.write("\x1b[2K\n");
      stdout.write(`\x1b[${lastLines}A`);
    };

    const cleanup = () => {
      stdin.removeListener("data", onKey);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\x1b[?25h");
    };

    const onKey = (buf: Buffer) => {
      const k = buf.toString();
      if (k === "\x03" || k === "\x1b") { cleanup(); clear(); stdout.write("\n"); process.exit(0); }
      if (k === "\r" || k === "\n") {
        const chosen = choices[index]!;
        cleanup(); clear();
        stdout.write(`  ${C.green}›${C.reset} ${chosen.label}\n\n`);
        resolve(chosen.value);
        return;
      }
      if (k === "\x1b[A" || k === "k") { index = index > 0 ? index - 1 : choices.length - 1; clear(); render(); return; }
      if (k === "\x1b[B" || k === "j") { index = index < choices.length - 1 ? index + 1 : 0; clear(); render(); return; }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onKey);
    render();
  });
}

async function selectFallback<T>(title: string, choices: Choice<T>[]): Promise<T> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\n  ${C.bold}${title}${C.reset}`);
  let group: string | undefined | null = null;
  choices.forEach((ch, i) => {
    if (ch.group !== group) { group = ch.group; if (group) console.log(`\n  ${C.dim}${group}${C.reset}`); }
    console.log(`    ${C.dim}${String(i + 1).padStart(2)}.${C.reset} ${ch.label}`);
  });
  return new Promise<T>((resolve) => {
    rl.question(`\n  pick (1-${choices.length}): `, (ans) => {
      rl.close();
      const i = parseInt(ans.trim(), 10) - 1;
      resolve(choices[i >= 0 && i < choices.length ? i : 0]!.value);
    });
  });
}
