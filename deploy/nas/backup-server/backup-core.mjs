import { createHash, timingSafeEqual } from 'node:crypto';

export const MAX_BODY = 5_000_000;
export const ID_PATTERN = /^\d{8}T\d{6}Z-[0-9a-f]{12}$/;

export const sha256 = text => createHash('sha256').update(text).digest('hex');

export function summarize(data) {
  const sessions = data.sessions.filter(session => session.exercises.some(exercise => exercise.sets.some(set => !set.canceledAt)));
  const sets = data.sessions.reduce((n, session) => n + session.exercises.reduce((sum, exercise) => sum + exercise.sets.filter(set => !set.canceledAt).length, 0), 0);
  return { routines: data.routines.length, sessions: sessions.length, sets };
}

// Sorts by name, so ids stay in time order without reading the files.
export function backupId(date, hash) {
  return `${date.toISOString().slice(0, 19).replace(/[-:]/g, '')}Z-${hash.slice(0, 12)}`;
}

// Hashing both sides first gives equal lengths, so the comparison time never depends on the guess.
export function tokenMatches(header, token) {
  const match = /^Bearer (\S+)$/.exec(header ?? '');
  if (!match || !token) return false;
  return timingSafeEqual(createHash('sha256').update(match[1]).digest(), createHash('sha256').update(token).digest());
}

// A wiped device must not quietly replace a full backup with an empty or much smaller one.
export function isShrink(previous, incoming) {
  if (!previous) return false;
  if (incoming.routines === 0 && incoming.sets === 0) return previous.routines > 0 || previous.sets > 0;
  return previous.sets > 0 && incoming.sets * 2 < previous.sets;
}

// entries are newest first. The backup with the most sets is kept regardless of age.
export function idsToPrune(entries, keep) {
  if (entries.length <= keep) return [];
  const largest = entries.reduce((best, entry) => (entry.sets > best.sets ? entry : best), entries[0]);
  return entries.slice(keep).filter(entry => entry !== largest).map(entry => entry.id);
}
