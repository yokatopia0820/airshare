import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, stat } from 'node:fs/promises';

const dataPath = new URL('../handbook-viewer/technical-fee-data.js', import.meta.url);
const appPath = new URL('../handbook-viewer/app.js', import.meta.url);

test('handbook viewer publishes the verified $ and # technical-fee rows', async () => {
  const source = await readFile(dataPath, 'utf8');
  const match = source.match(/window\.HANDBOOK_TECHNICAL_FEES = (.+);\s*$/u);
  assert.ok(match, 'static data must expose the viewer payload');
  const payload = JSON.parse(match[1]);
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.rows.length, 128);
  assert.equal(payload.metadata.dollar.rowCount, 90);
  assert.equal(payload.metadata.sharp.rowCount, 38);
  assert.match(payload.metadata.dollar.sourceSha256, /^[a-f0-9]{64}$/u);
  assert.match(payload.metadata.sharp.sourceSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(payload.rows.find((row) => row.key === 'dollar:general:4:D'), {
    key: 'dollar:general:4:D', mark: 'dollar', category: 'general', number: 4, rank: 'D', minutes: 60,
    xYen: 7200, tYen: 10800, standardYen: 16000, technicalFee3: null,
  });
  const sharpD = payload.rows.find((row) => row.key === 'sharp:sharp:3:D');
  assert.equal(sharpD.technicalFee3.onePerson.standardYen, 4800);
  assert.equal(sharpD.technicalFee3.twoPeople.standardYen, 4800);
});

test('handbook viewer supports source-page switching and exact row overlays for both tables', async () => {
  const source = await readFile(appPath, 'utf8');
  assert.match(source, /\.\/assets\/fee-page-7\.png/u);
  assert.match(source, /\.\/assets\/fee-page-8\.png/u);
  assert.match(source, /row\.mark === 'sharp'/u);
  assert.match(source, /evidence-highlight/u);
  await Promise.all([
    stat(new URL('../handbook-viewer/assets/fee-page-7.png', import.meta.url)),
    stat(new URL('../handbook-viewer/assets/fee-page-8.png', import.meta.url)),
  ]);
});
