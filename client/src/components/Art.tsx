// Tout l'art du jeu, dessiné ici : des fenêtres de verre et de plomb, une par quartier et par personnage.
import { memo, type CSSProperties, type MouseEventHandler, type ReactNode } from 'react';
import { TYPE_NAMES, buildCost, character, district, type DistrictType } from '../../../shared/protocol';
import { cls } from '../lib/util';

/** Les verres : du plus clair au plus sombre. */
const GLASS: Record<string, string[]> = {
  noble: ['#ffe58a', '#ffc933', '#f5ae00', '#d48a00', '#ffd95c'],
  religious: ['#9dd0ff', '#4d9dff', '#2272e0', '#154fb0', '#6fb2ff'],
  trade: ['#a7ec8a', '#4fcf6f', '#1fa65a', '#127a45', '#7adf78'],
  military: ['#ffa494', '#ff5a4d', '#d92e2e', '#9e1a24', '#f2705f'],
  unique: ['#dcabff', '#b06fff', '#8a3fe0', '#6322b0', '#c48cff'],
  c1: ['#c0606e', '#8e2b43', '#6b1a33', '#470f25', '#a33e54'],
  c2: ['#7fd6cf', '#2fa8a6', '#1b7f83', '#105a61', '#54c0ba'],
  c3: ['#9fa8ff', '#6a70f0', '#4a45c8', '#2f2b94', '#8388ff'],
  c7: ['#ffc08a', '#ff9440', '#e8701c', '#b04e10', '#ffab62'],
  c9: ['#e4cfa0', '#c6a566', '#9d7d3f', '#6f5628', '#d8bc80'],
};

const TONE: Record<string, string> = {
  l: '#fff3d6',
  g: '#ffc93a',
  d: '#3a2f4a',
  s: '#d4dff0',
  r: '#e8413c',
  b: '#4d9dff',
  v: '#3fc46a',
  p: '#a65cf0',
  o: '#f08a2c',
};

type Glyph = [keyof typeof TONE | string, string][];

/** Les dessins, sur un cadre de 100 × 130, posés sur le bas de la fenêtre. */
const DISTRICT_GLYPHS: Record<string, Glyph> = {
  manoir: [['d', 'M64 50h7v16h-7z'], ['l', 'M26 70h48v46H26z'], ['r', 'M20 72 50 46l30 26z'], ['d', 'M44 92h12v24H44z'], ['g', 'M31 78h9v10h-9z'], ['g', 'M60 78h9v10h-9z']],
  chateau: [['r', 'M16 56l10-18 10 18z'], ['r', 'M64 56l10-18 10 18z'], ['s', 'M18 56h16v60H18z'], ['s', 'M66 56h16v60H66z'], ['s', 'M34 66h6v6h6v-6h8v6h6v-6h6v50H34z'], ['d', 'M42 96a8 8 0 0 1 16 0v20H42z'], ['d', 'M23 70h6v10h-6z'], ['d', 'M71 70h6v10h-6z']],
  palais: [['l', 'M18 84h64v32H18z'], ['g', 'M32 84a18 18 0 0 1 36 0z'], ['g', 'M48 52h4v14h-4z'], ['l', 'M20 60h8v24h-8z'], ['l', 'M72 60h8v24h-8z'], ['g', 'M18 60a6 6 0 0 1 12 0z'], ['g', 'M70 60a6 6 0 0 1 12 0z'], ['d', 'M28 96a4 4 0 0 1 8 0v20h-8z'], ['d', 'M45 96a5 5 0 0 1 10 0v20H45z'], ['d', 'M64 96a4 4 0 0 1 8 0v20h-8z']],
  temple: [['l', 'M20 62h60L50 38z'], ['l', 'M24 62h52v6H24z'], ['s', 'M28 68h8v40h-8z'], ['s', 'M46 68h8v40h-8z'], ['s', 'M64 68h8v40h-8z'], ['l', 'M20 108h60v8H20z'], ['g', 'M46 52a4 4 0 0 1 8 0a4 4 0 0 1-8 0z']],
  eglise: [['g', 'M49 18h2v8h4v2h-4v8h-2v-8h-4v-2h4z'], ['b', 'M42 50l8-16 8 16z'], ['l', 'M44 50h12v22H44z'], ['b', 'M24 80l26-16 26 16z'], ['l', 'M30 80h40v36H30z'], ['d', 'M44 98a6 6 0 0 1 12 0v18H44z'], ['g', 'M35 86h6v10h-6z'], ['g', 'M59 86h6v10h-6z']],
  monastere: [['r', 'M40 46l10-14 10 14z'], ['l', 'M44 46h12v20H44z'], ['r', 'M14 76l10-12h52l10 12z'], ['l', 'M20 76h60v40H20z'], ['d', 'M26 90a5 5 0 0 1 10 0v26H26z'], ['d', 'M45 90a5 5 0 0 1 10 0v26H45z'], ['d', 'M64 90a5 5 0 0 1 10 0v26H64z']],
  cathedrale: [['b', 'M26 62l9-34 9 34z'], ['b', 'M56 62l9-34 9 34z'], ['l', 'M28 62h14v54H28z'], ['l', 'M58 62h14v54H58z'], ['l', 'M42 72h16v44H42z'], ['g', 'M44 82a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['d', 'M45 102a5 5 0 0 1 10 0v14H45z'], ['g', 'M32 74h6v12h-6z'], ['g', 'M62 74h6v12h-6z']],
  taverne: [['d', 'M22 68l28-24 28 24z'], ['l', 'M26 68h48v48H26z'], ['g', 'M36 84h20v24H36z'], ['g', 'M56 88h6a4 4 0 0 1 4 4v6a4 4 0 0 1-4 4h-6v-4h5v-6h-5z'], ['l', 'M34 78h24v8H34z']],
  echoppe: [['l', 'M22 76h56v40H22z'], ['r', 'M14 78l6-20h60l6 20z'], ['l', 'M32 58l-4 20h10l2-20z'], ['l', 'M60 58l2 20h10l-4-20z'], ['d', 'M28 92h44v24H28z'], ['g', 'M34 86a5 5 0 1 0 10 0a5 5 0 1 0-10 0z'], ['o', 'M50 86a5 5 0 1 0 10 0a5 5 0 1 0-10 0z']],
  marche: [['v', 'M12 74l8-18h28l2 18z'], ['l', 'M20 74h28v42H20z'], ['o', 'M50 80l2-16h28l8 16z'], ['l', 'M54 80h28v36H54z'], ['g', 'M24 92h20v24H24z'], ['r', 'M58 96h20v20H58z'], ['d', 'M24 92h20v4H24z'], ['d', 'M58 96h20v4H58z']],
  comptoir: [['d', 'M60 50h28v5H60z'], ['d', 'M62 50h5v66h-5z'], ['l', 'M16 72h46v44H16z'], ['r', 'M12 74l27-20 27 20z'], ['d', 'M30 88h18v28H30z'], ['g', 'M76 74h12v14H76z'], ['d', 'M81 55h2v19h-2z']],
  port: [['d', 'M48 34h4v58h-4z'], ['l', 'M52 38l24 44H52z'], ['l', 'M48 46 28 82h20z'], ['o', 'M18 90h64l-8 18H26z'], ['b', 'M12 108h76v10H12z']],
  hotel: [['v', 'M40 46l10-16 10 16z'], ['l', 'M42 46h16v34H42z'], ['g', 'M45 60a5 5 0 1 0 10 0a5 5 0 1 0-10 0z'], ['l', 'M22 80h56v36H22z'], ['r', 'M18 82l6-6h52l6 6z'], ['d', 'M44 96a6 6 0 0 1 12 0v20H44z'], ['g', 'M28 90h8v12h-8z'], ['g', 'M64 90h8v12h-8z']],
  tour: [['r', 'M50 22h2v18h-2zM52 22l14 6-14 6z'], ['s', 'M32 40h8v6h6v-6h8v6h6v-6h8v16H32z'], ['s', 'M38 56h24v60H38z'], ['d', 'M47 68h6v14h-6z'], ['d', 'M44 96a6 6 0 0 1 12 0v20H44z']],
  prison: [['s', 'M24 50h10v6h8v-6h8v6h8v-6h8v6h10v60H24z'], ['d', 'M36 72h28v28H36z'], ['l', 'M42 72h4v28h-4z'], ['l', 'M54 72h4v28h-4z'], ['l', 'M36 84h28v4H36z']],
  caserne: [['d', 'M50 30h3v26h-3z'], ['r', 'M53 30l14 5-14 5z'], ['r', 'M18 116l32-62 32 62z'], ['d', 'M42 116l8-30 8 30z'], ['s', 'M16 96l8-4 8 4v14l-8 6-8-6z']],
  forteresse: [['s', 'M38 40h6v6h4v-6h6v6h4v-6h6v30H38z'], ['s', 'M14 64h6v6h4v-6h6v6h4v-6h6v52H14z'], ['s', 'M60 64h6v6h4v-6h6v6h4v-6h6v52H60z'], ['s', 'M40 70h20v46H40z'], ['d', 'M43 98a7 7 0 0 1 14 0v18H43z'], ['d', 'M22 80h6v12h-6z'], ['d', 'M72 80h6v12h-6z'], ['d', 'M47 52h6v10h-6z']],
  dragon: [['v', 'M22 66 8 44l20 8z'], ['v', 'M78 66l14-22-20 8z'], ['s', 'M22 116V72a28 28 0 0 1 56 0v44H60V76a10 10 0 0 0-20 0v40z'], ['r', 'M50 114c-12-8-10-20 0-34c10 14 12 26 0 34z'], ['g', 'M50 112c-6-4-5-10 0-18c5 8 6 14 0 18z'], ['g', 'M32 64a3 3 0 1 0 6 0a3 3 0 1 0-6 0z'], ['g', 'M62 64a3 3 0 1 0 6 0a3 3 0 1 0-6 0z']],
  manufacture: [['l', 'M76 30a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['l', 'M68 40a4 4 0 1 0 8 0a4 4 0 1 0-8 0z'], ['d', 'M70 46h9v70h-9z'], ['s', 'M18 116V78l17-12v12l17-12v12l18-12v50z'], ['g', 'M30 98a7 7 0 1 0 14 0a7 7 0 1 0-14 0z'], ['d', 'M34 98a3 3 0 1 0 6 0a3 3 0 1 0-6 0z'], ['g', 'M52 88h10v10H52z']],
  miracles: [['l', 'M70 34a11 11 0 1 0 9 20a13 13 0 0 1-9-20z'], ['d', 'M18 116V78l12-12 12 12v38z'], ['p', 'M42 116V66l14-14 14 16v48z'], ['d', 'M68 116V84l9-8 9 8v32z'], ['g', 'M26 88h8v8h-8z'], ['g', 'M50 76h10v10H50z'], ['g', 'M73 92h8v8h-8z'], ['d', 'M50 98a5 5 0 0 1 10 0v18H50z']],
  tresor: [['g', 'M36 46a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['g', 'M52 40a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['l', 'M46 56a5 5 0 1 0 10 0a5 5 0 1 0-10 0z'], ['o', 'M22 80a28 16 0 0 1 56 0z'], ['o', 'M22 80h56v34H22z'], ['d', 'M22 80h56v6H22z'], ['g', 'M44 80h12v16H44z'], ['d', 'M48 86h4v6h-4z']],
  donjon: [['s', 'M26 36h9v7h6v-7h9v7h6v-7h9v7h9v15H26z'], ['s', 'M32 58h36v58H32z'], ['d', 'M47 68h6v18h-6z'], ['d', 'M43 98a7 7 0 0 1 14 0v18H43z']],
  laboratoire: [['l', 'M44 44h12v22l20 42a6 6 0 0 1-6 8H30a6 6 0 0 1-6-8l20-42z'], ['v', 'M36 86h28l12 24a4 4 0 0 1-4 6H28a4 4 0 0 1-4-6z'], ['d', 'M40 36h20v9H40z'], ['g', 'M42 98a3 3 0 1 0 6 0a3 3 0 1 0-6 0z'], ['g', 'M54 104a3 3 0 1 0 6 0a3 3 0 1 0-6 0z']],
  bibliotheque: [['r', 'M20 58h11v56H20z'], ['b', 'M31 50h12v64H31z'], ['g', 'M43 62h10v52H43z'], ['v', 'M53 52h12v62H53z'], ['l', 'M67 60l11-3 9 56-11 2z'], ['d', 'M14 114h72v6H14z']],
  cartes: [['l', 'M20 56l20 7 20-7 20 7v54l-20-7-20 7-20-7z'], ['d', 'M39 63h2v54h-2z'], ['d', 'M59 56h2v54h-2z'], ['b', 'M24 82c8-6 14 4 22-2s16-4 30-2l1 14c-10-4-20-2-30 2s-16 2-23-2z'], ['r', 'M64 66l3 3 3-3 2 2-3 3 3 3-2 2-3-3-3 3-2-2 3-3-3-3z']],
  carriere: [['s', 'M16 96h30v20H16z'], ['s', 'M46 96h38v20H46z'], ['s', 'M28 76h34v20H28z'], ['d', 'M64 40l14 34-6 3-14-34z'], ['l', 'M44 46c12-14 30-16 40-8l-5 6c-8-4-18-3-29 8z']],
  ecole: [['g', 'M50 16l3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z'], ['p', 'M32 64l18-26 18 26z'], ['b', 'M38 64h24v52H38z'], ['g', 'M45 74a5 5 0 1 0 10 0a5 5 0 1 0-10 0z'], ['d', 'M44 98a6 6 0 0 1 12 0v18H44z'], ['l', 'M20 48l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z'], ['l', 'M80 62l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z']],
  forge: [['g', 'M60 56h6v22h-6z'], ['d', 'M48 40h30v16H48z'], ['s', 'M18 80h64c0 10-12 14-22 14v10h12v12H28v-12h12V94c-10 0-22-4-22-14z'], ['g', 'M32 64l4 8-8-3z'], ['r', 'M42 58l2 12-7-6z'], ['g', 'M84 66l-6 8-1-7z']],
  statue: [['l', 'M43 44a7 7 0 1 0 14 0a7 7 0 1 0-14 0z'], ['l', 'M41 54h18l4 42H37z'], ['l', 'M58 56l14-22 4 3-14 24z'], ['g', 'M74 24l4 8-8 2z'], ['s', 'M30 96h40v8H30z'], ['s', 'M36 104h28v12H36z']],
  repaire: [['g', 'M36 100a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['g', 'M52 104a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['d', 'M18 62c12-10 52-10 64 0c-2 20-16 24-22 14c-4-6-16-6-20 0c-6 10-20 6-22-14z'], ['l', 'M30 66c4-3 10-3 12 0c-1 5-10 5-12 0z'], ['l', 'M58 66c2-3 8-3 12 0c-2 5-11 5-12 0z']],
  fontaine: [['r', 'M20 58l30-20 30 20z'], ['d', 'M30 58h5v30h-5z'], ['d', 'M65 58h5v30h-5z'], ['d', 'M49 58h2v18h-2z'], ['g', 'M44 74h12v10H44z'], ['s', 'M24 88h52v28H24z'], ['b', 'M28 88h44v6H28z'], ['d', 'M38 98h8v8h-8z'], ['d', 'M54 98h8v8h-8z']],
};

const CHARACTER_GLYPHS: Record<number, Glyph> = {
  1: [['s', 'M46 26h8l3 60H43z'], ['l', 'M50 26h4l3 60h-7z'], ['g', 'M32 86h36v7H32z'], ['d', 'M45 93h10v16H45z'], ['g', 'M44 109a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['r', 'M70 54c-6 8-6 14 0 16c6-2 6-8 0-16z'], ['r', 'M28 66c-4 6-4 10 0 12c4-2 4-6 0-12z']],
  2: [['g', 'M28 82c0-14 10-22 22-22s22 8 22 22c0 20-10 32-22 32S28 102 28 82z'], ['d', 'M38 44l12 10 12-10-4 16H42z'], ['r', 'M38 60h24v5H38z'], ['o', 'M50 72l3 8 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z'], ['l', 'M72 40a5 5 0 1 0 10 0a5 5 0 1 0-10 0z'], ['l', 'M18 54a4 4 0 1 0 8 0a4 4 0 1 0-8 0z']],
  3: [['d', 'M24 94l26-62 26 62z'], ['g', 'M42 66l2 5 5 1-4 3 1 5-4-3-4 3 1-5-4-3 5-1z'], ['l', 'M56 52a7 7 0 1 0 5 13a8 8 0 0 1-5-13z'], ['g', 'M16 94h68v9H16z'], ['l', 'M22 44l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z'], ['l', 'M78 62l2 4 4 1-3 3 1 4-4-2-4 2 1-4-3-3 4-1z']],
  4: [['g', 'M20 96V52l15 20 15-30 15 30 15-20v44z'], ['r', 'M20 96h60v12H20z'], ['l', 'M46 37a4 4 0 1 0 8 0a4 4 0 1 0-8 0z'], ['l', 'M16 50a4 4 0 1 0 8 0a4 4 0 1 0-8 0z'], ['l', 'M76 50a4 4 0 1 0 8 0a4 4 0 1 0-8 0z'], ['l', 'M47 98h6v8h-6z'], ['l', 'M30 98h6v8h-6z'], ['l', 'M64 98h6v8h-6z']],
  5: [['l', 'M30 110V66c0-16 12-28 20-38c8 10 20 22 20 38v44z'], ['g', 'M47 42h6v18h8v6h-8v18h-6V66h-8v-6h8z'], ['g', 'M30 98h40v12H30z'], ['g', 'M84 40a7 7 0 0 0-12 2l5 2a2 2 0 0 1 2-1v70h5z']],
  6: [['d', 'M36 106h28v8H36z'], ['g', 'M47 40h6v66h-6z'], ['g', 'M20 44h60v5H20z'], ['g', 'M44 34a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['d', 'M24 49l-8 28h2l8-26 8 26h2l-8-28z'], ['d', 'M76 49l-8 28h2l8-26 8 26h2l-8-28z'], ['o', 'M12 77a14 9 0 0 0 28 0z'], ['o', 'M60 77a14 9 0 0 0 28 0z'], ['l', 'M22 68a4 4 0 1 0 8 0a4 4 0 1 0-8 0z']],
  7: [['b', 'M20 112c0-30 30-60 60-60v6c-30 0-54 24-54 54z'], ['s', 'M50 40l-20 70 6 2 14-50 14 50 6-2z'], ['g', 'M44 38a6 6 0 1 0 12 0a6 6 0 1 0-12 0z'], ['l', 'M62 92h24v7H69v17h-7z']],
  8: [['s', 'M24 30l5-3 46 70-6 4z'], ['s', 'M76 30l-5-3-46 70 6 4z'], ['g', 'M16 90l14 2-10 12z'], ['g', 'M84 90l-14 2 10 12z'], ['r', 'M36 58h28v22c0 10-8 18-14 20c-6-2-14-10-14-20z'], ['g', 'M47 64h6v12h8v6h-8v8h-6v-8h-8v-6h8z']],
  9: [['l', 'M18 56h44v58H18z'], ['d', 'M24 66h32v3H24z'], ['d', 'M24 76h32v3H24z'], ['d', 'M24 86h22v3H24z'], ['r', 'M18 56h6v58h-6z'], ['g', 'M64 104a10 6 0 1 0 20 0a10 6 0 1 0-20 0z'], ['g', 'M64 94a10 6 0 1 0 20 0a10 6 0 1 0-20 0z'], ['g', 'M64 84a10 6 0 1 0 20 0a10 6 0 1 0-20 0z'], ['o', 'M64 74a10 6 0 1 0 20 0a10 6 0 1 0-20 0z']],
};

/** Générateur déterministe : la même fenêtre garde toujours les mêmes éclats. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shardsFor(seed: string): { d: string; t: number }[] {
  let x = hash(seed) || 1;
  const rnd = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  const cols = 4;
  const rows = 5;
  const pts: [number, number][][] = [];
  for (let r = 0; r <= rows; r++) {
    const row: [number, number][] = [];
    for (let c = 0; c <= cols; c++) {
      const edgeX = c === 0 || c === cols;
      const edgeY = r === 0 || r === rows;
      const jx = edgeX ? 0 : (rnd() - 0.5) * 14;
      const jy = edgeY ? 0 : (rnd() - 0.5) * 14;
      row.push([(c * 100) / cols + jx, (r * 130) / rows + jy]);
    }
    pts.push(row);
  }
  const out: { d: string; t: number }[] = [];
  const P = (p: [number, number]) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const [a, b, d, e] = [pts[r][c], pts[r][c + 1], pts[r + 1][c + 1], pts[r + 1][c]];
      if (rnd() < 0.5) {
        out.push({ d: `M${P(a)}L${P(b)}L${P(d)}Z`, t: Math.floor(rnd() * 5) });
        out.push({ d: `M${P(a)}L${P(d)}L${P(e)}Z`, t: Math.floor(rnd() * 5) });
      } else {
        out.push({ d: `M${P(a)}L${P(b)}L${P(e)}Z`, t: Math.floor(rnd() * 5) });
        out.push({ d: `M${P(b)}L${P(d)}L${P(e)}Z`, t: Math.floor(rnd() * 5) });
      }
    }
  }
  return out;
}

const shardCache = new Map<string, { d: string; t: number }[]>();
function shards(seed: string) {
  let s = shardCache.get(seed);
  if (!s) {
    s = shardsFor(seed);
    shardCache.set(seed, s);
  }
  return s;
}

/** Une seule définition pour tout le document : l'arc et la lumière derrière le verre. */
export function GlassDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>
        <clipPath id="arch" clipPathUnits="userSpaceOnUse">
          <path d="M2 130V50C2 22 24 2 50 2s48 20 48 48v80z" />
        </clipPath>
        <radialGradient id="backlight" cx="0.5" cy="0.32" r="0.75">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.06" />
          <stop offset="1" stopColor="#000" stopOpacity="0.38" />
        </radialGradient>
      </defs>
    </svg>
  );
}

const LEAD = '#17121c';

const Pane = memo(function Pane({ seed, palette, glyph }: { seed: string; palette: string; glyph: Glyph }) {
  const colors = GLASS[palette];
  return (
    <svg className="pane" viewBox="0 0 100 130" aria-hidden>
      <g clipPath="url(#arch)">
        {shards(seed).map((s, i) => (
          <path key={i} d={s.d} fill={colors[s.t]} stroke={LEAD} strokeWidth="1.3" strokeLinejoin="round" />
        ))}
        {glyph.map(([tone, d], i) => (
          <path key={i} d={d} fill={TONE[tone] ?? tone} stroke={LEAD} strokeWidth="2.4" strokeLinejoin="round" />
        ))}
        <rect width="100" height="130" fill="url(#backlight)" />
      </g>
      <path d="M2 130V50C2 22 24 2 50 2s48 20 48 48v80z" fill="none" stroke={LEAD} strokeWidth="4" />
    </svg>
  );
});

export function DistrictPane({ id }: { id: string }) {
  return <Pane seed={id} palette={district(id).type} glyph={DISTRICT_GLYPHS[id] ?? []} />;
}

const RANK_GLASS: Record<number, string> = { 1: 'c1', 2: 'c2', 3: 'c3', 4: 'noble', 5: 'religious', 6: 'trade', 7: 'c7', 8: 'military', 9: 'c9' };

export function CharacterPane({ rank }: { rank: number }) {
  return <Pane seed={`rang${rank}`} palette={RANK_GLASS[rank]} glyph={CHARACTER_GLYPHS[rank] ?? []} />;
}

/** Le pictogramme d'un type de quartier : une petite lancette de sa couleur. */
export function TypeDot({ type }: { type: DistrictType }) {
  return <span className={`type-dot is-${type}`} aria-label={TYPE_NAMES[type]} title={TYPE_NAMES[type]} />;
}

export function Coin({ className, children }: { className?: string; children?: ReactNode }) {
  return <span className={cls('coin', className)}>{children}</span>;
}

/** Une carte de quartier : la fenêtre, son coût en pièce, son nom. */
export function DistrictCard({
  id,
  city,
  size = 'md',
  selected,
  dim,
  glow,
  onClick,
  showText,
  style,
}: {
  id: string;
  /** Si on la bâtit, le coût réel dépend de cette cité (Manufacture). */
  city?: string[];
  size?: 'sm' | 'md' | 'lg';
  selected?: boolean;
  dim?: boolean;
  glow?: boolean;
  onClick?: MouseEventHandler;
  showText?: boolean;
  style?: CSSProperties;
}) {
  const d = district(id);
  const cost = city ? buildCost(id, city) : d.cost;
  const body = (
    <>
      <span className="card-art">
        <DistrictPane id={id} />
      </span>
      <Coin className={cls('card-cost', cost < d.cost && 'is-cheaper')}>{cost}</Coin>
      <span className="card-name">{d.name}</span>
      {showText && d.text && <span className="card-text">{d.text}</span>}
    </>
  );
  const classes = cls('card', `is-${d.type}`, `size-${size}`, selected && 'is-selected', dim && 'is-dim', glow && 'is-glow');
  return onClick ? (
    <button type="button" className={classes} onClick={onClick} style={style} aria-label={`${d.name}, ${cost} or, ${TYPE_NAMES[d.type]}${d.text ? `. ${d.text}` : ''}`}>
      {body}
    </button>
  ) : (
    <span className={classes} style={style}>
      {body}
    </span>
  );
}

/** Une carte de personnage : son rang dans un joyau, son blason, son nom. */
export function CharacterCard({
  rank,
  size = 'md',
  selected,
  discarded,
  dim,
  onClick,
  showPower,
}: {
  rank: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  selected?: boolean;
  discarded?: boolean;
  dim?: boolean;
  onClick?: MouseEventHandler;
  showPower?: boolean;
}) {
  const c = character(rank);
  const body = (
    <>
      <span className="card-art">
        <CharacterPane rank={rank} />
      </span>
      <span className="card-rank"><b>{rank}</b></span>
      <span className="card-name">{c.name}</span>
      {showPower && <span className="card-text">{c.power}</span>}
    </>
  );
  const classes = cls('card', 'is-character', `size-${size}`, selected && 'is-selected', discarded && 'is-discard', dim && 'is-dim');
  return onClick ? (
    <button type="button" className={classes} onClick={onClick} aria-label={`${c.name} : ${c.power}`} aria-pressed={selected}>
      {body}
    </button>
  ) : (
    <span className={classes}>{body}</span>
  );
}

/** Le dos d'une carte : un carreau de plomb. */
export function CardBack({ className }: { className?: string }) {
  return (
    <span className={cls('card-back', className)} aria-hidden>
      <svg viewBox="0 0 100 130">
        <rect width="100" height="130" rx="8" fill="#2a2231" />
        <path d="M0 0l100 130M100 0L0 130M50 0v130M0 65h100" stroke="#57496a" strokeWidth="3" />
        <path d="M50 35l24 30-24 30-24-30z" fill="#f2c14e" stroke={LEAD} strokeWidth="4" />
      </svg>
    </span>
  );
}

/** Une petite fenêtre, dans la cité vue de loin. */
export function CityWindow({ id, big }: { id: string; big?: boolean }) {
  const d = district(id);
  return big ? (
    <span className={cls('city-card', `is-${d.type}`)}>
      <DistrictPane id={id} />
      <i>{d.cost}</i>
    </span>
  ) : (
    <span className={cls('win', `is-${d.type}`)} title={`${d.name} (${d.cost})`}>
      {d.cost}
    </span>
  );
}
