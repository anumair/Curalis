import bcrypt from 'bcrypt';
import crypto from 'node:crypto';

const SALT_ROUNDS = 10;

export function hashPassword(plainPassword) {
  return bcrypt.hash(plainPassword, SALT_ROUNDS);
}

export function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

// Doctors don't choose their own password — an admin provisions the account
// and this is shown once in the response so it can be handed off.
export function generateTemporaryPassword() {
  return crypto.randomBytes(12).toString('base64url');
}
