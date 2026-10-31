// Les bots de Citadelles : ils ne regardent que ce qu'un joueur voit à la table (cités, or, nombre de cartes,
// personnages annoncés), plus leur propre main et ce qu'ils ont aperçu en choisissant.
import {
  ARCHITECTE,
  ASSASSIN,
  CONDOTTIERE,
  EVEQUE,
  MAGICIEN,
  MARCHAND,
  PERCEPTEUR,
  ROI,
  VOLEUR,
  buildCost,
  destroyCost,
  district,
  incomeOf,
  sameAllowed,
  type Action,
  type District,
  type DistrictType,
} from '../shared/protocol';
import { buildable, type Game, type TurnState } from './game';

/** Niveau d'un bot : le bruit dans ses choix (0 : il joue au mieux de ses règles). */
export interface Skill {
  noise: number;
  /** Se sert-il de ce qu'il a vu passer en choisissant ? */
  attentive: boolean;
}

export function randomSkill(): Skill {
  const r = Math.random();
  if (r < 0.34) return { noise: 0.4, attentive: true };
  if (r < 0.75) return { noise: 1.2, attentive: true };
  return { noise: 2.4, attentive: false };
}

/** Le pilote automatique d'un absent : prudent et sans finesse. */
export const AUTOPILOT: Skill = { noise: 1.5, attentive: false };
/** La référence naïve des simulations : elle joue au hasard parmi ce qui est permis. */
export const NAIVE: Skill = { noise: 50, attentive: false };

const rand = (n = 1) => Math.random() * n;

// ───────────────────────────── Ce qu'on devine d'un joueur ─────────────────────────────

/** Ce qu'il voit de sa propre cité et de sa bourse. */
function typeCount(g: Game, id: string, type: DistrictType): number {
  return g.city(id).filter((c) => district(c).type === type).length;
}

/** La force d'un joueur, telle qu'on peut la lire sur la table. */
function threat(g: Game, id: string): number {
  const city = g.city(id);
  const value = city.reduce((s, c) => s + district(c).cost, 0);
  return value + city.length * 1.5 + g.coins(id) * 0.4 + g.hand(id).length * 0.3;
}

/** Combien un personnage intéresse ce joueur, d'après ce que tout le monde voit de lui. */
function appeal(g: Game, id: string, rank: number): number {
  const gold = g.coins(id);
  const hand = g.hand(id).length;
  const size = g.city(id).length;
  const lead = Math.max(...g.order.filter((o) => o !== id).map((o) => g.city(o).length));
  switch (rank) {
    case ASSASSIN:
      return 2.6 + (lead >= g.goal - 2 ? 1.5 : 0);
    case VOLEUR:
      return 2 + Math.max(...g.order.filter((o) => o !== id).map((o) => g.coins(o))) * 0.45;
    case MAGICIEN:
      return 1.6 + (hand <= 1 ? 2.6 : 0) + (hand >= 4 ? -1 : 0);
    case ROI:
      return 2 + typeCount(g, id, 'noble') * 1.3 + (g.crown === id ? -0.6 : 0.6) + (g.city(id).includes('statue') ? 1.5 : 0);
    case EVEQUE:
      return 1.8 + typeCount(g, id, 'religious') * 1.3 + (size >= g.goal - 2 ? 1.6 : 0);
    case MARCHAND:
      return 2.8 + typeCount(g, id, 'trade') * 1.3;
    case ARCHITECTE:
      return 2 + (hand >= 3 && gold >= 4 ? 2.2 : 0) + (hand <= 1 ? 1.2 : 0) + (size >= g.goal - 3 ? 1 : 0);
    case CONDOTTIERE:
      return 2 + typeCount(g, id, 'military') * 1.3 + (lead >= g.goal - 1 ? 2.5 : 0);
    case PERCEPTEUR:
      return 1.4 + g.taxPot * 0.9;
    default:
      return 1;
  }
}

/** Qui peut bien tenir ce personnage ? Ceux qui choisissaient après moi, s'il était encore là ; avant moi, s'il n'y était plus. */
function suspects(g: Game, me: string, rank: number, skill: Skill): string[] {
  const others = g.order.filter((o) => o !== me);
  const seen = g.seenPool.get(me);
  if (!skill.attentive || !seen || g.order.length <= 3) return others;
  const start = g.order.indexOf(g.crown);
  const seats = g.order.map((_, i) => g.order[(start + i) % g.order.length]);
  const myAt = seats.indexOf(me);
  const before = seats.slice(0, myAt);
  const after = seats.slice(myAt + 1);
  const list = seen.includes(rank) ? after : before;
  return list.length ? list : others;
}

function targetRanks(g: Game, me: string, exclude: number[]): number[] {
  const mine = new Set(g.ranksOf(me));
  return g.cast.filter((r) => !exclude.includes(r) && !mine.has(r) && !g.faceUp.includes(r));
}

/** L'Assassin vise le personnage que les joueurs les plus dangereux ont sans doute pris. */
function chooseKill(g: Game, me: string, skill: Skill): number {
  const options = targetRanks(g, me, [ASSASSIN]);
  let best = options[0];
  let bestScore = -Infinity;
  for (const r of options) {
    let s = rand(skill.noise);
    for (const o of suspects(g, me, r, skill)) s += appeal(g, o, r) * (threat(g, o) + 2) * 0.1;
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

/** Le Voleur vise le personnage que les joueurs riches ont sans doute pris. */
function chooseRob(g: Game, me: string, skill: Skill): number {
  const options = targetRanks(g, me, [ASSASSIN, VOLEUR, ...(g.killed ? [g.killed] : [])]);
  let best = options[0];
  let bestScore = -Infinity;
  for (const r of options) {
    let s = rand(skill.noise);
    for (const o of suspects(g, me, r, skill)) s += appeal(g, o, r) * (g.coins(o) + 0.5) * 0.15;
    if (s > bestScore) {
      bestScore = s;
      best = r;
    }
  }
  return best;
}

function choosePick(g: Game, me: string, skill: Skill, options: number[]): { rank: number; discard?: number } {
  const scored = options
    .map((r) => ({ r, s: appeal(g, me, r) + rand(skill.noise) }))
    .sort((a, b) => b.s - a.s);
  const rank = scored[0].r;
  if (!g.mustDiscard) return { rank };
  // À deux, on écarte ce qui servirait le plus à l'adversaire.
  const foe = g.order.find((o) => o !== me)!;
  const rest = options.filter((r) => r !== rank).map((r) => ({ r, s: appeal(g, foe, r) + rand(skill.noise) }));
  rest.sort((a, b) => b.s - a.s);
  return { rank, discard: rest[0].r };
}

// ───────────────────────────── Le tour ─────────────────────────────

function worth(g: Game, me: string, card: string): number {
  const d: District = district(card);
  const city = g.city(me);
  let v = d.cost;
  if (!city.some((c) => district(c).type === d.type)) v += 1.4;
  if (d.type === 'unique') v += 0.8;
  if (d.id === 'statue' && g.crown === me) v += 3;
  if (d.id === 'dragon') v += 2;
  return v;
}

function chooseGather(g: Game, me: string, t: TurnState, skill: Skill): 'gold' | 'cards' {
  const hand = g.hand(me);
  const gold = g.coins(me);
  const city = g.city(me);
  if (!g.deck.length) return 'gold';
  if (!hand.length) return 'cards';
  const playable = hand.filter((c) => sameAllowed(c, city));
  if (!playable.length) return 'cards';
  const cheapest = Math.min(...playable.map((c) => buildCost(c, city)));
  // Sans carte à sa portée à moyen terme, on pioche ; sinon on accumule pour bâtir.
  if (t.limit > 1 && hand.length >= 3) return 'gold';
  if (hand.length >= 3) return 'gold';
  if (gold >= 6 && hand.length <= 1) return 'cards';
  if (cheapest <= gold + 2) return rand(skill.noise) > 2 ? 'cards' : 'gold';
  return hand.length <= 1 ? 'cards' : 'gold';
}

function chooseBuild(g: Game, me: string): string | null {
  const options = buildable(g, me);
  if (!options.length) return null;
  return options.sort((a, b) => worth(g, me, b) - worth(g, me, a))[0];
}

function chooseMagician(g: Game, me: string, skill: Skill): Action | null {
  const mine = g.hand(me);
  const others = g.order.filter((o) => o !== me).sort((a, b) => g.hand(b).length - g.hand(a).length);
  const rich = others[0];
  if (rich && g.hand(rich).length >= mine.length + 2) return { type: 'swap', target: rich };
  const city = g.city(me);
  const bad = mine.filter((c, i) => !sameAllowed(c, city) || mine.indexOf(c) !== i || buildCost(c, city) > g.coins(me) + 4);
  if (bad.length && g.deck.length) return { type: 'redraw', cards: bad };
  if (skill.noise > 10 && rich) return { type: 'swap', target: rich };
  return null;
}

/** Le Condottiere frappe les meneurs, avec l'or qu'il lui reste. */
function chooseDestroy(g: Game, me: string, skill: Skill): Action | null {
  const coins = g.coins(me);
  let best: { target: string; card: string; s: number } | null = null;
  for (const o of g.order) {
    if (o === me || g.isComplete(o) || g.protectedByBishop(o)) continue;
    const city = g.city(o);
    const danger = threat(g, o) + (city.length >= g.goal - 1 ? 12 : 0);
    for (const card of new Set(city)) {
      if (card === 'donjon') continue;
      const cost = destroyCost(card);
      if (cost > coins) continue;
      const s = danger * 0.5 + district(card).cost - cost * 1.1 + rand(skill.noise);
      if (!best || s > best.s) best = { target: o, card, s };
    }
  }
  if (!best || best.s < 2.4) return null;
  return { type: 'destroy', target: best.target, card: best.card };
}

/**
 * La prochaine action d'un bot ou d'un absent, une à la fois : la table laisse un temps entre chacune,
 * pour que les autres voient ce qui se passe.
 */
export function botAct(g: Game, me: string, skill: Skill): Action {
  if (g.stage === 'pick') {
    const { rank, discard } = choosePick(g, me, skill, g.pickOptions(me) ?? []);
    return { type: 'pick', rank, discard };
  }
  const t = g.turn!;
  if (t.drawn) {
    const pick = [...t.drawn].sort((a, b) => worth(g, me, b) - worth(g, me, a))[0];
    return { type: 'keep', card: pick };
  }
  if (!t.powerDone) {
    if (t.rank === ASSASSIN) return { type: 'kill', rank: chooseKill(g, me, skill) };
    if (t.rank === VOLEUR) return { type: 'rob', rank: chooseRob(g, me, skill) };
    if (t.rank === MAGICIEN) {
      const a = chooseMagician(g, me, skill);
      if (a) return a;
    }
  }
  if (!t.gathered) return { type: 'gather', kind: chooseGather(g, me, t, skill) };
  // Le Condottiere et la Forge d'abord s'il y a urgence ; les revenus avant de bâtir s'ils aident à payer.
  if (t.rank === CONDOTTIERE && !t.powerDone) {
    const a = chooseDestroy(g, me, skill);
    if (a) return a;
  }
  const gold = g.coins(me);
  const city = g.city(me);
  if (!t.incomeDone && incomeOf(t.rank, city) > 0 && !buildable(g, me).length) return { type: 'income' };
  if (city.includes('laboratoire') && !t.labDone && gold < 3) {
    const spare = g.hand(me).find((c, i, h) => !sameAllowed(c, city) || h.indexOf(c) !== i);
    if (spare) return { type: 'lab', card: spare };
  }
  if (city.includes('forge') && !t.smithyDone && gold >= 5 && g.hand(me).length <= 1 && g.deck.length) return { type: 'smithy' };
  if (t.built < t.limit) {
    const card = chooseBuild(g, me);
    if (card) return { type: 'build', card };
  }
  return { type: 'end' };
}
