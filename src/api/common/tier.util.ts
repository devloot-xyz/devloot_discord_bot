export function getUserTier(xp: number): string {
  if (xp >= 5000) return 'Legend';
  if (xp >= 2000) return 'Hunter';
  if (xp >= 500) return 'Builder';
  return 'Newcomer';
}
