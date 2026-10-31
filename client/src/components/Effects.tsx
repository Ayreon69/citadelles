// Ce qui bouge à l'écran : l'or vole, les quartiers se posent, le verre se brise. Rien ici n'empêche de toucher la table.
import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'framer-motion';
import { Crown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { character, district, type GameEvent, type RoomView } from '../../../shared/protocol';
import { sfx } from '../lib/sound';
import { nameOf } from '../lib/text';
import { reducedMotion, vibrate } from '../lib/util';
import { serverNow } from '../store';
import { CardBack, CharacterCard, Coin, DistrictCard } from './Art';

interface Point {
  x: number;
  y: number;
}

type Fly =
  | { id: number; kind: 'coin' | 'card' | 'crown'; from: Point; to: Point; delay: number; label?: string }
  | { id: number; kind: 'build'; card: string; to: Point }
  | { id: number; kind: 'shard'; from: Point; to: Point; color: string; rotate: number };

interface Banner {
  id: number;
  rank: number;
  title: string;
  sub?: string;
  stamp?: 'kill' | 'rob';
  small?: boolean;
}

const COLORS: Record<string, string> = { noble: '#ffc933', religious: '#4d9dff', trade: '#4fcf6f', military: '#ff5a4d', unique: '#b06fff' };

let flyId = 0;

function center(el: Element | null): Point | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!r.width) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function seat(id: string | undefined): Point {
  return center(document.querySelector(`[data-seat="${id}"]`)) ?? bank();
}

function bank(): Point {
  return center(document.querySelector('.crier')) ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
}

export function Effects({ view }: { view: RoomView }) {
  const g = view.game;
  const seen = useRef(new Set<number>());
  const [flies, setFlies] = useState<Fly[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const bannerTimer = useRef(0);
  const lastCall = useRef(0);

  const add = (items: Fly[]) => {
    if (!reducedMotion() && items.length) setFlies((f) => [...f, ...items].slice(-40));
  };
  const drop = (id: number) => setFlies((f) => f.filter((x) => x.id !== id));

  const coins = (from: Point, to: Point, n: number, label?: string) => {
    add(Array.from({ length: Math.min(n, 6) }, (_, i) => ({ id: ++flyId, kind: 'coin' as const, from, to, delay: i * 0.07, label: i === 0 ? label : undefined })));
  };
  const cards = (to: Point, n: number) => {
    add(Array.from({ length: Math.min(n, 4) }, (_, i) => ({ id: ++flyId, kind: 'card' as const, from: bank(), to, delay: i * 0.1 })));
  };
  const announce = (b: Omit<Banner, 'id'>, ms = 1250) => {
    window.clearTimeout(bannerTimer.current);
    setBanner({ ...b, id: ++flyId });
    bannerTimer.current = window.setTimeout(() => setBanner(null), ms);
  };

  const play = (e: GameEvent) => {
    const mine = e.by === view.me;
    const n = e.amount ?? 0;
    switch (e.kind) {
      case 'round':
        sfx.shuffle();
        break;
      case 'reveal': {
        const c = character(e.rank!);
        if (mine) {
          sfx.turn();
          vibrate([40, 40, 80]);
          announce({ rank: e.rank!, title: 'À toi !', sub: `Tu es ${c.the}` }, 1100);
        } else {
          sfx.reveal();
          announce({ rank: e.rank!, title: c.name, sub: nameOf(view, e.by), small: true }, 1000);
        }
        break;
      }
      case 'gold':
      case 'income':
      case 'tax':
      case 'lab':
        if (n > 0) {
          sfx.coin();
          coins(bank(), seat(e.by), n, `+${n}`);
        }
        break;
      case 'draw':
      case 'architect':
      case 'smithy':
      case 'redraw':
        sfx.card();
        cards(seat(e.by), n);
        break;
      case 'build':
        sfx.build();
        if (mine) vibrate(25);
        add([{ id: ++flyId, kind: 'build', card: e.card!, to: (mine && center(document.querySelector('.my-city'))) || seat(e.by) }]);
        break;
      case 'kill':
        sfx.kill();
        vibrate(view.game?.mine.includes(e.rank!) ? [120, 60, 200] : 30);
        announce({ rank: e.rank!, title: character(e.rank!).name, sub: 'est visé par l’Assassin', stamp: 'kill' }, 1500);
        break;
      case 'rob':
        sfx.rob();
        announce({ rank: e.rank!, title: character(e.rank!).name, sub: 'est visé par le Voleur', stamp: 'rob' }, 1300);
        break;
      case 'robbed':
        if (n > 0) {
          sfx.robbed();
          coins(seat(e.target), seat(e.by), n, `+${n}`);
        }
        break;
      case 'swap': {
        sfx.card();
        const a = seat(e.by);
        const b = seat(e.target);
        add([
          { id: ++flyId, kind: 'card', from: a, to: b, delay: 0 },
          { id: ++flyId, kind: 'card', from: b, to: a, delay: 0.05 },
        ]);
        break;
      }
      case 'destroy': {
        sfx.glass();
        vibrate(e.target === view.me ? [80, 40, 80] : 20);
        const at = seat(e.target);
        const color = COLORS[district(e.card!).type];
        add(
          Array.from({ length: 12 }, (_, i) => {
            const angle = (i / 12) * Math.PI * 2 + Math.random();
            const dist = 50 + Math.random() * 70;
            return { id: ++flyId, kind: 'shard' as const, from: at, to: { x: at.x + Math.cos(angle) * dist, y: at.y + Math.sin(angle) * dist + 30 }, color, rotate: Math.random() * 540 - 270 };
          }),
        );
        break;
      }
      case 'crown':
      case 'heir':
        sfx.crown();
        add([{ id: ++flyId, kind: 'crown', from: bank(), to: seat(e.by), delay: 0.2 }]);
        break;
      case 'complete':
        sfx.complete();
        if (!reducedMotion()) void confetti({ particleCount: 90, spread: 80, origin: { y: 0.35 }, colors: ['#ffc933', '#2272e0', '#1fa65a', '#d92e2e', '#8a3fe0'], scalar: 0.9, disableForReducedMotion: true });
        break;
    }
  };

  useEffect(() => {
    if (!g) return;
    const now = serverNow();
    for (const e of g.events) {
      if (seen.current.has(e.id)) continue;
      seen.current.add(e.id);
      // Après une reprise, on ne rejoue pas ce qui s'est passé pendant l'absence.
      if (now - e.at < 1500) play(e);
    }
    if (g.stage === 'call' && g.calling !== lastCall.current && g.calling > 0) sfx.call();
    lastCall.current = g.calling;
  });

  useEffect(() => () => window.clearTimeout(bannerTimer.current), []);

  return (
    <div className="fx" aria-hidden>
      {flies.map((f) => {
        if (f.kind === 'build') {
          const cx = window.innerWidth / 2;
          const cy = window.innerHeight * 0.38;
          return (
            <motion.div
              key={f.id}
              className="fly fly-build"
              initial={{ x: cx, y: cy + 40, scale: 0.5, opacity: 0 }}
              animate={{ x: [cx, cx, f.to.x], y: [cy + 40, cy, f.to.y], scale: [0.5, 1, 0.22], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 1.25, times: [0, 0.4, 1], ease: 'easeInOut' }}
              onAnimationComplete={() => drop(f.id)}
            >
              <DistrictCard id={f.card} size="lg" />
            </motion.div>
          );
        }
        if (f.kind === 'shard') {
          return (
            <motion.i
              key={f.id}
              className="fly fly-shard"
              style={{ background: f.color }}
              initial={{ x: f.from.x, y: f.from.y, rotate: 0, opacity: 1 }}
              animate={{ x: f.to.x, y: f.to.y, rotate: f.rotate, opacity: 0 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
              onAnimationComplete={() => drop(f.id)}
            />
          );
        }
        return (
          <motion.div
            key={f.id}
            className={`fly fly-${f.kind}`}
            initial={{ x: f.from.x, y: f.from.y, scale: 0.7, opacity: 0 }}
            animate={{ x: f.to.x, y: f.to.y, scale: 1, opacity: [0, 1, 1, 0] }}
            transition={{ duration: 0.7, delay: f.delay, ease: 'easeInOut' }}
            onAnimationComplete={() => drop(f.id)}
          >
            {f.kind === 'coin' && <Coin />}
            {f.kind === 'card' && <CardBack />}
            {f.kind === 'crown' && <Crown size={30} className="crown-icon" />}
            {f.kind === 'coin' && f.label && <b className="fly-label">{f.label}</b>}
          </motion.div>
        );
      })}
      <AnimatePresence>
        {banner && (
          <motion.div key={banner.id} className={banner.small ? 'announce is-small' : 'announce'} initial={{ opacity: 0, scale: 0.86 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.05 }} transition={{ duration: 0.2 }}>
            <div className="announce-card">
              <CharacterCard rank={banner.rank} size="lg" />
              {banner.stamp && <span className={`stamp stamp-${banner.stamp}`}>{banner.stamp === 'kill' ? 'Assassiné' : 'Volé'}</span>}
            </div>
            <strong>{banner.title}</strong>
            {banner.sub && <span>{banner.sub}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
