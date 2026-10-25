const PHONE_SUFFIX = /\s+(?:for|compatible with|works with)\s+(?:all\s+)?(?:nfc[- ]?(?:enabled\s+)?)?(?:phones?|smartphones?)$/i;

function dropRepeatedWords(words) {
  return words.filter((w, i) => i === 0 || w.toLowerCase() !== words[i - 1].toLowerCase());
}

function dropRepeatedTail(words) {
  for (let n = Math.min(4, Math.floor(words.length / 2)); n >= 2; n--) {
    const tail = words.slice(-n).join(" ").toLowerCase();
    const head = words.slice(0, -n).join(" ").toLowerCase();
    if (` ${head} `.includes(` ${tail} `)) return words.slice(0, -n);
  }
  return words;
}

export function cleanTitle(name) {
  let t = String(name ?? "").replace(/\s+/g, " ").trim();
  const bar = t.indexOf(" | ");
  if (bar > 0) t = t.slice(0, bar);
  const dash = t.search(/ [–—-] /);
  if (dash > 0 && t.slice(0, dash).split(" ").length >= 3) t = t.slice(0, dash);
  t = t.replace(PHONE_SUFFIX, "");
  let words = dropRepeatedWords(t.split(" "));
  words = dropRepeatedTail(words);
  return words.join(" ").trim() || String(name ?? "").trim();
}

export function displayNameOf(product) {
  return product.displayName?.trim() || cleanTitle(product.name);
}
