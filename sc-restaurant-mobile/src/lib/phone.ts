export function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "");
  let national = digits;

  if (national.startsWith("7") || national.startsWith("8")) {
    national = national.slice(1);
  }

  national = national.slice(0, 10);

  if (!national.length) {
    return "";
  }

  let result = "+7";

  if (national.length > 0) {
    result += ` (${national.slice(0, 3)}`;
  }
  if (national.length >= 3) {
    result += ")";
  }
  if (national.length > 3) {
    result += ` ${national.slice(3, 6)}`;
  }
  if (national.length > 6) {
    result += `-${national.slice(6, 8)}`;
  }
  if (national.length > 8) {
    result += `-${national.slice(8, 10)}`;
  }

  return result;
}

export function normalizePhoneValue(value: string): string {
  const digits = value.replace(/\D/g, "");
  let normalizedDigits = digits;

  if (normalizedDigits.length === 11 && normalizedDigits.startsWith("8")) {
    normalizedDigits = `7${normalizedDigits.slice(1)}`;
  } else if (normalizedDigits.length === 10) {
    normalizedDigits = `7${normalizedDigits}`;
  }

  if (normalizedDigits.length !== 11 || !normalizedDigits.startsWith("7")) {
    return "";
  }

  return `+${normalizedDigits}`;
}

export function isCompletePhoneInput(value: string): boolean {
  return normalizePhoneValue(value).length > 0;
}
