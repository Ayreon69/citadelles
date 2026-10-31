// Fin de partie : le vainqueur, puis chaque cité dévoilée avec le détail de ses points, et la revanche.
import confetti from 'canvas-confetti';
import { motion } from 'framer-motion';
import { Crown, LogOut, RotateCcw, Trophy } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { character, type RoomView } from '../../../shared/protocol';
import { CharacterCard, CityWindow, DistrictCard } from '../components/Art';
import { Avatar, Backdrop, Button, Logo } from '../components/Ui';
import { sfx } from '../lib/sound';
import { listing, nameOf } from '../lib/text';
import { cls, reducedMotion } from '../lib/util';
import { leaveRoom, send } from '../net';

export function Final({ view }: { view: RoomView }) {
  const final = view.final!;
  const isHost = view.hostId === view.me;
  const iWon = final.winners.includes(view.me);
  const once = useRef(false);

  useEffect(() => {
    if (once.current) return;
    once.current = true;
    sfx.fanfare(iWon);
    if (reducedMotion()) return;
    const t = window.setTimeout(() => {
      void confetti({ particleCount: iWon ? 180 : 90, spread: 100, origin: { y: 0.3 }, colors: ['#ffc933', '#2272e0', '#1fa65a', '#d92e2e', '#8a3fe0', '#fff3d6'], scalar: 0.95, disableForReducedMotion: true });
    }, 400);
    return () => window.clearTimeout(t);
  }, [iWon]);

  const winners = final.players.filter((p) => p.winner);
  const champion = winners[0];
  const title =
    winners.length > 1
      ? `${listing(winners.map((p) => (p.id === view.me ? 'toi' : p.name)))} : ex æquo !`
      : champion.id === view.me
        ? 'Tu gagnes !'
        : `${nameOf(view, champion.id)} gagne !`;

  return (
    <Backdrop quiet>
      <div className="final">
        <header className="final-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="final-hero" initial={{ y: 18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.5 }}>
          <span className="eyebrow">
            Partie terminée en {final.rounds} tour{final.rounds > 1 ? 's' : ''}
          </span>
          <h1>{title}</h1>
          <p className="final-reason">
            {champion.score.total} points{champion.tieRank > 0 && final.players[1]?.score.total === champion.score.total && winners.length === 1 ? `, départagés par ${character(champion.tieRank).the}` : ''}
          </p>
        </motion.section>

        <div className="final-skyline" aria-label={`La cité de ${champion.name}`}>
          {champion.city.map((id, i) => (
            <motion.div key={`${id}${i}`} initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 + i * 0.08, type: 'spring', stiffness: 170, damping: 15 }}>
              <DistrictCard id={id} size="sm" />
            </motion.div>
          ))}
        </div>

        <section className="panel final-table">
          <h3>Toutes les cités</h3>
          <ol className="final-list">
            {final.players.map((p, i) => (
              <li key={p.id} className={cls('final-row', p.winner && 'is-winner', p.id === view.me && 'is-me')}>
                <div className="final-who">
                  <span className="final-place">{i + 1}</span>
                  <Avatar avatar={p.avatar} className="player-avatar" />
                  <b className="final-name">{p.id === view.me ? 'Toi' : p.name}</b>
                  {p.crown && <Crown size={15} className="crown-icon" aria-label="Couronne" />}
                  {p.wins > 0 && (
                    <span className="final-wins" title="Parties gagnées à cette table">
                      <Trophy size={13} aria-hidden /> {p.wins}
                    </span>
                  )}
                  <strong className="final-total">{p.score.total}</strong>
                </div>
                <div className="final-city">
                  {p.city.map((id, k) => (
                    <CityWindow key={`${id}${k}`} id={id} big />
                  ))}
                </div>
                <div className="final-score">
                  <span>
                    Quartiers <b>{p.score.base}</b>
                  </span>
                  {p.score.types > 0 && (
                    <span>
                      5 couleurs <b>+{p.score.types}</b>
                    </span>
                  )}
                  {p.score.complete > 0 && (
                    <span>
                      Cité complète <b>+{p.score.complete}</b>
                    </span>
                  )}
                  {p.score.wonders > 0 && (
                    <span>
                      Merveilles <b>+{p.score.wonders}</b>
                    </span>
                  )}
                </div>
                <div className="final-ranks">
                  <span className="muted small">Dernier tour :</span>
                  {p.ranks.map((r) => (
                    <CharacterCard key={r} rank={r} size="xs" />
                  ))}
                  <span className="muted small">
                    {p.gold} or · {p.hand.length} carte{p.hand.length > 1 ? 's' : ''}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<RotateCcw size={20} />} onClick={() => void send('game:restart')}>
              Rejouer
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente de la revanche…
            </div>
          )}
        </div>
      </div>
    </Backdrop>
  );
}
