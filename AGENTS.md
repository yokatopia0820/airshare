# AGENTS.md

## Source Basis

- Core format: https://agents.md/
- Practical safety and workflow baseline: https://github.com/sunnykgupta/AI-Helpers
- Clean Code-inspired rules: https://github.com/ciembor/agent-rules-books

Use these as reference sources, but keep this file adapted to the current project instead of pasting large generic rule sets.

## Project Overview

- AirShare is a static web app for AirDrop-style file sharing UI between iPhone and Windows.
- Entry point: `index.html`.
- Frontend assets: `css/style.css` and `js/app.js`.
- Optional backend reference: `worker/worker.js` and `worker/schema.sql` for Cloudflare Workers + D1.
- No package manager scripts are required.

## Working Agreements

- Respond to the user in Japanese unless they ask for another language.
- Keep explanations concise, but include enough context for the user to act confidently.
- Prefer making small, focused changes that match the existing project style.
- Before editing files, inspect the relevant files and understand the local conventions.
- For non-trivial changes, share a short plan before coding, then implement once the direction is clear.
- When requirements are ambiguous, ask or state the assumption before making risky changes.
- Keep functions small and focused on a single responsibility.
- Handle expected errors explicitly, especially in async flows and user-facing code paths.

## Code Quality

- Treat readability as part of delivery; working code is not automatically clean code.
- Use precise names and one term per concept.
- Keep functions small, focused, and at one level of abstraction.
- Avoid boolean flags or multi-mode functions when separate functions would be clearer.
- Separate queries from commands; avoid hidden mutation.
- Keep happy paths readable and move error or cleanup handling into clear branches/helpers.
- Add abstractions only when they reduce real duplication or clarify a real concept.
- Comments should explain rationale, constraints, or external contracts; avoid narrating obvious code.
- When touching code, improve the touched area within scope without broad unrelated refactors.

## Project Expectations

- Do not overwrite user changes. If a file has unrelated edits, preserve them and work around them.
- Use `rg` or `rg --files` first when searching.
- Use `apply_patch` for manual file edits.

## Build And Run

- Build: none; this is a static app.
- Dev server: `node dev-server.js`, then open `http://127.0.0.1:4173/index.html`.
- Static HTML fallback: `python -m http.server 4173`, `py -m http.server 4173`, or a known local Python path, then open `http://localhost:4173/index.html`.
- Do not add npm, pnpm, Vite, or other tooling unless the user asks or the project clearly adopts it.
- If package scripts are added later, document the exact build, lint, test, and dev-server commands here.

## Verification

- When code is changed, run the most relevant available checks.
- Prefer the project's documented build, lint, and test commands when they exist.
- For frontend work, open the local page in a browser and verify the visible result when possible.
- Check desktop and mobile viewport widths for layout issues.
- Check the browser console for JavaScript errors.
- If assets change, confirm referenced files exist and render in the browser.
- If no automated test or build command exists, say that verification was limited to static/manual browser checks.

## Dependencies And Safety

- Ask before adding new production dependencies.
- Avoid destructive commands unless the user explicitly requests them.
- Do not commit, push, or create pull requests unless the user asks.
- Never commit secrets, API keys, tokens, passwords, or `.env` files.
- Never log or print credentials, tokens, or private user data.
- Do not build shell commands or queries by unsafe string concatenation.
- Validate and sanitize external input before using it in file paths, shell calls, or queries.

## Git Workflow

- Keep commits atomic if the user asks for commits.
- Use conventional commit style when a commit message is needed: `type(scope): description`.
- Review diffs before summarizing work.
- Do not stage unrelated files.
