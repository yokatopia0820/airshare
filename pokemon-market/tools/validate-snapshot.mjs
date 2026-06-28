import { readFile, stat } from "node:fs/promises";
import {
  MAX_SNAPSHOT_BYTES,
  parseSnapshotText
} from "../snapshot.mjs";

async function main(args) {
  if (args.length !== 1) {
    console.error("Usage: node pokemon-market/tools/validate-snapshot.mjs <snapshot.json>");
    process.exitCode = 1;
    return;
  }

  const inputPath = args[0];
  try {
    const file = await stat(inputPath);
    if (!file.isFile()) {
      throw new Error("指定されたパスはファイルではありません。");
    }
    if (file.size > MAX_SNAPSHOT_BYTES) {
      reportErrors(inputPath, ["JSON入力は5 MiB以下である必要があります。"]);
      return;
    }

    const text = await readFile(inputPath, "utf8");
    const result = parseSnapshotText(text);
    if (!result.ok) {
      reportErrors(inputPath, result.errors);
      return;
    }

    const { schemaVersion, generatedAt, cards } = result.snapshot;
    console.log(`Valid snapshot: schemaVersion ${schemaVersion}, ${cards.length} cards, generatedAt ${generatedAt}`);
  } catch (error) {
    console.error(`Snapshot read failed: ${inputPath}: ${error.message}`);
    process.exitCode = 1;
  }
}

function reportErrors(inputPath, errors) {
  console.error(`Invalid snapshot: ${inputPath}`);
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}

await main(process.argv.slice(2));
