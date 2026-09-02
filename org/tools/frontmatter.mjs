// Front matter reader. Machine-readable facts live in a fenced header at the
// top of a document; the prose below it is free text in any language.
//
// This exists because parsers used to read Russian prose with regexes
// ("Вердикт: принято"), which made translating a document a silent runtime
// break. Keys are English and stable; the text is not part of the contract.

import { readFileSync } from "node:fs";

/** Parses a leading `---` block of `key: value` pairs. Values stay strings. */
export function parseFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\s*(\r?\n|$)/.exec(text || "");
  if (!m) return null;
  const out = {};
  for (const line of m[1].split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const kv = /^([A-Za-z][A-Za-z0-9_]*):\s*(.*)$/.exec(line);
    if (!kv) continue;
    out[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

export function readFrontMatter(path) {
  try { return parseFrontMatter(readFileSync(path, "utf8")); } catch { return null; }
}
