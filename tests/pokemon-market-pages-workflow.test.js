const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const workflow = fs.readFileSync(
  path.resolve(__dirname, "..", ".github", "workflows", "pages.yml"),
  "utf8"
);

test("Pages workflow refreshes the Japanese card index every day", () => {
  assert.match(workflow, /schedule:\s*\r?\n\s*- cron:/u);
  assert.match(workflow, /node pokemon-market\/tools\/build-tcgdex-ja-index\.mjs/u);
  assert.match(workflow, /github\.event_name == 'schedule'/u);
  assert.match(workflow, /continue-on-error: true/u);
});
