import { execSync } from 'child_process';
import 'dotenv/config';

// Resets the dedicated test database (TEST_DATABASE_URL) and applies all migrations before the suite.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required to run tests');
  process.env.DATABASE_URL = url;
  execSync('npx prisma migrate reset --force --skip-seed', { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url } });
}
