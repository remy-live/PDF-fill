// Suite de non-régression de l'éditeur PDF.
//
//   node tests/make-fixtures.js <dossier>/libs     # PDF d'essai
//   npx http-server <dossier> -p 8377 -s           # sert index.html + libs
//   node tests/run.js [http://127.0.0.1:8377/index.html]
//
// Le dossier servi doit contenir index.html, libs/ (bibliothèques + PDF d'essai),
// icons/, manifest.webmanifest et sw.js.
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://127.0.0.1:8377/index.html';
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium';
const errors = [];
const fail = (msg) => errors.push(msg);

// Le document d'essai est composé en 11 pt ; le fond est rendu à 2x,
// donc une police de 22 unités de canevas correspond au texte imprimé.
const TAILLE_DOC = 22;

async function ouvrir(browser, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const page = await ctx.newPage();
  page.on('pageerror', e => fail(`erreur JS : ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') fail(`console : ${m.text()}`); });
  await page.goto(URL);
  await page.waitForTimeout(3000);
  return { ctx, page };
}

const charger = async (page, pdf) => {
  await page.setInputFiles('#file-upload', pdf);
  await page.waitForTimeout(4000);
};

const zones = (page, kind) => page.evaluate((k) => canvas.getObjects()
  .filter(o => o.isFieldHint && (!k || o.fieldKind === k))
  .sort((a, b) => (a.top - b.top) || (a.left - b.left))
  .map(o => ({ kind: o.fieldKind, x: o.left / 2, y: o.top / 2, w: o.width / 2, h: o.height / 2,
               lineY: o.lineY, filled: !!o.isFilled, lie: !!o._filledWith })), kind);

const enEdition = (page) => page.evaluate(() => {
  const a = canvas.getActiveObject();
  return a && a.isEditing ? { texte: a.text, police: a.fontSize, top: a.top } : null;
});

const textes = (page) => page.evaluate(() =>
  canvas.getObjects().filter(o => o.type === 'i-text').map(o => o.text));

// Clique un point exprimé en coordonnées du document (unités de canevas)
async function cliquerDoc(page, x, y) {
  const p = await page.evaluate(([dx, dy]) => {
    const pt = fabric.util.transformPoint(new fabric.Point(dx, dy), canvas.viewportTransform);
    return { x: pt.x, y: pt.y };
  }, [x, y]);
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(450);
}

// --- A. Détection des zones sur un document sans champs interactifs ---
async function detection(browser) {
  const { ctx, page } = await ouvrir(browser, { width: 1440, height: 900 });
  await charger(page, 'libs/certificat.pdf');

  const t = await zones(page, 'text'), c = await zones(page, 'check');
  const pres = (haut, x1, x2, tol = 22) =>
    t.some(z => Math.abs(z.y + z.h - haut) < tol && z.x < x2 && z.x + z.w > x1);

  if (!pres(240, 170, 450)) fail('A : pointillés « Docteur ... » non détectés');
  if (!pres(258, 185, 365)) fail('A : pointillés « M./Mme ... » non détectés');
  if (!pres(408, 105, 190)) fail('A : date « ...../...../..... » non détectée');
  if (!pres(408, 205, 480)) fail('A : lieu « A ........ » non détecté');
  if (c.length !== 2) fail(`A : ${c.length} case(s) à cocher au lieu de 2`);
  if (t.some(z => z.y < 40 || z.y + z.h > 800)) fail('A : cadre de page pris pour une zone');
  if (t.some(z => z.y + z.h > 60 && z.y < 140 && z.w > 100)) fail('A : bordures du tableau prises pour une zone');
  if (t.some(z => Math.abs(z.y + z.h - 192) < 12)) fail('A : sommets des capitales du titre pris pour une zone');
  if (t.length > 8) fail(`A : ${t.length} zones texte, dérive probable`);

  // La fiche scolaire : ni le titre souligné ni le paragraphe
  await charger(page, 'libs/worksheet.pdf');
  const f = await zones(page, 'text');
  if (f.length < 4) fail(`A : fiche, ${f.length} zones au lieu de 4 au moins`);
  if (f.some(z => z.y + z.h < 80)) fail('A : fiche, titre souligné pris pour une zone');
  if (f.filter(z => z.y > 350 && z.y < 450).length > 1) fail('A : fiche, paragraphe pris pour des zones');
  await ctx.close();
}

// --- B. Remplissage : clic sur le trait, taille et alignement ---
async function remplissage(browser) {
  const { ctx, page } = await ouvrir(browser, { width: 1440, height: 900 });
  await charger(page, 'libs/certificat.pdf');
  const t = await zones(page, 'text');

  for (let i = 0; i < t.length; i++) {
    const z = t[i];
    if (z.height > TAILLE_DOC * 3) fail(`B : zone ${i} trop haute (${Math.round(z.h * 2)})`);
    // Cliquer SUR le trait, geste naturel, et non dans le blanc au-dessus
    await cliquerDoc(page, (z.x + z.w / 2) * 2, z.lineY);
    const e = await enEdition(page);
    if (!e) { fail(`B : clic sur le trait de la zone ${i} sans effet`); continue; }
    if (Math.abs(e.police - TAILLE_DOC) > 3)
      fail(`B : zone ${i}, police ${Math.round(e.police)} au lieu de ~${TAILLE_DOC}`);
    const base = e.top + e.police * 1.13 * 0.778;
    if (Math.abs(base - z.lineY) > 4)
      fail(`B : zone ${i}, ligne de base à ${Math.round(base)} au lieu de ${Math.round(z.lineY)}`);
    await page.keyboard.type('T' + i);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(250);
  }

  // Les cases se cochent
  const c = await zones(page, 'check');
  for (const z of c) await cliquerDoc(page, (z.x + z.w / 2) * 2, (z.y + z.h / 2) * 2);
  const coches = await page.evaluate(() => canvas.getObjects().filter(o => o.type === 'path').length);
  if (coches !== c.length) fail(`B : ${coches} case(s) cochée(s) sur ${c.length}`);
  await ctx.close();
}

// --- C. Le clic reste juste après un zoom ou un déplacement ---
// setViewportTransform recalcule les zones de clic ; en modifiant le cadrage
// directement, la détection restait figée et les clics tombaient à côté.
async function clicApresDeplacement(browser) {
  const { ctx, page } = await ouvrir(browser, { width: 1440, height: 900 });
  await charger(page, 'libs/certificat.pdf');

  for (let i = 0; i < 2; i++) { await page.click('#zoom-bar button[title="Agrandir"]'); await page.waitForTimeout(250); }
  await page.mouse.move(700, 450);
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(150); }

  // On vise une zone réellement à l'écran : ce qui est testé, c'est la justesse
  // de la détection de clic après un changement de cadrage, pas la chance.
  const cible = await page.evaluate(() => {
    const vp = canvas.viewportTransform;
    for (const h of canvas.getObjects().filter(o => o.isFieldHint && o.fieldKind === 'text')) {
      const p = fabric.util.transformPoint(
        new fabric.Point(h.left + h.width / 2, h.lineY || (h.top + h.height / 2)), vp);
      if (p.x > 60 && p.x < innerWidth - 60 && p.y > 90 && p.y < innerHeight - 190) return p;
    }
    return null;
  });
  if (!cible) { fail('C : aucune zone visible après le déplacement, test non concluant'); await ctx.close(); return; }
  await page.mouse.click(cible.x, cible.y);
  await page.waitForTimeout(450);
  if (!await enEdition(page)) fail('C : après zoom et défilement, le clic ne trouve plus le champ');
  await page.keyboard.type('Apres');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  if (!(await textes(page)).includes('Apres')) fail('C : saisie impossible après déplacement');
  await ctx.close();
}

// --- D. Tabulation entre champs ---
async function tabulation(browser) {
  const { ctx, page } = await ouvrir(browser, { width: 1440, height: 900 });
  await charger(page, 'libs/form.pdf');
  const t = await zones(page);

  await cliquerDoc(page, (t[0].x + t[0].w / 2) * 2, (t[0].y + t[0].h / 2) * 2);
  await page.keyboard.type('Remy');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);

  const idx = () => page.evaluate(() => canvas.getObjects().filter(o => o.isFieldHint)
    .sort((a, b) => (a.top - b.top) || (a.left - b.left)).indexOf(currentFieldHint));
  if (await idx() !== 1) fail(`D : Tab n'avance pas au champ suivant (${await idx()})`);
  if (!await enEdition(page)) fail('D : Tab n\'ouvre pas la saisie suivante');
  if (!(await textes(page)).includes('Remy')) fail('D : valeur perdue au changement de champ');

  await page.keyboard.type('Bruxelles');
  await page.keyboard.press('Tab');
  await page.waitForTimeout(600);
  if (await page.evaluate(() => currentFieldHint && currentFieldHint.fieldKind) !== 'check')
    fail('D : Tab n\'atteint pas la case à cocher');

  const avant = await page.evaluate(() => canvas.getObjects().filter(o => o.type === 'path').length);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  if (await page.evaluate(() => canvas.getObjects().filter(o => o.type === 'path').length) !== avant + 1)
    fail('D : Espace ne coche pas la case');

  // Retour arrière : la valeur précédente se rouvre, sélectionnée
  await cliquerDoc(page, (t[1].x + t[1].w / 2) * 2, (t[1].y + t[1].h / 2) * 2);
  await page.keyboard.press('Shift+Tab');
  await page.waitForTimeout(600);
  const e = await enEdition(page);
  if (!e || e.texte !== 'Remy') fail(`D : Maj+Tab ne rouvre pas le champ précédent (${JSON.stringify(e)})`);

  // --- E. Après rechargement, les champs remplis restent modifiables ---
  await page.keyboard.press('Escape');
  await page.waitForTimeout(2500);
  await page.reload();
  await page.waitForTimeout(5000);

  if (!(await textes(page)).includes('Remy')) fail('E : session non restaurée');
  const apres = await zones(page);
  const remplis = apres.filter(z => z.filled);
  if (!remplis.length) fail('E : aucune zone reconnue comme remplie après rechargement');
  const texteRemplis = remplis.filter(z => z.kind === 'text');
  if (texteRemplis.some(z => !z.lie))
    fail('E : des zones remplies ne sont plus reliées à leur saisie après rechargement');

  const zr = texteRemplis[0];
  await cliquerDoc(page, (zr.x + zr.w / 2) * 2, (zr.y + zr.h / 2) * 2);
  if (!await enEdition(page)) fail('E : clic sans effet sur une zone remplie après rechargement');
  await ctx.close();
}

// --- F. Aucune trace du curseur de saisie quand la vue bouge ---
async function curseur(browser) {
  const { ctx, page } = await ouvrir(browser, { width: 1440, height: 900 });
  await charger(page, 'libs/certificat.pdf');

  const colonnes = () => page.evaluate(() => {
    const el = canvas.upperCanvasEl, d = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
    const w = el.width, h = el.height, cols = [];
    for (let x = 0; x < w; x++) {
      let n = 0;
      for (let y = 0; y < h; y++) {
        const i = (y * w + x) * 4;
        if (d[i + 3] > 60 && (d[i] + d[i + 1] + d[i + 2]) / 3 < 140) n++;
      }
      if (n > 8) cols.push(x);
    }
    let g = 0, prev = -99;
    cols.forEach(x => { if (x - prev > 3) g++; prev = x; });
    return g;
  });

  const z = (await zones(page, 'text'))[0];
  await cliquerDoc(page, (z.x + z.w / 2) * 2, z.lineY);
  await page.keyboard.type('Docteur Martin');
  await page.waitForTimeout(500);

  for (let i = 0; i < 3; i++) { await page.click('#zoom-bar button[title="Agrandir"]'); await page.waitForTimeout(300); }
  if (await colonnes() > 1) fail('F : traits résiduels du curseur après zoom');
  await page.mouse.move(700, 450);
  for (let i = 0; i < 4; i++) { await page.mouse.wheel(30, 40); await page.waitForTimeout(200); }
  if (await colonnes() > 1) fail('F : traits résiduels du curseur après défilement');
  await ctx.close();
}

// --- G. Déplacement dans la feuille ---
async function deplacement(browser) {
  const { ctx, page } = await ouvrir(browser, { width: 1440, height: 900 });
  await charger(page, 'libs/certificat.pdf');
  const vue = () => page.evaluate(() => ({
    x: canvas.viewportTransform[4], y: canvas.viewportTransform[5], z: canvas.getZoom() }));

  let a = await vue();
  await page.mouse.move(700, 450);
  await page.mouse.wheel(0, 240);
  await page.waitForTimeout(300);
  let b = await vue();
  if (Math.abs(b.y - a.y) < 50) fail('G : la molette ne fait pas défiler');
  if (Math.abs(b.z - a.z) > 0.001) fail('G : la molette modifie le zoom');

  a = await vue();
  await page.keyboard.down('Shift');
  await page.mouse.wheel(0, 200);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(300);
  if (Math.abs((await vue()).x - a.x) < 50) fail('G : Maj+molette ne défile pas horizontalement');

  a = await vue();
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -300);
  await page.keyboard.up('Control');
  await page.waitForTimeout(300);
  if ((await vue()).z <= a.z) fail('G : Ctrl+molette ne zoome pas');

  await page.click('#zoom-level'); await page.waitForTimeout(400);
  await page.click('[data-tool="pan"]'); await page.waitForTimeout(300);
  if (await page.evaluate(() => canvas.defaultCursor) !== 'grab') fail('G : outil Main sans curseur de main');

  a = await vue();
  await page.mouse.move(700, 450);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) { await page.mouse.move(700 + i * 20, 450 + i * 12); await page.waitForTimeout(50); }
  await page.mouse.up();
  await page.waitForTimeout(300);
  b = await vue();
  if (Math.abs(b.x - a.x) < 60 || Math.abs(b.y - a.y) < 40) fail('G : l\'outil Main ne déplace pas la feuille');
  if (await page.evaluate(() => !!canvas.getActiveObject())) fail('G : l\'outil Main sélectionne un objet');

  await page.click('[data-tool="select"]'); await page.waitForTimeout(300);
  a = await vue();
  await page.keyboard.down('Space');
  await page.waitForTimeout(200);
  if (await page.evaluate(() => canvas.defaultCursor) !== 'grab') fail('G : Espace maintenu ne donne pas la main');
  await page.mouse.move(700, 450);
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) { await page.mouse.move(700 - i * 18, 450 - i * 10); await page.waitForTimeout(50); }
  await page.mouse.up();
  await page.keyboard.up('Space');
  await page.waitForTimeout(300);
  if (Math.abs((await vue()).x - a.x) < 50) fail('G : Espace + glisser ne déplace pas');
  if (await page.evaluate(() => canvas.defaultCursor) === 'grab') fail('G : le curseur main persiste après relâchement');

  // La feuille ne doit jamais sortir entièrement de l'écran
  const visible = async () => page.evaluate(() => {
    const bg = canvas.backgroundImage, z = canvas.getZoom();
    const x = canvas.viewportTransform[4], y = canvas.viewportTransform[5];
    const w = bg.width * z, h = bg.height * z;
    return { iw: Math.max(0, Math.min(innerWidth, x + w) - Math.max(0, x)),
             ih: Math.max(0, Math.min(innerHeight, y + h) - Math.max(0, y)) };
  });
  for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 400);
  await page.waitForTimeout(400);
  let v = await visible();
  if (v.iw < 50 || v.ih < 50) fail('G : feuille perdue en défilant vers le bas');
  for (let i = 0; i < 60; i++) await page.mouse.wheel(0, -400);
  await page.waitForTimeout(400);
  v = await visible();
  if (v.iw < 50 || v.ih < 50) fail('G : feuille perdue en défilant vers le haut');
  await ctx.close();
}

// --- H. Mise en page sur téléphone, tablette et ordinateur ---
async function miseEnPage(browser) {
  for (const [nom, vp, tactile] of [
    ['téléphone', { width: 390, height: 844 }, true],
    ['tablette', { width: 820, height: 1180 }, true],
    ['ordinateur', { width: 1440, height: 900 }, false],
  ]) {
    const { ctx, page } = await ouvrir(browser, vp,
      tactile ? { hasTouch: true, isMobile: vp.width < 500, deviceScaleFactor: 2 } : {});
    await charger(page, 'libs/certificat.pdf');
    for (const sel of ['#btn-open', '#btn-images', '#export-btn', '#btn-menu', '#zoom-bar', '#main-toolbar', '#bottom-bar']) {
      const b = await page.locator(sel).boundingBox();
      if (!b) { fail(`H : ${nom}, ${sel} absent`); continue; }
      if (b.x < -1 || b.x + b.width > vp.width + 1 || b.y < -1 || b.y + b.height > vp.height + 1)
        fail(`H : ${nom}, ${sel} hors écran`);
    }
    const haut = await page.locator('#main-toolbar').boundingBox();
    const bas = await page.locator('#bottom-bar').boundingBox();
    if (haut.y + haut.height > bas.y) fail(`H : ${nom}, les barres se chevauchent`);
    if (vp.width < 500 && haut.y > 60) fail('H : téléphone, outils pas en haut');

    const part = await page.evaluate(() => canvas.backgroundImage.height * canvas.getZoom() / innerHeight);
    if (part < 0.5) fail(`H : ${nom}, la page n'occupe que ${Math.round(part * 100)} % de la hauteur`);
    await ctx.close();
  }
}

// --- I. Export : texte vectoriel et formulaire aplati ---
async function exportation(browser) {
  const { ctx, page } = await ouvrir(browser, { width: 1440, height: 900 });
  await charger(page, 'libs/form.pdf');
  const t = await zones(page, 'text');
  await cliquerDoc(page, (t[0].x + t[0].w / 2) * 2, (t[0].y + t[0].h / 2) * 2);
  await page.keyboard.type('Marie Durand');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  const dl = page.waitForEvent('download', { timeout: 60000 });
  await page.click('#export-btn');
  const fichier = require('path').join(require('os').tmpdir(), 'export-test.pdf');
  await (await dl).saveAs(fichier);
  await page.waitForTimeout(500);

  const { PDFDocument } = require('pdf-lib');
  const doc = await PDFDocument.load(require('fs').readFileSync(fichier));
  let champs = 0;
  try { champs = doc.getForm().getFields().length; } catch (e) {}
  if (champs !== 0) fail(`I : ${champs} champ(s) interactif(s) restant(s) dans le PDF exporté`);
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  const etapes = [
    ['A détection', detection], ['B remplissage', remplissage],
    ['C clic après déplacement', clicApresDeplacement], ['D+E tabulation et rechargement', tabulation],
    ['F curseur', curseur], ['G déplacement', deplacement],
    ['H mise en page', miseEnPage], ['I export', exportation],
  ];
  for (const [nom, fn] of etapes) {
    const avant = errors.length;
    try { await fn(browser); } catch (e) { fail(`${nom} : exception — ${e.message}`); }
    console.log(`${errors.length === avant ? '  ok  ' : ' ECHEC'}  ${nom}`);
  }
  await browser.close();
  console.log(errors.length ? '\nERREURS :\n- ' + errors.join('\n- ') : '\nTOUT EST VERT');
  process.exit(errors.length ? 1 : 0);
})();
