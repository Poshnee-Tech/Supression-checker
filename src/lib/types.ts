/**
 * Types shared between server and client code.
 * Safe to import from Client Components (no secrets, no Node APIs).
 */

export type CheckStatus = 'PASS' | 'FAIL' | 'INVALID' | 'ERROR'

export type CheckResult = {
  status: CheckStatus
  message: string
}
