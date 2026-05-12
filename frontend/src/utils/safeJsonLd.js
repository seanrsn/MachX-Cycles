// Render JSON-LD safely inside a <script> tag.
//
// React doesn't HTML-escape children of <script> tags. JSON.stringify happily
// passes through `</script>` and other HTML-significant sequences. So an
// admin-controlled string containing `</script><script>alert(1)</script>`
// would break out of the JSON-LD block and execute arbitrary JS for every
// visitor (and every social-preview bot, since prerender bakes this into
// static HTML).
//
// Escaping dangerous sequences here makes JSON-LD safe regardless of what
// admin pastes into bike fields. The escapes are valid JSON unicode literals,
// so consumers (Google's Structured Data tool, Bing, etc.) parse them back
// to the original characters.

// Build U+2028 / U+2029 regexes via fromCharCode — esbuild rejects regex
// literals that *contain* those code points (they're line terminators).
const LSEP_RX = new RegExp(String.fromCharCode(0x2028), 'g')
const PSEP_RX = new RegExp(String.fromCharCode(0x2029), 'g')

export function safeJsonLd(value) {
  // Each replacement string is a 6-char JSON unicode escape literal:
  //   "\\u003c" in source → string `<` in memory → emits `<`
  // which the consumer's JSON parser turns back into '<' / '>' / '&' / etc.
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(LSEP_RX, "\\u2028")
    .replace(PSEP_RX, "\\u2029")
}
