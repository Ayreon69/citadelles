// Le moteur, règle par règle, d'après le livret.
import { describe, expect, it } from 'vitest';
import { ARCHITECTE, ASSASSIN, CONDOTTIERE, DISTRICTS, EVEQUE, MAGICIEN, MARCHAND, PERCEPTEUR, ROI, VOLEUR, buildCost, castSize, discards, incomeOf, parseAction, scoreCity } from '../shared/protocol';
import { AUTOPILOT, botAct, randomSkill } from '../server/bots';
import { Game, newDeck } from '../server/game';

const fixed = (cast: number[]) => [...cast];

function play4(opts: { deck?: string[] } = {}) {
  const g = new Game(['a', 'b', 'c', 'd'], { crown: 'a', castOrder: fixed, ...opts });
  return g;
}

/** Donne à chacun le personnage voulu, puis passe à l'appel. */
function assign(g: Game, ranks: Record<string, number>) {
  while (g.stage === 'pick') {
    const id = g.pick!.queue[0];
    const options = g.pickOptions(id)!;
    const wanted = options.includes(ranks[id]) ? ranks[id] : options.find((r) => !Object.values(ranks).includes(r)) ?? options[0];
    expect(g.act(id, { type: 'pick', rank: wanted })).toBeUndefined();
  }
}

/** Avance jusqu'au tour du personnage voulu. */
function callTo(g: Game, rank: number) {
  for (let i = 0; i < 40 && !(g.stage === 'turn' && g.turn?.rank === rank); i++) {
    if (g.stage === 'turn') {
      const id = g.turn!.player;
      if (!g.turn!.gathered) g.act(id, { type: 'gather', kind: 'gold' });
      g.act(id, { type: 'end' });
    } else g.advanceCall();
  }
  expect(g.turn?.rank).toBe(rank);
}

/** Une cible où tous les personnages voulus sont disponibles : on retire ce qui est écarté d'office. */
function open(): Game {
  const g = new Game(['a', 'b', 'c', 'd', 'e', 'f'], { crown: 'a', castOrder: (c) => [8, ...c.filter((r) => r !== 8)] });
  return g;
}

describe('mise en place', () => {
  it('prépare 54 quartiers de base et 14 merveilles', () => {
    expect(DISTRICTS.filter((d) => d.type !== 'unique').reduce((s, d) => s + d.copies, 0)).toBe(54);
    expect(DISTRICTS.filter((d) => d.type === 'unique').length).toBe(14);
    expect(newDeck().length).toBe(68);
  });

  it('donne 4 cartes et 2 or, et la couronne au premier', () => {
    const g = play4();
    for (const id of g.order) {
      expect(g.hand(id).length).toBe(4);
      expect(g.coins(id)).toBe(2);
    }
    expect(g.crown).toBe('a');
  });

  it('suit la table des personnages écartés du livret', () => {
    expect(discards(4, 8)).toEqual({ up: 2, down: 1 });
    expect(discards(5, 8)).toEqual({ up: 1, down: 1 });
    expect(discards(6, 8)).toEqual({ up: 0, down: 1 });
    expect(discards(7, 8)).toEqual({ up: 0, down: 1 });
    expect(discards(4, 9)).toEqual({ up: 3, down: 1 });
    expect(discards(5, 9)).toEqual({ up: 2, down: 1 });
    expect(discards(6, 9)).toEqual({ up: 1, down: 1 });
    expect(discards(7, 9)).toEqual({ up: 0, down: 1 });
    expect(discards(8, 9)).toEqual({ up: 0, down: 1 });
  });

  it('impose le 9e personnage à 3 et à 8, pas à 2', () => {
    expect(castSize(2, true)).toBe(8);
    expect(castSize(3, false)).toBe(9);
    expect(castSize(8, false)).toBe(9);
    expect(castSize(5, false)).toBe(8);
    expect(castSize(5, true)).toBe(9);
  });
});

describe('sélection', () => {
  it('n’écarte jamais le Roi face visible', () => {
    for (let i = 0; i < 40; i++) {
      const g = new Game(['a', 'b', 'c', 'd'], { crown: 'a', castOrder: () => [1, ROI, 2, 3, 5, 6, 7, 8] });
      expect(g.faceUp).not.toContain(ROI);
      expect(g.faceUp.length).toBe(2);
      expect(g.faceDown.length).toBe(1);
    }
  });

  it('fait choisir dans le sens du jeu, à partir de la couronne', () => {
    const g = play4();
    expect(g.pick!.queue).toEqual(['a', 'b', 'c', 'd']);
    expect(g.act('b', { type: 'pick', rank: g.pickOptions('a')![0] })).toBeTruthy();
    const opt = g.pickOptions('a')!;
    expect(opt.length).toBe(5);
    expect(g.act('a', { type: 'pick', rank: opt[0] })).toBeUndefined();
    expect(g.pickOptions('b')).not.toContain(opt[0]);
  });

  it('à 7 joueurs, le dernier reçoit aussi la carte cachée', () => {
    const g = new Game(['a', 'b', 'c', 'd', 'e', 'f', 'g'], { crown: 'a', castOrder: fixed });
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f']) g.act(id, { type: 'pick', rank: g.pickOptions(id)![0] });
    const last = g.pickOptions('g')!;
    expect(last.length).toBe(2);
    expect(g.act('g', { type: 'pick', rank: 1 })).toBeUndefined();
    expect(g.stage).toBe('call');
    expect(g.faceDown.length).toBe(1);
  });

  it('à 3 joueurs, chacun prend deux personnages, avec une carte écartée entre les deux passages', () => {
    const g = new Game(['a', 'b', 'c'], { crown: 'a', castOrder: fixed });
    expect(g.cast.length).toBe(9);
    expect(g.pickOptions('a')!.length).toBe(8);
    for (const id of ['a', 'b', 'c']) g.act(id, { type: 'pick', rank: g.pickOptions(id)![0] });
    expect(g.pickOptions('a')!.length).toBe(4);
    for (const id of ['a', 'b', 'c']) g.act(id, { type: 'pick', rank: g.pickOptions(id)![0] });
    expect(g.stage).toBe('call');
    expect(g.ranksOf('a').length).toBe(2);
    expect(g.ranksOf('b').length).toBe(2);
    expect(g.faceDown.length).toBe(3);
  });

  it('à 2 joueurs, on garde et on écarte tour à tour', () => {
    const g = new Game(['a', 'b'], { crown: 'a', castOrder: fixed });
    expect(g.goal).toBe(8);
    expect(g.pickOptions('a')!.length).toBe(7);
    expect(g.mustDiscard).toBe(false);
    g.act('a', { type: 'pick', rank: 2 });
    expect(g.pickOptions('b')!.length).toBe(6);
    expect(g.mustDiscard).toBe(true);
    expect(g.act('b', { type: 'pick', rank: 3 })).toBeTruthy();
    expect(g.act('b', { type: 'pick', rank: 3, discard: 4 })).toBeUndefined();
    expect(g.pickOptions('a')!.length).toBe(4);
    g.act('a', { type: 'pick', rank: 5, discard: 6 });
    expect(g.pickOptions('b')!.length).toBe(2);
    g.act('b', { type: 'pick', rank: 7, discard: 8 });
    expect(g.stage).toBe('call');
    expect(g.ranksOf('a')).toEqual([2, 5]);
    expect(g.ranksOf('b')).toEqual([3, 7]);
    expect(g.faceDown.length).toBe(4);
  });
});

describe('appel des personnages', () => {
  it('appelle dans l’ordre et donne la main', () => {
    const g = open();
    assign(g, { a: ASSASSIN, b: VOLEUR, c: MAGICIEN, d: ROI, e: EVEQUE, f: MARCHAND });
    g.advanceCall();
    expect(g.stage).toBe('turn');
    expect(g.turn!.player).toBe('a');
  });

  it('la victime passe son tour sans se révéler', () => {
    const g = open();
    assign(g, { a: ASSASSIN, b: VOLEUR, c: MAGICIEN, d: ROI, e: EVEQUE, f: MARCHAND });
    g.advanceCall();
    expect(g.act('a', { type: 'kill', rank: VOLEUR })).toBeUndefined();
    g.act('a', { type: 'gather', kind: 'gold' });
    g.act('a', { type: 'end' });
    g.advanceCall(); // Voleur : silence.
    expect(g.stage).toBe('call');
    expect(g.revealed.has(VOLEUR)).toBe(false);
    g.advanceCall();
    expect(g.turn!.rank).toBe(MAGICIEN);
  });

  it('le Voleur prend tout l’or à la révélation, jamais à l’Assassin ni à sa victime', () => {
    const g = open();
    assign(g, { a: ASSASSIN, b: VOLEUR, c: MAGICIEN, d: ROI, e: EVEQUE, f: MARCHAND });
    callTo(g, ASSASSIN);
    g.act('a', { type: 'kill', rank: MAGICIEN });
    callTo(g, VOLEUR);
    expect(g.act('b', { type: 'rob', rank: ASSASSIN })).toBeTruthy();
    expect(g.act('b', { type: 'rob', rank: MAGICIEN })).toBeTruthy();
    expect(g.act('b', { type: 'rob', rank: ROI })).toBeUndefined();
    const before = g.coins('b');
    callTo(g, ROI);
    expect(g.coins('d')).toBe(0);
    expect(g.coins('b')).toBe(before + 4);
  });

  it('le Roi prend la couronne en se révélant, et son héritier à la fin du tour s’il est tué', () => {
    const g = open();
    assign(g, { a: ASSASSIN, b: VOLEUR, c: MAGICIEN, d: ROI, e: EVEQUE, f: MARCHAND });
    callTo(g, ASSASSIN);
    g.act('a', { type: 'kill', rank: ROI });
    expect(g.crown).toBe('a');
    for (let i = 0; i < 20 && g.stage !== 'round'; i++) {
      if (g.stage === 'turn') {
        const id = g.turn!.player;
        if (!g.turn!.gathered) g.act(id, { type: 'gather', kind: 'gold' });
        g.act(id, { type: 'end' });
      } else g.advanceCall();
    }
    expect(g.crown).toBe('d');
    g.nextRound();
    expect(g.pick!.queue[0]).toBe('d');
  });
});

describe('le tour', () => {
  function atTurn(rank: number): Game {
    const g = open();
    const seats = ['a', 'b', 'c', 'd', 'e', 'f'];
    const ranks = [rank, ...[1, 2, 3, 4, 5, 6, 7].filter((r) => r !== rank)].slice(0, 6);
    assign(g, Object.fromEntries(seats.map((s, i) => [s, ranks[i]])));
    callTo(g, rank);
    return g;
  }

  it('oblige à prendre ses ressources avant de bâtir ou de finir', () => {
    const g = atTurn(MARCHAND);
    const id = g.turn!.player;
    expect(g.act(id, { type: 'end' })).toBeTruthy();
    expect(g.act(id, { type: 'build', card: g.hand(id)[0] })).toBeTruthy();
    g.act(id, { type: 'gather', kind: 'gold' });
    expect(g.coins(id)).toBe(4);
    expect(g.act(id, { type: 'gather', kind: 'gold' })).toBeTruthy();
  });

  it('pioche 2 cartes, en garde 1, et remet l’autre sous la pioche', () => {
    const g = atTurn(MARCHAND);
    const id = g.turn!.player;
    const n = g.hand(id).length;
    g.act(id, { type: 'gather', kind: 'cards' });
    const [a, b] = g.turn!.drawn!;
    expect(g.act(id, { type: 'end' })).toBeTruthy();
    g.act(id, { type: 'keep', card: a });
    expect(g.hand(id).length).toBe(n + 1);
    expect(g.deck[g.deck.length - 1]).toBe(b);
    expect(g.turn!.drawn).toBeNull();
  });

  it('refuse un second quartier et un quartier identique', () => {
    const g = atTurn(MARCHAND);
    const id = g.turn!.player;
    g.gold.set(id, 20);
    g.hands.set(id, ['taverne', 'taverne', 'temple']);
    g.act(id, { type: 'gather', kind: 'gold' });
    expect(g.act(id, { type: 'build', card: 'taverne' })).toBeUndefined();
    expect(g.act(id, { type: 'build', card: 'temple' })).toBeTruthy();
    g.cities.set(id, ['taverne']);
    g.turn!.built = 0;
    expect(g.act(id, { type: 'build', card: 'taverne' })).toBeTruthy();
    g.cities.get(id)!.push('carriere');
    expect(g.act(id, { type: 'build', card: 'taverne' })).toBeUndefined();
  });

  it('l’Architecte pioche 2 cartes de plus et bâtit jusqu’à 3 quartiers', () => {
    const g = atTurn(ARCHITECTE);
    const id = g.turn!.player;
    expect(g.hand(id).length).toBe(6);
    g.gold.set(id, 20);
    g.hands.set(id, ['taverne', 'temple', 'tour', 'eglise']);
    g.act(id, { type: 'gather', kind: 'gold' });
    for (const c of ['taverne', 'temple', 'tour']) expect(g.act(id, { type: 'build', card: c })).toBeUndefined();
    expect(g.act(id, { type: 'build', card: 'eglise' })).toBeTruthy();
  });

  it('calcule les revenus, avec l’école de magie et l’or du Marchand', () => {
    expect(incomeOf(ROI, ['manoir', 'chateau', 'temple'])).toBe(2);
    expect(incomeOf(MARCHAND, ['taverne'])).toBe(2);
    expect(incomeOf(MARCHAND, [])).toBe(1);
    expect(incomeOf(EVEQUE, ['temple', 'ecole'])).toBe(2);
    expect(incomeOf(CONDOTTIERE, ['ecole'])).toBe(1);
    expect(incomeOf(ARCHITECTE, ['manoir'])).toBe(0);
  });

  it('encaisse à la fin du tour les revenus oubliés', () => {
    const g = atTurn(MARCHAND);
    const id = g.turn!.player;
    g.act(id, { type: 'gather', kind: 'gold' });
    g.act(id, { type: 'end' });
    expect(g.coins(id)).toBe(5);
  });

  it('le Magicien échange sa main, ou repioche autant qu’il défausse, une seule fois', () => {
    const g = atTurn(MAGICIEN);
    const id = g.turn!.player;
    const other = g.order.find((o) => o !== id)!;
    g.hands.set(id, ['taverne']);
    g.hands.set(other, ['temple', 'tour', 'prison']);
    expect(g.act(id, { type: 'swap', target: other })).toBeUndefined();
    expect(g.hand(id).length).toBe(3);
    expect(g.hand(other)).toEqual(['taverne']);
    expect(g.act(id, { type: 'redraw', cards: [g.hand(id)[0]] })).toBeTruthy();

    const h = atTurn(MAGICIEN);
    const me = h.turn!.player;
    const [x, y] = h.hand(me);
    expect(h.act(me, { type: 'redraw', cards: [x, y] })).toBeUndefined();
    expect(h.hand(me).length).toBe(4);
  });

  it('le Condottiere paie le coût moins 1, et respecte la cité complète, le Donjon et l’Évêque', () => {
    const g = new Game(['a', 'b', 'c', 'd', 'e', 'f'], { crown: 'a', castOrder: (c) => [1, ...c.filter((r) => r !== 1)] });
    assign(g, { a: CONDOTTIERE, b: EVEQUE, c: VOLEUR, d: ROI, e: MARCHAND, f: ARCHITECTE });
    g.cities.set('b', ['temple']);
    g.cities.set('c', ['taverne', 'donjon', 'palais']);
    g.cities.set('d', ['taverne', 'temple', 'tour', 'eglise', 'marche', 'prison', 'manoir']);
    callTo(g, CONDOTTIERE);
    g.gold.set('a', 3);
    expect(g.act('a', { type: 'destroy', target: 'b', card: 'temple' })).toBeTruthy();
    expect(g.act('a', { type: 'destroy', target: 'c', card: 'donjon' })).toBeTruthy();
    expect(g.act('a', { type: 'destroy', target: 'd', card: 'taverne' })).toBeTruthy();
    expect(g.act('a', { type: 'destroy', target: 'c', card: 'palais' })).toBeTruthy();
    expect(g.act('a', { type: 'destroy', target: 'c', card: 'taverne' })).toBeUndefined();
    expect(g.coins('a')).toBe(3);
    expect(g.city('c')).toEqual(['donjon', 'palais']);
    expect(g.act('a', { type: 'destroy', target: 'c', card: 'palais' })).toBeTruthy();
  });

  it('une action d’un autre joueur est refusée', () => {
    const g = atTurn(MARCHAND);
    const other = g.order.find((o) => o !== g.turn!.player)!;
    expect(g.act(other, { type: 'gather', kind: 'gold' })).toBeTruthy();
  });

  it('le Percepteur prélève 1 or par quartier, et vide sa bourse à son tour', () => {
    const g = new Game(['a', 'b', 'c'], { crown: 'a', castOrder: (c) => [3, ...c.filter((r) => r !== 3)] });
    g.act('a', { type: 'pick', rank: MARCHAND });
    g.act('b', { type: 'pick', rank: PERCEPTEUR });
    g.act('c', { type: 'pick', rank: 1 });
    g.act('a', { type: 'pick', rank: g.pickOptions('a')![0] });
    g.act('b', { type: 'pick', rank: g.pickOptions('b')![0] });
    g.act('c', { type: 'pick', rank: g.pickOptions('c')![0] });
    callTo(g, MARCHAND);
    g.hands.set('a', ['taverne']);
    g.gold.set('a', 3);
    g.act('a', { type: 'gather', kind: 'gold' });
    g.act('a', { type: 'build', card: 'taverne' });
    expect(g.coins('a')).toBe(3);
    expect(g.taxPot).toBe(1);
    const before = g.coins('b');
    callTo(g, PERCEPTEUR);
    expect(g.coins('b')).toBe(before + 1);
    expect(g.taxPot).toBe(0);
  });

  it('les merveilles agissent : Forge, Laboratoire, Bibliothèque, Manufacture, Repaire', () => {
    const g = atTurn(MARCHAND);
    const id = g.turn!.player;
    g.cities.set(id, ['forge', 'laboratoire', 'bibliotheque', 'manufacture']);
    g.gold.set(id, 2);
    g.hands.set(id, ['taverne', 'repaire', 'temple', 'tour', 'prison', 'eglise', 'marche', 'caserne']);
    const before = g.hand(id).length;
    g.act(id, { type: 'gather', kind: 'cards' });
    expect(g.turn!.drawn).toBeNull();
    expect(g.hand(id).length).toBe(before + 2);
    expect(g.act(id, { type: 'lab', card: 'taverne' })).toBeUndefined();
    expect(g.coins(id)).toBe(4);
    expect(g.act(id, { type: 'lab', card: 'temple' })).toBeTruthy();
    expect(g.act(id, { type: 'smithy' })).toBeUndefined();
    expect(g.coins(id)).toBe(2);
    expect(g.act(id, { type: 'smithy' })).toBeTruthy();
    expect(buildCost('repaire', g.city(id))).toBe(5);
    expect(g.act(id, { type: 'build', card: 'repaire', pay: ['temple', 'tour', 'prison', 'eglise', 'marche', 'caserne'] })).toBeTruthy();
    expect(g.act(id, { type: 'build', card: 'repaire', pay: ['temple', 'tour', 'prison'] })).toBeUndefined();
    expect(g.coins(id)).toBe(0);
    expect(g.city(id)).toContain('repaire');
  });
});

describe('fin de partie', () => {
  it('compte coûts, types, cité complète et merveilles', () => {
    const city = ['chateau', 'taverne', 'echoppe', 'monastere', 'cathedrale', 'tour', 'miracles'];
    const s = scoreCity(city, { gold: 3, hand: 2, crown: false, first: true, goal: 7 });
    // Le même calcul que l'exemple du livret, avec la tour à la place de l'observatoire.
    expect(s.base).toBe(4 + 1 + 2 + 3 + 5 + 1 + 2);
    // Noble, commerce, religieux, militaire : la Cour des Miracles compte comme merveille.
    expect(s.types).toBe(3);
    expect(s.complete).toBe(4);
    expect(scoreCity(['manoir', 'temple', 'taverne', 'tour', 'dragon'], { gold: 0, hand: 0, crown: false, first: false, goal: 7 }).types).toBe(3);
    expect(scoreCity(['manoir', 'temple', 'taverne', 'miracles', 'dragon'], { gold: 0, hand: 0, crown: false, first: false, goal: 7 }).types).toBe(3);
  });

  it('applique les bonus de merveilles', () => {
    const base = { gold: 4, hand: 3, crown: true, first: false, goal: 7 };
    expect(scoreCity(['dragon'], base).wonders).toBe(2);
    expect(scoreCity(['tresor'], base).wonders).toBe(4);
    expect(scoreCity(['cartes'], base).wonders).toBe(3);
    expect(scoreCity(['statue'], base).wonders).toBe(5);
    expect(scoreCity(['statue'], { ...base, crown: false }).wonders).toBe(0);
    expect(scoreCity(['fontaine', 'donjon'], base).wonders).toBe(2);
  });

  it('finit après le tour où une cité est complète et départage par le plus haut personnage révélé', () => {
    const g = open();
    assign(g, { a: ASSASSIN, b: VOLEUR, c: MAGICIEN, d: ROI, e: EVEQUE, f: MARCHAND });
    g.cities.set('a', ['temple', 'eglise', 'tour', 'prison', 'taverne', 'marche']);
    g.hands.set('a', ['manoir']);
    g.gold.set('a', 3);
    callTo(g, ASSASSIN);
    g.act('a', { type: 'gather', kind: 'gold' });
    g.act('a', { type: 'build', card: 'manoir' });
    expect(g.firstComplete).toBe('a');
    expect(g.lastRound).toBe(true);
    g.act('a', { type: 'end' });
    for (let i = 0; i < 20 && g.stage !== 'over'; i++) {
      if (g.stage === 'turn') {
        const id = g.turn!.player;
        g.act(id, { type: 'gather', kind: 'gold' });
        g.act(id, { type: 'end' });
      } else g.advanceCall();
    }
    expect(g.stage).toBe('over');
    expect(g.ranking()[0].id).toBe('a');
    expect(g.winners()).toEqual(['a']);
    // Deux cités vides à égalité : le rang révélé départage.
    const others = g.ranking().slice(1);
    for (let i = 1; i < others.length; i++) expect(others[i - 1].tie).toBeGreaterThanOrEqual(others[i].tie);
  });
});

describe('actions reçues du réseau', () => {
  it('refuse les formes invalides', () => {
    expect(parseAction(null)).toBeNull();
    expect(parseAction({ type: 'pick', rank: 12 })).toBeNull();
    expect(parseAction({ type: 'build', card: 'inconnu' })).toBeNull();
    expect(parseAction({ type: 'gather', kind: 'x' })).toBeNull();
    expect(parseAction({ type: 'pwn' })).toBeNull();
    expect(parseAction({ type: 'gather', kind: 'gold' })).toEqual({ type: 'gather', kind: 'gold' });
    expect(parseAction({ type: 'end', extra: 1 })).toEqual({ type: 'end' });
  });
});

describe('les bots', () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8]) {
    it(`jouent une partie complète à ${n}, sans action refusée`, () => {
      const order = Array.from({ length: n }, (_, i) => `p${i}`);
      const skills = new Map(order.map((id) => [id, randomSkill()]));
      const g = new Game(order, { crown: 'p0', eventMs: 1 });
      for (let i = 0; i < 20000 && g.stage !== 'over'; i++) {
        if (g.stage === 'call') g.advanceCall();
        else if (g.stage === 'round') g.nextRound();
        else {
          const id = g.stage === 'pick' ? g.pick!.queue[0] : g.turn!.player;
          const a = botAct(g, id, skills.get(id) ?? AUTOPILOT);
          expect(g.act(id, a), JSON.stringify(a)).toBeUndefined();
        }
      }
      expect(g.stage).toBe('over');
      expect(g.winners().length).toBeGreaterThan(0);
      // Rien ne se perd : pioche, mains et cités font toujours 68 cartes.
      const total = g.deck.length + order.reduce((s, id) => s + g.hand(id).length + g.city(id).length, 0);
      expect(total).toBe(68);
    });
  }
});
