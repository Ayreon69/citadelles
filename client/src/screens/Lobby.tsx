// Salon : partage de la table, joueurs, réglages de l'hôte et lancement.
import { motion } from 'framer-motion';
import { BookOpen, Bot, Check, Copy, Crown, LogOut, Play, QrCode, Share2, Trophy, UserX } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, THINK_OPTIONS, castSize, cityGoal, type PlayerView, type RoomView, type ThinkTime } from '../../../shared/protocol';
import { Avatar, Backdrop, Button, Logo, Modal, Pill, Segmented } from '../components/Ui';
import { cls, shareUrl } from '../lib/util';
import { leaveRoom, send } from '../net';
import { useStore } from '../store';

function PlayerRow({ view, p, i, isHost }: { view: RoomView; p: PlayerView; i: number; isHost: boolean }) {
  return (
    <motion.li className={cls('player-row', p.id === view.me && 'is-me')} initial={{ x: -10, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: i * 0.03 }}>
      <Avatar avatar={p.avatar} className="player-avatar" />
      <span className="player-name">
        {p.name}
        {p.id === view.me && <span className="muted"> (toi)</span>}
      </span>
      {p.wins > 0 && (
        <Pill tone="gold" className="wins-pill">
          <Trophy size={12} aria-hidden /> {p.wins}
        </Pill>
      )}
      {p.isHost && (
        <Pill tone="violet">
          <Crown size={12} aria-hidden /> Hôte
        </Pill>
      )}
      {p.isBot && <Pill tone="blue">Bot</Pill>}
      {!p.connected && <Pill>Hors ligne</Pill>}
      {isHost && p.id !== view.me && (
        <button type="button" className="icon-btn" aria-label={`Retirer ${p.name}`} onClick={() => void send('room:kick', { playerId: p.id })}>
          <UserX size={18} />
        </button>
      )}
    </motion.li>
  );
}

function sizeNote(n: number): string {
  if (n < MIN_PLAYERS) return 'De 2 à 8 joueurs. Ajoute un bot si tu veux jouer tout de suite.';
  const goal = cityGoal(n);
  if (n === 2) return `À 2 : deux personnages chacun, et on en écarte en secret en les choisissant. Cité complète à ${goal} quartiers.`;
  if (n === 3) return `À 3 : deux personnages chacun, plus le Percepteur. Cité complète à ${goal} quartiers.`;
  if (n === 8) return `À 8 : le Percepteur s'ajoute d'office. Cité complète à ${goal} quartiers.`;
  return `Cité complète à ${goal} quartiers.`;
}

export function Lobby({ view }: { view: RoomView }) {
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const isHost = view.hostId === view.me;
  const seated = view.players.filter((p) => p.status !== 'spectator');
  const spectators = view.players.filter((p) => p.status === 'spectator');
  const [copied, setCopied] = useState(false);
  const [qr, setQr] = useState(false);
  const url = shareUrl(view.code);
  const host = view.players.find((p) => p.id === view.hostId);
  const s = view.settings;
  const n = seated.length;
  const ninthForced = n === 2 || n === 3 || n === 8;
  const blocked = n < MIN_PLAYERS ? `Il faut au moins ${MIN_PLAYERS} joueurs` : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      useStore.getState().showToast(`Lien : ${url}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Citadelles', text: `Rejoins ma table de Citadelles (code ${view.code}) !`, url });
      } catch {
        /* partage annulé */
      }
    } else void copy();
  };

  return (
    <Backdrop quiet>
      <div className="lobby">
        <header className="lobby-top">
          <Logo size="sm" />
          <Button variant="ghost" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter
          </Button>
        </header>

        <motion.section className="code-panel" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
          <span className="eyebrow">Code de la table</span>
          <div className="big-code" aria-label={`Code ${view.code.split('').join(' ')}`}>
            {view.code.split('').map((c, i) => (
              <motion.span key={i} className={`is-c${i}`} initial={{ y: -14, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.06, type: 'spring', stiffness: 260, damping: 16 }}>
                {c}
              </motion.span>
            ))}
          </div>
          <div className="share-row">
            <Button variant="primary" icon={<Share2 size={18} />} onClick={share}>
              Inviter des amis
            </Button>
            <Button icon={copied ? <Check size={18} /> : <Copy size={18} />} onClick={copy}>
              {copied ? 'Lien copié !' : 'Copier le lien'}
            </Button>
            <Button icon={<QrCode size={18} />} onClick={() => setQr(true)} aria-label="Afficher le QR code">
              QR
            </Button>
          </div>
        </motion.section>

        <div className="lobby-grid">
          <section className="panel">
            <div className="panel-head">
              <h3>
                Joueurs <span className="muted">{n}/{MAX_PLAYERS}</span>
              </h3>
              {isHost && (
                <Button variant="soft" icon={<Bot size={18} />} disabled={n >= MAX_PLAYERS} onClick={() => void send('room:addBot')}>
                  Ajouter un bot
                </Button>
              )}
            </div>
            <ul className="player-list">
              {seated.map((p, i) => (
                <PlayerRow key={p.id} view={view} p={p} i={i} isHost={isHost} />
              ))}
              {Array.from({ length: Math.max(0, MIN_PLAYERS - n) }, (_, i) => (
                <li key={`empty${i}`} className="player-row is-empty">
                  <span className="player-ghost">?</span>
                  <span className="player-name muted">En attente d'un joueur…</span>
                </li>
              ))}
            </ul>
            {spectators.length > 0 && <p className="muted small">Spectateurs : {spectators.map((p) => p.name).join(', ')}</p>}
            <p className="muted small lobby-note">{sizeNote(n)}</p>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3>Réglages</h3>
              {!isHost && <span className="muted small">choisis par {host?.name ?? "l'hôte"}</span>}
            </div>
            <span className="field-label">Temps par tour</span>
            <Segmented<ThinkTime>
              label="Temps par tour"
              value={s.think}
              disabled={!isHost}
              onChange={(think) => void send('room:settings', { think })}
              options={THINK_OPTIONS.map((t) => ({ value: t, label: t === 0 ? 'Sans limite' : `${t / 60} min` }))}
            />
            <p className="muted small lobby-note">Le temps écoulé, le pilote automatique joue à ta place.</p>
            <span className="field-label">Le Percepteur, 9e personnage</span>
            <Segmented<boolean>
              label="Le Percepteur"
              value={n >= MIN_PLAYERS ? castSize(n, s.ninth) === 9 : s.ninth}
              disabled={!isHost || ninthForced}
              onChange={(ninth) => void send('room:settings', { ninth })}
              options={[
                { value: false, label: 'Sans' },
                { value: true, label: 'Avec', sub: 'taxe de 1 or' },
              ]}
            />
            <p className="muted small lobby-note">{ninthForced ? (n === 2 ? 'Impossible à 2 joueurs.' : `Obligatoire à ${n} joueurs.`) : 'Chaque quartier bâti lui verse 1 or. Une partie un peu plus longue.'}</p>
          </section>
        </div>

        <div className="lobby-cta">
          {isHost ? (
            <Button variant="primary" className="btn-lg btn-wide" icon={<Play size={20} />} disabled={!!blocked} onClick={() => void send('game:start')}>
              {blocked ?? `Lancer la partie (${n} joueurs)`}
            </Button>
          ) : (
            <div className="waiting" role="status">
              <span className="spinner" /> En attente que {host?.name ?? "l'hôte"} lance la partie…
            </div>
          )}
          <Button variant="ghost" icon={<BookOpen size={18} />} onClick={() => setRulesOpen(true)}>
            Nouveau ? Les règles en 2 minutes
          </Button>
        </div>

        <Modal open={qr} onClose={() => setQr(false)} title={`Table ${view.code}`}>
          <div className="qr-box">
            <QRCodeSVG value={url} size={220} bgColor="#fff8ea" fgColor="#17121c" level="M" includeMargin />
            <p className="muted small">Scanne pour rejoindre la table directement.</p>
            <code className="url-code">{url}</code>
          </div>
        </Modal>
      </div>
    </Backdrop>
  );
}
