/**
 * Buyer (TLD CRM) suppression API client. SERVER ONLY.
 *
 * Calls the dialer "ready" endpoint, which screens a number against the buyer's
 * suppression groups (TLD_FPG, e.g. CLIENTS,ECLIENTS,BLOCK,EBLOCK,OCLIENTS):
 *
 *   GET {TLD_BASE_URL}/api/public/dialer/ready/{phone11}?fpg={TLD_FPG}
 *
 * Neither the URL nor the raw upstream body is ever returned to the browser -
 * callers receive only a mapped { status, message } pair.
 */

import { getTldConfig } from '@/lib/env'
import type { CheckResult, CheckStatus } from '@/lib/types'

export type { CheckResult, CheckStatus }

export const CHECK_TIMEOUT_MS = 5_000

export const CHECK_RESULTS: Record<CheckStatus, CheckResult> = {
  PASS: { status: 'PASS', message: 'Clear to transfer' },
  FAIL: { status: 'FAIL', message: 'Do not transfer — number will be rejected' },
  INVALID: { status: 'INVALID', message: 'Buyer rejected this number as invalid' },
  ERROR: { status: 'ERROR', message: "Couldn't verify right now — do not transfer, try again" },
}

/**
 * Mask long digit runs before an upstream body reaches the server log.
 * The buyer echoes the full phone number back inside error payloads
 * (e.g. {"reason":"NUM","details":{"phone":"1111111111"}}), and full numbers
 * must never be written to logs - only the last 4 go in the audit log.
 */
export function redactForLog(text: string): string {
  return text.replace(/\d{7,}/g, (run) => `[redacted-${run.length}-digits]`)
}

/** Map the upstream payload to a client-safe result. */
export function mapUpstreamPayload(payload: unknown): CheckResult {
  if (payload === null || typeof payload !== 'object') return CHECK_RESULTS.ERROR

  const body = payload as Record<string, unknown>
  const rawReady = body.ready
  const ready =
    typeof rawReady === 'number'
      ? rawReady
      : typeof rawReady === 'string' && rawReady.trim() !== ''
        ? Number(rawReady)
        : typeof rawReady === 'boolean'
          ? Number(rawReady)
          : NaN

  if (Number.isNaN(ready)) return CHECK_RESULTS.ERROR
  if (ready === 1) return CHECK_RESULTS.PASS

  if (ready === 0) {
    const reason = typeof body.reason === 'string' ? body.reason.trim().toUpperCase() : ''
    if (reason === 'NUM') return CHECK_RESULTS.INVALID
    // "PAR" means the request carried no usable filter groups. Every number
    // would come back ready:0, so this is a configuration fault, not a
    // suppression hit - never report it to the agent as "do not transfer".
    if (reason === 'PAR') {
      console.error(
        '[suppression-checker] upstream rejected the request parameters (reason "PAR"). ' +
          'Check that TLD_FPG is set to the filter groups the buyer expects.'
      )
      return CHECK_RESULTS.ERROR
    }
    return CHECK_RESULTS.FAIL
  }

  return CHECK_RESULTS.ERROR
}

/**
 * Call the buyer's suppression endpoint for an 11-digit normalized number.
 * Never throws — any failure is mapped to ERROR and logged server-side.
 */
export async function checkSuppression(phone11: string): Promise<CheckResult> {
  let url: string
  try {
    const { baseUrl, fpg } = getTldConfig()
    url = `${baseUrl}/api/public/dialer/ready/${encodeURIComponent(phone11)}?fpg=${encodeURIComponent(fpg)}`
  } catch (error) {
    console.error('[suppression-checker] upstream is misconfigured', error)
    return CHECK_RESULTS.ERROR
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    })

    const text = await response.text()

    if (!response.ok) {
      console.error(
        `[suppression-checker] upstream returned HTTP ${response.status}`,
        redactForLog(text.slice(0, 500))
      )
      return CHECK_RESULTS.ERROR
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      console.error(
        '[suppression-checker] upstream returned non-JSON body',
        redactForLog(text.slice(0, 500))
      )
      return CHECK_RESULTS.ERROR
    }

    return mapUpstreamPayload(parsed)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[suppression-checker] upstream timed out after ${CHECK_TIMEOUT_MS}ms`)
    } else {
      console.error('[suppression-checker] upstream request failed', error)
    }
    return CHECK_RESULTS.ERROR
  } finally {
    clearTimeout(timeout)
  }
}
