import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await readFile(path.join(root, 'src/app/shared/brand/brand-shapes.ts'), 'utf8');
const mark = source.match(/BRAVISO_MARK = '([^']+)'/)[1];
const wordmark = source.match(/BRAVISO_WORDMARK = '([^']+)'/)[1];
const brandDir = path.join(root, 'public/brand');
const iconsDir = path.join(root, 'public/icons');
const docsDir = path.join(root, 'docs/branding');
await mkdir(brandDir, { recursive: true });
await mkdir(iconsDir, { recursive: true });
await mkdir(docsDir, { recursive: true });
const symbol = `<path d="${mark}" fill="currentColor" fill-rule="evenodd"/>`;
const letters = `<path d="${wordmark}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="square" stroke-linejoin="round"/>`;
const svg = (viewBox, body, color) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="BRAVISO" color="${color}">${body}</svg>`;

for (const [theme, color] of [['light', '#285444'], ['dark', '#d4e5aa'], ['mono', '#000000']]) {
  await writeFile(path.join(brandDir, `braviso-horizontal-${theme}.svg`), svg('0 0 254 64', symbol + `<g transform="translate(70 18)">${letters}</g>`, color));
  await writeFile(path.join(brandDir, `braviso-compact-${theme}.svg`), svg('0 0 200 116', `<g transform="translate(68 0)">${symbol}</g><g transform="translate(9 80)">${letters}</g>`, color));
  await writeFile(path.join(brandDir, `braviso-symbol-${theme}.svg`), svg('0 0 64 64', symbol, color));
}
const iconSvg = (maskable = false) => svg('0 0 64 64', `<rect width="64" height="64" ${maskable ? '' : 'rx="14"'} fill="#173e35"/><g transform="translate(9.6 8.8) scale(.7)">${symbol}</g>`, '#dce7b1');
await writeFile(path.join(root, 'public/favicon.svg'), iconSvg());
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  for (const [file, size, maskable] of [
    ['icon-192.png', 192, true],
    ['icon-512.png', 512, true],
    ['apple-touch-icon.png', 180, true],
    ['icon-192-maskable.png', 192, true],
    ['icon-512-maskable.png', 512, true],
    ['favicon-32.png', 32, false],
  ]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><head><style>html,body{margin:0;width:100%;height:100%;background:transparent}svg{display:block;width:100%;height:100%}</style></head><body>${iconSvg(maskable)}</body></html>`);
    await page.screenshot({ path: path.join(iconsDir, file), omitBackground: true });
  }
  const png = await readFile(path.join(iconsDir, 'favicon-32.png'));
  const ico = Buffer.alloc(22);
  ico.writeUInt16LE(1, 2);
  ico.writeUInt16LE(1, 4);
  ico.writeUInt8(32, 6);
  ico.writeUInt8(32, 7);
  ico.writeUInt16LE(1, 10);
  ico.writeUInt16LE(32, 12);
  ico.writeUInt32LE(png.length, 14);
  ico.writeUInt32LE(22, 18);
  await writeFile(path.join(root, 'public/favicon.ico'), Buffer.concat([ico, png]));
  const horizontal = color => svg('0 0 254 64', symbol + `<g transform="translate(70 18)">${letters}</g>`, color);
  const compact = color => svg('0 0 200 116', `<g transform="translate(68 0)">${symbol}</g><g transform="translate(9 80)">${letters}</g>`, color);
  const board = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BRAVISO · Identidad visual</title><style>
  *{box-sizing:border-box}body{margin:0;background:#f5f5ef;color:#233c32;font-family:system-ui,sans-serif;padding:48px}main{max-width:1100px;margin:auto}header{display:flex;justify-content:space-between;align-items:end;margin-bottom:36px}h1{font:44px Georgia,serif;letter-spacing:-1.5px;margin:10px 0}p{font-size:13px;line-height:1.7;color:#5e6e62}.eyebrow{font-size:10px;letter-spacing:2px}header svg{width:150px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.tile{background:white;border:1px solid #d9dfd3;border-radius:20px;padding:28px;min-height:200px;display:flex;flex-direction:column;justify-content:space-between;gap:24px}.tile>svg{width:270px;max-width:100%;margin:auto}.tile span{font-size:10px;letter-spacing:1px}.dark{background:#173e35;color:#dce7b1}.compact>svg{width:145px}.swatches{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.swatch{flex:1;min-width:120px;font-size:11px}.swatch i{display:block;height:48px;border-radius:8px;margin-bottom:8px;border:1px solid #233c321a}.sizes{display:flex;gap:32px;align-items:center;min-height:90px}.sizes svg{width:64px}.sizes svg:nth-child(2){width:32px}.sizes svg:nth-child(3){width:16px}.footer{border-top:1px solid #d9dfd3;padding-top:16px;margin-top:24px}@media(max-width:600px){body{padding:24px}.grid{grid-template-columns:1fr}header{display:block}h1{font-size:32px}}
  </style><main><header><div><span class="eyebrow">SISTEMA DE IDENTIDAD · 01</span><h1>BRAVISO</h1><p>Tu dinero, en perspectiva.</p></div>${horizontal('#285444')}</header><div class="grid"><div class="tile">${horizontal('#285444')}<span>HORIZONTAL · FONDO CLARO</span></div><div class="tile dark">${horizontal('#d4e5aa')}<span>HORIZONTAL · FONDO OSCURO</span></div><div class="tile compact">${compact('#285444')}<span>COMPACTO · EQUILIBRIO Y DIRECCIÓN</span></div><div class="tile"><div class="sizes">${svg('0 0 64 64',symbol,'#000000')}${svg('0 0 64 64',symbol,'#000000')}${svg('0 0 64 64',symbol,'#000000')}${iconSvg()}</div><span>ISOTIPO · MONOCROMO · ICONO DE INSTALACIÓN</span></div></div><div class="swatches">${[['Bosque','#173e35'],['Verde de marca','#285444'],['Oliva claro','#d4e5aa'],['Crema','#f5f5ef']].map(([name,color])=>`<div class="swatch"><i style="background:${color}"></i>${name} · ${color.toUpperCase()}</div>`).join('')}</div><p class="footer">Una B estructurada en dos planos que comparten un eje. Sus extremos orientados hacia la derecha expresan perspectiva y dirección. Letras dibujadas como trazados vectoriales: sin fuentes externas ni imágenes enlazadas.</p></main></html>`;
  await writeFile(path.join(docsDir, 'identidad.html'), board);
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.setContent(board);
  await page.screenshot({ path: path.join(docsDir, 'identidad.png'), fullPage: true });
} finally {
  await browser.close();
}
process.stdout.write('BRAVISO: 9 SVG variants, SVG/ICO favicon and 6 PNG icons generated.\n');
