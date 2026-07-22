const LINE_BREAK = /\r\n|\r|\n/;
const GROUP_PREFIX = /^[A-Za-z0-9-]+\./;
const WAID_PARAM = /(?:^|;)waid=([^;:]*)/i;

export interface VCardContact {
  name: string;
  number: string;
}

function unfoldLines(raw: string): string[] {
  const lines = raw.split(LINE_BREAK);
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }
    unfolded.push(line);
  }
  return unfolded;
}

function splitCards(raw: string): string[][] {
  const cards: string[][] = [];
  let current: string[] | null = null;
  for (const line of unfoldLines(raw)) {
    const upper = line.trim().toUpperCase();
    if (upper === 'BEGIN:VCARD') {
      current = [];
      cards.push(current);
      continue;
    }
    if (upper === 'END:VCARD') {
      current = null;
      continue;
    }
    if (current) current.push(line);
  }
  return cards.filter((card) => card.length > 0);
}

function splitProperty(line: string): { name: string; params: string; value: string } | null {
  const separator = line.indexOf(':');
  if (separator === -1) return null;
  const head = line.slice(0, separator);
  const value = line.slice(separator + 1).trim();
  const paramStart = head.indexOf(';');
  const rawName = paramStart === -1 ? head : head.slice(0, paramStart);
  const params = paramStart === -1 ? '' : head.slice(paramStart);
  return {
    name: rawName.replace(GROUP_PREFIX, '').trim().toUpperCase(),
    params,
    value,
  };
}

function unescapeValue(value: string): string {
  return value
    .replace(/\\n/gi, ' ')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim();
}

function toDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function parseCard(lines: string[]): VCardContact[] {
  let name = '';
  const numbers: string[] = [];

  for (const line of lines) {
    const property = splitProperty(line);
    if (!property) continue;

    if (property.name === 'FN' && name.length === 0) {
      name = unescapeValue(property.value);
      continue;
    }

    if (property.name !== 'TEL') continue;

    const waid = WAID_PARAM.exec(property.params);
    const digits = waid ? toDigits(waid[1]) : toDigits(property.value);
    if (digits.length > 0 && !numbers.includes(digits)) {
      numbers.push(digits);
    }
  }

  return numbers.map((number) => ({ name, number }));
}

export function extractContactsFromVCards(vcards: string[]): VCardContact[] {
  const contacts: VCardContact[] = [];
  const seen = new Set<string>();

  for (const raw of vcards) {
    if (typeof raw !== 'string' || raw.trim().length === 0) continue;
    for (const card of splitCards(raw)) {
      for (const contact of parseCard(card)) {
        if (seen.has(contact.number)) continue;
        seen.add(contact.number);
        contacts.push(contact);
      }
    }
  }

  return contacts;
}
