import path from 'node:path';

export const guestStorageStatePath = path.resolve(
  process.cwd(),
  'tmp/e2e/auth/guest.json',
);
