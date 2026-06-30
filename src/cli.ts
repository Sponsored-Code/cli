// `scode` — onboarding + control CLI.

import { resolve, join } from "node:path";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import updateNotifier from "update-notifier";
import {
  register as apiRegister,
  saveCredential,
  hasCredential,
  readCredential,
  getMe,
  mintWebTicket,
  readOnchain,
  type Me,
  type Level,
  webBase,
  openBrowser,
  isValidEvmAddress,
  setSpinnerVerbs,
  clearSpinnerVerbs,
  setStatusLine,
  clearStatusLine,
  settingsStatus,
  adSpinnerVerbs,
  recordManaged,
  clearManaged,
  checkIntegrity,
  renderStatusLine,
  renderDemoStatusLine,
  redactSession,
  shortAddr,
  accountBootstrap,
  campaignCreate,
  campaignStats,
  campaignStatus,
  saveSession,
  readSession,
  clearSession,
  browserLogin,
  classifyInstall,
  isEntrypoint,
} from "@sponsored-code/core";
import * as ui from "./ui";
import { select } from "./select";

// Color helpers routed through the ui kit to share the brand palette.
const C = { reset: "", dim: "dim", bold: "bold", green: "green", red: "red", cyan: "brand", amber: "amber" } as const;
const c = (key: string, s: string): string =>
  key === "dim" ? ui.dim(s)
  : key === "bold" ? ui.bold(s)
  : key === "green" ? ui.green(s)
  : key === "red" ? ui.red(s)
  : key === "brand" ? ui.brand(s)
  : key === "amber" ? ui.amber(s)
  : s;

function parseFlags(args: string[]): { wallet?: string; activate: boolean } {
  let wallet: string | undefined;
  let activate = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--wallet" || a === "-w") wallet = args[++i];
    else if (a === "--activate" || a === "-a") activate = true;
    else if (a.startsWith("0x")) wallet = a;
  }
  return { wallet, activate };
}

/** Absolute path to a globally-installed @sponsored-code/cli, or null. Memoized; `force` recomputes. */
let memoGlobalCli: string | null | undefined;
function globalCliPath(force = false): string | null {
  if (!force && memoGlobalCli !== undefined) return memoGlobalCli;
  let root = "";
  try {
    const out = spawnSync("npm root -g", { shell: true, encoding: "utf8", timeout: 15_000, windowsHide: true }).stdout;
    root = out?.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop() ?? "";
  } catch { /* npm missing or timed out → no durable global path */ }
  const p = root ? join(root, "@sponsored-code", "cli", "dist", "cli.js") : "";
  return (memoGlobalCli = p && existsSync(p) ? p : null);
}

// Forward-slashed and quoted so it holds up across cmd.exe, sh, or a direct spawn on any platform.
function statusLineCommand(): string {
  const quote = (s: string) => `"${s.replace(/\\/g, "/")}"`;
  const entry = globalCliPath() ?? resolve(process.argv[1] ?? "");
  return `${quote(process.execPath)} ${quote(entry)} statusline`;
}

/** Ensure a durable global install exists so the statusLine command's baked path can't vanish. Returns
 *  true to proceed; false only when the global install couldn't be set up. */
function ensureGlobalInstall(): boolean {
  if (process.env.SCODE_ALLOW_NONGLOBAL === "1") return true;
  if (classifyInstall(process.argv[1] ?? "").global) return true;
  if (globalCliPath()) return true;

  console.log(`\n  ${c(C.cyan, "Setting up Sponsored Code")} ${c(C.dim, "— installing globally so it stays put on your PATH")}\n`);
  const inst = spawnSync("npm install -g @sponsored-code/cli", { stdio: "inherit", shell: true, windowsHide: true });
  if (inst.status !== 0 || !globalCliPath(true)) {
    console.error(`
  ${c(C.red, "✗ couldn't install globally")} ${c(C.dim, `(npm exited ${inst.status ?? "?"})`)}

   Install it yourself, then re-run ${c(C.bold, "scode start")}:

     ${c(C.bold, "npm i -g @sponsored-code/cli")}   ${c(C.dim, "(prefix with sudo if your global dir is root-owned)")}

   ${c(C.dim, "already global but misdetected? set SCODE_ALLOW_NONGLOBAL=1 to skip this step.")}
`);
    process.exitCode = 1;
    return false;
  }
  return true;
}

/** Set the spinner verbs + the statusLine command. */
function activateAds(): number {
  const verbs = adSpinnerVerbs();
  setSpinnerVerbs(verbs, "replace");
  recordManaged(verbs);
  setStatusLine(statusLineCommand());
  return verbs.length;
}

/** Resolve a payout wallet: from --wallet / a bare 0x… arg, else interactively prompt (TTY only). */
async function resolveWallet(args: string[]): Promise<string | null> {
  const { wallet } = parseFlags(args);
  if (wallet) {
    if (isValidEvmAddress(wallet)) return wallet;
    console.error(c(C.red, "✗ that's not a valid wallet — need a 0x… Polygon address (40 hex chars)"));
    return null;
  }
  return promptWallet();
}

/** Ask for the payout wallet on the terminal. Re-prompts on bad input; bails on non-TTY/EOF. */
async function promptWallet(): Promise<string | null> {
  if (!process.stdin.isTTY) {
    console.error(c(C.red, "✗ no wallet given. Re-run with --wallet 0xYourPolygonAddress"));
    return null;
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (let i = 0; i < 3; i++) {
      const ans = (await rl.question(`\n  ${c(C.cyan, "Polygon wallet for USDC payouts")}\n  ${c(C.dim, "›")} `)).trim();
      if (isValidEvmAddress(ans)) return ans;
      console.error(c(C.red, `  ✗ not a valid 0x… address${i < 2 ? " — try again" : ""}`));
    }
    return null;
  } catch {
    return null; // Ctrl+D / EOF at the prompt → cancel, never crash
  } finally {
    rl.close();
  }
}

/** A yes/no prompt. Non-TTY → returns the default, so a piped/CI run never blocks. */
async function confirm(message: string, def = true): Promise<boolean> {
  if (!process.stdin.isTTY) return def;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const ans = (await rl.question(`${message} ${c(C.dim, def ? "[Y/n]" : "[y/N]")} `)).trim().toLowerCase();
    return ans ? ans === "y" || ans === "yes" : def;
  } catch {
    return false; // Ctrl+D / EOF at the prompt → treat as "no", never crash
  } finally {
    rl.close();
  }
}

function levelValue(level: Level): string {
  if (level === "verified-dev") return ui.okGlyph(ui.bold("verified-dev"));
  if (level === "authenticated") return ui.green("authenticated");
  return ui.dim("anonymous");
}

function eligibilityCallout(level: Level | undefined): void {
  if (level === "verified-dev") return;
  ui.funnel(level ?? "anonymous");
  ui.blank();
}

type AccountState =
  | { kind: "ok"; me: Me } // this machine's token resolves to an account
  | { kind: "unknown" } // reached, but the token isn't recognized (orphaned)
  | { kind: "offline" } // couldn't reach the network
  | { kind: "none" }; // no token stored on this machine

/** Resolve this machine's account into the four states the UI must treat differently. Bounded so a
 *  hung request can't stall an interactive command. */
async function accountState(): Promise<AccountState> {
  if (!hasCredential()) return { kind: "none" };
  const token = readCredential();
  if (!token) return { kind: "none" };
  try {
    const me = await Promise.race([
      getMe(token),
      new Promise<never>((_, reject) => { const t = setTimeout(() => reject(new Error("timeout")), 4000); t.unref?.(); }),
    ]);
    return me && !("error" in me) ? { kind: "ok", me } : { kind: "unknown" };
  } catch {
    return { kind: "offline" };
  }
}

/** Ensure this machine is linked to a recognized account, healing in place when it isn't: on an
 *  orphaned/missing token, offer to (re-)link right here (confirm → wallet prompt → register). Returns
 *  the live account, or null if we couldn't link (offline, declined, or non-TTY). */
async function ensureLinked(why: string): Promise<Me | null> {
  const st = await accountState();
  if (st.kind === "ok") return st.me;
  if (st.kind === "offline") {
    console.error(`\n  ${c(C.red, "✗ Can't reach Sponsored Code right now.")} ${c(C.dim, "Check your connection and try again.")}\n`);
    return null;
  }
  ui.blank();
  ui.warn(st.kind === "unknown" ? "The wallet linked here isn't recognized anymore." : "No wallet linked yet.");
  console.log(`  ${c(C.dim, why)}`);
  if (!process.stdin.isTTY) {
    console.error(`  ${c(C.dim, "Re-run with")} ${c(C.bold, "scode start --wallet 0xYourPolygonAddress")}\n`);
    return null;
  }
  if (!(await confirm(`  ${c(C.cyan, "Link a wallet now?")}`))) {
    console.log(`  ${c(C.dim, "No problem — do it anytime with")} ${c(C.bold, "scode start")}.\n`);
    return null;
  }
  const wallet = await promptWallet();
  if (!wallet) return null;
  const res = await apiRegister(wallet).catch(() => null);
  if (!res?.token) {
    console.error(`  ${c(C.red, "✗ Couldn't link your wallet right now.")} ${c(C.dim, "Try again in a moment.")}\n`);
    return null;
  }
  saveCredential(res.token);
  console.log(`  ${c(C.green, "✓ linked")} ${shortAddr(wallet)} ${c(C.dim, "— USDC payouts go here")}\n`);
  const after = await accountState();
  return after.kind === "ok"
    ? after.me
    : { wallet: wallet.toLowerCase(), accruedMicros: 0, claimedMicros: 0, claimableMicros: 0, accruedUsdc: 0, claimableUsdc: 0, verified: false, level: "anonymous", badges: [], email: null, githubLogin: null, providers: { google: false, github: false }, githubs: 0 };
}

/** Register the account, store the encrypted token, and optionally turn the slot on. */
async function doRegister(wallet: string, activate: boolean): Promise<void> {
  try {
    const res = await apiRegister(wallet);
    if (!res?.token) {
      ui.fail("Couldn't set up your account right now — check your connection and try again.");
      process.exitCode = 1;
      return;
    }
    saveCredential(res.token);
    if (activate) {
      activateAds();
      ui.head();
      ui.success("You're earning.");
      ui.blank();
      ui.rows([
        ["wallet", `${wallet}  ${ui.dim("→ USDC payouts")}`],
        ["earning", `on  ${ui.dim("· your sponsor word, on Claude's spinner + statusline")}`],
      ]);
      ui.blank();
      eligibilityCallout("anonymous");
      ui.note(`${ui.dim("pause anytime:")}  ${ui.bold("scode off")}`);
      ui.blank();
      return;
    }
    ui.head();
    ui.success("Account created.");
    ui.blank();
    ui.rows([
      ["wallet", `${wallet}  ${ui.dim("→ USDC payouts")}`],
      ["credential", ui.dim("encrypted in ~/.scode")],
    ]);
    ui.blank();
    ui.note(`${ui.dim("turn on:")}  ${ui.bold("scode start")}`);
    ui.blank();
  } catch {
    ui.fail("Couldn't reach Sponsored Code — check your connection and try again.");
    process.exitCode = 1;
  }
}

// `scode start` — register if needed (prompting for a wallet), then start earning; resumes if set up.
async function start(args: string[]): Promise<void> {
  if (!ensureGlobalInstall()) return;
  const { wallet: flagWallet } = parseFlags(args);
  if (hasCredential() && !flagWallet) {
    await on();
    return;
  }
  const wallet = await resolveWallet(args);
  if (!wallet) {
    process.exitCode = 1;
    return;
  }
  await doRegister(wallet, true);
}

// `scode register` — create the account (optionally --activate). Prompts for the wallet if not given.
async function register(args: string[]): Promise<void> {
  const { activate } = parseFlags(args);
  if (activate && !ensureGlobalInstall()) return;
  const wallet = await resolveWallet(args);
  if (!wallet) {
    process.exitCode = 1;
    return;
  }
  await doRegister(wallet, activate);
}

async function on(): Promise<void> {
  if (!ensureGlobalInstall()) return;
  // Never start earning until a wallet is linked here; offer to fix it if this machine isn't linked.
  const me = await ensureLinked("Link a wallet to start earning USDC for your sponsor word.");
  if (!me) {
    process.exitCode = 1;
    return;
  }
  activateAds();
  ui.head();
  ui.success("You're earning.");
  ui.blank();
  ui.rows([
    ["wallet", `${shortAddr(me.wallet)}  ${ui.dim("→ USDC payouts")}`],
    ["earning", `on  ${ui.dim("· your sponsor word, on Claude's spinner + statusline")}`],
  ]);
  ui.blank();
  eligibilityCallout(me.level);
  ui.note(`${ui.dim("pause anytime:")}  ${ui.bold("scode off")}`);
  ui.blank();
}

function off(): void {
  clearSpinnerVerbs();
  clearStatusLine();
  clearManaged();
  console.log(`\n  ${ui.amber("⏸ paused")} ${ui.dim("— stock Claude Code restored. re-enable:")} ${ui.bold("scode on")}\n`);
}

async function status(): Promise<void> {
  const s = settingsStatus();
  const integ = checkIntegrity();
  // Resolve over the network — the on-disk token can be stale.
  const st = await accountState();

  const earned = st.kind === "ok"
    ? `${ui.bold("$" + (st.me.accruedUsdc < 1 ? st.me.accruedUsdc.toFixed(4) : st.me.accruedUsdc.toFixed(2)))} ${ui.dim("USDC")}`
    : ui.dim("—");
  ui.head("Account");
  ui.rows([
    ["wallet", st.kind === "ok" ? shortAddr(st.me.wallet) : ui.dim("—")],
    ["earned", earned],
    ["level", st.kind === "ok" ? levelValue(st.me.level) : ui.dim("—")],
    ["earning", s.spinnerVerbs || s.statusLine ? ui.okGlyph("on") : ui.dim("off")],
  ]);
  ui.blank();

  // Quiet when healthy — surface a line only when there's something to act on.
  if (st.kind === "offline") { ui.note(ui.dim("offline — couldn't reach Sponsored Code")); return; }
  if (!integ.ok) ui.warn(`Claude Code settings changed — run ${ui.bold("scode on")} to restore.`);

  if (st.kind === "ok") {
    eligibilityCallout(st.me.level);
  } else {
    await ensureLinked(st.kind === "unknown" ? "Relink your wallet to keep earning." : "Link a wallet to start earning.");
  }
}

// Build a CLI→browser URL; the verifier lives in the fragment (never sent to a server). Falls back to the bare page.
async function earnerWebUrl(path: string, token: string | null): Promise<string> {
  if (!token) return `${webBase()}${path}`;
  try {
    const { ticket, verifier } = await mintWebTicket(token);
    return `${webBase()}${path}?ticket=${encodeURIComponent(ticket)}#v=${encodeURIComponent(verifier)}`;
  } catch {
    return `${webBase()}${path}`;
  }
}

// `scode earnings` — your USDC earnings in the terminal; connected earners also get the web view.
async function earningsCmd(): Promise<void> {
  const me = await ensureLinked("See your USDC earnings once a wallet is linked.");
  if (!me) {
    process.exitCode = 1;
    return;
  }
  ui.head("Earnings");
  ui.rows([
    ["wallet", shortAddr(me.wallet)],
    ["lifetime", `${ui.bold("$" + me.accruedUsdc.toFixed(4))} ${ui.dim("USDC earned")}`],
    ["claimable", `${ui.bold("$" + me.claimableUsdc.toFixed(4))} ${ui.dim("USDC against the live root")}`],
  ]);
  ui.blank();

  // Anonymous → the terminal is the surface; no browser dashboard to open.
  if (me.level === "anonymous") {
    ui.note(`${ui.dim("sign in for more —")} ${ui.brand("scode login")}`);
    ui.blank();
    return;
  }

  // Connected → open the web dashboard.
  const token = readCredential();
  const url = await earnerWebUrl("/earnings/me", token);
  ui.note(`${ui.dim("over time:")}  ${ui.brand(url)}`);
  ui.blank();
  openBrowser(url);
}

// `scode wallet [0x…]` — reads USDC balance + claimed from Polygon for any wallet (yours if omitted).
async function walletCmd(args: string[]): Promise<void> {
  const argWallet = args.find((a) => isValidEvmAddress(a))?.toLowerCase();
  let wallet = argWallet;
  let me: Me | null = null;

  if (wallet) {
    const st = await accountState();
    if (st.kind === "ok" && st.me.wallet.toLowerCase() === wallet) me = st.me;
  } else {
    me = await ensureLinked("Pass a wallet (scode wallet 0x…), or link one to inspect yours.");
    if (!me) {
      process.exitCode = 1;
      return;
    }
    wallet = me.wallet.toLowerCase();
  }

  const onchain = await readOnchain(wallet);
  const usd = (m: bigint | null | undefined) => (m == null ? ui.dim("—") : ui.bold("$" + (Number(m) / 1e6).toFixed(4)));

  const r: Array<[string, string]> = [];
  if (me) {
    r.push(["earned", `${ui.bold("$" + me.accruedUsdc.toFixed(4))} ${ui.dim("lifetime (off-chain ledger)")}`]);
    r.push(["claimable", `${ui.bold("$" + me.claimableUsdc.toFixed(4))} ${ui.dim("against the live root")}`]);
  }
  r.push(["claimed", `${usd(onchain?.claimedMicros)} ${ui.dim("pulled on-chain")}`]);
  r.push(["balance", `${usd(onchain?.balanceMicros)} ${ui.dim("USDC in this wallet now")}`]);

  ui.head(`Wallet ${shortAddr(wallet)}`);
  ui.rows(r);
  ui.blank();
  if (onchain?.explorer) ui.note(ui.brand(`${onchain.explorer}/address/${wallet}`));
  if (!onchain) ui.warn(ui.dim("on-chain read unavailable (no Polygon RPC reachable) — showing the ledger only"));
  ui.blank();
}

// Read Claude Code's statusLine stdin JSON; the caller keeps only redacted signals.
async function readStdinJson(): Promise<unknown> {
  if (process.stdin.isTTY) return {};
  try {
    const chunks: Buffer[] = [];
    for await (const c of process.stdin) chunks.push(c as Buffer);
    return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
  } catch {
    return {};
  }
}

async function statusline(): Promise<void> {
  if (process.argv.includes("--demo")) {
    process.stdout.write(renderDemoStatusLine());
    return;
  }
  const ctx = redactSession(await readStdinJson());
  process.stdout.write(await renderStatusLine(ctx));
}

function opts(args: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) continue;
    const v = args[i + 1];
    if (v !== undefined && !v.startsWith("--")) {
      o[a.slice(2)] = v;
      i++;
    } else o[a.slice(2)] = "true";
  }
  return o;
}

function resolveTeam<T extends { id: string; slug: string; name: string; type: string }>(teams: T[], sel?: string): T | undefined {
  if (!sel) return teams.find((t) => t.type === "personal") ?? teams[0];
  const s = sel.toLowerCase();
  return teams.find((t) => t.id === sel || t.slug.toLowerCase() === s || t.name.toLowerCase() === s);
}

function sessionToken(): string | null {
  const token = readSession();
  if (!token) {
    console.error(c(C.red, "✗ not signed in. Run: scode login"));
    process.exitCode = 1;
    return null;
  }
  return token;
}

async function campaignCreateCmd(args: string[]): Promise<void> {
  const token = sessionToken();
  if (!token) return;
  const o = opts(args);
  if (!o.brand || !o.tagline || !o.url) {
    console.error(c(C.red, "✗ need --brand, --tagline, --url") + c(C.dim, "   [--bid 20 --budget 500 --color #10b981 --country US,DE --team <name>]"));
    process.exitCode = 1;
    return;
  }
  const boot = await accountBootstrap(token);
  if (!boot?.user) {
    clearSession();
    console.error(c(C.red, "✗ session expired — sign in again"));
    process.exitCode = 1;
    return;
  }
  const team = resolveTeam(boot.teams, o.team);
  if (!team) {
    console.error(c(C.red, `✗ team not found: ${o.team}`));
    process.exitCode = 1;
    return;
  }
  if (team.role !== "admin") {
    console.error(c(C.red, "✗ only team admins can create campaigns"));
    process.exitCode = 1;
    return;
  }
  const bid = Number(o.bid ?? 20);
  const budget = Number(o.budget ?? 500);
  const color = o.color || "#10b981";
  // --country US,DE (comma/space separated). Empty = everywhere.
  const countries = (o.country ?? o.countries ?? "").split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));
  const res = await campaignCreate(token, { teamId: team.id, brand: o.brand, tagline: o.tagline, url: o.url, color, bidUsdCpm: bid, budgetUsd: budget, targetCountries: countries });
  if (!("campaign" in res)) {
    console.error(c(C.red, `✗ couldn't create campaign${"error" in res ? ` (${res.error})` : ""}`));
    process.exitCode = 1;
    return;
  }
  const cmp = res.campaign;
  console.log(`
  ${c(C.green, "✓ campaign live")}  ${c(C.dim, "in team " + team.name)}

   ${c(C.bold, cmp.brand)} ${c(C.dim, "· " + cmp.tagline + " ↗")}
   ${c(C.dim, "bid    ")} $${bid}/1k     ${c(C.dim, "budget")} $${budget} USDC
   ${c(C.dim, "geo    ")} ${cmp.targetCountries.length ? cmp.targetCountries.join(", ") : "everywhere"}
   ${c(C.dim, "id     ")} ${cmp.id}

   Track it: ${c(C.bold, "scode campaign stats" + (o.team ? ` --team ${o.team}` : ""))}
`);
}

async function campaignStatsCmd(args: string[]): Promise<void> {
  const token = sessionToken();
  if (!token) return;
  const o = opts(args);
  const boot = await accountBootstrap(token);
  if (!boot?.user) {
    clearSession();
    console.error(c(C.red, "✗ session expired — sign in again"));
    process.exitCode = 1;
    return;
  }
  const team = resolveTeam(boot.teams, o.team);
  if (!team) {
    console.error(c(C.red, `✗ team not found: ${o.team}`));
    process.exitCode = 1;
    return;
  }
  const a = await campaignStats(token, team.id);
  const t = a.totals;
  const top = a.geo.slice(0, 5).map((g) => `${g.country} ${c(C.dim, String(g.impressions))}`).join("   ") || c(C.dim, "—");
  console.log(`
  ${c(C.bold, team.name)} ${c(C.dim, `· ${team.slug} · analytics`)}

   ${c(C.dim, "impressions")} ${t.impressions.toLocaleString()}     ${c(C.dim, "spend")} $${t.spendUsd.toFixed(4)}     ${c(C.dim, "reach")} ${t.reach.toLocaleString()}
   ${c(C.dim, "clicks     ")} ${t.clicks.toLocaleString()} ${c(C.dim, `(${(t.ctr * 100).toFixed(1)}% CTR)`)}     ${c(C.dim, "avg CPM")} $${t.avgCpm.toFixed(2)}     ${c(C.dim, "active")} ${t.activeCampaigns}
   ${c(C.dim, "top geo    ")} ${top}`);
  if (a.campaigns.length) {
    console.log(`\n   ${c(C.dim, "campaigns")}`);
    for (const cmp of a.campaigns) {
      console.log(`     ${cmp.status === "active" ? c(C.green, "●") : c(C.dim, "○")} ${c(C.dim, cmp.id)}  ${cmp.brand.padEnd(16)} ${String(cmp.impressions).padStart(6)} impr   ${String(cmp.clicks).padStart(4)} clk   $${cmp.spendUsd.toFixed(4)}`);
    }
  }
  console.log("");
}

async function whoamiCmd(): Promise<void> {
  const token = sessionToken();
  if (!token) return;
  const boot = await accountBootstrap(token);
  if (!boot?.user) {
    clearSession();
    console.error(c(C.red, "✗ session expired — sign in again"));
    process.exitCode = 1;
    return;
  }
  console.log(`\n   ${c(C.dim, "wallet")} ${shortAddr(boot.user.wallet)}\n\n   ${c(C.dim, "teams")} ${c(C.dim, "— pass the slug to --team")}`);
  for (const t of boot.teams) {
    const meta = `${t.type === "personal" ? "personal" : t.role} · ${t.campaigns.length} campaign(s)`;
    console.log(`     ${c(C.bold, t.slug.padEnd(16))} ${c(C.dim, `${t.name} · ${meta}`)}`);
    for (const cmp of t.campaigns) {
      const dot = cmp.status === "active" ? c(C.green, "●") : c(C.dim, "○");
      console.log(`        ${dot} ${cmp.brand.padEnd(16)} ${c(C.dim, `${cmp.status.padEnd(7)}${cmp.id}`)}`);
    }
  }
  console.log(`\n   ${c(C.dim, "stats:")} ${c(C.bold, "scode campaign stats --team <slug>")}   ${c(C.dim, "list:")} ${c(C.bold, "scode campaign list")}\n`);
}

function logoutCmd(): void {
  clearSession();
  console.log(`\n  ${c(C.cyan, "signed out")} — session cleared.\n`);
}

function campaignHelp(): void {
  console.log(`
  ${c(C.bold, "scode campaign")} — create + track campaigns ${c(C.dim, "(sign in first: scode login)")}

   ${c(C.bold, "list")} [--team <slug>]          your campaigns — id · status · spend
   ${c(C.bold, "create")} --brand .. --tagline .. --url ..   create a campaign ${c(C.dim, "[--bid --budget --color --country US,DE --team <slug>]")}
   ${c(C.bold, "stats")} [--team <slug>]         impressions · spend · clicks · geo ${c(C.dim, "(team slugs: scode whoami)")}
   ${c(C.bold, "pause")} / ${c(C.bold, "resume")} <id>          pause or resume a campaign ${c(C.dim, "(ids: scode campaign list)")}
`);
}

// `scode campaign list` — your campaigns: id · status · spend. `--team <slug>` narrows to one team.
async function campaignListCmd(args: string[]): Promise<void> {
  const token = sessionToken();
  if (!token) return;
  const o = opts(args);
  const boot = await accountBootstrap(token);
  if (!boot?.user) {
    clearSession();
    console.error(c(C.red, "✗ session expired — sign in again"));
    process.exitCode = 1;
    return;
  }
  let teams = boot.teams;
  if (o.team) {
    const tm = resolveTeam(boot.teams, o.team);
    if (!tm) {
      console.error(c(C.red, `✗ team not found: ${o.team}`));
      process.exitCode = 1;
      return;
    }
    teams = [tm];
  }
  let any = false;
  for (const t of teams) {
    if (!t.campaigns.length) continue;
    any = true;
    console.log(`\n  ${c(C.bold, t.name)} ${c(C.dim, "· " + t.slug)}`);
    for (const cmp of t.campaigns) {
      const dot = cmp.status === "active" ? c(C.green, "●") : c(C.dim, "○");
      const geo = cmp.targetCountries.length ? cmp.targetCountries.join(",") : "everywhere";
      console.log(`     ${dot} ${c(C.dim, cmp.id)}  ${cmp.brand.padEnd(16)} ${c(C.dim, cmp.status.padEnd(6))} ${c(C.dim, `$${cmp.spentUsd.toFixed(2)}/${cmp.budgetUsd} · $${cmp.bidUsdCpm}/1k · ${geo}`)}`);
    }
  }
  console.log(any ? "" : `\n  ${c(C.dim, "no campaigns yet — create one: scode campaign create …")}\n`);
}

// Pause / resume a campaign by id (exact or unique prefix).
async function campaignStatusCmd(args: string[], status: "active" | "paused"): Promise<void> {
  const token = sessionToken();
  if (!token) return;
  const sel = args.find((a) => !a.startsWith("--"));
  if (!sel) {
    console.error(c(C.red, `✗ need a campaign id — see: ${c(C.bold, "scode campaign list")}`));
    process.exitCode = 1;
    return;
  }
  const boot = await accountBootstrap(token);
  if (!boot?.user) {
    clearSession();
    console.error(c(C.red, "✗ session expired — sign in again"));
    process.exitCode = 1;
    return;
  }
  const hits = boot.teams.flatMap((t) => t.campaigns.filter((cmp) => cmp.id === sel || cmp.id.startsWith(sel)).map((cmp) => ({ team: t, cmp })));
  const hit = hits.find((h) => h.cmp.id === sel) ?? (hits.length === 1 ? hits[0] : undefined);
  if (!hit) {
    console.error(c(C.red, hits.length > 1 ? `✗ ambiguous id "${sel}" — use the full id (scode campaign list)` : `✗ campaign not found: ${sel}`));
    process.exitCode = 1;
    return;
  }
  if (hit.team.role !== "admin") {
    console.error(c(C.red, "✗ only team admins can change campaign status"));
    process.exitCode = 1;
    return;
  }
  const res = await campaignStatus(token, { teamId: hit.team.id, campaignId: hit.cmp.id, status });
  if (!("campaign" in res)) {
    console.error(c(C.red, `✗ couldn't update${"error" in res ? ` (${res.error})` : ""}`));
    process.exitCode = 1;
    return;
  }
  console.log(`\n  ${status === "active" ? c(C.green, "✓ resumed") : c(C.amber, "⏸ paused")}  ${c(C.bold, res.campaign.brand)} ${c(C.dim, res.campaign.id)}\n`);
}

async function campaign(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case "list": return campaignListCmd(rest);
    case "create": return campaignCreateCmd(rest);
    case "stats": return campaignStatsCmd(rest);
    case "pause": return campaignStatusCmd(rest, "paused");
    case "resume": return campaignStatusCmd(rest, "active");
    default: return campaignHelp();
  }
}

// `scode login` — sign in with Google in the browser, linking this terminal to your account.
async function loginCmd(): Promise<void> {
  try {
    // Pass this terminal's account token so one sign-in also links it to the account.
    const { token } = await browserLogin({ accountToken: readCredential() ?? undefined });
    saveSession(token);
    console.log(`\n  ${c(C.green, "✓ signed in")} ${c(C.dim, "— via browser")}\n`);
  } catch (e) {
    console.error(c(C.red, `✗ ${(e as Error).message}`));
    process.exitCode = 1;
  }
}

// `scode account` — your account; connected earners open the web view, anonymous see it here.
async function accountCmd(): Promise<void> {
  const me = await ensureLinked("Sign in to see your account — link a wallet first.");
  if (!me) {
    process.exitCode = 1;
    return;
  }
  const token = readCredential();
  if (!token) {
    ui.fail("no wallet linked yet — run scode start");
    process.exitCode = 1;
    return;
  }
  ui.head("Account");
  ui.rows([
    ["level", levelValue(me.level)],
    ["wallet", `${shortAddr(me.wallet)}  ${ui.dim("→ USDC payouts")}`],
  ]);
  ui.blank();

  // Anonymous → the terminal account; no browser dashboard to open.
  if (me.level === "anonymous") {
    eligibilityCallout("anonymous");
    return;
  }

  const url = await earnerWebUrl("/earnings/me", token);
  ui.note(`${ui.dim("all your wallets + GitHub:")}  ${ui.brand(url)}`);
  ui.blank();
  openBrowser(url);
}

function help(): void {
  ui.banner();
  ui.section("Earn");
  ui.commands([
    ["scode start", "link a wallet + start earning"],
    ["scode on / off", "pause / resume earning"],
    ["scode status", "account + earning status"],
    ["scode earnings", "your USDC earned + the web chart"],
    ["scode account", "your wallets + GitHub — opens the web view"],
    ["scode wallet [0x…]", "on-chain balance + claimed (yours if omitted)"],
  ]);
  ui.blank();
  ui.section("Account");
  ui.commands([
    ["scode login", "sign in with Google (browser)"],
    ["scode whoami", "wallet + your teams"],
    ["scode logout", "sign out"],
  ]);
  ui.blank();
  ui.section("Campaigns");
  ui.commands([
    ["scode campaigns", "list — id · status · spend"],
    ["scode campaign create …", "launch a campaign"],
    ["scode campaign stats", "impressions · spend · clicks · geo"],
    ["scode campaign pause / resume <id>", "toggle a campaign"],
  ]);
  ui.blank();
  ui.note(ui.dim("sponsoredcode.com"));
  ui.blank();
}

// Bare `scode` in a terminal → an interactive picker; each pick runs its command.
async function menu(): Promise<void> {
  ui.banner();
  const run = await select<() => Promise<void> | void>("What do you want to do?", [
    { group: "Earn", label: "Start earning", value: () => start([]) },
    { group: "Earn", label: "Pause earning", value: off },
    { group: "Earn", label: "Resume earning", value: on },
    { group: "Earn", label: "Status — account + earning", value: status },
    { group: "Earn", label: "Earnings — your USDC + the chart", value: earningsCmd },
    { group: "Earn", label: "Account — your wallets + GitHub", value: accountCmd },
    { group: "Account", label: "Sign in with Google", value: loginCmd },
    { group: "Account", label: "Who am I — wallet + teams", value: whoamiCmd },
    { group: "Account", label: "Sign out", value: logoutCmd },
    { group: "Campaigns", label: "Your campaigns", value: () => campaignListCmd([]) },
  ]);
  await run();
}

declare const __PKG_VERSION__: string; // baked at build (build.ts)

export async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  // Nudge if a newer scode is published; skip the machine-read paths and the launcher.
  if (cmd !== "statusline" && cmd !== "mcp" && !process.env.SCODE_VIA_LAUNCHER) {
    try { updateNotifier({ pkg: { name: "@sponsored-code/cli", version: __PKG_VERSION__ } }).notify(); } catch { /* never block the CLI on the version check */ }
  }
  switch (cmd) {
    case "start": return start(rest);
    case "register": return register(rest);
    case "on": return on();
    case "off": return off();
    case "status": return status();
    case "earnings": return earningsCmd();
    case "account": return accountCmd();
    case "wallet": return walletCmd(rest);
    case "statusline": return statusline();
    case "login": return loginCmd();
    case "logout": return logoutCmd();
    case "whoami": case "teams": return whoamiCmd();
    case "campaigns": return campaignListCmd(rest);
    case "campaign": return campaign(rest);
    case "mcp": { const { runMcpServer } = await import("@sponsored-code/core/mcp"); return runMcpServer(); }
    case "help": case "--help": case "-h": return help();
    // Bare `scode` in a TTY → the interactive picker; piped → the help dump.
    default: return process.stdin.isTTY ? menu() : help();
  }
}

// Run main() only when this file is the program Node launched (robust to symlinks/.cmd shims).
if (isEntrypoint(process.argv[1], import.meta.url)) void main(process.argv.slice(2));
