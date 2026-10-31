# Citadelles

**Un personnage secret à chaque tour. Bâtis la plus belle cité, et méfie-toi de l'Assassin.**

👉 **Jouer : https://citadelles-59hy.onrender.com** (la première ouverture peut prendre jusqu'à une minute, le temps que le serveur gratuit se réveille)

Jeu de cartes multijoueur en ligne, à jouer entre amis depuis un navigateur, sur téléphone ou ordinateur, sans compte ni installation.
D'après *Citadelles*, le jeu de Bruno Faidutti (création de fans, non officielle, avec ses propres visuels en vitrail).

## Règles en bref

- De 2 à 8 joueurs. Chacun commence avec 2 or et 4 cartes.
- **À chaque tour de table, on choisit un personnage en secret.** Les cartes passent de main en main à partir de celui qui porte la couronne. Certains personnages sont écartés, face visible ou cachée, selon le nombre de joueurs.
- **Puis on appelle les personnages dans l'ordre**, de 1 à 8. Celui qui l'a choisi se révèle et joue :
  - il prend ses ressources : **2 or**, ou **il pioche 2 cartes et en garde 1** ;
  - il peut **bâtir un quartier** en payant son coût ;
  - il peut utiliser **le pouvoir de son personnage**.
- **Les personnages :** l'Assassin (1) fait passer son tour à un personnage. Le Voleur (2) lui prend son or. Le Magicien (3) échange ou change des cartes. Le Roi (4) prend la couronne. L'Évêque (5) protège sa cité du Condottiere. Le Marchand (6) gagne 1 or de plus. L'Architecte (7) pioche 2 cartes de plus et bâtit jusqu'à 3 quartiers. Le Condottiere (8) détruit un quartier. Le Percepteur (9) prélève 1 or sur ceux qui bâtissent, s'ils ont encore de l'or.
- Le Roi, l'Évêque, le Marchand et le Condottiere touchent 1 or par quartier de leur couleur.
- **Dès qu'une cité atteint 7 quartiers** (8 à 2 ou 3 joueurs), on finit le tour en cours et on compte : la valeur des quartiers, 3 points si la cité a les 5 types, 4 pour la première cité complète, 2 pour les autres cités complètes, plus les bonus des merveilles.

Les règles suivent le livret de l'édition 2016 (lu en anglais). À 2 joueurs, chacun joue deux personnages et on écarte en secret ; à 3 joueurs, chacun en joue deux aussi. Le Percepteur est obligatoire à 3 et à 8 joueurs, en option de 4 à 7.

Sont des choix de ce jeu :

- **Seule la distribution de première partie est faite** : les 8 personnages de base, le Percepteur et 14 merveilles sur les 30 de l'édition 2016. Les 18 autres personnages et les 16 autres merveilles n'y sont pas.
- **Les revenus oubliés sont encaissés à la fin du tour**, pour que personne ne perde de l'or à cause d'un bouton.
- **L'Architecte, le Roi et le Percepteur agissent dès leur révélation** : pioche, couronne, bourse.
- **À 2 ou 3 joueurs, on ne peut ni assassiner ni voler son propre personnage.**
- **La Cour des Miracles et la Fontaine aux souhaits sont comptées au mieux**, automatiquement, au décompte.
- **Les noms français** sont écrits de mémoire, et certains sont choisis (« Percepteur », « Comptoir », « Échoppe »).
- **Le coût des merveilles** est lui aussi de mémoire : seuls l'École de magie (6), la Porte du Dragon (6) et la Cour des Miracles (2) sont confirmés par l'exemple de décompte du livret. À corriger sur une vraie boîte en cas d'écart.
- **Aucune aide au calcul** : ni score pendant la partie, ni compteur de pioche, ni historique. On voit ce qu'on verrait autour d'une vraie table, plus la dernière chose qui vient de se passer.
- **Le silence ne dit rien** : un personnage écarté et un personnage assassiné sont appelés avec le même délai. La victime l'apprend seule, sur son écran.
- **Le temps par tour est réglable** par l'hôte (sans limite, 60 ou 120 secondes). Un joueur absent plus de 20 secondes est remplacé par le pilote automatique jusqu'à son retour.

## Les bots

Ils ne voient que ce qu'un joueur voit : l'or, le nombre de cartes, les cités, les personnages annoncés, leur propre main, et les personnages qu'ils ont vus passer en choisissant.

- Ils choisissent leur personnage selon leur situation : l'Architecte avec des cartes et de l'or, le Roi avec des quartiers nobles, le Magicien quand leur main est vide, l'Assassin quand quelqu'un approche de la fin.
- L'Assassin et le Voleur visent le personnage que les joueurs les plus dangereux ou les plus riches ont sans doute pris. Le Condottiere frappe les meneurs.
- Leur niveau varie d'un bot à l'autre.

`npx tsx test/sim.ts 100` mesure leur force. Un bon bot contre une table de bots naïfs, sur 100 parties :

| Joueurs | Tours par partie | Victoires du bon bot | Au hasard |
|---|---|---|---|
| 2 | 6,3 | 84 % | 50 % |
| 3 | 7,1 | 62 % | 33 % |
| 4 | 10,8 | 60 % | 25 % |
| 5 | 10,4 | 46 % | 20 % |
| 6 | 10,0 | 43 % | 17 % |
| 7 | 10,5 | 31 % | 14 % |
| 8 | 10,5 | 17 % | 13 % |

## Fonctionnalités

- Tables privées avec code à 4 lettres, lien d'invitation, partage natif et QR code
- Partie contre 1 à 7 bots en un clic
- Une cathédrale la nuit : chaque carte est un vitrail dessiné pour ce jeu, sans image du jeu d'origine
- En haut, la cour des personnages : on voit qui est écarté, qui est appelé, qui s'est révélé, qui est visé ; toucher un personnage affiche son pouvoir
- Choix du personnage en deux gestes, avec ta cité et ta main sous les yeux
- Un gros bouton par ressource, puis ce que tu peux bâtir s'illumine ; toucher une carte la soulève, un bouton la bâtit
- Les pièces et les cartes volent vers ceux qui les reçoivent, le quartier se pose dans la cité, le vitrail se brise sous le Condottiere, le tampon de l'Assassin s'abat, confettis pour la première cité complète
- Toucher un joueur ouvre sa cité, carte par carte
- Écran de victoire, décompte détaillé, personnages joués, victoires de la soirée, revanche en un clic
- Réactions, règles consultables en jeu
- Reprise automatique après une coupure, pilote automatique, spectateurs
- Sons synthétisés et vibrations, animations réduites si le système le demande

## Développement

```bash
npm install
npm run dev:server   # serveur temps réel sur http://localhost:3200
npm run dev:client   # interface sur http://localhost:5199
npm test             # distribution, choix, pouvoirs, merveilles, décompte
npm run build && npm run e2e   # parties complètes avec de vrais clients connectés
npx tsx test/sim.ts 100        # force des bots : 100 parties par configuration
```

`CI_FAST=1` accélère les bots et les chronos (tests locaux uniquement).

## Architecture

- `shared/` : contrat client/serveur, personnages, quartiers et décompte
- `server/` : Express + Socket.IO, moteur de partie (`game.ts`), bots (`bots.ts`), table et minuteries (`room.ts`). Le serveur fait autorité : chacun ne reçoit que sa main et ses propres personnages, et rien de passé n'est renvoyé
- `client/` : React + Vite + Framer Motion. Les vitraux sont dans `components/Art.tsx`, les choix du joueur dans `components/Panels.tsx`, les animations dans `components/Effects.tsx`, la table dans `screens/Table.tsx`
- Déploiement : un seul service Node (`npm ci && npm run build`, puis `npm start`)
