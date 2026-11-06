import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';
import { migrate } from './migrate.js';
import { seed } from './seed.js';

/** Drop everything, re-run migrations, re-seed. Dev/test only. */
export async function reset(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to reset the database in production.');
  }
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate();
  await seed();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  reset()
    .then(() => console.log('Database reset, migrated and seeded.'))
    .catch((err) => {
      console.error('Reset failed:', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
