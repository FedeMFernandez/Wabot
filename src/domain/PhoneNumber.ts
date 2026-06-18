const MIN_DIGITS = 8;
const MAX_DIGITS = 15;
const ALLOWED_CHARS = /^[+\d\s()\-.]+$/;
const GROUP_ID = /^\d+(-\d+)?@g\.us$/;
const CONTACT_ID = /^\d+@c\.us$/;

export interface RecipientError {
  input: string;
  reason: string;
}

export interface RecipientValidation {
  valid: string[];
  errors: RecipientError[];
}

function validateDigitLength(digits: string): string | null {
  if (digits.length < MIN_DIGITS) {
    return `tiene muy pocos dígitos (${digits.length})`;
  }
  if (digits.length > MAX_DIGITS) {
    return `tiene demasiados dígitos (${digits.length})`;
  }
  return null;
}

export function validateGroupId(value: string): string | null {
  const trimmed = value.trim();
  if (!GROUP_ID.test(trimmed)) {
    return 'no es un ID de grupo válido (debe ser dígitos terminados en @g.us)';
  }
  return null;
}

export function validatePhoneNumber(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return 'está vacío';
  }
  if (trimmed.includes('@')) {
    if (trimmed.endsWith('@g.us')) {
      return validateGroupId(trimmed);
    }
    if (trimmed.endsWith('@c.us')) {
      if (!CONTACT_ID.test(trimmed)) {
        return 'no es un ID de contacto válido (debe ser dígitos terminados en @c.us)';
      }
      return validateDigitLength(trimmed.replace(/\D/g, ''));
    }
    return 'no es un ID de WhatsApp válido (debe terminar en @c.us o @g.us)';
  }
  if (!ALLOWED_CHARS.test(trimmed)) {
    return 'contiene caracteres inválidos';
  }
  return validateDigitLength(trimmed.replace(/\D/g, ''));
}

export function validateRecipients(input: string): RecipientValidation {
  const entries = input
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const valid: string[] = [];
  const errors: RecipientError[] = [];

  for (const entry of entries) {
    const reason = validatePhoneNumber(entry);
    if (reason) {
      errors.push({ input: entry, reason });
    } else {
      valid.push(entry);
    }
  }

  return { valid, errors };
}
