import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv";
const JAPANESE_LANGUAGE_ID = 1;
const ENGLISH_LANGUAGE_ID = 9;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const response = await fetch(SOURCE_URL);
if (!response.ok) throw new Error(`Pokemon name source returned ${response.status}`);

const namesBySpecies = new Map();
for (const line of (await response.text()).split(/\r?\n/u).slice(1)) {
  if (!line) continue;
  const [speciesId, languageId, name] = firstCsvFields(line, 3);
  const language = Number(languageId);
  if (!speciesId || !name || ![JAPANESE_LANGUAGE_ID, ENGLISH_LANGUAGE_ID].includes(language)) continue;
  const names = namesBySpecies.get(speciesId) || {};
  if (language === JAPANESE_LANGUAGE_ID) names.ja = name;
  if (language === ENGLISH_LANGUAGE_ID) names.en = name;
  namesBySpecies.set(speciesId, names);
}

const nameMap = Object.fromEntries(
  [...namesBySpecies.values()]
    .filter(names => names.ja && names.en)
    .sort((left, right) => left.ja.localeCompare(right.ja, "ja"))
    .map(names => [names.ja, names.en])
);

await fs.writeFile(
  path.join(ROOT, "data", "pokemon-names.json"),
  `${JSON.stringify(nameMap, null, 2)}\n`,
  "utf8"
);
console.log(`Wrote ${Object.keys(nameMap).length} Pokemon names`);

function firstCsvFields(line, count) {
  const fields = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      fields.push(value);
      value = "";
      if (fields.length === count) return fields;
    } else {
      value += character;
    }
  }
  fields.push(value);
  return fields;
}
