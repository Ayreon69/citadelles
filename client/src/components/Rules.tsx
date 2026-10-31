// Les règles, lisibles en deux minutes et consultables à tout moment.
import { Coins, Crown, Hammer, Trophy, VenetianMask } from 'lucide-react';
import { CHARACTERS, DISTRICTS } from '../../../shared/protocol';
import { useStore } from '../store';
import { CharacterCard, DistrictCard } from './Art';
import { Modal } from './Ui';

export function RulesModal() {
  const open = useStore((s) => s.rulesOpen);
  const setOpen = useStore((s) => s.setRulesOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Les règles" wide>
      <div className="rules">
        <p className="rule-lead">
          Bâtis la cité la plus précieuse. La partie s'arrête à la fin du tour où quelqu'un pose son <b>7e quartier</b> (le 8e à 2 ou 3 joueurs). Chaque quartier rapporte ce qu'il a coûté.
        </p>

        <section>
          <h3>
            <VenetianMask size={18} aria-hidden /> 1. Chacun choisit un personnage, en secret
          </h3>
          <p>
            Le joueur à la couronne choisit en premier parmi les personnages restants, puis passe les autres à sa gauche. Certains sont écartés au hasard : ceux qui sont face visible ne seront pas joués, et personne ne connaît celui qui est face cachée.
          </p>
        </section>

        <section>
          <h3>
            <Crown size={18} aria-hidden /> 2. On appelle les personnages, de 1 à 8
          </h3>
          <p>
            Celui qui est appelé se révèle et joue. Si personne ne répond, c'est qu'il est écarté… ou assassiné : la victime se tait et passe son tour.
          </p>
        </section>

        <section>
          <h3>
            <Coins size={18} aria-hidden /> 3. À ton tour
          </h3>
          <ul className="rule-steps">
            <li>
              <b>Prends tes ressources :</b> 2 or, ou pioche 2 cartes et gardes-en une.
            </li>
            <li>
              <b>Bâtis un quartier :</b> paie son coût. Pas deux quartiers identiques dans ta cité.
            </li>
            <li>
              <b>Utilise ton pouvoir</b> quand tu veux pendant ton tour. Les revenus oubliés sont encaissés à la fin.
            </li>
          </ul>
        </section>

        <section>
          <h3>Les personnages</h3>
          <ul className="rule-cast">
            {CHARACTERS.map((c) => (
              <li key={c.rank}>
                <CharacterCard rank={c.rank} size="sm" />
                <div>
                  <b>{c.name}</b>
                  <p>{c.power}</p>
                  {c.rank === 9 && <p className="muted small">Obligatoire à 3 et à 8 joueurs, au choix de 4 à 7, absent à 2.</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3>
            <Hammer size={18} aria-hidden /> Les couleurs des quartiers
          </h3>
          <ul className="rule-types">
            <li className="is-noble">Noble</li>
            <li className="is-religious">Religieux</li>
            <li className="is-trade">Commerce</li>
            <li className="is-military">Militaire</li>
            <li className="is-unique">Merveille</li>
          </ul>
        </section>

        <section>
          <h3>Les merveilles</h3>
          <ul className="rule-wonders">
            {DISTRICTS.filter((d) => d.type === 'unique').map((d) => (
              <li key={d.id}>
                <DistrictCard id={d.id} size="sm" />
                <div>
                  <b>{d.name}</b>
                  <p>{d.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="rule-score">
          <h3>
            <Trophy size={18} aria-hidden /> Fin de partie
          </h3>
          <ul>
            <li>La somme des coûts de tes quartiers.</li>
            <li>+3 si tu as les cinq couleurs.</li>
            <li>+4 pour le premier à finir sa cité, +2 pour ceux qui la finissent ensuite.</li>
            <li>Les points de tes merveilles.</li>
            <li>À égalité, le plus haut personnage révélé au dernier tour l'emporte.</li>
          </ul>
        </section>

        <section>
          <h3>À 2 ou 3 joueurs</h3>
          <p>Chacun joue deux personnages par tour, avec une seule cité et une seule bourse. À 2, on écarte en secret un personnage chaque fois qu'on en garde un.</p>
        </section>

        <p className="rule-foot">
          D'après <i>Citadelles</i>, le jeu de Bruno Faidutti. Création de fans, non officielle, avec ses propres visuels.
        </p>
      </div>
    </Modal>
  );
}
