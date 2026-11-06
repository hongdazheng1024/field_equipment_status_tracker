import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { pool, withTransaction } from './pool.js';

type Status = 'OPERATIONAL' | 'DEGRADED' | 'DOWN' | 'IN_MAINTENANCE';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Mock-login accounts. Everyone shares one dev password (see README). */
export const SEED_PASSWORD = 'password';
const USERS = [
  { username: 'olivia', displayName: 'Olivia Ortiz', role: 'OPERATOR' },
  { username: 'omar', displayName: 'Omar Nasser', role: 'OPERATOR' },
  { username: 'sara', displayName: 'Sara Kim', role: 'SUPERVISOR' },
] as const;

const SITES = [
  { name: 'North Ridge', code: 'NR', items: 30 },
  { name: 'Harbor Depot', code: 'HD', items: 25 },
  { name: 'Desert Relay', code: 'DR', items: 20 },
];

const TYPES = [
  { type: 'Generator', code: 'GEN' },
  { type: 'Radio', code: 'RAD' },
  { type: 'Sensor', code: 'SEN' },
  { type: 'Vehicle', code: 'VEH' },
];

// Weighted so most things work, a realistic minority do not.
const STATUS_WEIGHTS: [Status, number][] = [
  ['OPERATIONAL', 0.6],
  ['DEGRADED', 0.15],
  ['DOWN', 0.13],
  ['IN_MAINTENANCE', 0.12],
];

const REASONS: Record<Status, string[]> = {
  OPERATIONAL: ['Passed routine inspection', 'Repair completed, back in service', 'Restarted and verified'],
  DEGRADED: ['Intermittent signal loss', 'Running below rated output', 'Battery holding partial charge'],
  DOWN: ['Will not power on', 'Physical damage reported', 'Failed self-test'],
  IN_MAINTENANCE: ['Scheduled quarterly service', 'Parts on order', 'Sent to workshop'],
};

/** Small deterministic PRNG (mulberry32) so every seed run produces the same data. */
function createRandom(seed: number) {
  let a = seed;
  const next = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)]!,
    weighted: <T>(entries: [T, number][]): T => {
      let r = next();
      for (const [value, weight] of entries) {
        if ((r -= weight) <= 0) return value;
      }
      return entries[entries.length - 1]![0];
    },
  };
}

export async function seed(now: Date = new Date()): Promise<{ users: number; sites: number; equipment: number; history: number }> {
  const rand = createRandom(42);
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  return withTransaction(async (client) => {
    await client.query(
      'TRUNCATE equipment_status_history, equipment, sites, users RESTART IDENTITY CASCADE',
    );

    const userIds: number[] = [];
    for (const u of USERS) {
      const { rows } = await client.query<{ user_id: number }>(
        `INSERT INTO users (username, display_name, password_hash, role)
         VALUES ($1, $2, $3, $4) RETURNING user_id`,
        [u.username, u.displayName, passwordHash, u.role],
      );
      userIds.push(rows[0]!.user_id);
    }

    let equipmentCount = 0;
    let historyCount = 0;

    for (const site of SITES) {
      const { rows } = await client.query<{ site_id: number }>(
        'INSERT INTO sites (name) VALUES ($1) RETURNING site_id',
        [site.name],
      );
      const siteId = rows[0]!.site_id;

      for (let i = 1; i <= site.items; i++) {
        const t = rand.pick(TYPES);
        const name = `${t.code}-${site.code}-${String(i).padStart(3, '0')}`;
        const status = rand.weighted(STATUS_WEIGHTS);
        // ~30% stale (checked 8–30 days ago), the rest checked within 6 days.
        const isStale = rand.next() < 0.3;
        const hoursAgo = isStale ? rand.int(8 * 24, 30 * 24) : rand.int(0, 6 * 24);
        const lastCheckedAt = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
        const createdAt = new Date(lastCheckedAt.getTime() - rand.int(30, 120) * DAY_MS);

        // Build 0–3 history entries that end at the current status, the last
        // one at last_checked_at, so history and current state agree.
        const changes = rand.int(0, 3);
        const chain: Status[] = [status];
        for (let c = 0; c < changes; c++) {
          let prev: Status;
          do prev = rand.weighted(STATUS_WEIGHTS);
          while (prev === chain[0]);
          chain.unshift(prev);
        }
        // Each recorded change bumped the version once.
        const version = 1 + changes;

        const { rows: eq } = await client.query<{ equip_id: number }>(
          `INSERT INTO equipment (name, type, site_id, status, last_checked_at, version, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $5) RETURNING equip_id`,
          [name, t.type, siteId, status, lastCheckedAt, version, createdAt],
        );
        const equipId = eq[0]!.equip_id;
        equipmentCount++;

        for (let c = 1; c < chain.length; c++) {
          const stepsBack = chain.length - 1 - c;
          const changedAt = new Date(lastCheckedAt.getTime() - stepsBack * rand.int(2, 10) * DAY_MS);
          const newStatus = chain[c]!;
          await client.query(
            `INSERT INTO equipment_status_history (equip_id, user_id, changed_at, old_status, new_status, reason)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [equipId, rand.pick(userIds), changedAt, chain[c - 1], newStatus, rand.pick(REASONS[newStatus])],
          );
          historyCount++;
        }
      }
    }

    return { users: USERS.length, sites: SITES.length, equipment: equipmentCount, history: historyCount };
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then((counts) => console.log('Seeded:', counts))
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
