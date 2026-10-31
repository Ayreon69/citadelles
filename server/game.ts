// Le moteur de Citadelles : pur, sans réseau ni minuterie. La table l'appelle et décide du temps qui passe.
import crypto from 'node:crypto';
import {
  ARCHITECTE,
  ASSASSIN,
  CONDOTTIERE,
  EVEQUE,
  MAGICIEN,
  PERCEPTEUR,
  ROI,
  START_GOLD,
  START_HAND,
  VOLEUR,
  DISTRICTS,
  buildCost,
  castSize,
  character,
  cityGoal,
  destroyCost,
  discards,
  incomeOf,
  sameAllowed,
  scoreCity,
  type Action,
  type EventKind,
  type GameEvent,
  type Score,
  type Stage,
} from '../shared/protocol';

export function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function newDeck(): string[] {
  const deck: string[] = [];
  for (const d of DISTRICTS) for (let i = 0; i < d.copies; i++) deck.push(d.id);
  return shuffle(deck);
}

export interface GameOptions {
  ninth?: boolean;
  crown?: string;
  eventMs?: number;
  /** Pour les tests : le paquet, dans l'ordre. */
  deck?: string[];
  /** Pour les tests : l'ordre des personnages au début de chaque tour. */
  castOrder?: (cast: number[]) => number[];
}

export interface TurnState {
  player: string;
  rank: number;
  no: number;
  gathered: boolean;
  drawn: string[] | null;
  built: number;
  limit: number;
  incomeDone: boolean;
  powerDone: boolean;
  smithyDone: boolean;
  labDone: boolean;
}

export interface PickState {
  /** Ceux qui doivent encore choisir, dans l'ordre. */
  queue: string[];
  pool: number[];
}

export class Game {
  readonly order: string[];
  readonly goal: number;
  readonly cast: number[];
  private readonly eventMs: number;
  private readonly castOrder: (cast: number[]) => number[];

  deck: string[];
  hands = new Map<string, string[]>();
  cities = new Map<string, string[]>();
  gold = new Map<string, number>();
  crown: string;
  round = 0;
  stage: Stage = 'pick';
  taxPot = 0;
  firstComplete: string | null = null;

  faceUp: number[] = [];
  faceDown: number[] = [];
  pick: PickState | null = null;
  /** Qui joue quel personnage à ce tour. */
  holders = new Map<number, string>();
  /** Ce que chacun a vu en choisissant : les bots s'en servent, comme un joueur attentif. */
  seenPool = new Map<string, number[]>();
  killed: number | null = null;
  robbed: number | null = null;
  calling = 0;
  turn: TurnState | null = null;
  turnNo = 0;
  revealed = new Map<number, string>();
  events: GameEvent[] = [];
  private eventId = 0;

  constructor(order: string[], opts: GameOptions = {}) {
    this.order = [...order];
    this.goal = cityGoal(order.length);
    const size = castSize(order.length, !!opts.ninth);
    this.cast = Array.from({ length: size }, (_, i) => i + 1);
    this.eventMs = opts.eventMs ?? 3000;
    this.castOrder = opts.castOrder ?? ((c) => shuffle(c));
    this.deck = opts.deck ? [...opts.deck] : newDeck();
    this.crown = opts.crown ?? order[0];
    for (const id of order) {
      this.hands.set(id, this.deck.splice(0, START_HAND));
      this.cities.set(id, []);
      this.gold.set(id, START_GOLD);
    }
    this.startRound();
  }

  // ───────────────────────────── Lecture ─────────────────────────────

  hand(id: string): string[] {
    return this.hands.get(id) ?? [];
  }

  city(id: string): string[] {
    return this.cities.get(id) ?? [];
  }

  coins(id: string): number {
    return this.gold.get(id) ?? 0;
  }

  get lastRound(): boolean {
    return this.firstComplete !== null;
  }

  /** Les personnages d'un joueur à ce tour. */
  ranksOf(id: string): number[] {
    return this.cast.filter((r) => this.holders.get(r) === id);
  }

  revealedBy(id: string): number[] {
    return [...this.revealed.entries()].filter(([, p]) => p === id).map(([r]) => r);
  }

  isComplete(id: string): boolean {
    return this.city(id).length >= this.goal;
  }

  /** La cité d'un joueur est à l'abri : l'Évêque en vie, révélé ou pas encore appelé, la protège. */
  protectedByBishop(id: string): boolean {
    return this.holders.get(EVEQUE) === id && this.killed !== EVEQUE;
  }

  /** Les choix qu'il reste à faire à un joueur pendant la sélection. */
  pickOptions(id: string): number[] | null {
    if (this.stage !== 'pick' || this.pick?.queue[0] !== id) return null;
    const last = this.pick.queue.length === 1 && this.order.length >= 7;
    // Le dernier de 7 ou 8 joueurs reçoit aussi la carte écartée face cachée.
    return last ? [...this.pick.pool, ...this.faceDown].sort((a, b) => a - b) : [...this.pick.pool].sort((a, b) => a - b);
  }

  get mustDiscard(): boolean {
    return this.order.length === 2 && !!this.pick && this.pick.pool.length < this.cast.length - 1;
  }

  // ───────────────────────────── Événements ─────────────────────────────

  private note(kind: EventKind, e: Omit<GameEvent, 'id' | 'at' | 'until' | 'kind'> = {}): void {
    const now = Date.now();
    this.events = this.events.filter((x) => x.until > now);
    this.events.push({ id: ++this.eventId, at: now, until: now + this.eventMs, kind, ...e });
    if (this.events.length > 6) this.events.shift();
  }

  // ───────────────────────────── Sélection ─────────────────────────────

  private startRound(): void {
    this.round++;
    this.stage = 'pick';
    this.killed = null;
    this.robbed = null;
    this.calling = 0;
    this.turn = null;
    this.holders.clear();
    this.revealed.clear();
    this.seenPool.clear();
    this.faceUp = [];
    let pool = this.castOrder([...this.cast]);
    const { up, down } = discards(this.order.length, this.cast.length);
    this.faceDown = pool.splice(0, down);
    for (let i = 0; i < up; i++) {
      // Le Roi ne peut pas être écarté face visible : on le remet et on en écarte un autre.
      const idx = pool.findIndex((r) => r !== ROI);
      this.faceUp.push(pool.splice(idx, 1)[0]);
    }
    pool = shuffle(pool);
    const start = this.order.indexOf(this.crown);
    const seats = this.order.map((_, i) => this.order[(start + i) % this.order.length]);
    let queue: string[];
    if (this.order.length === 2) queue = [seats[0], seats[1], seats[0], seats[1]];
    else if (this.order.length === 3) queue = [...seats, ...seats];
    else queue = seats;
    this.pick = { queue, pool };
    this.note('round', { amount: this.round });
    this.seePool();
  }

  private seePool(): void {
    const id = this.pick?.queue[0];
    if (id && !this.seenPool.has(id)) this.seenPool.set(id, this.pickOptions(id) ?? []);
  }

  private actPick(by: string, rank: number, discard?: number): string | undefined {
    const options = this.pickOptions(by);
    if (!options) return "Ce n'est pas à toi de choisir.";
    if (!options.includes(rank)) return "Ce personnage n'est plus là.";
    const p = this.pick!;
    const two = this.mustDiscard;
    if (two) {
      if (discard === undefined || !options.includes(discard) || discard === rank) return 'Choisis aussi le personnage à écarter.';
    }
    this.holders.set(rank, by);
    const fromHidden = this.faceDown.includes(rank);
    if (fromHidden) {
      // Le dernier joueur a pris la carte cachée : celle qui reste prend sa place.
      this.faceDown = this.faceDown.filter((r) => r !== rank);
    } else p.pool = p.pool.filter((r) => r !== rank);
    if (two) {
      p.pool = p.pool.filter((r) => r !== discard);
      this.faceDown.push(discard!);
    }
    p.queue.shift();
    // À 3 joueurs, après le premier passage, le 3e écarte une carte au hasard.
    if (this.order.length === 3 && p.queue.length === 3) {
      const k = crypto.randomInt(p.pool.length);
      this.faceDown.push(p.pool.splice(k, 1)[0]);
    }
    if (p.queue.length === 0) {
      this.faceDown.push(...p.pool);
      this.pick = null;
      this.stage = 'call';
      this.calling = 0;
      return undefined;
    }
    this.seePool();
    return undefined;
  }

  // ───────────────────────────── Appel des personnages ─────────────────────────────

  /**
   * Appelle le personnage suivant. Une victime et un personnage absent font le même silence :
   * la table doit laisser passer le même temps dans les deux cas.
   */
  advanceCall(): void {
    if (this.stage !== 'call') return;
    this.calling++;
    if (this.calling > this.cast[this.cast.length - 1]) return this.endRound();
    const holder = this.holders.get(this.calling);
    if (!holder || this.killed === this.calling) return;
    this.reveal(holder, this.calling);
  }

  private reveal(player: string, rank: number): void {
    this.revealed.set(rank, player);
    this.stage = 'turn';
    this.turn = {
      player,
      rank,
      no: ++this.turnNo,
      gathered: false,
      drawn: null,
      built: 0,
      limit: rank === ARCHITECTE ? 3 : 1,
      incomeDone: !character(rank).income,
      powerDone: false,
      smithyDone: false,
      labDone: false,
    };
    this.note('reveal', { by: player, rank });
    if (this.robbed === rank) {
      const thief = this.holders.get(VOLEUR);
      const loot = this.coins(player);
      if (thief && thief !== player && loot > 0) {
        this.gold.set(player, 0);
        this.gold.set(thief, this.coins(thief) + loot);
      }
      this.note('robbed', { by: thief, target: player, rank, amount: thief && thief !== player ? loot : 0 });
    }
    if (rank === ROI) this.takeCrown(player, 'crown');
    if (rank === ARCHITECTE) {
      const n = this.draw(player, 2);
      this.note('architect', { by: player, amount: n });
    }
    if (rank === PERCEPTEUR && this.taxPot > 0) {
      this.gold.set(player, this.coins(player) + this.taxPot);
      this.note('tax', { by: player, amount: this.taxPot });
      this.taxPot = 0;
    }
  }

  private takeCrown(player: string, kind: 'crown' | 'heir'): void {
    if (this.crown === player) return;
    this.crown = player;
    this.note(kind, { by: player });
  }

  private draw(player: string, n: number): number {
    const got = this.deck.splice(0, n);
    this.hand(player).push(...got);
    return got.length;
  }

  private toBottom(cards: string[]): void {
    this.deck.push(...cards);
  }

  private endRound(): void {
    this.turn = null;
    // Le Roi assassiné se dévoile à la fin du tour et prend la couronne en héritier.
    if (this.killed === ROI) {
      const heir = this.holders.get(ROI);
      if (heir) this.takeCrown(heir, 'heir');
    }
    this.stage = this.lastRound ? 'over' : 'round';
  }

  /** La table appelle ceci après la pause de fin de tour. */
  nextRound(): void {
    if (this.stage === 'round') this.startRound();
  }

  // ───────────────────────────── Actions ─────────────────────────────

  act(by: string, a: Action): string | undefined {
    if (a.type === 'pick') return this.actPick(by, a.rank, a.discard);
    const t = this.turn;
    if (this.stage !== 'turn' || !t) return "Ce n'est pas le moment.";
    if (t.player !== by) return "Ce n'est pas ton tour.";
    if (t.drawn && a.type !== 'keep') return "Choisis d'abord la carte à garder.";
    switch (a.type) {
      case 'gather':
        return this.gather(t, a.kind);
      case 'keep':
        return this.keep(t, a.card);
      case 'build':
        return this.build(t, a.card, a.pay);
      case 'kill':
        return this.kill(t, a.rank);
      case 'rob':
        return this.rob(t, a.rank);
      case 'income':
        return this.income(t);
      case 'swap':
        return this.swap(t, a.target);
      case 'redraw':
        return this.redraw(t, a.cards);
      case 'destroy':
        return this.destroy(t, a.target, a.card);
      case 'smithy':
        return this.smithy(t);
      case 'lab':
        return this.lab(t, a.card);
      case 'end':
        return this.endTurn(t);
    }
  }

  private gather(t: TurnState, kind: 'gold' | 'cards'): string | undefined {
    if (t.gathered) return 'Tu as déjà pris tes ressources.';
    if (kind === 'gold') {
      this.gold.set(t.player, this.coins(t.player) + 2);
      t.gathered = true;
      this.note('gold', { by: t.player, amount: 2 });
      return undefined;
    }
    if (!this.deck.length) return 'La pioche est vide : prends de l’or.';
    const drawn = this.deck.splice(0, 2);
    t.gathered = true;
    if (this.city(t.player).includes('bibliotheque') || drawn.length === 1) {
      this.hand(t.player).push(...drawn);
      this.note('draw', { by: t.player, amount: drawn.length });
    } else t.drawn = drawn;
    return undefined;
  }

  private keep(t: TurnState, card: string): string | undefined {
    if (!t.drawn) return "Il n'y a rien à trier.";
    const i = t.drawn.indexOf(card);
    if (i < 0) return "Cette carte n'est pas parmi les deux.";
    const [kept] = t.drawn.splice(i, 1);
    this.hand(t.player).push(kept);
    this.toBottom(t.drawn);
    t.drawn = null;
    this.note('draw', { by: t.player, amount: 1 });
    return undefined;
  }

  private build(t: TurnState, card: string, pay?: string[]): string | undefined {
    if (!t.gathered) return "Prends d'abord tes ressources.";
    if (t.built >= t.limit) return t.limit === 1 ? 'Un seul quartier par tour.' : `Pas plus de ${t.limit} quartiers à ce tour.`;
    const hand = this.hand(t.player);
    const city = this.city(t.player);
    const at = hand.indexOf(card);
    if (at < 0) return "Cette carte n'est pas dans ta main.";
    if (!sameAllowed(card, city)) return 'Tu as déjà ce quartier dans ta cité.';
    let cost = buildCost(card, city);
    const rest = [...hand];
    rest.splice(at, 1);
    const paid: string[] = [];
    if (pay?.length) {
      if (card !== 'repaire') return 'Seul le Repaire des voleurs se paie avec des cartes.';
      if (pay.length > cost) return 'Tu donnes plus de cartes que nécessaire.';
      for (const c of pay) {
        const k = rest.indexOf(c);
        if (k < 0) return "Tu donnes une carte que tu n'as pas.";
        rest.splice(k, 1);
        paid.push(c);
      }
      cost -= pay.length;
    }
    if (this.coins(t.player) < cost) return "Tu n'as pas assez d'or.";
    this.gold.set(t.player, this.coins(t.player) - cost);
    this.hands.set(t.player, rest);
    this.toBottom(paid);
    city.push(card);
    t.built++;
    this.note('build', { by: t.player, card, amount: cost });
    // Le Percepteur prélève 1 or sur chaque quartier, sauf quand c'est lui qui bâtit.
    if (this.cast.includes(PERCEPTEUR) && t.rank !== PERCEPTEUR && this.coins(t.player) > 0) {
      this.gold.set(t.player, this.coins(t.player) - 1);
      this.taxPot++;
    }
    if (city.length >= this.goal && !this.completedOnce.has(t.player)) {
      this.completedOnce.add(t.player);
      if (!this.firstComplete) this.firstComplete = t.player;
      this.note('complete', { by: t.player });
    }
    return undefined;
  }

  private completedOnce = new Set<string>();

  private kill(t: TurnState, rank: number): string | undefined {
    if (t.rank !== ASSASSIN) return "Seul l'Assassin peut tuer.";
    if (t.powerDone) return 'Tu as déjà frappé.';
    if (!this.cast.includes(rank) || rank === ASSASSIN) return 'Cible impossible.';
    if (this.faceUp.includes(rank)) return 'Ce personnage est écarté, face visible.';
    if (this.holders.get(rank) === t.player) return "C'est ton propre personnage.";
    this.killed = rank;
    t.powerDone = true;
    this.note('kill', { by: t.player, rank });
    return undefined;
  }

  private rob(t: TurnState, rank: number): string | undefined {
    if (t.rank !== VOLEUR) return 'Seul le Voleur peut voler.';
    if (t.powerDone) return 'Tu as déjà désigné ta cible.';
    if (!this.cast.includes(rank) || rank === VOLEUR || rank === ASSASSIN) return 'Cible impossible.';
    if (rank === this.killed) return 'On ne vole pas une victime.';
    if (this.faceUp.includes(rank)) return 'Ce personnage est écarté, face visible.';
    if (this.holders.get(rank) === t.player) return "C'est ton propre personnage.";
    this.robbed = rank;
    t.powerDone = true;
    this.note('rob', { by: t.player, rank });
    return undefined;
  }

  private income(t: TurnState): string | undefined {
    if (t.incomeDone) return 'Tes revenus sont déjà encaissés.';
    const n = incomeOf(t.rank, this.city(t.player));
    this.gold.set(t.player, this.coins(t.player) + n);
    t.incomeDone = true;
    this.note('income', { by: t.player, amount: n, rank: t.rank });
    return undefined;
  }

  private swap(t: TurnState, target: string): string | undefined {
    if (t.rank !== MAGICIEN) return 'Seul le Magicien peut échanger.';
    if (t.powerDone) return 'Tu as déjà utilisé ton pouvoir.';
    if (target === t.player || !this.order.includes(target)) return 'Joueur introuvable.';
    const mine = this.hand(t.player);
    this.hands.set(t.player, this.hand(target));
    this.hands.set(target, mine);
    t.powerDone = true;
    this.note('swap', { by: t.player, target });
    return undefined;
  }

  private redraw(t: TurnState, cards: string[]): string | undefined {
    if (t.rank !== MAGICIEN) return 'Seul le Magicien peut repiocher.';
    if (t.powerDone) return 'Tu as déjà utilisé ton pouvoir.';
    if (!cards.length) return 'Choisis au moins une carte.';
    const rest = [...this.hand(t.player)];
    for (const c of cards) {
      const k = rest.indexOf(c);
      if (k < 0) return "Tu défausses une carte que tu n'as pas.";
      rest.splice(k, 1);
    }
    this.hands.set(t.player, rest);
    this.toBottom(cards);
    const n = this.draw(t.player, cards.length);
    t.powerDone = true;
    this.note('redraw', { by: t.player, amount: n });
    return undefined;
  }

  private destroy(t: TurnState, target: string, card: string): string | undefined {
    if (t.rank !== CONDOTTIERE) return 'Seul le Condottiere peut détruire.';
    if (t.powerDone) return 'Tu as déjà détruit un quartier.';
    if (!this.order.includes(target)) return 'Joueur introuvable.';
    const city = this.city(target);
    const at = city.indexOf(card);
    if (at < 0) return "Ce quartier n'est pas dans cette cité.";
    if (this.isComplete(target)) return 'Une cité complète ne peut plus être touchée.';
    if (card === 'donjon') return 'Le Donjon est indestructible.';
    if (this.protectedByBishop(target)) return "L'Évêque protège cette cité.";
    const cost = destroyCost(card);
    if (this.coins(t.player) < cost) return "Tu n'as pas assez d'or.";
    this.gold.set(t.player, this.coins(t.player) - cost);
    city.splice(at, 1);
    this.toBottom([card]);
    t.powerDone = true;
    this.note('destroy', { by: t.player, target, card, amount: cost });
    return undefined;
  }

  private smithy(t: TurnState): string | undefined {
    if (!this.city(t.player).includes('forge')) return "Tu n'as pas de Forge.";
    if (t.smithyDone) return 'Une fois par tour.';
    if (this.coins(t.player) < 2) return "Il faut 2 or.";
    if (!this.deck.length) return 'La pioche est vide.';
    this.gold.set(t.player, this.coins(t.player) - 2);
    const n = this.draw(t.player, 3);
    t.smithyDone = true;
    this.note('smithy', { by: t.player, amount: n });
    return undefined;
  }

  private lab(t: TurnState, card: string): string | undefined {
    if (!this.city(t.player).includes('laboratoire')) return "Tu n'as pas de Laboratoire.";
    if (t.labDone) return 'Une fois par tour.';
    const hand = this.hand(t.player);
    const at = hand.indexOf(card);
    if (at < 0) return "Cette carte n'est pas dans ta main.";
    hand.splice(at, 1);
    this.toBottom([card]);
    this.gold.set(t.player, this.coins(t.player) + 2);
    t.labDone = true;
    this.note('lab', { by: t.player, amount: 2 });
    return undefined;
  }

  private endTurn(t: TurnState): string | undefined {
    if (!t.gathered) return "Prends d'abord tes ressources.";
    // Les revenus oubliés sont encaissés : personne ne perd son or sur un oubli.
    if (!t.incomeDone) this.income(t);
    this.turn = null;
    this.stage = 'call';
    return undefined;
  }

  // ───────────────────────────── Fin de partie ─────────────────────────────

  scoreOf(id: string): Score {
    return scoreCity(this.city(id), {
      gold: this.coins(id),
      hand: this.hand(id).length,
      crown: this.crown === id,
      first: this.firstComplete === id,
      goal: this.goal,
    });
  }

  /** Le plus haut personnage révélé au dernier tour : il départage les ex æquo. */
  tieRank(id: string): number {
    return Math.max(0, ...this.revealedBy(id));
  }

  /** Du premier au dernier : le score, puis le plus haut personnage révélé. */
  ranking(): { id: string; score: Score; tie: number }[] {
    return this.order
      .map((id) => ({ id, score: this.scoreOf(id), tie: this.tieRank(id) }))
      .sort((a, b) => b.score.total - a.score.total || b.tie - a.tie);
  }

  winners(): string[] {
    const list = this.ranking();
    return list.filter((p) => p.score.total === list[0].score.total && p.tie === list[0].tie).map((p) => p.id);
  }
}

/** Ce qu'un joueur peut bâtir, or en poche : pour les bots et le pilote automatique. */
export function buildable(g: Game, id: string): string[] {
  const city = g.city(id);
  return [...new Set(g.hand(id))].filter((c) => sameAllowed(c, city) && buildCost(c, city) <= g.coins(id));
}
