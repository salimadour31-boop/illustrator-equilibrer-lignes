# Équilibrer les lignes des titres — script Adobe Illustrator

**EquilibrerLignes.jsx** v1.0.0 — choisit automatiquement les coupes d'un titre, d'une accroche ou d'une légende sur plusieurs lignes pour obtenir des **lignes de longueurs égales** (ou en **pyramide**, ou en **pyramide inversée**), sans changer la mise en forme ni la taille du cadre.
*Automatically picks the line breaks of a multi-line headline, tagline or caption so the lines have equal lengths (or a pyramid / inverted pyramid shape), without changing formatting or frame size (FR/EN dialog).*

## Le problème

InDesign a l'option « Équilibrer les lignes en drapeau ». **Illustrator ne l'a pas.** Un titre en texte captif s'arrête donc là où le cadre le coupe : dernière ligne d'un seul mot, ligne qui finit par « de », « la » ou « the », bloc centré bancal. La seule solution est de placer des retours forcés (Maj+Entrée) à la main, titre par titre, et de tout refaire dès que le texte ou le corps change.

## Ce que fait le script

1. Il **mesure la largeur réelle** de chaque mot avec un texte de point temporaire (police, corps, approche, échelle horizontale, capitales, méthode de crénage du mot), puis la largeur des espaces (espacement des mots souhaité compris).
2. Il cherche, par **programmation dynamique**, la meilleure combinaison de coupes pour le nombre de lignes voulu :
   - **lignes égales** (le plus régulier possible) ;
   - **pyramide** : chaque ligne au moins aussi longue que la précédente (1re ligne la plus courte) ;
   - **pyramide inversée** : chaque ligne au plus aussi longue que la précédente.
3. Il applique les coupes avec des **retours à la ligne forcés** (caractère U+0003 d'Illustrator, l'équivalent de Maj+Entrée) : le paragraphe reste un seul paragraphe, la mise en forme de chaque caractère est conservée.

Règles de coupe :

- **ne pas finir une ligne par un petit mot** (liste modifiable : articles et prépositions en français, en anglais et quelques mots arabes) ;
- **éviter une ligne d'un seul mot** quand il y a assez de mots ;
- les **espaces insécables** (U+00A0, fines U+202F/U+2009) et l'attribut **Sans retour à la ligne** sont respectés (compatible avec le script TypographieFrancaise.jsx) ;
- **coupe après un trait d'union** en option (porte-/avions) ;
- les **retours forcés déjà présents** sont recalculés (option) ou laissés tels quels ;
- en **texte captif**, aucune ligne ne dépasse la largeur utile du cadre (retraits et marge intérieure déduits) ; après l'application, le script recompte les lignes et **sélectionne les textes à vérifier** si le nombre a changé.

Autres fonctions :

- **Nombre de lignes** : garder le nombre actuel, ou imposer 2 à 6 lignes (utile pour couper un texte de point d'une seule ligne) ;
- **Portée** : sélection (y compris dans des groupes, ou le texte en cours d'édition) ou tout le document, en ne traitant que les paragraphes de 2 à N lignes (6 par défaut) pour ne pas toucher au texte courant ;
- **Analyser** : liste chaque paragraphe avec l'aperçu des coupes (« ligne / ligne ») et l'irrégularité avant → après, sans rien modifier ;
- **Retirer les retours forcés** : remet les textes en habillage normal (espace rétablie, ou rien après un trait d'union) ;
- réglages mémorisés, dialogue en français ou en anglais selon la langue d'Illustrator.

Ignorés et signalés : textes verrouillés ou masqués, textes curvilignes, textes liés ou en colonnes, textes verticaux, paragraphes trop longs, cas où aucune coupe ne tient dans le cadre.

## Pourquoi c'est nouveau

Vérifié le 16 octobre 2026 :

- **Illustrator** : aucune fonction native d'équilibrage des lignes. L'option « Balance Ragged Lines » n'existe que dans InDesign (fils Adobe Community et Creative COW sur l'absence d'équivalent hors InDesign ; même demande sur le forum Affinity). Le composeur Adobe multiligne d'Illustrator optimise l'espacement, pas l'égalité des longueurs de lignes.
- **Scripts InDesign** : les scripts connus (Gilbert Consulting, Jongware) ne font que régler la propriété native `balanceRaggedLines` d'InDesign ; ils ne fonctionnent pas dans Illustrator.
- **GitHub** : aucune recherche (« illustrator balance lines », « balance ragged illustrator jsx ») ne donne de script Illustrator. Le plus proche concerne le Web (`text-wrap: balance` en CSS, outil Balance Text du New York Times), hors Illustrator.
- **Auteurs connus** : rien dans les collections de creold (scripts texte : alignement des lignes de base, découpe, etc.), Hiroyuki Sato, Alexander Ladygin, wckdtall, Josh Duncan, John Wundes, Kelso Cartography ni dans vexy-illustrator-scripts (209 scripts) : on y trouve l'alignement sur la ligne de base ou la découpe de textes, pas d'équilibrage des coupes.
- Le code (découpe, mesure, programmation dynamique) est entièrement original.

## Installation

- **Ponctuelle** : Fichier > Scripts > Autre script…, puis choisir `EquilibrerLignes.jsx`.
- **Permanente** : copier le fichier dans le dossier `Presets/<langue>/Scripts` d'Illustrator (par exemple `Adobe Illustrator 2026/Presets/fr_FR/Scripts`), puis redémarrer Illustrator. Le script apparaît dans Fichier > Scripts.

## Utilisation

1. **Travaillez sur une copie** du document (ou dupliquez le titre).
2. Sélectionnez un ou plusieurs textes (titres, accroches, légendes), ou choisissez « Tout le document ».
3. Lancez le script, choisissez la forme, le nombre de lignes et les règles de coupe.
4. Cliquez sur **Analyser** pour voir les coupes proposées, puis sur **Équilibrer**.
5. Ctrl+Z / Cmd+Z annule (une ou plusieurs fois selon la version). Le bouton **Retirer les retours forcés** remet un texte en habillage normal, par exemple après une modification du texte, avant de relancer l'équilibrage.

Limites connues : la largeur d'un mot est mesurée avec les attributs de sa première lettre (un mot à moitié en gras est approximatif) ; le crénage entre un mot et l'espace qui suit est ignoré ; un cadre non rectangulaire est mesuré par sa boîte (le contrôle du nombre de lignes signale alors les écarts).

## Version cible et statut des tests

- Cible : Adobe Illustrator CC 2018 et versions plus récentes (ExtendScript), Windows et macOS.
- **Non testé dans Illustrator.**
- Vérifié sur l'ordinateur de développement :
  - syntaxe ES3 validée avec acorn ;
  - `node tests/test-core.js` : 30 tests (découpe, insécables, petits mots, trait d'union, programmation dynamique comparée à une recherche exhaustive sur 240 cas aléatoires dans les 3 formes avec largeur maximale et pénalités, modifications de texte) ;
  - `node tests/test-simulation.js` : 23 tests sur des objets Illustrator simulés (texte de point et captif avec habillage simulé, plusieurs paragraphes, verrouillé, curviligne, attribut Sans retour à la ligne, portée document, cadre trop étroit, retrait des retours forcés, détection d'une ligne en trop, dialogue FR/EN). Ces simulations ne remplacent pas un essai réel.
- Aucun appel réseau, aucune collecte de données. Les réglages sont enregistrés localement dans `EquilibrerLignes.cfg` (dossier des données utilisateur).

## Licence

MIT — © 2026 Amirouche Amwanes. Voir [LICENSE](LICENSE).
