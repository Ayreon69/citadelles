// Contrat partagé entre le serveur et le client : cartes, personnages, réglages, actions et vues de table.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 8;

export const START_GOLD = 2;
export const START_HAND = 4;

/** La cité est complète à 7 quartiers, ou à 8 quand on joue à 2 ou 3. */
export function cityGoal(players: number): number {
  return players <= 3 ? 8 : 7;
}

// ───────────────────────────── Quartiers ─────────────────────────────

export type DistrictType = 'noble' | 'religious' | 'trade' | 'military' | 'unique';
export const DISTRICT_TYPES: DistrictType[] = ['noble', 'religious', 'trade', 'military', 'unique'];

export const TYPE_NAMES: Record<DistrictType, string> = {
  noble: 'noble',
  religious: 'religieux',
  trade: 'commerce',
  military: 'militaire',
  unique: 'merveille',
};

export interface District {
  id: string;
  name: string;
  cost: number;
  type: DistrictType;
  copies: number;
  /** Merveilles : leur effet, en une phrase. */
  text?: string;
}

function basic(type: DistrictType, list: [string, string, number, number][]): District[] {
  return list.map(([id, name, cost, copies]) => ({ id, name, cost, type, copies }));
}

export const DISTRICTS: District[] = [
  ...basic('noble', [
    ['manoir', 'Manoir', 3, 5],
    ['chateau', 'Château', 4, 4],
    ['palais', 'Palais', 5, 3],
  ]),
  ...basic('religious', [
    ['temple', 'Temple', 1, 3],
    ['eglise', 'Église', 2, 3],
    ['monastere', 'Monastère', 3, 3],
    ['cathedrale', 'Cathédrale', 5, 2],
  ]),
  ...basic('trade', [
    ['taverne', 'Taverne', 1, 5],
    ['echoppe', 'Échoppe', 2, 3],
    ['marche', 'Marché', 2, 4],
    ['comptoir', 'Comptoir', 3, 3],
    ['port', 'Port', 4, 3],
    ['hotel', 'Hôtel de ville', 5, 2],
  ]),
  ...basic('military', [
    ['tour', 'Tour de guet', 1, 3],
    ['prison', 'Prison', 2, 3],
    ['caserne', 'Caserne', 3, 3],
    ['forteresse', 'Forteresse', 5, 2],
  ]),
  { id: 'dragon', name: 'Porte du Dragon', cost: 6, type: 'unique', copies: 1, text: 'En fin de partie : 2 points de plus.' },
  { id: 'manufacture', name: 'Manufacture', cost: 5, type: 'unique', copies: 1, text: 'Tes autres merveilles te coûtent 1 or de moins.' },
  { id: 'miracles', name: 'Cour des Miracles', cost: 2, type: 'unique', copies: 1, text: 'En fin de partie, elle compte comme le type de ton choix.' },
  { id: 'tresor', name: 'Trésor impérial', cost: 5, type: 'unique', copies: 1, text: 'En fin de partie : 1 point par or que tu possèdes.' },
  { id: 'donjon', name: 'Donjon', cost: 3, type: 'unique', copies: 1, text: 'Le Condottiere ne peut pas le détruire.' },
  { id: 'laboratoire', name: 'Laboratoire', cost: 5, type: 'unique', copies: 1, text: 'Une fois par tour : défausse 1 carte pour gagner 2 or.' },
  { id: 'bibliotheque', name: 'Bibliothèque', cost: 6, type: 'unique', copies: 1, text: 'Quand tu pioches pour tes ressources, garde les 2 cartes.' },
  { id: 'cartes', name: 'Salle des cartes', cost: 5, type: 'unique', copies: 1, text: 'En fin de partie : 1 point par carte en main.' },
  { id: 'carriere', name: 'Carrière', cost: 5, type: 'unique', copies: 1, text: 'Tu peux bâtir des quartiers identiques à ceux de ta cité.' },
  { id: 'ecole', name: 'École de magie', cost: 6, type: 'unique', copies: 1, text: 'Pour les revenus de ton personnage, elle compte comme le type de ton choix.' },
  { id: 'forge', name: 'Forge', cost: 5, type: 'unique', copies: 1, text: 'Une fois par tour : paie 2 or pour piocher 3 cartes.' },
  { id: 'statue', name: 'Statue', cost: 3, type: 'unique', copies: 1, text: 'Si tu as la couronne en fin de partie : 5 points de plus.' },
  { id: 'repaire', name: 'Repaire des voleurs', cost: 6, type: 'unique', copies: 1, text: 'Paie-le en partie ou en totalité avec des cartes : 1 carte vaut 1 or.' },
  { id: 'fontaine', name: 'Fontaine aux souhaits', cost: 5, type: 'unique', copies: 1, text: 'En fin de partie : 1 point par merveille de ta cité, celle-ci comprise.' },
];

const BY_ID = new Map(DISTRICTS.map((d) => [d.id, d]));

export function district(id: string): District {
  const d = BY_ID.get(id);
  if (!d) throw new Error(`Quartier inconnu : ${id}`);
  return d;
}

export function isDistrict(id: unknown): id is string {
  return typeof id === 'string' && BY_ID.has(id);
}

// ───────────────────────────── Personnages ─────────────────────────────

export const ASSASSIN = 1;
export const VOLEUR = 2;
export const MAGICIEN = 3;
export const ROI = 4;
export const EVEQUE = 5;
export const MARCHAND = 6;
export const ARCHITECTE = 7;
export const CONDOTTIERE = 8;
export const PERCEPTEUR = 9;

export interface Character {
  rank: number;
  name: string;
  /** « l'Assassin », « le Roi » : pour les phrases. */
  the: string;
  /** Les revenus de ce personnage viennent de ce type de quartier. */
  income?: DistrictType;
  /** Son pouvoir, en une phrase. */
  power: string;
}

export const CHARACTERS: Character[] = [
  { rank: 1, name: 'Assassin', the: 'l’Assassin', power: 'Désigne un personnage : il passera son tour sans rien dire.' },
  { rank: 2, name: 'Voleur', the: 'le Voleur', power: 'Désigne un personnage, sauf l’Assassin et sa victime : quand il se révèle, tu prends tout son or.' },
  { rank: 3, name: 'Magicien', the: 'le Magicien', power: 'Échange toute ta main avec un joueur, ou défausse des cartes pour en piocher autant.' },
  { rank: 4, name: 'Roi', the: 'le Roi', income: 'noble', power: 'Prends la couronne : tu choisiras le premier au prochain tour. +1 or par quartier noble.' },
  { rank: 5, name: 'Évêque', the: 'l’Évêque', income: 'religious', power: 'Le Condottiere ne peut pas toucher à ta cité, sauf si tu es assassiné. +1 or par quartier religieux.' },
  { rank: 6, name: 'Marchand', the: 'le Marchand', income: 'trade', power: '+1 or, plus +1 or par quartier de commerce.' },
  { rank: 7, name: 'Architecte', the: 'l’Architecte', power: 'Pioche 2 cartes de plus, et bâtis jusqu’à 3 quartiers ce tour-ci.' },
  { rank: 8, name: 'Condottiere', the: 'le Condottiere', income: 'military', power: 'Détruis un quartier en payant son coût moins 1, sauf dans une cité complète. +1 or par quartier militaire.' },
  { rank: 9, name: 'Percepteur', the: 'le Percepteur', power: 'Toute la partie, chaque joueur qui bâtit met 1 or dans sa bourse. À ton tour, tu la vides.' },
];

export function character(rank: number): Character {
  const c = CHARACTERS[rank - 1];
  if (!c) throw new Error(`Personnage inconnu : ${rank}`);
  return c;
}

/** Le 9e personnage est obligatoire à 3 et à 8, au choix de 4 à 7, impossible à 2. */
export function castSize(players: number, ninth: boolean): 8 | 9 {
  if (players === 2) return 8;
  if (players === 3 || players === 8) return 9;
  return ninth ? 9 : 8;
}

/** Cartes écartées face visible puis face cachée au début d'un tour, selon le livret. */
export function discards(players: number, cast: number): { up: number; down: number } {
  if (players <= 3) return { up: 0, down: 1 };
  if (cast === 8) return { up: Math.max(0, 6 - players), down: 1 };
  return { up: Math.max(0, 7 - players), down: 1 };
}

// ───────────────────────────── Règles de construction ─────────────────────────────

/** Ce que coûte un quartier à ce joueur, compte tenu de sa Manufacture. */
export function buildCost(card: string, city: string[]): number {
  const d = district(card);
  return d.type === 'unique' && d.id !== 'manufacture' && city.includes('manufacture') ? Math.max(0, d.cost - 1) : d.cost;
}

/** Un quartier identique n'est permis qu'avec la Carrière. */
export function sameAllowed(card: string, city: string[]): boolean {
  return !city.includes(card) || city.includes('carriere');
}

/** Ce que rapporte le pouvoir de revenu d'un personnage dans cette cité. */
export function incomeOf(rank: number, city: string[]): number {
  const c = character(rank);
  if (!c.income) return 0;
  let n = city.filter((id) => district(id).type === c.income).length;
  if (city.includes('ecole')) n++;
  return rank === MARCHAND ? n + 1 : n;
}

/** Ce que coûte la destruction d'un quartier au Condottiere. */
export function destroyCost(card: string): number {
  return Math.max(0, district(card).cost - 1);
}

// ───────────────────────────── Fin de partie ─────────────────────────────

export interface Score {
  /** Somme des coûts des quartiers. */
  base: number;
  /** +3 : au moins un quartier de chaque type. */
  types: number;
  /** +4 pour le premier à finir, +2 pour les suivants. */
  complete: number;
  /** Points des merveilles. */
  wonders: number;
  total: number;
}

export function scoreCity(city: string[], opts: { gold: number; hand: number; crown: boolean; first: boolean; goal: number }): Score {
  const base = city.reduce((sum, id) => sum + district(id).cost, 0);
  const complete = city.length >= opts.goal ? (opts.first ? 4 : 2) : 0;
  let wonders = 0;
  if (city.includes('dragon')) wonders += 2;
  if (city.includes('tresor')) wonders += opts.gold;
  if (city.includes('cartes')) wonders += opts.hand;
  if (city.includes('statue') && opts.crown) wonders += 5;
  // La Cour des Miracles compte comme le type qui rapporte le plus : le joueur aurait choisi le mieux.
  const present = new Set(city.filter((id) => id !== 'miracles').map((id) => district(id).type));
  const missing = DISTRICT_TYPES.filter((t) => !present.has(t));
  const hasCourt = city.includes('miracles');
  const uniques = city.filter((id) => district(id).type === 'unique').length;
  let types = 0;
  let wells = city.includes('fontaine') ? uniques : 0;
  if (missing.length === 0) types = 3;
  else if (hasCourt && missing.length === 1) {
    types = 3;
    // Comptée comme un autre type, elle n'est plus une merveille pour la Fontaine.
    if (missing[0] !== 'unique' && wells) wells--;
  }
  wonders += wells;
  return { base, types, complete, wonders, total: base + types + complete + wonders };
}

// ───────────────────────────── Réglages et décor ─────────────────────────────

/** Temps pour chaque choix et chaque tour, en secondes (0 : sans limite). */
export const THINK_OPTIONS = [0, 60, 120] as const;
export type ThinkTime = (typeof THINK_OPTIONS)[number];

export interface Settings {
  think: ThinkTime;
  /** De 4 à 7 joueurs : ajouter le Percepteur. */
  ninth: boolean;
}

export const AVATARS = ['heaume', 'couronne', 'chouette', 'cerf', 'lion', 'corbeau', 'licorne', 'dragon', 'rose', 'tonneau', 'parchemin', 'bougie'] as const;
export const EMOTES = ['👑', '🗡️', '💰', '😱', '😂', '🏰'] as const;
export const TAUNTS = ['Pas moi !', 'Je savais !', 'Bien joué', 'Mon or…', 'Laisse ma cité', 'C’est le Roi'] as const;

// ───────────────────────────── Actions ─────────────────────────────

export type Action =
  | { type: 'pick'; rank: number; discard?: number }
  | { type: 'gather'; kind: 'gold' | 'cards' }
  | { type: 'keep'; card: string }
  | { type: 'build'; card: string; pay?: string[] }
  | { type: 'kill'; rank: number }
  | { type: 'rob'; rank: number }
  | { type: 'income' }
  | { type: 'swap'; target: string }
  | { type: 'redraw'; cards: string[] }
  | { type: 'destroy'; target: string; card: string }
  | { type: 'smithy' }
  | { type: 'lab'; card: string }
  | { type: 'end' };

// ───────────────────────────── Vues ─────────────────────────────

export type PlayerStatus = 'lobby' | 'playing' | 'spectator';

export interface PlayerView {
  id: string;
  name: string;
  avatar: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  autopilot: boolean;
  status: PlayerStatus;
  /** Or et nombre de cartes : à une vraie table, cela se voit. Null hors partie. */
  gold: number | null;
  hand: number | null;
  city: string[];
  crown: boolean;
  /** Les personnages qu'il a révélés à ce tour. */
  revealed: number[];
  wins: number;
}

export type Stage = 'pick' | 'call' | 'turn' | 'round' | 'over';

export type EventKind =
  | 'round'
  | 'reveal'
  | 'gold'
  | 'draw'
  | 'income'
  | 'build'
  | 'kill'
  | 'rob'
  | 'robbed'
  | 'swap'
  | 'redraw'
  | 'destroy'
  | 'tax'
  | 'crown'
  | 'heir'
  | 'complete'
  | 'smithy'
  | 'lab'
  | 'architect';

/** Ce qui vient de se passer. Le serveur ne garde ces événements que quelques secondes : ce n'est pas un historique. */
export interface GameEvent {
  id: number;
  at: number;
  until: number;
  kind: EventKind;
  by?: string;
  target?: string;
  rank?: number;
  card?: string;
  amount?: number;
}

export interface PickView {
  /** Qui choisit. */
  current: string;
  endsAt: number;
  /** Ce parmi quoi tu choisis : seulement quand c'est à toi. */
  options: number[] | null;
  /** À 2 joueurs : en plus de celui qu'on garde, on en écarte un en secret. */
  mustDiscard: boolean;
}

export interface TurnView {
  player: string;
  rank: number;
  /** Numéro du tour de personnage : une action envoyée pour un tour passé est refusée. */
  no: number;
  endsAt: number;
  gathered: boolean;
  /** Les deux cartes piochées, à trier : visibles du seul joueur. */
  drawn: string[] | null;
  built: number;
  limit: number;
  incomeDone: boolean;
  powerDone: boolean;
  smithyDone: boolean;
  labDone: boolean;
}

export interface GameView {
  order: string[];
  stage: Stage;
  round: number;
  goal: number;
  /** Les personnages de la partie. */
  cast: number[];
  /** Écartés face visible à ce tour. */
  faceUp: number[];
  /** Le rang qu'on vient d'appeler (phase d'appel et tour). */
  calling: number;
  /** Les personnages que TU joues à ce tour : personne d'autre ne les connaît. */
  mine: number[];
  /** Tu as été assassiné : toi seul le sais avant la fin du tour. */
  iAmDead: boolean;
  /** Annoncés à voix haute par l'Assassin et le Voleur. */
  killed: number | null;
  robbed: number | null;
  pick: PickView | null;
  turn: TurnView | null;
  /** Ta main, ou null pour un spectateur. */
  hand: string[] | null;
  /** L'or de la bourse du Percepteur. */
  taxPot: number;
  deckEmpty: boolean;
  /** Une cité est complète : ce tour est le dernier. */
  lastRound: boolean;
  firstComplete: string | null;
  events: GameEvent[];
}

export interface FinalPlayer {
  id: string;
  name: string;
  avatar: string;
  city: string[];
  hand: string[];
  gold: number;
  crown: boolean;
  score: Score;
  /** Le plus haut personnage révélé au dernier tour, pour départager. */
  tieRank: number;
  /** Les personnages joués au dernier tour, enfin dévoilés. */
  ranks: number[];
  wins: number;
  winner: boolean;
}

export interface FinalView {
  rounds: number;
  goal: number;
  /** Du premier au dernier. */
  players: FinalPlayer[];
  winners: string[];
}

export interface RoomView {
  code: string;
  phase: 'lobby' | 'playing' | 'finished';
  me: string;
  hostId: string;
  settings: Settings;
  players: PlayerView[];
  game: GameView | null;
  final: FinalView | null;
  serverNow: number;
}

export type Ack<T = unknown> = (res: { ok: boolean; error?: string; data?: T }) => void;

function str(v: unknown): v is string {
  return typeof v === 'string' && v.length < 40;
}
function rank(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 9;
}
function cards(v: unknown): v is string[] {
  return Array.isArray(v) && v.length <= 60 && v.every(isDistrict);
}

/** Une action reçue du réseau, vérifiée dans sa forme (le moteur vérifie qu'elle est permise). */
export function parseAction(raw: unknown): Action | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  switch (r.type) {
    case 'pick':
      return rank(r.rank) && (r.discard === undefined || rank(r.discard)) ? { type: 'pick', rank: r.rank, discard: r.discard as number | undefined } : null;
    case 'gather':
      return r.kind === 'gold' || r.kind === 'cards' ? { type: 'gather', kind: r.kind } : null;
    case 'keep':
      return isDistrict(r.card) ? { type: 'keep', card: r.card } : null;
    case 'build':
      return isDistrict(r.card) && (r.pay === undefined || cards(r.pay)) ? { type: 'build', card: r.card, pay: r.pay as string[] | undefined } : null;
    case 'kill':
    case 'rob':
      return rank(r.rank) ? { type: r.type, rank: r.rank } : null;
    case 'swap':
      return str(r.target) ? { type: 'swap', target: r.target } : null;
    case 'redraw':
      return cards(r.cards) ? { type: 'redraw', cards: r.cards } : null;
    case 'destroy':
      return str(r.target) && isDistrict(r.card) ? { type: 'destroy', target: r.target, card: r.card } : null;
    case 'lab':
      return isDistrict(r.card) ? { type: 'lab', card: r.card } : null;
    case 'income':
    case 'smithy':
    case 'end':
      return { type: r.type };
    default:
      return null;
  }
}
