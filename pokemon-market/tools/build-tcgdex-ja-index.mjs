import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTcgdexIndexPayload,
  TCGDEX_JA_CARDS_URL
} from "../tcgdex-index.mjs";

const OUTPUT_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../data/tcgdex-ja-index.json");

export async function fetchTcgdexJapaneseIndex({
  fetchImpl = fetch,
  generatedAt = new Date().toISOString(),
  minimumCount = 1000
} = {}) {
  const response = await fetchImpl(TCGDEX_JA_CARDS_URL, {
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`TCGdex一覧の取得に失敗しました (${response.status || "unknown"})`);
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error("TCGdex一覧の応答形式が不正です");
  return buildTcgdexIndexPayload(rows, { generatedAt, minimumCount });
}

export async function writeTcgdexJapaneseIndex({
  outputPath = OUTPUT_PATH,
  ...options
} = {}) {
  const payload = await fetchTcgdexJapaneseIndex(options);
  const json = `${JSON.stringify(payload)}\n`;
  await writeFile(outputPath, json, "utf8");
  return {
    outputPath,
    count: payload.cards.length,
    bytes: new TextEncoder().encode(json).byteLength
  };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  writeTcgdexJapaneseIndex()
    .then(result => {
      console.log(`TCGdex日本語索引: ${result.count.toLocaleString("ja-JP")}件 / ${result.bytes.toLocaleString("ja-JP")} bytes`);
      console.log(result.outputPath);
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
