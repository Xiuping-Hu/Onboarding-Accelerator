import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const options = {};

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--email') {
    options.email = args[++i];
  } else if (args[i] === '--name') {
    options.name = args[++i];
  } else if (args[i] === '--role') {
    options.role = args[++i];
  }
}

if (!options.email) {
  console.error('Error: --email is required');
  process.exit(1);
}
if (!options.name) {
  console.error('Error: --name is required');
  process.exit(1);
}
options.role = options.role || 'user';

const readline = createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = promisify(readline.question).bind(readline);

const DATA_DIR = resolve(process.cwd(), 'data');
const USERS_FILE = resolve(DATA_DIR, 'users.json');

async function loadUsers() {
  try {
    const content = await readFile(USERS_FILE, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

async function saveUsers(users) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
}

async function main() {
  const password = await question('Enter password for the new user: ');
  readline.close();

  if (!password || password.length < 8) {
    console.error('Error: Password must be at least 8 characters');
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const users = await loadUsers();

  const existingUser = users.find((u) => u.email.toLowerCase() === options.email.toLowerCase());
  if (existingUser) {
    console.error('Error: A user with this email already exists');
    process.exit(1);
  }

  const newUser = {
    id: randomUUID(),
    email: options.email,
    display_name: options.name,
    password_hash: passwordHash,
    role: options.role,
    is_active: true,
    last_login_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  users.push(newUser);
  await saveUsers(users);

  console.log('\nUser created successfully:');
  console.log(`ID: ${newUser.id}`);
  console.log(`Email: ${newUser.email}`);
  console.log(`Name: ${newUser.display_name}`);
  console.log(`Role: ${newUser.role}`);
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
