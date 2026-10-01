import sharp from 'sharp';
import type { DiscordProfile } from '../core/core-api.client';
import { STACK_GLYPHS } from './stack-glyphs';

interface Glyph {
  color: string;
  viewBox: string;
  body: string;
}

const glyphs: Record<string, Glyph> = STACK_GLYPHS;
const WIDTH = 920;
const TILE_WIDTH = 280;
const GAP = 16;

function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character]!);
}

function label(value: string, maxLength: number): string {
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return escapeXml(clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean);
}

function heading(title: string, note: string, y: number): string {
  return `<rect x="24" y="${y}" width="5" height="21" rx="2.5" fill="#20bd6c"/>
    <text x="42" y="${y + 18}" fill="#e4f2e9" font-size="20" font-weight="700" font-family="Arial, Helvetica, sans-serif" letter-spacing="1.4">${title}</text>
    <text x="896" y="${y + 17}" text-anchor="end" fill="#91ad9c" font-size="14" font-family="Arial, Helvetica, sans-serif">${note}</text>`;
}

function stackTiles(stack: string[], y: number): string {
  return stack.map((value, index) => {
    const x = 24 + (index % 3) * (TILE_WIDTH + GAP);
    const top = y + Math.floor(index / 3) * 90;
    const glyph = Object.hasOwn(glyphs, value) ? glyphs[value] : glyphs.__fallback;
    const fallback = glyph === glyphs.__fallback;
    return `<rect x="${x}" y="${top}" width="${TILE_WIDTH}" height="76" rx="16" fill="#20292b" stroke="#385148"/>
      <rect x="${x + 13}" y="${top + 13}" width="50" height="50" rx="12" fill="#121b1c"/>
      <svg x="${x + 24}" y="${top + 24}" width="28" height="28" viewBox="${glyph.viewBox}" fill="${fallback ? 'none' : glyph.color}" stroke="${fallback ? glyph.color : 'none'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph.body}</svg>
      <text x="${x + 76}" y="${top + 46}" fill="#f3f7f4" font-size="21" font-weight="650" font-family="Arial, Helvetica, sans-serif">${label(value, 22)}</text>`;
  }).join('');
}

function achievementTiles(profile: DiscordProfile, y: number): string {
  return profile.achievements.slice(0, 3).map((item, index) => {
    const x = 24 + index * (TILE_WIDTH + GAP);
    const detail = item.project || 'DevLoot achievement';
    const result = item.points > 0 ? `${item.points} points` : `Earned ${item.deliveredAt.slice(0, 10)}`;
    return `<rect x="${x}" y="${y}" width="${TILE_WIDTH}" height="108" rx="16" fill="#20292b" stroke="#385148"/>
      <rect x="${x + 13}" y="${y + 18}" width="45" height="45" rx="12" fill="#302a1c"/>
      <path d="M${x + 35.5} ${y + 26}l3.3 7.3 8 1-5.9 5.4 1.5 7.9-6.9-3.9-6.9 3.9 1.5-7.9-5.9-5.4 8-1z" fill="#e8b95c"/>
      <text x="${x + 70}" y="${y + 42}" fill="#f3f7f4" font-size="20" font-weight="650" font-family="Arial, Helvetica, sans-serif">${label(item.name, 20)}</text>
      <text x="${x + 70}" y="${y + 66}" fill="#b2c3b8" font-size="15" font-family="Arial, Helvetica, sans-serif">${label(detail, 23)}</text>
      <text x="${x + 70}" y="${y + 91}" fill="#e8b95c" font-size="15" font-family="Arial, Helvetica, sans-serif">${label(result, 25)}</text>`;
  }).join('');
}

/** Optional visual sections; facts remain in the native Discord embed. */
export async function renderProfileSections(profile: DiscordProfile): Promise<Buffer | null> {
  const stack = [...new Set((profile.assessment?.stack ?? [])
    .slice(0, 20).map((item) => item.trim()).filter(Boolean))].slice(0, 6);
  const awards = profile.achievements.slice(0, 3);
  let cursor = 24;
  let sections = '';
  const milestoneComplete = profile.bountiesClaimed > 0;
  sections += heading('FIRST BOUNTY CLAIM', milestoneComplete ? 'MILESTONE COMPLETE' : 'PROGRESS', cursor);
  cursor += 40;
  sections += `<rect x="24" y="${cursor}" width="872" height="80" rx="16" fill="#20292b" stroke="${milestoneComplete ? '#20bd6c' : '#385148'}"/>
    <text x="48" y="${cursor + 34}" fill="#f3f7f4" font-size="23" font-weight="700" font-family="Arial, Helvetica, sans-serif">${milestoneComplete ? 'First bounty claimed' : 'Claim your first bounty'}</text>
    <text x="48" y="${cursor + 59}" fill="#b2c3b8" font-size="16" font-family="Arial, Helvetica, sans-serif">${milestoneComplete ? 'Confirmed by DevLoot Core' : 'Complete a funded bounty to unlock this milestone'}</text>
    <text x="872" y="${cursor + 49}" text-anchor="end" fill="${milestoneComplete ? '#20bd6c' : '#91ad9c'}" font-size="25" font-weight="700" font-family="Arial, Helvetica, sans-serif">${profile.bountiesClaimed} ${profile.bountiesClaimed === 1 ? 'CLAIM' : 'CLAIMS'}</text>`;
  cursor += 104;
  if (stack.length) {
    const note = profile.assessment ? `UPDATED ${label(profile.assessment.updatedAt.slice(0, 10), 10)}` : '';
    sections += heading('TECH STACK', note, cursor);
    cursor += 40;
    sections += stackTiles(stack, cursor);
    cursor += Math.ceil(stack.length / 3) * 76 + (Math.ceil(stack.length / 3) - 1) * 14 + 28;
  }
  if (awards.length) {
    sections += heading('ACHIEVEMENT HIGHLIGHTS', `${awards.length} OF ${profile.achievementsEarned} SHOWN`, cursor);
    cursor += 40;
    sections += achievementTiles(profile, cursor);
    cursor += 108 + 24;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${cursor}" viewBox="0 0 ${WIDTH} ${cursor}">
    <rect width="${WIDTH}" height="${cursor}" rx="20" fill="#151c1d"/>
    ${sections}
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
