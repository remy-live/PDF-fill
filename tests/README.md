# Tests

Suite de non-régression, jouée dans un vrai navigateur (Chromium via Playwright).
Elle vérifie le comportement observable de l'application, pas son code interne.

## Lancer

```bash
# 1. dépendances (dans un dossier de travail quelconque)
npm install playwright pdf-lib

# 2. dossier servi : l'application + les PDF d'essai
mkdir -p /tmp/pdf-test && cp -r index.html libs icons manifest.webmanifest sw.js /tmp/pdf-test/
node tests/make-fixtures.js /tmp/pdf-test/libs

# 3. servir puis jouer la suite
npx http-server /tmp/pdf-test -p 8377 -s &
node tests/run.js http://127.0.0.1:8377/index.html
```

`CHROME_PATH` permet de désigner un autre binaire Chromium.

## Ce qui est couvert

| | Vérification |
|---|---|
| **A** | Détection des zones sur un document sans champs : pointillés au milieu du texte, dates, cases à cocher. Et surtout ce qui ne doit **pas** être détecté — cadre de page, bordures de tableau, titre souligné, paragraphes. |
| **B** | Remplissage : un clic **sur le trait** ouvre la saisie, la police correspond au texte imprimé, la ligne de base tombe sur le trait. |
| **C** | Le clic reste juste **après un zoom ou un déplacement**. Sans cela, la détection reste figée sur l'ancien cadrage et tous les champs deviennent inatteignables. |
| **D** | Tabulation entre champs, Maj+Tab en arrière, Espace sur une case à cocher. |
| **E** | Après **rechargement complet**, les champs remplis sont toujours reliés à leur saisie et restent modifiables. |
| **F** | Aucune trace du curseur de saisie ne subsiste quand la vue bouge. |
| **G** | Déplacement : molette, Maj+molette, Ctrl+molette, outil Main, Espace+glisser, et impossibilité de perdre la feuille hors de l'écran. |
| **H** | Mise en page sur téléphone, tablette et ordinateur : barres en place, boutons dans l'écran, page occupant au moins la moitié de la hauteur. |
| **I** | Export : le formulaire est aplati, aucun champ interactif ne subsiste. |

## Les PDF d'essai

`make-fixtures.js` génère trois documents qui concentrent les pièges rencontrés
sur de vrais formulaires :

- **form.pdf** — vrai formulaire avec champs AcroForm et case à cocher.
- **worksheet.pdf** — fiche scolaire : traits de réponse, pointillés, mais aussi
  un titre souligné et un paragraphe dense qui ne doivent pas être confondus
  avec des zones à remplir.
- **certificat.pdf** — reproduit un certificat médical : pointillés **au milieu**
  d'une ligne de texte, date « ...../...../..... », cases à cocher, cadre de page
  et tableau d'en-tête à bordures.
