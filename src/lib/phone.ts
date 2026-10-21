/**
 * Shared US phone number validation + formatting.
 *
 * This module is intentionally dependency-free so the EXACT same logic runs in
 * the browser (live validation while typing) and on the server (never trust the
 * client).
 */

export type PhoneValidationError =
  | 'EMPTY'
  | 'LENGTH'
  | 'AREA_CODE_LEADING'
  | 'AREA_CODE_N11'
  | 'EXCHANGE_LEADING'
  | 'REPEATED_DIGITS'

export const PHONE_ERROR_MESSAGES: Record<PhoneValidationError, string> = {
  EMPTY: 'Enter a 10-digit US number',
  LENGTH: 'Enter a 10-digit US number',
  AREA_CODE_LEADING: "Area code can't start with 0 or 1",
  AREA_CODE_N11: 'Invalid area code',
  EXCHANGE_LEADING: "Exchange code can't start with 0 or 1",
  REPEATED_DIGITS: 'Invalid number',
}

export type PhoneValidationResult =
  | {
      valid: true
      /** Bare 10 digits, e.g. "7046587404" */
      digits: string
      /** 11-digit normalized form sent upstream, e.g. "17046587404" */
      normalized: string
      /** Display form, e.g. "(704) 658-7404" */
      formatted: string
      /** Last 4 digits — the only part of the number we are allowed to log. */
      last4: string
    }
  | {
      valid: false
      error: PhoneValidationError
      message: string
    }

/** Strip everything that is not a digit. */
export function stripToDigits(input: string): string {
  return (input ?? '').replace(/\D+/g, '')
}

/**
 * Reduce any pasted format to at most 10 significant digits:
 * drops a leading country code "1" and ignores anything past 10 digits.
 */
export function toNationalDigits(input: string): string {
  let digits = stripToDigits(input)
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  else if (digits.length > 10 && digits.startsWith('1')) digits = digits.slice(1)
  return digits.slice(0, 10)
}

/** Progressive display formatting: "704658" -> "(704) 658" */
export function formatPhoneInput(input: string): string {
  const d = toNationalDigits(input)
  if (d.length === 0) return ''
  if (d.length < 4) return `(${d}`
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}`
}

/** Full display formatting for a known-valid 10-digit string. */
export function formatPhoneDisplay(digits10: string): string {
  return `(${digits10.slice(0, 3)}) ${digits10.slice(3, 6)}-${digits10.slice(6, 10)}`
}

function fail(error: PhoneValidationError): PhoneValidationResult {
  return { valid: false, error, message: PHONE_ERROR_MESSAGES[error] }
}

/**
 * Validate a US phone number in any common input format.
 *
 * Rules (applied after stripping non-digits):
 *  - 10 digits, or 11 digits starting with "1" (the leading 1 is dropped)
 *  - area code (digits 1-3) must not start with 0 or 1
 *  - area code must not be an N11 service code (211, 311, ... 911)
 *  - exchange (digits 4-6) must not start with 0 or 1
 *  - the 10 digits must not all be identical
 */
export function validateUsPhone(input: string): PhoneValidationResult {
  const raw = stripToDigits(input)
  if (raw.length === 0) return fail('EMPTY')

  let digits: string
  if (raw.length === 10) {
    digits = raw
  } else if (raw.length === 11 && raw.startsWith('1')) {
    digits = raw.slice(1)
  } else {
    return fail('LENGTH')
  }

  const areaCode = digits.slice(0, 3)
  const exchange = digits.slice(3, 6)

  if (areaCode[0] === '0' || areaCode[0] === '1') return fail('AREA_CODE_LEADING')
  // N11 codes: second and third digits are both "1" (211, 311, 411 ... 911)
  if (areaCode[1] === '1' && areaCode[2] === '1') return fail('AREA_CODE_N11')
  if (exchange[0] === '0' || exchange[0] === '1') return fail('EXCHANGE_LEADING')
  if (/^(\d)\1{9}$/.test(digits)) return fail('REPEATED_DIGITS')

  return {
    valid: true,
    digits,
    normalized: `1${digits}`,
    formatted: formatPhoneDisplay(digits),
    last4: digits.slice(-4),
  }
}
