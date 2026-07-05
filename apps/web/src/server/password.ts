import bcrypt from 'bcryptjs';

const defaultPasswordHashRounds = 12;

export async function hashPassword(
  password: string,
  rounds = defaultPasswordHashRounds,
): Promise<string> {
  return bcrypt.hash(password, rounds);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}
