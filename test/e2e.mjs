// Test de bout en bout sur le serveur compilé : parties complètes jouées par de vrais clients Socket.IO,
// avec spectateur, déconnexion, reprise et session volée. À chaque état reçu, on vérifie qu'aucun secret ne fuit.
// Usage : npm run build && npm run e2e
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';

const PORT = 3900 + Math.floor(Math.random() * 90);
const URL = process.env.CI_URL || `http://localhost:${PORT}`;
const server = process.env.CI_URL
  ? null
  : spawn(process.execPath, ['dist/server/index.mjs'], {
      env: { ...process.env, PORT: String(PORT), CI_FAST: '1' },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  server?.kill();
  process.exit(1);
};
setTimeout(() => fail('délai dépassé (4 min)'), 240_000).unref();

if (server) await new Promise((resolve) => server.stdout.on('data', (d) => String(d).includes('prêt') && resolve()));

const stats = { states: 0, picks: 0, builds: 0, kills: 0, robs: 0, destroys: 0, swaps: 0, refused: 0, games: [] };
const FORBIDDEN = ['"token"', '"deck"', '"faceDown"', '"holders"', '"seenPool"', '"hands"', '"skills"'];

function client(name, { player = true, avatar = 'lion' } = {}) {
  const socket = io(URL, { transports: ['websocket'], forceNew: true });
  const c = { name, socket, view: null, avatar, player, session: null, lastHand: null };
  socket.on('state', (v) => {
    c.view = v;
    audit(c, v);
    if (c.player) play(c);
  });
  c.call = (event, payload = {}) => new Promise((res) => socket.emit(event, payload, res));
  return c;
}

/** Ce que reçoit chaque client : sa main, ses personnages, rien de ceux des autres avant qu'ils se révèlent. */
function audit(c, v) {
  stats.states++;
  const json = JSON.stringify(v);
  for (const word of FORBIDDEN) if (json.includes(word)) fail(`la vue contient ${word}`);
  for (const p of v.players) {
    if (p.hand !== null && !Number.isInteger(p.hand)) fail(`la main de ${p.name} circule en clair`);
    if (p.gold !== null && (!Number.isInteger(p.gold) || p.gold < 0)) fail(`or impossible pour ${p.name}`);
  }
  const g = v.game;
  if (v.phase !== 'playing' || !g) return;
  const seated = g.order.includes(v.me);
  if (seated !== Array.isArray(g.hand)) fail(`${c.name} : main reçue à tort`);
  if (g.hand && g.hand.length !== v.players.find((p) => p.id === v.me).hand) fail(`${c.name} : main et compte diffèrent`);
  if (!seated && g.mine.length) fail('un spectateur connaît des personnages');
  if (!seated && g.iAmDead) fail('un spectateur est mort');
  if (g.pick) {
    if (g.pick.current !== v.me && g.pick.options !== null) fail(`${c.name} voit les personnages proposés à un autre`);
    if (g.pick.current === v.me && !g.pick.options) fail(`${c.name} ne voit pas ses choix`);
  }
  if (g.turn) {
    if (g.turn.player !== v.me && g.turn.drawn !== null) fail(`${c.name} voit la pioche d'un autre`);
    const revealed = v.players.find((p) => p.id === g.turn.player).revealed;
    if (!revealed.includes(g.turn.rank)) fail('le joueur en cours ne s’est pas révélé');
  }
  if (g.events.length > 6) fail('trop d’événements : on dirait un historique');
  for (const e of g.events) {
    if (e.until < v.serverNow - 50) fail('un événement expiré circule encore');
    // Seule la pose d'un quartier et sa destruction nomment une carte, comme à une vraie table.
    if (e.card && e.kind !== 'build' && e.kind !== 'destroy') fail(`l'événement ${e.kind} dévoile une carte`);
    if (e.kind === 'reveal' && g.stage === 'turn' && e.rank === g.turn.rank && e.by !== g.turn.player) fail('révélation incohérente');
  }
  // Un personnage assassiné n'est connu que de sa victime : elle reste la seule à savoir.
  if (g.iAmDead && !g.mine.includes(g.killed)) fail('victime incohérente');
}

const busy = new Set();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Un joueur moyen : il choisit au hasard et bâtit ce qu'il peut. */
function play(c) {
  const v = c.view;
  const g = v?.game;
  if (!v || v.phase !== 'playing' || !g || !g.order.includes(v.me)) return;
  const send = (key, action) => {
    if (busy.has(key)) return;
    busy.add(key);
    c.socket.emit('game:act', { action, turn: g.turn?.no }, (res) => {
      if (!res?.ok) stats.refused++;
    });
  };
  if (g.stage === 'pick') {
    if (g.pick.current !== v.me) return;
    const options = g.pick.options;
    const rank = pick(options);
    const discard = g.pick.mustDiscard ? pick(options.filter((r) => r !== rank)) : undefined;
    stats.picks++;
    return send(`${c.name}:pick:${g.round}:${options.length}`, { type: 'pick', rank, discard });
  }
  if (g.stage !== 'turn' || g.turn.player !== v.me) return;
  const t = g.turn;
  const me = v.players.find((p) => p.id === v.me);
  const k = (s) => `${c.name}:${t.no}:${s}`;
  if (t.drawn) return send(k('keep'), { type: 'keep', card: t.drawn[0] });
  const others = v.players.filter((p) => g.order.includes(p.id) && p.id !== v.me);
  if (!t.powerDone) {
    const open = g.cast.filter((r) => r !== t.rank && !g.faceUp.includes(r) && !g.mine.includes(r));
    if (t.rank === 1) {
      stats.kills++;
      return send(k('kill'), { type: 'kill', rank: pick(open) });
    }
    if (t.rank === 2) {
      const targets = open.filter((r) => r !== 1 && r !== g.killed);
      stats.robs++;
      return send(k('rob'), { type: 'rob', rank: pick(targets) });
    }
    if (t.rank === 3 && Math.random() < 0.7) {
      stats.swaps++;
      return send(k('swap'), { type: 'swap', target: pick(others).id });
    }
  }
  if (!t.gathered) return send(k('gather'), { type: 'gather', kind: g.hand.length < 2 && !g.deckEmpty ? 'cards' : 'gold' });
  if (!t.incomeDone) return send(k('income'), { type: 'income' });
  if (t.rank === 8 && !t.powerDone) {
    const victim = others.find((p) => p.city.length && p.city.length < g.goal && !p.revealed.includes(5));
    if (victim && me.gold >= 4) {
      stats.destroys++;
      // Le serveur peut refuser (Donjon, Évêque) : ce n'est pas une erreur, on essaie une fois.
      return send(k('destroy'), { type: 'destroy', target: victim.id, card: victim.city[0] });
    }
  }
  if (t.built < t.limit) {
    const city = me.city;
    const can = g.hand.find((id) => !city.includes(id) && COST.get(id) <= me.gold);
    if (can) {
      stats.builds++;
      return send(k(`build:${t.built}`), { type: 'build', card: can });
    }
  }
  send(k('end'), { type: 'end' });
}

const COST = new Map([
  ['manoir', 3], ['chateau', 4], ['palais', 5],
  ['temple', 1], ['eglise', 2], ['monastere', 3], ['cathedrale', 5],
  ['taverne', 1], ['echoppe', 2], ['marche', 2], ['comptoir', 3], ['port', 4], ['hotel', 5],
  ['tour', 1], ['prison', 2], ['caserne', 3], ['forteresse', 5],
  ['dragon', 6], ['manufacture', 5], ['miracles', 2], ['tresor', 5], ['donjon', 3], ['laboratoire', 5], ['bibliotheque', 6],
  ['cartes', 5], ['carriere', 5], ['ecole', 6], ['forge', 5], ['statue', 3], ['repaire', 6], ['fontaine', 5],
]);

const waitPhase = (c, phase) =>
  new Promise((resolve) => {
    const check = setInterval(() => {
      if (c.view?.phase === phase) {
        clearInterval(check);
        resolve();
      }
    }, 30);
  });

function checkFinal(final, players, goal) {
  if (!final || final.players.length !== players) fail(`classement incomplet (${final?.players.length})`);
  if (final.goal !== goal) fail(`objectif ${final.goal}, attendu ${goal}`);
  if (!final.winners.length) fail('aucun gagnant');
  if (!final.players.some((p) => p.city.length >= goal)) fail('partie finie sans cité complète');
  const completed = final.players.filter((p) => p.city.length >= goal);
  if (completed.filter((p) => p.score.complete === 4).length !== 1) fail('un seul joueur marque le bonus de 4');
  for (const p of final.players) {
    if (p.score.total !== p.score.base + p.score.types + p.score.complete + p.score.wonders) fail('total faux');
    const base = p.city.reduce((s, id) => s + COST.get(id), 0);
    if (base !== p.score.base) fail(`${p.name} : somme des coûts fausse`);
    if (p.winner !== final.winners.includes(p.id)) fail('gagnant mal marqué');
  }
  for (let i = 1; i < final.players.length; i++) if (final.players[i].score.total > final.players[i - 1].score.total) fail('classement mal trié');
  stats.games.push(`${players} joueurs : ${final.rounds} tours, ${final.players[0].name} gagne avec ${final.players[0].score.total} points`);
}

async function join(c, code, extra = {}) {
  if (!c.socket.connected) await new Promise((r) => c.socket.on('connect', r));
  const res = await c.call('room:join', { code, name: c.name, avatar: c.avatar, ...extra });
  if (!res.ok) fail(`arrivée de ${c.name} : ${res.error}`);
  c.session = res.data;
}

// ── Partie 1 : 3 humains + 2 bots, spectateur, déconnexion, session volée ──
const host = client('Ana');
await new Promise((r) => host.socket.on('connect', r));
const created = await host.call('room:create', { name: 'Ana', avatar: 'lion', bots: 2 });
if (!created.ok) fail(`création : ${created.error}`);
const code = created.data.code;
const bob = client('Bob');
const chloe = client('Chloé');
await join(bob, code);
await join(chloe, code);
if (!(await host.call('room:settings', { think: 60 })).ok) fail('réglages refusés');
if ((await bob.call('room:settings', { think: 0 })).ok) fail('un invité a changé les réglages');
if ((await bob.call('game:start')).ok) fail('un invité a lancé la partie');
if (!(await host.call('game:start')).ok) fail('lancement refusé');

await new Promise((r) => setTimeout(r, 200));
const watcher = client('Dora', { player: false, avatar: 'cerf' });
await join(watcher, code);
await new Promise((r) => setTimeout(r, 80));
if (watcher.view.players.find((p) => p.name === 'Dora')?.status !== 'spectator') fail('la retardataire devrait regarder');
if ((await watcher.call('game:act', { action: { type: 'end' } })).ok) fail('un spectateur a joué');

await new Promise((r) => setTimeout(r, 200));
bob.socket.disconnect();
await new Promise((r) => setTimeout(r, 600));
bob.socket.connect();
await new Promise((r) => bob.socket.on('connect', r));
const back = await bob.call('room:join', { code, playerId: bob.session.playerId, token: bob.session.token, resumeOnly: true });
if (!back.ok) fail(`retour de Bob : ${back.error}`);
const intruder = await chloe.call('room:join', { code, playerId: bob.session.playerId, token: 'faux', resumeOnly: true });
if (intruder.ok) fail('une session volée a été acceptée');

await waitPhase(host, 'finished');
checkFinal(host.view.final, 5, 7);
if (!host.view.players.some((p) => p.wins >= 1)) fail('la victoire n’est pas comptée');

// ── Partie 2 : la revanche à 8 (spectatrice assise, bots ajoutés) : 9 personnages et 7 quartiers ──
if ((await bob.call('game:restart')).ok) fail('un invité a relancé la partie');
if (!(await host.call('game:restart')).ok) fail('revanche refusée');
await new Promise((r) => setTimeout(r, 100));
if (host.view.phase !== 'lobby') fail('la revanche ne ramène pas au salon');
watcher.player = true;
for (let i = 0; i < 2; i++) if (!(await host.call('room:addBot')).ok) fail('ajout de bot refusé');
if ((await host.call('room:addBot')).ok) fail('un 9e joueur a été accepté');
if (!(await host.call('game:start')).ok) fail('lancement à 8 refusé');
await new Promise((r) => setTimeout(r, 30));
if (host.view.game && host.view.game.cast.length !== 9) fail('à 8 joueurs, il faut 9 personnages');
await waitPhase(host, 'finished');
checkFinal(host.view.final, 8, 7);

// ── Partie 3 : 3 joueurs, deux personnages chacun, 8 quartiers ──
for (const c of [host, bob, chloe, watcher]) c.player = false;
const a = client('Éli');
await new Promise((r) => a.socket.on('connect', r));
const room3 = await a.call('room:create', { name: 'Éli', avatar: 'rose' });
const b = client('Fanny');
const d = client('Gaspard');
await join(b, room3.data.code);
await join(d, room3.data.code);
if (!(await a.call('game:start')).ok) fail('lancement à 3 refusé');
await new Promise((r) => setTimeout(r, 30));
if (a.view.game && a.view.game.cast.length !== 9) fail('à 3 joueurs, il faut 9 personnages');
await waitPhase(a, 'finished');
checkFinal(a.view.final, 3, 8);

// ── Partie 4 : un duel à 2, contre un bot, 8 personnages et 8 quartiers ──
const e = client('Hugo');
await new Promise((r) => e.socket.on('connect', r));
const room4 = await e.call('room:create', { name: 'Hugo', avatar: 'chouette', bots: 1, autostart: true });
if (!room4.ok) fail('duel refusé');
await waitPhase(e, 'finished');
checkFinal(e.view.final, 2, 8);

console.log(stats.games.map((g) => `✓ ${g}`).join('\n'));
console.log(`  ${stats.picks} choix, ${stats.builds} quartiers, ${stats.kills} assassinats, ${stats.robs} vols, ${stats.destroys} destructions tentées, ${stats.swaps} échanges, ${stats.refused} coups refusés, ${stats.states} états vérifiés sans fuite.`);
for (const c of [host, bob, chloe, watcher, a, b, d, e]) c.socket.close();
server?.kill();
process.exit(0);
