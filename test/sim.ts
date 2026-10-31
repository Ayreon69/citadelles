// Simulation : des bots entre eux, pour juger leur niveau et la durée des parties (npx tsx test/sim.ts 200).
import { botAct, NAIVE, randomSkill, type Skill } from '../server/bots';
import { Game } from '../server/game';

const N = Number(process.argv[2] ?? 200);

function play(order: string[], skill: (id: string) => Skill): Game {
  const g = new Game(order, { crown: order[Math.floor(Math.random() * order.length)], eventMs: 1 });
  const skills = new Map(order.map((id) => [id, skill(id)]));
  for (let guard = 0; guard < 40000; guard++) {
    if (g.stage === 'over') return g;
    if (g.stage === 'call') g.advanceCall();
    else if (g.stage === 'round') g.nextRound();
    else {
      const id = g.stage === 'pick' ? g.pick!.queue[0] : g.turn!.player;
      const a = botAct(g, id, skills.get(id)!);
      const err = g.act(id, a);
      if (err) throw new Error(`${err} ${JSON.stringify(a)}`);
    }
  }
  throw new Error('partie sans fin');
}

for (const n of [2, 3, 4, 5, 6, 7, 8]) {
  const order = Array.from({ length: n }, (_, i) => `p${i}`);
  let rounds = 0;
  let best = 0;
  let last = 0;
  let sharpWins = 0;
  for (let k = 0; k < N; k++) {
    const g = play(order, () => randomSkill());
    rounds += g.round;
    const ranking = g.ranking();
    best += ranking[0].score.total;
    last += ranking[ranking.length - 1].score.total;
    // p0 joue au mieux, les autres au hasard parmi ce qui est permis.
    const duel = play(order, (id) => (id === 'p0' ? { noise: 0.4, attentive: true } : NAIVE));
    if (duel.winners().includes('p0')) sharpWins++;
  }
  console.log(
    `${n} joueurs : ${(rounds / N).toFixed(1)} tours/partie, vainqueur ${(best / N).toFixed(0)} points, dernier ${(last / N).toFixed(0)} ; le bon bot bat la table naïve ${Math.round((sharpWins / N) * 100)} % du temps (hasard : ${Math.round(100 / n)} %)`,
  );
}
