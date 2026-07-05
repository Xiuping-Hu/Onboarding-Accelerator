import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const { Pool } = pg;
const args = process.argv.slice(2);
const options = parseArgs(args);

if (!options.email) {
  console.error('Error: --email is required');
  process.exit(1);
}
if (!options.name) {
  console.error('Error: --name is required');
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('Error: DATABASE_URL is required');
  process.exit(1);
}

const role = options.role || 'user';
const email = normalizeEmail(options.email);
const displayName = options.name.trim();

async function main() {
  const readline = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const password = await readline.question('Enter password for the new user: ');
    const confirmation = await readline.question('Confirm password: ');

    if (password !== confirmation) {
      throw new Error('Passwords do not match');
    }
    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
      max: Number.parseInt(process.env.POSTGRES_POOL_MAX ?? '10', 10),
    });

    try {
      const result = await pool.query(
        `insert into users (email, display_name, password_hash, role, is_active)
         values ($1, $2, $3, $4, true)
         returning id, email, display_name, role`,
        [email, displayName, passwordHash, role],
      );
      const user = result.rows[0];

      console.info('\nUser created successfully:');
      console.info(`ID: ${user.id}`);
      console.info(`Email: ${user.email}`);
      console.info(`Name: ${user.display_name}`);
      console.info(`Role: ${user.role}`);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error('A user with this email already exists');
      }
      throw error;
    } finally {
      await pool.end();
    }
  } finally {
    readline.close();
  }
}

function parseArgs(values) {
  const parsed = {};

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    const nextValue = values[index + 1];

    if (value === '--email' && nextValue) {
      parsed.email = nextValue;
      index += 1;
    } else if (value === '--name' && nextValue) {
      parsed.name = nextValue;
      index += 1;
    } else if (value === '--role' && nextValue) {
      parsed.role = nextValue;
      index += 1;
    }
  }

  return parsed;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function isUniqueViolation(error) {
  return typeof error === 'object' && error !== null && error.code === '23505';
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
