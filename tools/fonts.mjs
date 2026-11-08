// Builds small self-hosted fonts: variable Inter and Montserrat cover every weight
// in two files, trimmed to Latin text and common punctuation.
import fs from 'node:fs/promises';
import subsetFont from 'subset-font';

const latin = Array.from({ length: 0x24f - 0x20 + 1 }, (_, i) => String.fromCodePoint(0x20 + i)).join('') + '–—‘’“”•…€™·→✓';
const fonts = [
  ['inter', 'Inter', 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', '100 900'],
  ['montserrat', 'Montserrat', 'node_modules/@fontsource-variable/montserrat/files/montserrat-latin-wght-normal.woff2', '100 900'],
  ['alex-brush', 'Alex Brush', 'node_modules/@fontsource/alex-brush/files/alex-brush-latin-400-normal.woff2', '400'],
];
await fs.mkdir('public/fonts', { recursive: true });
let css = '';
for (const [file, family, source, weight] of fonts) {
  const out = await subsetFont(await fs.readFile(source), latin, { targetFormat: 'woff2' });
  await fs.writeFile(`public/fonts/${file}.woff2`, out);
  css += `@font-face{font-family:"${family}";font-style:normal;font-weight:${weight};font-display:swap;src:url(/fonts/${file}.woff2) format("woff2")}\n`;
  console.log(file, Math.round(out.length / 1024), 'KB');
}
await fs.writeFile('src/styles/fonts.css', css, 'utf8');
