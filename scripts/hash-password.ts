/**
 * Generate a bcrypt hash (cost 12) for an APP_USERS entry.
 *
 *   npm run hash-password                  # prompts, input is hidden
 *   npm run hash-password -- --user agent1 # also prints a ready APP_USERS entry
 *
 * The plain-text password is never written to disk or logged.
 */

import bcrypt from 'bcryptjs'
import { createInterface } from 'node:readline'
import process from 'node:process'

const BCRYPT_COST = 12
const MIN_LENGTH = 12

function parseArgs(argv: string[]): { username: string | null } {
  const index = argv.findIndex((arg) => arg === '--user' || arg === '-u')
  if (index !== -1 && argv[index + 1]) return { username: argv[index + 1] }
  return { username: null }
}

/** Read a line from stdin without echoing it to the terminal. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const input = process.stdin
    const output = process.stdout
    const rl = createInterface({ input, output, terminal: true })

    // Suppress echo of typed characters.
    const originalWrite = (rl as unknown as { _writeToOutput?: (s: string) => void })._writeToOutput
    ;(rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = function (
      this: unknown,
      chunk: string
    ) {
      if (chunk.includes(question)) {
        output.write(question)
        return
      }
      if (chunk === '\r\n' || chunk === '\n') output.write(chunk)
    }

    rl.question(question, (answer) => {
      if (originalWrite) {
        ;(rl as unknown as { _writeToOutput: unknown })._writeToOutput = originalWrite
      }
      rl.close()
      resolve(answer)
    })

    rl.on('error', reject)
  })
}

async function main(): Promise<void> {
  const { username } = parseArgs(process.argv.slice(2))

  if (!process.stdin.isTTY) {
    console.error('Run this script in an interactive terminal so the password is not echoed.')
    process.exit(1)
  }

  const password = await promptHidden('Password: ')
  const confirm = await promptHidden('Confirm password: ')

  if (!password) {
    console.error('\nNo password entered.')
    process.exit(1)
  }
  if (password !== confirm) {
    console.error('\nPasswords do not match.')
    process.exit(1)
  }
  if (password.length < MIN_LENGTH) {
    console.error(`\nUse at least ${MIN_LENGTH} characters.`)
    process.exit(1)
  }

  const hash = await bcrypt.hash(password, BCRYPT_COST)

  console.log('\nbcrypt hash (cost 12):')
  console.log(hash)

  if (username) {
    console.log('\nAPP_USERS entry:')
    console.log(JSON.stringify([{ username, passwordHash: hash, role: 'agent' }]))
  } else {
    console.log('\nAdd it to APP_USERS, e.g.:')
    console.log(
      JSON.stringify([{ username: 'agent1', passwordHash: hash, role: 'agent' }], null, 0)
    )
  }

  console.log('\nAPP_USERS must stay on a single line.')
  console.log(
    'In a local .env file, escape every "$" as "\\$" (dotenv interpolates $). ' +
      'Vercel environment variables need no escaping - paste as-is.'
  )
}

main().catch((error) => {
  console.error('Failed to hash password:', error)
  process.exit(1)
})
