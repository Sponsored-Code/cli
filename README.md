<p align="center">
  <a href="https://sponsoredcode.com"><img src="https://sponsoredcode.com/mascot/connect.webp" alt="Sponsored Code — CLI" width="300" /></a>
</p>

# [<img src="https://sponsoredcode.com/sponsored-code-mark.svg" alt="Sponsored Code" />](https://sponsoredcode.com)

[![npm](https://img.shields.io/npm/v/sponsored-code?color=cb3837&logo=npm)](https://www.npmjs.com/package/sponsored-code)
[![downloads](https://img.shields.io/npm/dm/sponsored-code?color=cb3837)](https://www.npmjs.com/package/sponsored-code)
[![license](https://img.shields.io/badge/license-source--available-blue)](./LICENSE)
[![sponsoredcode.com](https://img.shields.io/badge/web-sponsoredcode.com-111)](https://sponsoredcode.com)

## CLI

Get paid in USDC for the status-line slot Claude Code already shows while it works.

`scode` shows one small, clearly-labeled ad in the Claude Code terminal UI and pays you in USDC to a
Polygon wallet you connect. It's also the brand side: launch campaigns and read their analytics
straight from the terminal. Everything below runs on your machine.

## Install

```bash
npm install -g sponsored-code
scode start
```

Or in one line — `npx sponsored-code start` installs globally on first run, then runs `start` for you:

```bash
npx sponsored-code start
```

`scode start` prompts for a Polygon wallet for USDC payouts (or pass `--wallet 0x…`), registers an
account, and turns the slot on.

The CLI installs two interchangeable commands — **`scode`** (short) and **`sponsored-code`**. The
examples below use `scode`; use `sponsored-code` anywhere if `scode` is already taken on your system.

## Commands

Run `scode help` (or `scode`, `scode --help`) any time for the full list.

#### Earn

| command | what it does |
|---|---|
| `scode start` | Register and turn the ad slot on — prompts for your payout wallet (or `--wallet 0x…`). |
| `scode register` | Create an account only, without turning the slot on. |
| `scode on` / `scode off` | Resume or pause the slot. `off` restores stock Claude Code instantly. |
| `scode status` | Your account, integrity check, and current slot state. |
| `scode earnings` | USDC earned and earnings over time — opens the web view. |
| `scode statusline` | Render the ad row (Claude Code calls this itself). Add `--demo` to preview it with no account. |

#### Account

| command | what it does |
|---|---|
| `scode login` | Sign in with Google — opens the browser to link this terminal to your account. |
| `scode whoami` *(alias `teams`)* | Show your wallet and the teams you belong to (the slug is the `--team` selector). |
| `scode logout` | Sign out. |

#### Campaigns *(brand side — `scode campaign …`)*

| command | what it does |
|---|---|
| `scode campaigns` | List your campaigns — id · status · spend. |
| `scode campaign create` | Launch a campaign: brand, tagline, click-through URL, CPM bid, budget, and optional country targeting. |
| `scode campaign stats` | A campaign's performance — impressions · spend · clicks · geo. |
| `scode campaign pause` / `resume <id>` | Pause or resume a campaign (team admins only). |

#### Other

| command | what it does |
|---|---|
| `scode mcp` | Run an MCP server exposing the same account + campaign actions to Claude or any MCP client. For unattended automation, set `SCODE_WALLET_KEY` to sign in headlessly instead of the browser. |
| `scode help` | Show every command. |

## Privacy

It never reads your prompts, code, file paths, or transcript — none of that is touched or sent
anywhere. All it does locally is edit supported Claude Code settings, cleanly reverted by `scode off`.

## License

Source-available — see [LICENSE](./LICENSE).
