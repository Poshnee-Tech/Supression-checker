/**
 * User directory + password verification. Node runtime only (bcrypt).
 *
 * Users come from the APP_USERS env variable as JSON:
 *   [{"username":"agent1","passwordHash":"$2b$12$...","role":"agent"}]
 */

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { getAppUsersRaw } from '@/lib/env'

/** A bcrypt hash looks like $2a$12$... / $2b$12$... / $2y$12$... */
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

const appUserSchema = z.object({
  username: z.string().min(1),
  passwordHash: z.string().regex(BCRYPT_HASH, 'passwordHash is not a valid bcrypt hash'),
  role: z.string().min(1).default('agent'),
})

const appUsersSchema = z.array(appUserSchema).min(1)

export type AppUser = z.infer<typeof appUserSchema>

let cache: AppUser[] | null = null

export function getUsers(): AppUser[] {
  if (cache) return cache
  let parsed: unknown
  try {
    parsed = JSON.parse(getAppUsersRaw())
  } catch {
    throw new Error('APP_USERS is not valid JSON')
  }
  const result = appUsersSchema.safeParse(parsed)
  if (!result.success) {
    const badHash = result.error.issues.some((issue) => issue.path.includes('passwordHash'))
    throw new Error(
      'APP_USERS must be a non-empty JSON array of {username, passwordHash, role}. ' +
        (badHash
          ? 'One or more passwordHash values are not valid bcrypt hashes. In a local .env file every "$" ' +
            'must be escaped as "\\$" (dotenv treats $ as variable interpolation). Vercel environment ' +
            'variables need no escaping.'
          : `Problem: ${result.error.issues[0]?.message ?? 'invalid shape'}`)
    )
  }
  cache = result.data
  return cache
}

/**
 * A bcrypt hash of a random string, used to equalise response time when the
 * username does not exist. Prevents username enumeration via timing.
 */
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEe.ZjXsPq5g0O7D/HOfj3EaAH3p5QsRMHu'

/**
 * Verify credentials. Returns the user on success, null on failure.
 * Always performs exactly one bcrypt comparison.
 */
export async function verifyCredentials(username: string, password: string): Promise<AppUser | null> {
  const users = getUsers()
  // Usernames are matched case-insensitively: they are email-style, and agents
  // typing "admin@..." should not be locked out by a capital letter.
  const candidate = username.trim().toLowerCase()
  const user = users.find((u) => u.username.trim().toLowerCase() === candidate)
  const hash = user?.passwordHash ?? DUMMY_HASH

  let ok = false
  try {
    ok = await bcrypt.compare(password, hash)
  } catch {
    ok = false
  }

  if (!user || !ok) return null
  return user
}
