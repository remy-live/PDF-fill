// Génère les PDF d'essai utilisés par les tests.
//   node tests/make-fixtures.js <dossier-de-sortie>
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

const out = process.argv[2] || 'fixtures';
fs.mkdirSync(out, { recursive: true });
const W = 595.28, H = 841.89, K = rgb(0, 0, 0);

async function formulaire() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([W, H]);
  page.drawText('Formulaire de test', { x: 50, y: H - 60, size: 24, font });
  const form = doc.getForm();
  form.createTextField('nom').addToPage(page, { x: 150, y: H - 142, width: 300, height: 28 });
  page.drawText('Nom :', { x: 50, y: H - 134, size: 14, font });
  form.createTextField('ville').addToPage(page, { x: 150, y: H - 192, width: 300, height: 28 });
  page.drawText('Ville :', { x: 50, y: H - 184, size: 14, font });
  form.createCheckBox('accepte').addToPage(page, { x: 150, y: H - 242, width: 22, height: 22 });
  page.drawText("J'accepte :", { x: 50, y: H - 237, size: 14, font });
  fs.writeFileSync(path.join(out, 'form.pdf'), await doc.save());
}

// Fiche sans champs interactifs : traits pleins, pointillés, titre souligné, paragraphe
async function fiche() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([W, H]);
  page.drawText('Fiche de travail - Les fractions', { x: 50, y: H - 60, size: 18, font });
  page.drawLine({ start: { x: 50, y: H - 68 }, end: { x: 300, y: H - 68 }, thickness: 1, color: K });

  let y = H - 140;
  ['Nom', 'Prenom', 'Classe'].forEach(lab => {
    page.drawText(lab + ' :', { x: 50, y: y + 4, size: 12, font });
    page.drawLine({ start: { x: 130, y }, end: { x: 400, y }, thickness: 1, color: K });
    y -= 50;
  });

  y -= 20;
  page.drawText('Reponse :', { x: 50, y: y + 4, size: 12, font });
  for (let x = 130; x < 420; x += 6) {
    page.drawLine({ start: { x, y }, end: { x: x + 2, y }, thickness: 1, color: K });
  }

  y -= 60;
  for (let i = 0; i < 5; i++) {
    page.drawText('Une fraction est un nombre qui represente une partie d une unite entiere.',
      { x: 50, y, size: 11, font });
    y -= 16;
  }
  fs.writeFileSync(path.join(out, 'worksheet.pdf'), await doc.save());
}

// Certificat : pointillés AU MILIEU du texte, cases à cocher, cadre et tableau
async function certificat() {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([W, H]);

  page.drawRectangle({ x: 30, y: 30, width: W - 60, height: H - 60, borderWidth: 1, borderColor: K, opacity: 0 });
  page.drawRectangle({ x: 160, y: H - 130, width: 320, height: 60, borderWidth: 1, borderColor: K, opacity: 0 });
  page.drawLine({ start: { x: 160, y: H - 100 }, end: { x: 480, y: H - 100 }, thickness: 1, color: K });
  page.drawText('Certificat Medical', { x: 250, y: H - 92, size: 11, font: gras });
  page.drawText('Saison 2026/2027', { x: 255, y: H - 120, size: 11, font });
  page.drawText('CERTIFICAT MEDICAL', { x: 60, y: H - 200, size: 12, font: gras });

  let y = H - 240;
  page.drawText('Je soussigne, Docteur', { x: 60, y, size: 11, font });
  page.drawText('.'.repeat(60), { x: 175, y, size: 11, font });
  page.drawText('certifie avoir', { x: 445, y, size: 11, font });

  y -= 18;
  page.drawText('examine ce jour M./Mme', { x: 60, y, size: 11, font });
  page.drawText('.'.repeat(35), { x: 190, y, size: 11, font });
  page.drawText('et n avoir decele', { x: 360, y, size: 11, font });

  y -= 60;
  page.drawRectangle({ x: 80, y, width: 10, height: 10, borderWidth: 1, borderColor: K, opacity: 0 });
  page.drawText('la pratique du basket en competition', { x: 100, y: y + 2, size: 11, font });
  y -= 40;
  page.drawRectangle({ x: 80, y, width: 10, height: 10, borderWidth: 1, borderColor: K, opacity: 0 });
  page.drawText('la pratique du sport non competitif', { x: 100, y: y + 2, size: 11, font });

  y -= 50;
  page.drawText('FAIT LE', { x: 60, y, size: 11, font });
  page.drawText('...../...../.....', { x: 105, y, size: 11, font });
  page.drawText('A', { x: 190, y, size: 11, font });
  page.drawText('.'.repeat(40), { x: 205, y, size: 11, font });

  fs.writeFileSync(path.join(out, 'certificat.pdf'), await doc.save());
}

(async () => {
  await formulaire();
  await fiche();
  await certificat();
  console.log('PDF d\'essai créés dans', out);
})();
