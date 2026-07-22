const SPINTAX_PATTERN = /\{([^{}]*)\}/;

export function expandSpintax(text: string): string {
  if (!text) return text;
  let result = text;
  let match = SPINTAX_PATTERN.exec(result);
  while (match) {
    const options = match[1].split('|');
    const choice = options[Math.floor(Math.random() * options.length)];
    result = result.slice(0, match.index) + choice + result.slice(match.index + match[0].length);
    match = SPINTAX_PATTERN.exec(result);
  }
  return result;
}
