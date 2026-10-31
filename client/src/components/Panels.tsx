// Les choix du joueur : son personnage, ses ressources, son pouvoir, et les fenêtres qui les accompagnent.
import { Coins, Hammer, Hourglass, Layers, Sparkles, Swords, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import {
  ASSASSIN,
  CONDOTTIERE,
  EVEQUE,
  MAGICIEN,
  VOLEUR,
  TYPE_NAMES,
  buildCost,
  character,
  destroyCost,
  district,
  incomeOf,
  type Action,
  type RoomView,
} from '../../../shared/protocol';
import { sfx } from '../lib/sound';
import { plural } from '../lib/text';
import { cls } from '../lib/util';
import { send } from '../net';
import { CardBack, CharacterCard, Coin, DistrictCard, TypeDot } from './Art';
import { Avatar, Button, Modal } from './Ui';

export function act(view: RoomView, action: Action): Promise<boolean> {
  return send('game:act', { action, turn: view.game?.turn?.no });
}

// ───────────────────────────── Le choix du personnage ─────────────────────────────

export function PickPanel({ view }: { view: RoomView }) {
  const g = view.game!;
  const pick = g.pick!;
  const options = pick.options ?? [];
  const [keep, setKeep] = useState<number | null>(null);
  const [discard, setDiscard] = useState<number | null>(null);
  const two = pick.mustDiscard;
  // On change de choix : tout est remis à zéro si les cartes proposées ne sont plus les mêmes.
  const key = options.join();
  const [lastKey, setLastKey] = useState(key);
  if (key !== lastKey) {
    setLastKey(key);
    setKeep(null);
    setDiscard(null);
  }
  const ready = keep !== null && (!two || discard !== null);
  const choose = (r: number) => {
    sfx.tap();
    if (two && keep !== null && keep !== r) setDiscard(discard === r ? null : r);
    else if (two && keep === r) {
      setKeep(discard);
      setDiscard(null);
    } else setKeep(r);
  };
  return (
    <section className="pick-panel" aria-label="Choix du personnage">
      <h2 className="panel-title">
        {two && keep !== null ? (
          <>
            Écarte <b>un autre</b> personnage, en secret
          </>
        ) : (
          <>
            Choisis <b>ton personnage</b>, en secret
          </>
        )}
      </h2>
      <div className={cls('pick-grid', options.length > 6 && 'is-many')}>
        {options.map((r) => (
          <div key={r} className={cls('pick-cell', r === discard && 'is-thrown')}>
            <CharacterCard rank={r} size="md" selected={r === keep} dim={r === discard} onClick={() => choose(r)} />
            {r === discard && (
              <span className="pick-x">
                <X size={22} />
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="pick-detail">
        {keep !== null ? (
          <>
            <b>{character(keep).name}.</b> {character(keep).power}
          </>
        ) : (
          <span className="muted">Touche un personnage pour lire son pouvoir.</span>
        )}
      </div>
      <Button
        variant="primary"
        className="btn-lg btn-wide"
        disabled={!ready}
        onClick={() => {
          if (keep !== null) void act(view, { type: 'pick', rank: keep, discard: two ? (discard ?? undefined) : undefined });
        }}
      >
        {keep === null ? 'Choisis un personnage' : two && discard === null ? 'Choisis celui à écarter' : `Jouer ${character(keep).the}`}
      </Button>
    </section>
  );
}

// ───────────────────────────── Le tour ─────────────────────────────

/** Ce qui empêche de bâtir cette carte, ou null. */
export function buildBlock(view: RoomView, card: string): string | null {
  const g = view.game!;
  const t = g.turn;
  if (!t || t.player !== view.me) return "Tu bâtiras à ton tour.";
  if (!t.gathered) return "Prends d'abord tes ressources.";
  if (t.built >= t.limit) return t.limit === 1 ? 'Tu as déjà bâti à ce tour.' : `Tu as déjà bâti ${t.limit} quartiers.`;
  const me = view.players.find((p) => p.id === view.me)!;
  if (me.city.includes(card) && !me.city.includes('carriere')) return 'Déjà dans ta cité.';
  const cost = buildCost(card, me.city);
  const spare = card === 'repaire' ? (g.hand?.length ?? 1) - 1 : 0;
  if (cost > (me.gold ?? 0) + spare) return `Il te manque ${cost - (me.gold ?? 0) - spare} or.`;
  return null;
}

export function TurnPanel({ view, selected, onBuilt }: { view: RoomView; selected: string | null; onBuilt: () => void }) {
  const g = view.game!;
  const t = g.turn!;
  const me = view.players.find((p) => p.id === view.me)!;
  const [modal, setModal] = useState<null | 'target' | 'magician' | 'destroy' | 'lab' | 'repaire'>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const gold = me.gold ?? 0;
  const hand = g.hand ?? [];
  const city = me.city;
  const close = () => setModal(null);

  const needsTarget = !t.powerDone && (t.rank === ASSASSIN || t.rank === VOLEUR);
  const income = !t.incomeDone ? incomeOf(t.rank, city) : 0;

  if (t.drawn) {
    return (
      <section className="turn-panel" aria-label="Choisir une carte">
        <h2 className="panel-title">
          Garde <b>une carte</b>, l'autre repart sous la pioche
        </h2>
        <div className="draw-choice">
          {t.drawn.map((c, i) => (
            <div key={`${c}${i}`} className="draw-option">
              <DistrictCard id={c} city={city} size="lg" glow onClick={() => void act(view, { type: 'keep', card: c })} />
              {district(c).text && <p className="small">{district(c).text}</p>}
            </div>
          ))}
        </div>
      </section>
    );
  }

  const powers = (
    <>
      {needsTarget && (
        <Button variant="primary" className="power-go" icon={<Swords size={18} />} onClick={() => setModal('target')}>
          {t.rank === ASSASSIN ? 'Désigner ta victime' : 'Désigner ta cible'}
        </Button>
      )}
      {t.rank === MAGICIEN && !t.powerDone && (
        <Button variant="soft" icon={<Sparkles size={18} />} onClick={() => setModal('magician')}>
          Pouvoir du Magicien
        </Button>
      )}
      {t.rank === CONDOTTIERE && !t.powerDone && (
        <Button variant="soft" icon={<Hammer size={18} />} onClick={() => setModal('destroy')}>
          Détruire un quartier
        </Button>
      )}
      {income > 0 && (
        <Button variant="soft" icon={<Coins size={18} />} onClick={() => void act(view, { type: 'income' })}>
          Encaisser {income} or
        </Button>
      )}
      {city.includes('forge') && !t.smithyDone && (
        <Button variant="soft" icon={<Layers size={18} />} disabled={gold < 2 || g.deckEmpty} onClick={() => void act(view, { type: 'smithy' })}>
          Forge : 2 or, 3 cartes
        </Button>
      )}
      {city.includes('laboratoire') && !t.labDone && (
        <Button variant="soft" icon={<Trash2 size={18} />} disabled={!hand.length} onClick={() => setModal('lab')}>
          Laboratoire : 1 carte, 2 or
        </Button>
      )}
    </>
  );

  return (
    <section className="turn-panel" aria-label="Ton tour">
      {!t.gathered ? (
        <>
          {needsTarget || t.rank === MAGICIEN || (t.rank === CONDOTTIERE && !t.powerDone) ? <div className="power-row">{powers}</div> : null}
          <h2 className="panel-title">
            Prends <b>tes ressources</b>
          </h2>
          <div className="gather">
            <button type="button" className="gather-btn is-gold" onClick={() => void act(view, { type: 'gather', kind: 'gold' })}>
              <span className="gather-icons">
                <Coin />
                <Coin />
              </span>
              <b>2 or</b>
            </button>
            <button type="button" className="gather-btn" disabled={g.deckEmpty} onClick={() => void act(view, { type: 'gather', kind: 'cards' })}>
              <span className="gather-icons">
                <CardBack />
                <CardBack />
              </span>
              <b>{city.includes('bibliotheque') ? 'Piocher 2 cartes' : 'Piocher, garder 1'}</b>
            </button>
          </div>
          {!(needsTarget || t.rank === MAGICIEN || t.rank === CONDOTTIERE) && <div className="power-row">{powers}</div>}
        </>
      ) : selected && !buildBlock(view, selected) ? (
        <div className="build-row">
          <Button
            variant="primary"
            className="btn-lg btn-wide"
            icon={<Hammer size={20} />}
            onClick={() => {
              if (selected === 'repaire' && hand.length > 1) setModal('repaire');
              else void act(view, { type: 'build', card: selected }).then((ok) => ok && onBuilt());
            }}
          >
            Bâtir pour {buildCost(selected, city)} or
          </Button>
        </div>
      ) : (
        <>
          <div className="power-row">{powers}</div>
          <Button
            variant={needsTarget ? 'default' : 'primary'}
            className="btn-wide end-turn"
            onClick={() => {
              if (needsTarget && !confirmEnd) {
                setConfirmEnd(true);
                return;
              }
              setConfirmEnd(false);
              void act(view, { type: 'end' });
            }}
          >
            {needsTarget && confirmEnd ? 'Terminer sans utiliser ton pouvoir' : 'Terminer mon tour'}
          </Button>
        </>
      )}
      {modal === 'target' && <TargetModal view={view} onClose={close} />}
      {modal === 'magician' && <MagicianModal view={view} onClose={close} />}
      {modal === 'destroy' && <DestroyModal view={view} onClose={close} />}
      {modal === 'lab' && <LabModal view={view} onClose={close} />}
      {modal === 'repaire' && <RepaireModal view={view} onClose={close} onBuilt={onBuilt} />}
    </section>
  );
}

/** L'Assassin ou le Voleur désigne un personnage, jamais un joueur. */
function TargetModal({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const g = view.game!;
  const t = g.turn!;
  const kill = t.rank === ASSASSIN;
  const [chosen, setChosen] = useState<number | null>(null);
  const options = g.cast.filter((r) => r !== t.rank && !g.faceUp.includes(r) && !g.mine.includes(r) && (kill || (r !== ASSASSIN && r !== g.killed)));
  return (
    <Modal
      open
      onClose={onClose}
      title={kill ? 'Qui assassines-tu ?' : 'Qui voles-tu ?'}
      footer={
        <Button
          variant="primary"
          className="btn-lg btn-wide"
          disabled={chosen === null}
          onClick={() => {
            if (chosen !== null) void act(view, { type: kill ? 'kill' : 'rob', rank: chosen });
            onClose();
          }}
        >
          {chosen === null ? 'Choisis un personnage' : `${kill ? 'Assassiner' : 'Voler'} ${character(chosen).the}`}
        </Button>
      }
    >
      <p className="muted small modal-lead">{kill ? 'Tu vises un personnage, sans savoir qui le joue. Il est peut-être écarté.' : 'Quand ce personnage se révèlera, tu prendras tout son or. Tu ne peux viser ni l’Assassin ni sa victime.'}</p>
      <div className="target-grid">
        {options.map((r) => (
          <CharacterCard key={r} rank={r} size="md" selected={r === chosen} onClick={() => setChosen(r)} />
        ))}
      </div>
      {chosen !== null && <p className="pick-detail">{character(chosen).power}</p>}
    </Modal>
  );
}

function MagicianModal({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const g = view.game!;
  const hand = g.hand ?? [];
  const others = view.players.filter((p) => g.order.includes(p.id) && p.id !== view.me);
  const [picked, setPicked] = useState<number[]>([]);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  return (
    <Modal open onClose={onClose} title="Le pouvoir du Magicien">
      <h3 className="modal-sub">Échange toute ta main ({plural(hand.length, 'carte')}) avec :</h3>
      <ul className="swap-list">
        {others.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className="swap-row"
              onClick={() => {
                void act(view, { type: 'swap', target: p.id });
                onClose();
              }}
            >
              <Avatar avatar={p.avatar} className="player-avatar" />
              <span className="player-name">{p.name}</span>
              <span className="stat">
                <CardBack className="stat-card" /> {p.hand}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <h3 className="modal-sub">Ou défausse pour piocher autant :</h3>
      {hand.length ? (
        <div className="choose-cards">
          {hand.map((c, i) => (
            <DistrictCard key={`${c}${i}`} id={c} size="sm" selected={picked.includes(i)} onClick={() => toggle(i)} />
          ))}
        </div>
      ) : (
        <p className="muted small">Ta main est vide.</p>
      )}
      <Button
        className="btn-wide"
        variant="primary"
        disabled={!picked.length || g.deckEmpty}
        onClick={() => {
          void act(view, { type: 'redraw', cards: picked.map((i) => hand[i]) });
          onClose();
        }}
      >
        {picked.length ? `Changer ${plural(picked.length, 'carte')}` : 'Choisis des cartes'}
      </Button>
    </Modal>
  );
}

/** Le Condottiere voit tout ce qu'il peut détruire, et ce que ça lui coûte. */
function DestroyModal({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const g = view.game!;
  const me = view.players.find((p) => p.id === view.me)!;
  const gold = me.gold ?? 0;
  const list = view.players.filter((p) => g.order.includes(p.id) && p.city.length);
  const bishopAlive = g.killed !== EVEQUE;
  const bishopId = bishopAlive ? view.players.find((p) => p.revealed.includes(EVEQUE))?.id : undefined;
  const [choice, setChoice] = useState<{ target: string; card: string } | null>(null);
  return (
    <Modal
      open
      onClose={onClose}
      title="Détruire un quartier"
      footer={
        <Button
          variant="danger"
          className="btn-lg btn-wide"
          disabled={!choice}
          onClick={() => {
            if (choice) void act(view, { type: 'destroy', ...choice });
            onClose();
          }}
        >
          {choice ? `Détruire pour ${destroyCost(choice.card)} or` : 'Choisis un quartier'}
        </Button>
      }
    >
      <p className="muted small modal-lead">Coût du quartier moins 1. Tu as {gold} or.</p>
      {list.length === 0 && <p className="muted">Aucune cité n'a encore de quartier.</p>}
      {list.map((p) => {
        const complete = p.city.length >= g.goal;
        const safe = p.id === bishopId;
        return (
          <div key={p.id} className="destroy-block">
            <h3 className="modal-sub">
              {p.id === view.me ? 'Ta cité' : p.name}
              {complete && <small> · cité complète, intouchable</small>}
              {safe && <small> · protégée par l’Évêque</small>}
            </h3>
            <div className="choose-cards">
              {p.city.map((c, i) => {
                const cost = destroyCost(c);
                const can = !complete && !safe && c !== 'donjon' && cost <= gold;
                const on = choice?.target === p.id && choice.card === c;
                return <DistrictCard key={`${c}${i}`} id={c} size="sm" dim={!can} selected={on} onClick={can ? () => setChoice({ target: p.id, card: c }) : undefined} />;
              })}
            </div>
          </div>
        );
      })}
    </Modal>
  );
}

function LabModal({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const hand = view.game!.hand ?? [];
  return (
    <Modal open onClose={onClose} title="Le Laboratoire">
      <p className="muted small modal-lead">Touche la carte à défausser : elle te rapporte 2 or.</p>
      <div className="choose-cards">
        {hand.map((c, i) => (
          <DistrictCard
            key={`${c}${i}`}
            id={c}
            size="sm"
            onClick={() => {
              void act(view, { type: 'lab', card: c });
              onClose();
            }}
          />
        ))}
      </div>
    </Modal>
  );
}

/** Le Repaire des voleurs peut se payer avec des cartes. */
function RepaireModal({ view, onClose, onBuilt }: { view: RoomView; onClose: () => void; onBuilt: () => void }) {
  const g = view.game!;
  const me = view.players.find((p) => p.id === view.me)!;
  const gold = me.gold ?? 0;
  const cost = buildCost('repaire', me.city);
  const rest = [...(g.hand ?? [])];
  rest.splice(rest.indexOf('repaire'), 1);
  const [picked, setPicked] = useState<number[]>([]);
  const left = Math.max(0, cost - picked.length);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : p.length < cost ? [...p, i] : p));
  return (
    <Modal
      open
      onClose={onClose}
      title="Payer le Repaire"
      footer={
        <Button
          variant="primary"
          className="btn-lg btn-wide"
          disabled={left > gold}
          onClick={() => {
            void act(view, { type: 'build', card: 'repaire', pay: picked.map((i) => rest[i]) }).then((ok) => ok && onBuilt());
            onClose();
          }}
        >
          {left > gold ? `Il manque ${left - gold} or ou cartes` : `Payer ${left} or et ${plural(picked.length, 'carte')}`}
        </Button>
      }
    >
      <p className="muted small modal-lead">Il coûte {cost} or. Chaque carte donnée vaut 1 or. Tu as {gold} or.</p>
      <div className="choose-cards">
        {rest.map((c, i) => (
          <DistrictCard key={`${c}${i}`} id={c} size="sm" selected={picked.includes(i)} onClick={() => toggle(i)} />
        ))}
      </div>
    </Modal>
  );
}

// ───────────────────────────── Ce qu'on peut regarder ─────────────────────────────

/** La cité d'un joueur, carte par carte. */
export function PlayerSheet({ view, id, onClose }: { view: RoomView; id: string; onClose: () => void }) {
  const p = view.players.find((x) => x.id === id);
  if (!p) return null;
  return (
    <Modal open onClose={onClose} title={p.id === view.me ? 'Ta cité' : `La cité de ${p.name}`}>
      <div className="sheet-stats">
        <span className="stat">
          <Coin /> {p.gold} or
        </span>
        <span className="stat">
          <CardBack className="stat-card" /> {plural(p.hand ?? 0, 'carte')}
        </span>
        {p.revealed.map((r) => (
          <span key={r} className="stat">
            <CharacterCard rank={r} size="xs" /> {character(r).name}
          </span>
        ))}
      </div>
      {p.city.length ? (
        <ul className="sheet-city">
          {p.city.map((c, i) => (
            <li key={`${c}${i}`}>
              <DistrictCard id={c} size="sm" />
              <div>
                <b>{district(c).name}</b>
                <span className="muted small">
                  <TypeDot type={district(c).type} /> {TYPE_NAMES[district(c).type]}, {district(c).cost} or
                </span>
                {district(c).text && <p className="small">{district(c).text}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Pas encore de quartier.</p>
      )}
    </Modal>
  );
}

/** Ta main, carte par carte, pendant que tu choisis ton personnage. */
export function HandSheet({ view, onClose }: { view: RoomView; onClose: () => void }) {
  const hand = view.game!.hand ?? [];
  const city = view.players.find((p) => p.id === view.me)?.city ?? [];
  return (
    <Modal open onClose={onClose} title="Ta main">
      {hand.length ? (
        <ul className="sheet-city">
          {hand.map((c, i) => (
            <li key={`${c}${i}`}>
              <DistrictCard id={c} city={city} size="sm" />
              <div>
                <b>{district(c).name}</b>
                <span className="muted small">
                  <TypeDot type={district(c).type} /> {TYPE_NAMES[district(c).type]}
                </span>
                {district(c).text && <p className="small">{district(c).text}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">Ta main est vide.</p>
      )}
    </Modal>
  );
}

/** Le pouvoir d'un personnage, depuis la rangée du haut. */
export function CharacterSheet({ view, rank, onClose }: { view: RoomView; rank: number; onClose: () => void }) {
  const g = view.game!;
  const c = character(rank);
  const holder = view.players.find((p) => p.revealed.includes(rank));
  const state = g.faceUp.includes(rank)
    ? 'Écarté face visible à ce tour : personne ne le joue.'
    : holder
      ? `Révélé : c'est ${holder.id === view.me ? 'toi' : holder.name}.`
      : g.killed === rank
        ? "Visé par l'Assassin."
        : g.mine.includes(rank)
          ? "C'est ton personnage : personne d'autre ne le sait."
          : g.stage !== 'pick' && rank < g.calling
            ? 'Appelé : personne n’a répondu.'
            : null;
  return (
    <Modal open onClose={onClose} title={c.name}>
      <div className="char-sheet">
        <CharacterCard rank={rank} size="lg" />
        <div>
          <p>{c.power}</p>
          {g.robbed === rank && <p className="small char-note">Visé par le Voleur.</p>}
          {state && <p className="muted small">{state}</p>}
          {rank === 9 && <p className="muted small">Dans sa bourse : {g.taxPot} or.</p>}
        </div>
      </div>
    </Modal>
  );
}

export function TurnTimer({ left }: { left: number }) {
  return (
    <span className={cls('timer', left <= 10 && 'is-low')} role="timer">
      <Hourglass size={13} aria-hidden /> {left}
    </span>
  );
}
