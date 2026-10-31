// Les mots de la table : noms, ce qui vient de se passer et ce qu'on attend.
import { character, district, type GameEvent, type RoomView } from '../../../shared/protocol';

export function nameOf(view: RoomView, id: string | undefined | null): string {
  if (!id) return '?';
  if (id === view.me) return 'toi';
  return view.players.find((p) => p.id === id)?.name ?? '?';
}

export function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** « Léa, Zino et Sam ». */
export function listing(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} et ${names[names.length - 1]}`;
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${Math.abs(n) > 1 ? 's' : ''}`;
}

/** Ce qui vient de se passer, en une phrase ; null pour ce qui se voit déjà ailleurs. */
export function eventText(view: RoomView, e: GameEvent): string | null {
  const me = e.by === view.me;
  const who = me ? 'Tu' : nameOf(view, e.by);
  const target = e.target === view.me ? 'toi' : nameOf(view, e.target);
  const n = e.amount ?? 0;
  switch (e.kind) {
    case 'round':
      return null;
    case 'reveal':
      return null;
    case 'gold':
      return `${who} ${me ? 'prends' : 'prend'} 2 or.`;
    case 'draw':
      return n === 2 ? `${who} ${me ? 'gardes' : 'garde'} les 2 cartes piochées.` : `${who} ${me ? 'gardes' : 'garde'} 1 carte sur les 2 piochées.`;
    case 'income':
      return n ? `${who} ${me ? 'encaisses' : 'encaisse'} ${n} or de revenus.` : `${who} n’${me ? 'as' : 'a'} aucun revenu à encaisser.`;
    case 'build':
      return `${who} ${me ? 'bâtis' : 'bâtit'} : ${district(e.card!).name}.`;
    case 'kill':
      return `L’Assassin vise ${character(e.rank!).the}.`;
    case 'rob':
      return `Le Voleur vise ${character(e.rank!).the}.`;
    case 'robbed':
      if (!n) return `Le Voleur fouille ${character(e.rank!).the} : rien à prendre.`;
      return e.target === view.me ? `Le Voleur te prend ${n} or !` : `Le Voleur prend ${n} or à ${target}.`;
    case 'swap':
      return `${who} ${me ? 'échanges' : 'échange'} sa main avec ${target}.`.replace('Tu échanges sa', 'Tu échanges ta');
    case 'redraw':
      return `${who} ${me ? 'changes' : 'change'} ${plural(n, 'carte')}.`;
    case 'destroy':
      return `${who} ${me ? 'détruis' : 'détruit'} : ${district(e.card!).name}, chez ${target}.`;
    case 'tax':
      return `${who} ${me ? 'vides' : 'vide'} la bourse du Percepteur : ${n} or.`;
    case 'crown':
      return `${who} ${me ? 'prends' : 'prend'} la couronne.`;
    case 'heir':
      return `Le Roi assassiné était ${nameOf(view, e.by)} : la couronne suit.`;
    case 'complete':
      return `${me ? 'Ta' : `La cité de ${who}`} ${me ? 'cité est' : 'est'} complète : c’est le dernier tour !`;
    case 'smithy':
      return `${who} ${me ? 'paies' : 'paie'} la Forge : ${plural(n, 'carte')}.`;
    case 'lab':
      return `${who} ${me ? 'défausses' : 'défausse'} une carte au Laboratoire : 2 or.`;
    case 'architect':
      return `${who} ${me ? 'pioches' : 'pioche'} ${plural(n, 'carte')} de plus.`;
  }
}
