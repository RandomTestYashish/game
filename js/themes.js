// Court themes: four country environments, a Black Court surface on every
// third court, and the player's choice between automatic rotation and one
// fixed country. Visual only: nothing here touches the rules.
//
//   country  = floor((court - 1) / 2) % 4   Japan, New York, London, India
//   black    = court % 3 === 0              independent of the country

export const COUNTRIES = [
  {
    id: 'japan',
    name: 'JAPAN',
    title: 'SAKURA COURT',
    short: 'SAKURA COURT',
    accent: '#F5A6C8',
    court: { court: '#315E45', alt: '#3E7455', lines: '#E9E8C6' },
    black: { court: '#090D12', alt: '#111923', lines: '#F2B4D0' },
    bg: {
      sky: ['#171B3B', '#24204d', '#3d2660', '#6e2d6c', '#a8407a', '#D75A78', '#f7a0a8'],
      sun: { x: -54, lift: 16, r: 9, c: '#ffd0d8', band: '#f59ab0', glow: '#ffc0d0' },
      clouds: ['#3a2a5c', '#b9566f'],
      hills: ['#2a2a52', '#1d2b3a'],
      trees: { dark: '#123D2B', hi: '#2a6044', shade: '#0b2a1d', bush: '#163f2b', bushHi: '#21573a' },
      blossom: ['#c8679a', '#e88bb4', '#F5A6C8', '#fbd0e2'],
      wall: { base: '#5a5560', top: '#8a8492', top2: '#6f6a77', line: '#46424c', speck: ['#68636e', '#504c56'], pillar: '#6c6672', pillarTop: '#948d9a' },
      lamp: '#FFC96B',
    },
    ambient: { petals: '#F5A6C8', petalsHi: '#fbd0e2', petalRate: 1.6, fireflies: true },
  },
  {
    id: 'newyork',
    name: 'NEW YORK',
    title: 'CITY LIGHTS',
    short: 'CITY LIGHTS',
    accent: '#FF9B4A',
    court: { court: '#244F43', alt: '#315F51', lines: '#E7E7CF' },
    black: { court: '#070A10', alt: '#101722', lines: '#8CD9FF' },
    bg: {
      sky: ['#10182F', '#1b2350', '#2f2a5e', '#73306a', '#c2464f', '#E95B4B', '#FF9B4A'],
      sun: { x: 40, lift: 10, r: 12, c: '#ffc76a', band: '#ff9b4a', glow: '#ffb35c' },
      clouds: ['#33284f', '#c45a4f'],
      hills: ['#22263f', '#181e30'],
      trees: { dark: '#10261f', hi: '#1f4636', shade: '#09180f', bush: '#13291f', bushHi: '#1d3d2c' },
      wall: { base: '#4d4a4c', top: '#7c777a', top2: '#615d60', line: '#3b393b', speck: ['#5a5759', '#444143'], pillar: '#5f5b5e', pillarTop: '#87828a' },
      lamp: '#FFC76A',
    },
    ambient: { petals: null, petalRate: 0, fireflies: true },
  },
  {
    id: 'london',
    name: 'LONDON',
    title: 'CLASSIC GARDEN',
    short: 'CLASSIC GARDEN',
    accent: '#D77C63',
    court: { court: '#24553A', alt: '#326744', lines: '#E8E4C9' },
    black: { court: '#080B0C', alt: '#131916', lines: '#F0C68B' },
    bg: {
      sky: ['#171C35', '#252649', '#393051', '#584266', '#7a5070', '#a0607a', '#d49a8a'],
      clouds: ['#3b3352', '#8b5a6a'],
      hills: ['#2a2c45', '#1d2d2a'],
      trees: { dark: '#15301f', hi: '#2c5a38', shade: '#0f2417', bush: '#1a3d26', bushHi: '#225030' },
      wall: { base: '#77736D', top: '#9c978d', top2: '#86817a', line: '#5f5b55', speck: ['#827d75', '#69655f'], pillar: '#86817a', pillarTop: '#a8a297' },
      lamp: '#FFC66B',
    },
    ambient: { petals: '#f1eedd', petalsHi: '#d9c9c0', petalRate: 0.8, fireflies: true },
  },
  {
    id: 'india',
    name: 'INDIA',
    title: 'JAIPUR ROYAL COURT',
    short: 'ROYAL COURT',
    accent: '#FFAD5C',
    court: { court: '#42653A', alt: '#527642', lines: '#F2E4BD' },
    black: { court: '#0B0A0A', alt: '#1A1412', lines: '#FFD19A' },
    bg: {
      sky: ['#241B39', '#4a2142', '#79394F', '#b44a42', '#D75E3E', '#f08a3e', '#FFC46E'],
      sun: { x: -20, lift: 8, r: 15, c: '#ffe08a', band: '#ffad5c', glow: '#ffc96b' },
      clouds: ['#4d2a48', '#d0704a'],
      hills: ['#5a3446', '#3b2a33'],
      trees: { dark: '#1d3a22', hi: '#3a6a34', shade: '#132816', bush: '#24442a', bushHi: '#335f36' },
      wall: { base: '#B97750', top: '#E0AE78', top2: '#c98d60', line: '#94593a', speck: ['#c48860', '#a5684a'], pillar: '#c98d60', pillarTop: '#E0AE78' },
      lamp: '#FFC96B',
    },
    ambient: { petals: '#FFAD5C', petalsHi: '#ffd19a', petalRate: 0.7, fireflies: true },
  },
];

export const BY_ID = Object.fromEntries(COUNTRIES.map((c) => [c.id, c]));

// 'auto' rotates with the court number; a country id fixes that country.
export const THEME_CHOICES = ['auto', ...COUNTRIES.map((c) => c.id)];
export const cleanThemeChoice = (v) => (THEME_CHOICES.includes(v) ? v : 'auto');

export const autoCountryIndex = (court) => Math.floor((court - 1) / 2) % COUNTRIES.length;
export const isBlackCourt = (court) => court % 3 === 0;

export function getCourtTheme(courtNumber, choice = 'auto') {
  const court = Math.max(1, Math.floor(courtNumber) || 1);
  const pick = cleanThemeChoice(choice);
  const c = pick === 'auto' ? COUNTRIES[autoCountryIndex(court)] : BY_ID[pick];
  const black = isBlackCourt(court);
  const surface = black ? c.black : c.court;
  return {
    key: c.id + (black ? ':black' : ''),
    mode: pick === 'auto' ? 'auto' : 'manual',
    countryId: c.id,
    countryName: c.name,
    title: c.title,
    isBlackCourt: black,
    courtPalette: surface,
    backgroundPalette: c.bg,
    courtLineColor: surface.lines,
    accentColor: c.accent,
    ambientEffects: c.ambient,
  };
}
