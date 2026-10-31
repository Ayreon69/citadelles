// Une table de Citadelles : salon, partie, minuteries, bots, pilote automatique et vue de chacun.
import crypto from 'node:crypto';
import {
  AVATARS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  THINK_OPTIONS,
  parseAction,
  type Action,
  type FinalView,
  type GameView,
  type PlayerStatus,
  type RoomView,
  type Settings,
  type ThinkTime,
} from '../shared/protocol';
import { AUTOPILOT, botAct, randomSkill, type Skill } from './bots';
import { Game, shuffle } from './game';

const BOT_NAMES = ['Aliénor', 'Gauvain', 'Perceval', 'Mélisende', 'Thibault', 'Isaure', 'Godefroy', 'Yseult', 'Bertrand', 'Blanche'];
const MAX_MEMBERS = 16;
/** Délai laissé à un joueur déconnecté avant que le pilote automatique ne prenne le relais. */
const GRACE_MS = 20_000;
/** Mode accéléré pour les tests locaux (CI_FAST=1) : bots et chronos quasi instantanés. */
const FAST = process.env.CI_FAST === '1';
const EVENT_MS = FAST ? 200 : 3_400;
/** Le temps d'un appel : c'est le même pour un personnage absent et pour une victime, sinon le silence se trahirait. */
const CALL_MS = FAST ? 5 : 850;
/** La pause de fin de tour, avant de choisir à nouveau. */
const ROUND_MS = FAST ? 20 : 2_400;
/** Le temps de regarder la dernière cité avant le classement. */
const FINISH_MS = FAST ? 60 : 3_000;

export interface Player {
  id: string;
  token: string;
  name: string;
  avatar: string;
  isBot: boolean;
  sockets: Set<string>;
  connected: boolean;
  disconnectedAt: number;
  left: boolean;
  status: PlayerStatus;
}

function uid(): string {
  return crypto.randomBytes(9).toString('base64url');
}

export class Room {
  readonly code: string;
  hostId = '';
  phase: 'lobby' | 'playing' | 'finished' = 'lobby';
  settings: Settings = { think: 0, ninth: false };
  players: Player[] = [];
  game: Game | null = null;
  final: FinalView | null = null;
  wins = new Map<string, number>();
  skills = new Map<string, Skill>();
  /** La décision en cours (joueur qui choisit, ou tour de personnage) et son chrono. */
  stepKey = '';
  stepStartedAt = 0;
  stepEndsAt = 0;
  botActAt = 0;
  callAt = 0;
  roundAt = 0;
  finishAt = 0;
  lastActive = Date.now();
  onChange: () => void = () => {};
  onEmote: (playerId: string, text: string) => void = () => {};

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(code: string) {
    this.code = code;
  }

  // ───────────────────────────── Membres ─────────────────────────────

  get(id: string | undefined): Player | undefined {
    return id ? this.players.find((p) => p.id === id) : undefined;
  }

  findByToken(playerId: unknown, token: unknown): Player | undefined {
    if (typeof playerId !== 'string' || typeof token !== 'string') return undefined;
    const p = this.get(playerId);
    return p && !p.isBot && p.token === token ? p : undefined;
  }

  get seated(): Player[] {
    return this.players.filter((p) => p.status !== 'spectator');
  }

  get humansOnline(): number {
    return this.players.filter((p) => !p.isBot && p.connected).length;
  }

  touch(): void {
    this.lastActive = Date.now();
  }

  private uniqueName(name: string): string {
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    if (!taken.has(name.toLowerCase())) return name;
    for (let i = 2; i < 99; i++) {
      const candidate = `${name.slice(0, 13)} ${i}`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return name;
  }

  private makePlayer(name: string, avatar: string, isBot: boolean, status: PlayerStatus): Player {
    return {
      id: uid(),
      token: uid() + uid(),
      name: this.uniqueName(name),
      avatar,
      isBot,
      sockets: new Set(),
      connected: isBot,
      disconnectedAt: Date.now(),
      left: false,
      status,
    };
  }

  addHuman(name: string, avatar: string): Player | string {
    if (this.players.length >= MAX_MEMBERS) return 'Cette table est pleine.';
    if (this.phase === 'lobby' && this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const p = this.makePlayer(name, avatar, false, this.phase === 'lobby' ? 'lobby' : 'spectator');
    this.players.push(p);
    if (!this.hostId) this.hostId = p.id;
    return p;
  }

  addBot(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut ajouter des bots.";
    if (this.phase !== 'lobby') return 'On ajoute des bots dans le salon.';
    if (this.seated.length >= MAX_PLAYERS) return `La table est complète (${MAX_PLAYERS} joueurs maximum).`;
    const used = new Set(this.players.map((p) => p.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${this.players.length + 1}`;
    const usedAvatars = new Set(this.players.map((p) => p.avatar));
    const free = AVATARS.filter((a) => !usedAvatars.has(a));
    const pool = free.length ? free : AVATARS;
    this.players.push(this.makePlayer(name, pool[crypto.randomInt(pool.length)], true, 'lobby'));
    return undefined;
  }

  kick(by: string, target: string): { sockets: string[] } | string {
    if (by !== this.hostId) return "Seul l'hôte peut retirer un joueur.";
    if (this.phase !== 'lobby') return 'On ne peut retirer un joueur que dans le salon.';
    const p = this.get(target);
    if (!p || p.id === by) return 'Joueur introuvable.';
    this.players = this.players.filter((x) => x.id !== p.id);
    return { sockets: [...p.sockets] };
  }

  leave(id: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.clear();
    p.connected = false;
    p.disconnectedAt = Date.now();
    // En partie, sa cité reste sur la table : le pilote automatique joue pour lui.
    if (this.phase === 'lobby' || p.status === 'spectator') this.players = this.players.filter((x) => x.id !== id);
    else p.left = true;
    if (this.hostId === id) this.transferHost();
  }

  private transferHost(): void {
    const next = this.players.find((p) => !p.isBot && !p.left && p.connected) ?? this.players.find((p) => !p.isBot && !p.left);
    this.hostId = next?.id ?? '';
  }

  connect(p: Player, socketId: string): void {
    p.sockets.add(socketId);
    p.connected = true;
    p.left = false;
    if (!this.hostId || !this.get(this.hostId) || this.get(this.hostId)?.left) this.hostId = p.id;
  }

  disconnect(id: string | undefined, socketId: string): void {
    const p = this.get(id);
    if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size === 0) {
      p.connected = false;
      p.disconnectedAt = Date.now();
    }
  }

  isAuto(p: Player): boolean {
    return p.isBot || p.left || (!p.connected && Date.now() - p.disconnectedAt >= GRACE_MS);
  }

  updateSettings(by: string, payload: Record<string, unknown>): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut changer les réglages.";
    if (this.phase !== 'lobby') return 'Les réglages se changent dans le salon.';
    if ((THINK_OPTIONS as readonly unknown[]).includes(payload.think)) this.settings.think = payload.think as ThinkTime;
    if (typeof payload.ninth === 'boolean') this.settings.ninth = payload.ninth;
    return undefined;
  }

  // ───────────────────────────── Partie ─────────────────────────────

  start(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut lancer la partie.";
    if (this.phase !== 'lobby') return 'La partie est déjà lancée.';
    const seated = this.seated;
    if (seated.length < MIN_PLAYERS) return `Il faut au moins ${MIN_PLAYERS} joueurs (ajoute un bot si besoin).`;
    for (const p of seated) p.status = 'playing';
    const order = shuffle(seated.map((p) => p.id));
    const spectators = this.players.filter((p) => p.status === 'spectator');
    this.players = [...order.map((id) => this.get(id)!), ...spectators];
    this.game = new Game(order, { ninth: this.settings.ninth, eventMs: EVENT_MS });
    this.skills.clear();
    for (const p of this.players) if (p.isBot && p.status === 'playing') this.skills.set(p.id, randomSkill());
    this.phase = 'playing';
    this.final = null;
    this.stepKey = '';
    this.arm();
    return undefined;
  }

  restart(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut relancer une partie.";
    if (this.phase === 'lobby') return undefined;
    this.clearTimer();
    this.players = this.players.filter((p) => !p.left);
    let seats = 0;
    for (const p of this.players) {
      p.status = seats < MAX_PLAYERS ? 'lobby' : 'spectator';
      if (p.status === 'lobby') seats++;
    }
    this.phase = 'lobby';
    this.game = null;
    this.final = null;
    this.skills.clear();
    return undefined;
  }

  endEarly(by: string): string | undefined {
    if (by !== this.hostId) return "Seul l'hôte peut arrêter la partie.";
    if (this.phase !== 'playing') return undefined;
    return this.restart(by);
  }

  /** Plus aucun humain présent à la table : les bots jouent vite. */
  private onlyBots(): boolean {
    return this.players.every((p) => p.status !== 'playing' || this.isAuto(p));
  }

  private botDelay(min: number, spread: number): number {
    if (FAST) return 5;
    if (this.onlyBots()) return 200;
    return min + Math.random() * spread;
  }

  /** Prépare la prochaine échéance selon l'étape : un choix, un appel, un tour, ou la fin. */
  private arm(): void {
    const g = this.game;
    if (!g) return;
    const now = Date.now();
    const limit = FAST ? 1_500 : this.settings.think * 1000;
    if (g.stage === 'call') {
      this.callAt = now + (this.onlyBots() ? 120 : CALL_MS);
      this.stepEndsAt = 0;
      return;
    }
    if (g.stage === 'round') {
      this.roundAt = now + ROUND_MS;
      this.stepEndsAt = 0;
      return;
    }
    if (g.stage === 'over') {
      this.finishAt = now + FINISH_MS;
      this.stepEndsAt = 0;
      return;
    }
    const key = g.stage === 'pick' ? `pick:${g.round}:${g.pick!.queue.length}` : `turn:${g.turn!.no}`;
    if (key !== this.stepKey) {
      this.stepKey = key;
      this.stepStartedAt = now;
      this.stepEndsAt = limit ? now + limit : 0;
      this.botActAt = now + (g.stage === 'pick' ? this.botDelay(700, 900) : this.botDelay(1400, 500));
    } else this.botActAt = now + this.botDelay(850, 450);
  }

  act(by: string, raw: unknown, turn?: unknown): string | undefined {
    if (this.phase !== 'playing' || !this.game) return "Aucune partie n'est en cours.";
    const action = parseAction(raw);
    if (!action) return 'Action inconnue.';
    return this.apply(by, action, turn);
  }

  private apply(by: string, action: Action, turn?: unknown): string | undefined {
    const g = this.game!;
    // À 2 ou 3 joueurs, on enchaîne deux personnages : un double appui ne doit pas finir le suivant.
    if (action.type !== 'pick' && turn !== undefined && turn !== g.turn?.no) return 'Le tour a changé entre-temps.';
    const err = g.act(by, action);
    if (err) return err;
    if (action.type === 'destroy') this.botReacts(action.target, ['Laisse ma cité', '😱']);
    this.arm();
    return undefined;
  }

  /** De temps en temps, la victime d'un bot réagit, si c'est un bot. */
  private botReacts(id: string, pool: string[]): void {
    if (FAST || !this.get(id)?.isBot || Math.random() > 0.45) return;
    setTimeout(() => this.onEmote(id, pool[crypto.randomInt(pool.length)]), 800);
  }

  private finishGame(): void {
    const g = this.game;
    if (!g || g.stage !== 'over') return;
    const winners = g.winners();
    for (const id of winners) this.wins.set(id, (this.wins.get(id) ?? 0) + 1);
    this.final = {
      rounds: g.round,
      goal: g.goal,
      winners,
      players: g.ranking().map(({ id, score, tie }) => {
        const p = this.get(id);
        return {
          id,
          name: p?.name ?? '?',
          avatar: p?.avatar ?? AVATARS[0],
          city: [...g.city(id)],
          hand: [...g.hand(id)],
          gold: g.coins(id),
          crown: g.crown === id,
          score,
          tieRank: tie,
          ranks: g.ranksOf(id),
          wins: this.wins.get(id) ?? 0,
          winner: winners.includes(id),
        };
      }),
    };
    this.phase = 'finished';
    this.clearTimer();
  }

  // ───────────────────────────── Minuteries & pilote automatique ─────────────────────────────

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** À appeler après chaque changement : planifie la prochaine échéance puis diffuse l'état. */
  commit(): void {
    this.reschedule();
    this.onChange();
  }

  /** Celui dont on attend une décision. */
  private waitingFor(): string | null {
    const g = this.game!;
    if (g.stage === 'pick') return g.pick!.queue[0];
    if (g.stage === 'turn') return g.turn!.player;
    return null;
  }

  /** Quand agir pour un joueur : bot → délai naturel, absent → fin du délai de grâce, sinon fin du chrono. */
  private dueAt(p: Player | undefined): number {
    const limit = this.stepEndsAt > 0 ? this.stepEndsAt : Infinity;
    if (!p) return Date.now();
    if (p.isBot) return this.botActAt;
    if (this.isAuto(p)) return Math.min(this.botActAt, Math.max(this.stepStartedAt + 1200, p.disconnectedAt + (p.left ? 0 : GRACE_MS)));
    if (!p.connected) return Math.min(limit, p.disconnectedAt + GRACE_MS);
    return limit;
  }

  private nextDue(): number {
    const g = this.game!;
    if (g.stage === 'over') return this.finishAt;
    if (g.stage === 'round') return this.roundAt;
    if (g.stage === 'call') return this.callAt;
    return this.dueAt(this.get(this.waitingFor() ?? undefined));
  }

  private reschedule(): void {
    this.clearTimer();
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const now = Date.now();
    let due = this.nextDue();
    // Un événement affiché doit disparaître des écrans à l'heure dite.
    for (const e of g.events) if (e.until > now) due = Math.min(due, e.until + 5);
    if (!Number.isFinite(due)) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      try {
        this.tick();
      } catch (e) {
        console.error(`[room ${this.code}]`, e);
      }
      this.commit();
    }, Math.max(0, Math.min(due - now, 2_147_000_000)));
  }

  tick(): void {
    const g = this.game;
    if (this.phase !== 'playing' || !g) return;
    const now = Date.now();
    if (g.stage === 'over') {
      if (now >= this.finishAt) this.finishGame();
      return;
    }
    if (g.stage === 'round') {
      if (now >= this.roundAt) {
        g.nextRound();
        this.arm();
      }
      return;
    }
    if (g.stage === 'call') {
      if (now >= this.callAt) {
        g.advanceCall();
        this.arm();
      }
      return;
    }
    const id = this.waitingFor();
    if (id && now >= this.dueAt(this.get(id))) this.autoPlay(id);
  }

  /** Le bot joue une action ; le pilote automatique d'un absent ou d'un joueur hors délai fait de même. */
  autoPlay(id: string): void {
    const g = this.game!;
    const skill = this.skills.get(id) ?? AUTOPILOT;
    const action = botAct(g, id, skill);
    if (!this.apply(id, action)) return;
    // Filet de sécurité : la partie ne doit jamais se bloquer.
    console.error(`[room ${this.code}] action refusée`, action);
    if (g.stage === 'pick') {
      const options = g.pickOptions(id) ?? [];
      const err = this.apply(id, { type: 'pick', rank: options[0], discard: g.mustDiscard ? options[1] : undefined });
      if (err) console.error(`[room ${this.code}] choix refusé : ${err}`);
    } else if (g.turn?.drawn) this.apply(id, { type: 'keep', card: g.turn.drawn[0] });
    else if (g.turn && !g.turn.gathered) this.apply(id, { type: 'gather', kind: 'gold' });
    else this.apply(id, { type: 'end' });
  }

  dispose(): void {
    this.clearTimer();
  }

  // ───────────────────────────── Vue personnalisée ─────────────────────────────

  private gameView(g: Game, viewer: string): GameView {
    const now = Date.now();
    const seated = g.order.includes(viewer);
    const mine = seated ? g.ranksOf(viewer) : [];
    const t = g.turn;
    const picker = g.pick?.queue[0];
    return {
      order: [...g.order],
      stage: g.stage,
      round: g.round,
      goal: g.goal,
      cast: [...g.cast],
      faceUp: [...g.faceUp],
      calling: g.calling,
      mine,
      iAmDead: g.killed !== null && mine.includes(g.killed),
      killed: g.killed,
      robbed: g.robbed,
      pick: picker
        ? {
            current: picker,
            endsAt: this.stepEndsAt,
            options: picker === viewer ? g.pickOptions(viewer) : null,
            mustDiscard: picker === viewer && g.mustDiscard,
          }
        : null,
      turn: t
        ? {
            player: t.player,
            rank: t.rank,
            no: t.no,
            endsAt: this.stepEndsAt,
            gathered: t.gathered,
            drawn: t.player === viewer && t.drawn ? [...t.drawn] : null,
            built: t.built,
            limit: t.limit,
            incomeDone: t.incomeDone,
            powerDone: t.powerDone,
            smithyDone: t.smithyDone,
            labDone: t.labDone,
          }
        : null,
      hand: seated ? [...g.hand(viewer)] : null,
      taxPot: g.taxPot,
      deckEmpty: g.deck.length === 0,
      lastRound: g.lastRound,
      firstComplete: g.firstComplete,
      events: g.events.filter((e) => e.until > now).map((e) => ({ ...e })),
    };
  }

  viewFor(viewerId: string): RoomView {
    const g = this.phase === 'playing' ? this.game : null;
    return {
      code: this.code,
      phase: this.phase,
      me: viewerId,
      hostId: this.hostId,
      settings: { ...this.settings },
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        isBot: p.isBot,
        isHost: p.id === this.hostId,
        connected: p.isBot || p.connected,
        autopilot: !p.isBot && p.status === 'playing' && this.isAuto(p),
        status: p.status,
        gold: g && g.order.includes(p.id) ? g.coins(p.id) : null,
        hand: g && g.order.includes(p.id) ? g.hand(p.id).length : null,
        city: g ? [...g.city(p.id)] : [],
        crown: !!g && g.crown === p.id,
        revealed: g ? g.revealedBy(p.id) : [],
        wins: this.wins.get(p.id) ?? 0,
      })),
      game: g ? this.gameView(g, viewerId) : null,
      final: this.final,
      serverNow: Date.now(),
    };
  }
}

