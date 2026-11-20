// Singapore postal sectors (first 2 digits of 6-digit postal code) -> general area + approx centroid.
const AREAS: Array<[number[], string, number, number]> = [
  [[1, 2, 3, 4, 5, 6], 'Raffles Place / Marina', 1.2839, 103.8515],
  [[7, 8], 'Tanjong Pagar', 1.2764, 103.8458],
  [[9, 10], 'Telok Blangah / HarbourFront', 1.2706, 103.8195],
  [[11, 12, 13], 'Pasir Panjang / Clementi', 1.3015, 103.7745],
  [[14, 15, 16], 'Queenstown / Tiong Bahru', 1.2903, 103.8045],
  [[17], 'Beach Road', 1.2972, 103.8556],
  [[18, 19], 'Middle Road / Golden Mile', 1.3025, 103.8607],
  [[20, 21], 'Little India / Farrer Park', 1.3066, 103.8518],
  [[22, 23], 'Orchard / River Valley', 1.3036, 103.8318],
  [[24, 25, 26, 27], 'Tanglin / Holland', 1.3112, 103.7958],
  [[28, 29, 30], 'Bukit Timah', 1.3294, 103.8021],
  [[31, 32, 33], 'Novena / Toa Payoh', 1.3343, 103.8475],
  [[34, 35, 36, 37], 'MacPherson / Potong Pasir', 1.3268, 103.8836],
  [[38, 39, 40, 41], 'Geylang / Eunos', 1.3197, 103.8996],
  [[42, 43, 44, 45], 'Katong / Marine Parade', 1.3030, 103.9050],
  [[46, 47, 48], 'Bedok / Upper East Coast', 1.3236, 103.9273],
  [[49, 50, 81], 'Changi / Loyang', 1.3644, 103.9915],
  [[51, 52], 'Tampines / Pasir Ris', 1.3540, 103.9435],
  [[53, 54, 55, 82], 'Serangoon / Hougang / Punggol', 1.3725, 103.8930],
  [[56, 57], 'Bishan / Ang Mo Kio', 1.3610, 103.8480],
  [[58, 59], 'Upper Bukit Timah', 1.3580, 103.7700],
  [[60, 61, 62, 63, 64], 'Jurong / Boon Lay', 1.3404, 103.7090],
  [[65, 66, 67, 68], 'Bukit Batok / Choa Chu Kang', 1.3640, 103.7490],
  [[69, 70, 71], 'Lim Chu Kang / Tengah', 1.3720, 103.7180],
  [[72, 73], 'Kranji / Woodlands', 1.4382, 103.7890],
  [[75, 76], 'Yishun / Sembawang', 1.4290, 103.8350],
  [[77, 78], 'Upper Thomson / Springleaf', 1.3800, 103.8250],
  [[79, 80], 'Seletar / Yio Chu Kang', 1.3950, 103.8750],
];

export function lookupPostal(postal: string): { area: string; lat: number; lng: number } | null {
  if (!/^\d{6}$/.test(postal)) return null;
  const sector = Number(postal.slice(0, 2));
  const hit = AREAS.find(([s]) => s.includes(sector));
  if (!hit) return null;
  // deterministic small jitter so different postal codes don't stack on one point
  const n = Number(postal.slice(2));
  const jitter = (k: number) => (((n * k) % 1000) / 1000 - 0.5) * 0.012;
  return { area: hit[1], lat: +(hit[2] + jitter(7)).toFixed(5), lng: +(hit[3] + jitter(13)).toFixed(5) };
}
