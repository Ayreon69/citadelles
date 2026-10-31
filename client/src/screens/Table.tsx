// La table : la cour des personnages en haut, les cités des autres au milieu, ta cité et ta main en bas.
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Bot, Crown, Flag, LogOut, Menu, Smile, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { EMOTES, TAUNTS, TYPE_NAMES, buildCost, character, district, type PlayerView, type RoomView } from '../../../shared/protocol';
import { CardBack, CharacterCard, CharacterPane, CityWindow, Coin, DistrictCard, TypeDot } from '../components/Art';
import { Effects } from '../components/Effects';
import { CharacterSheet, HandSheet, PickPanel, PlayerSheet, TurnPanel, TurnTimer, buildBlock } from '../components/Panels';
import { Avatar, Button, Modal, Pill } from '../components/Ui';
import { sfx } from '../lib/sound';
import { capital, eventText, nameOf } from '../lib/text';
import { cls, secondsLeft, useTick, vibrate } from '../lib/util';
import { leaveRoom, send, socket } from '../net';
import { useStore, type Emote } from '../store';

function Bubbles({ emotes }: { emotes: Emote[] }) {
  return (
    <AnimatePresence>
      {emotes.slice(-1).map((e) => (
        <motion.span key={e.id} className="bubble" initial={{ y: 8, opacity: 0, scale: 0.7 }} animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
          {e.emoji}
        </motion.span>
      ))}
    </AnimatePresence>
  );
}

/** La rangée des personnages : ceux qu'on a écartés, celui qu'on appelle, ceux qui se sont révélés. */
function Court({ view, onOpen }: { view: RoomView; onOpen: (rank: number) => void }) {
  const g = view.game!;
  return (
    <ol className="court" aria-label="Les personnages">
      {g.cast.map((r) => {
        const holder = view.players.find((p) => p.revealed.includes(r));
        const out = g.faceUp.includes(r);
        const calling = g.calling === r && (g.stage === 'call' || g.stage === 'turn');
        const passed = g.stage !== 'pick' && r < g.calling && !holder;
        const c = character(r);
        return (
          <li key={r}>
            <button
              type="button"
              className={cls('token', out && 'is-out', calling && 'is-calling', passed && 'is-passed', !!holder && 'is-revealed', g.killed === r && 'is-killed', g.robbed === r && 'is-robbed', g.mine.includes(r) && 'is-mine')}
              aria-label={`${r}, ${c.name}${out ? ', écarté' : ''}${holder ? `, joué par ${holder.name}` : ''}`}
              onClick={() => onOpen(r)}
            >
              <CharacterPane rank={r} />
              <span className="token-rank">{r}</span>
              {holder && <Avatar avatar={holder.avatar} className="token-avatar" />}
              {g.killed === r && <span className="token-mark is-kill">✕</span>}
              {g.robbed === r && g.killed !== r && <span className="token-mark is-rob">$</span>}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** Le crieur : ce qu'on attend, et ce qui vient de se passer. */
function Crier({ view }: { view: RoomView }) {
  const g = view.game!;
  const now = useTick(250);
  let main: string;
  let endsAt = 0;
  if (g.stage === 'pick') {
    const p = g.pick!;
    endsAt = p.endsAt;
    main = p.current === view.me ? 'À toi de choisir !' : `${nameOf(view, p.current)} choisit en secret…`;
  } else if (g.stage === 'call') {
    // Ni absent ni victime ne répondent : le silence ne dit pas lequel des deux.
    main = g.calling > 0 ? `${capital(character(Math.min(g.calling, g.cast.length)).the)} ? Silence…` : 'On appelle les personnages…';
  } else if (g.stage === 'turn') {
    const t = g.turn!;
    endsAt = t.endsAt;
    main = t.player === view.me ? `À toi ! Tu es ${character(t.rank).the}.` : `${nameOf(view, t.player)} est ${character(t.rank).the}.`;
  } else if (g.stage === 'round') main = 'Fin du tour. On rebat les personnages…';
  else main = 'Une cité est complète : on compte les points !';
  const latest = [...g.events].reverse().find((e) => eventText(view, e));
  const left = endsAt > 0 ? secondsLeft(endsAt, now) : 0;
  return (
    <div className={cls('crier', g.stage === 'turn' && g.turn?.player === view.me && 'is-mine', g.stage === 'pick' && g.pick?.current === view.me && 'is-mine', g.stage === 'pick' && 'is-picking')} role="status">
      <div className="crier-main">
        <strong>{main}</strong>
        {left > 0 && <TurnTimer left={left} />}
      </div>
      {g.stage !== 'pick' && <p className="crier-event">{latest ? eventText(view, latest) : ' '}</p>}
    </div>
  );
}

function Windows({ city, goal }: { city: string[]; goal: number }) {
  return (
    <span className="windows" aria-label={`${city.length} quartiers sur ${goal}`}>
      {city.map((id, i) => (
        <CityWindow key={`${id}${i}`} id={id} />
      ))}
      {Array.from({ length: Math.max(0, goal - city.length) }, (_, i) => (
        <i key={`empty${i}`} className="win is-empty" />
      ))}
    </span>
  );
}

function Seat({ view, p, emotes, wide, onOpen }: { view: RoomView; p: PlayerView; emotes: Emote[]; wide: boolean; onOpen: () => void }) {
  const g = view.game!;
  const active = (g.stage === 'turn' && g.turn?.player === p.id) || (g.stage === 'pick' && g.pick?.current === p.id);
  return (
    <li className={cls('seat', active && 'is-active', wide && 'is-wide')}>
      <button type="button" className="seat-btn" data-seat={p.id} onClick={onOpen} aria-label={`Voir la cité de ${p.name}, ${p.gold} or, ${p.hand} cartes`}>
        <span className="seat-head">
          <Avatar avatar={p.avatar} className="seat-avatar" />
          <span className="seat-name">{p.name}</span>
          {p.crown && <Crown size={15} className="crown-icon" aria-label="Couronne" />}
          {p.isBot && <Bot size={13} className="muted" aria-label="Bot" />}
          {(!p.connected || p.autopilot) && <WifiOff size={13} className="seat-off" aria-label="Absent" />}
        </span>
        <span className="seat-stats">
          <span className="stat">
            <Coin /> {p.gold}
          </span>
          <span className="stat">
            <CardBack className="stat-card" /> {p.hand}
          </span>
          {p.revealed.map((r) => (
            <span key={r} className="seat-rank" title={character(r).name}>
              {r} <small>{character(r).name}</small>
            </span>
          ))}
        </span>
        <Windows city={p.city} goal={g.goal} />
      </button>
      <Bubbles emotes={emotes} />
    </li>
  );
}

function EmoteBar({ onClose }: { onClose: () => void }) {
  const say = (emoji: string) => {
    socket.emit('emote', { emoji });
    onClose();
  };
  return (
    <div className="emote-bar">
      <div className="emote-row">
        {EMOTES.map((e) => (
          <button key={e} type="button" className="emote-btn" onClick={() => say(e)}>
            {e}
          </button>
        ))}
      </div>
      <div className="taunt-row">
        {TAUNTS.map((t) => (
          <button key={t} type="button" className="taunt-btn" onClick={() => say(t)}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Table({ view }: { view: RoomView }) {
  const g = view.game!;
  const emotes = useStore((s) => s.emotes);
  const prefs = useStore((s) => s.prefs);
  const setPrefs = useStore((s) => s.setPrefs);
  const setRulesOpen = useStore((s) => s.setRulesOpen);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [sheet, setSheet] = useState<string | null>(null);
  const [charSheet, setCharSheet] = useState<number | null>(null);
  const [handOpen, setHandOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [talk, setTalk] = useState(false);
  const isHost = view.hostId === view.me;
  const seated = g.order.includes(view.me);
  const me = view.players.find((p) => p.id === view.me);
  const myIdx = g.order.indexOf(view.me);
  const othersIds = seated ? [...g.order.slice(myIdx + 1), ...g.order.slice(0, myIdx)] : g.order;
  const others = othersIds.map((id) => view.players.find((p) => p.id === id)!).filter(Boolean);
  const myTurn = g.stage === 'turn' && g.turn?.player === view.me;
  const myPick = g.stage === 'pick' && g.pick?.current === view.me;
  const hand = g.hand ?? [];

  // Si la carte choisie quitte la main, le choix tombe.
  const handKey = hand.join();
  const lastKey = useRef(handKey);
  useEffect(() => {
    if (handKey !== lastKey.current) {
      lastKey.current = handKey;
      setSelected(null);
      setSelectedIndex(null);
    }
  }, [handKey]);

  // C'est à toi de choisir : la cloche sonne.
  const wasPick = useRef(false);
  useEffect(() => {
    if (myPick && !wasPick.current) {
      sfx.turn();
      vibrate([40, 40, 80]);
    }
    wasPick.current = myPick;
  }, [myPick]);

  // Quand la page dépasse de l'écran, on descend vers ce que tu dois faire.
  useEffect(() => {
    if (myPick || myTurn) window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
  }, [myPick, myTurn]);

  const canBuildNow = myTurn && g.turn!.gathered && !g.turn!.drawn && g.turn!.built < g.turn!.limit;
  const block = selected ? buildBlock(view, selected) : null;

  return (
    <div className={cls('table-screen', others.length >= 5 && 'is-crowded', others.length === 1 && 'is-duel')}>
      <div className="rays" aria-hidden>
        <i className="ray r1" />
        <i className="ray r3" />
      </div>
      <Effects view={view} />
      <header className="table-top">
        <span className="round-tag">Tour {g.round}</span>
        {g.lastRound && (
          <Pill tone="red" className="last-pill">
            Dernier tour
          </Pill>
        )}
        {g.cast.includes(9) && (
          <span className="tax-tag" title="La bourse du Percepteur">
            <CharacterCard rank={9} size="xs" /> {g.taxPot}
          </span>
        )}
        <span className="table-top-right">
          {seated && (
            <button type="button" className="icon-btn" aria-label="Réagir" onClick={() => setTalk(true)}>
              <Smile size={20} />
            </button>
          )}
          <button type="button" className="icon-btn" aria-label="Règles" onClick={() => setRulesOpen(true)}>
            <BookOpen size={20} />
          </button>
          <button type="button" className="icon-btn" aria-label="Menu" onClick={() => setMenu(true)}>
            <Menu size={20} />
          </button>
        </span>
      </header>

      <div className="table-layout">
        <div className="table-public">
          <Court view={view} onOpen={setCharSheet} />
          <Crier view={view} />
          <ul className={cls('seats', others.length <= 1 && 'is-single')}>
            {others.map((p) => (
              <Seat key={p.id} view={view} p={p} emotes={emotes.filter((e) => e.playerId === p.id)} wide={others.length <= 1} onOpen={() => setSheet(p.id)} />
            ))}
          </ul>
        </div>

        <div className="table-mine">
          {seated && me ? (
            <>
              <section className={cls('my-zone', (myTurn || myPick) && 'is-active')}>
                <div className="my-head" data-seat={me.id}>
                  <Avatar avatar={me.avatar} className="seat-avatar" />
                  <span className="seat-name">{me.name}</span>
                  {me.crown && <Crown size={16} className="crown-icon" aria-label="Couronne" />}
                  <span className="stat stat-big">
                    <Coin /> {me.gold}
                  </span>
                  <span className="stat stat-big">
                    <CardBack className="stat-card" /> {me.hand}
                  </span>
                  <Bubbles emotes={emotes.filter((e) => e.playerId === view.me)} />
                </div>
                {g.mine.length > 0 && (
                  <div className={cls('my-roles', g.iAmDead && 'is-dead')}>
                    {g.mine.map((r) => (
                      <button key={r} type="button" className={cls('my-role', g.killed === r && 'is-killed', !!me.revealed.includes(r) && 'is-shown')} onClick={() => setCharSheet(r)}>
                        <CharacterCard rank={r} size="xs" />
                        <span>
                          <b>{character(r).name}</b>
                          <small>{g.killed === r ? 'Assassiné : tu passes ton tour, sans un mot.' : me.revealed.includes(r) ? 'Révélé' : 'Personne ne le sait'}</small>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {myPick ? (
                  <div className="my-rows">
                    <button type="button" className="my-row" onClick={() => setSheet(me.id)} aria-label={`Ta cité : ${me.city.length} quartiers sur ${g.goal}`}>
                      <span>Ta cité</span>
                      <Windows city={me.city} goal={g.goal} />
                    </button>
                    <button type="button" className="my-row" onClick={() => setHandOpen(true)} aria-label={`Voir ta main : ${hand.length} cartes`}>
                      <span>Ta main</span>
                      <span className="windows">
                        {hand.map((id, i) => (
                          <CityWindow key={`${id}${i}`} id={id} />
                        ))}
                      </span>
                    </button>
                  </div>
                ) : (
                  <button type="button" className="my-city" onClick={() => setSheet(me.id)} aria-label={`Ta cité : ${me.city.length} quartiers sur ${g.goal}`}>
                    {me.city.map((id, i) => (
                      <CityWindow key={`${id}${i}`} id={id} big />
                    ))}
                    {Array.from({ length: Math.max(0, g.goal - me.city.length) }, (_, i) => (
                      <i key={i} className="city-slot" />
                    ))}
                  </button>
                )}
              </section>

              {myPick ? (
                <PickPanel view={view} />
              ) : (
                <>
                  {!g.turn?.drawn && (
                    <div className="hand-wrap">
                      {hand.length ? (
                        <div className="hand" role="list" aria-label="Ta main">
                          {hand.map((c, i) => {
                            const can = canBuildNow && !buildBlock(view, c);
                            return (
                              <div key={`${c}${i}`} role="listitem" className="hand-slot">
                                <DistrictCard
                                  id={c}
                                  city={me.city}
                                  size="md"
                                  selected={selectedIndex === i}
                                  glow={can}
                                  dim={canBuildNow && !can}
                                  onClick={() => {
                                    sfx.tap();
                                    document.querySelectorAll('.hand-slot')[i]?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
                                    const off = selectedIndex === i;
                                    setSelectedIndex(off ? null : i);
                                    setSelected(off ? null : c);
                                  }}
                                />
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="hand-empty muted small">Ta main est vide.</p>
                      )}
                      {selected && (
                        <div className="card-detail">
                          <TypeDot type={district(selected).type} />
                          <span>
                            <b>{district(selected).name}</b> · {TYPE_NAMES[district(selected).type]}, {buildCost(selected, me.city)} or
                            {district(selected).text && <em> {district(selected).text}</em>}
                            {block && myTurn && <em className="card-block"> {block}</em>}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {myTurn && (
                    <TurnPanel
                      key={g.turn!.no}
                      view={view}
                      selected={selected}
                      onBuilt={() => {
                        setSelected(null);
                        setSelectedIndex(null);
                      }}
                    />
                  )}
                </>
              )}
            </>
          ) : (
            <p className="spectator-note">Tu regardes la partie : tu joueras à la prochaine.</p>
          )}
        </div>
      </div>

      {sheet && <PlayerSheet view={view} id={sheet} onClose={() => setSheet(null)} />}
      {handOpen && <HandSheet view={view} onClose={() => setHandOpen(false)} />}
      {charSheet !== null && <CharacterSheet view={view} rank={charSheet} onClose={() => setCharSheet(null)} />}
      <Modal open={talk} onClose={() => setTalk(false)} title="Réagir">
        <EmoteBar onClose={() => setTalk(false)} />
      </Modal>
      <Modal open={menu} onClose={() => setMenu(false)} title="Menu">
        <div className="menu-list">
          <Button icon={prefs.sound ? <Volume2 size={18} /> : <VolumeX size={18} />} onClick={() => setPrefs({ sound: !prefs.sound })}>
            {prefs.sound ? 'Couper le son' : 'Remettre le son'}
          </Button>
          <Button
            icon={<BookOpen size={18} />}
            onClick={() => {
              setMenu(false);
              setRulesOpen(true);
            }}
          >
            Les règles
          </Button>
          {isHost && (
            <Button
              icon={<Flag size={18} />}
              onClick={() => {
                setMenu(false);
                void send('game:end');
              }}
            >
              Arrêter la partie
            </Button>
          )}
          <Button variant="danger" icon={<LogOut size={18} />} onClick={() => void leaveRoom()}>
            Quitter la table
          </Button>
        </div>
      </Modal>
    </div>
  );
}
