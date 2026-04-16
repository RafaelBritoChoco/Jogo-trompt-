export type Exercise = {
  id: string;
  title: string;
  category: string;
  abc: string;
  composer?: string;
  difficulty?: 'Beginner' | 'Intermediate' | 'Advanced';
  dateAdded?: number;
};

export const EXERCISES: Exercise[] = [
  {
    id: 'ode_to_joy',
    title: 'Ode to Joy (Beethoven)',
    category: 'Músicas',
    abc: `X: 1
T: Ode to Joy (Trumpet in Bb)
M: 4/4
L: 1/4
K: C
E E F G | G F E D | C C D E | E>D D2 |
E E F G | G F E D | C C D E | D>C C2 |`
  },
  {
    id: 'greensleeves',
    title: 'Greensleeves (Folk)',
    category: 'Músicas',
    abc: `X: 1
T: Greensleeves
M: 6/8
L: 1/8
K: Am
A2 | c2 d e3/2 f/ e | d2 B G3/2 A/ B | c2 A A3/2 ^G/ A | B2 ^G E2 A |
c2 d e3/2 f/ e | d2 B G3/2 A/ B | c3/2 B/ A ^G3/2 ^F/ G | A2 A A3 |`
  },
  {
    id: 'swan_lake',
    title: 'Swan Lake Theme (Tchaikovsky)',
    category: 'Músicas Clássicas',
    abc: `X: 1
T: Swan Lake
M: 4/4
L: 1/8
K: Am
E2 | A4 B2 c2 | B6 GA | B2 e2 d2 c2 | B6 E2 |
A4 B2 c2 | B4 G2 A2 | F4 E4 | E6 :|`
  },
  {
    id: 'fly_me_to_the_moon',
    title: 'Fly Me to the Moon',
    category: 'Jazz Standards',
    abc: `X: 1
T: Fly Me to the Moon
M: 4/4
L: 1/4
K: C
c B A G | F G A c | B A G F | E2 E2 |
A G F E | D E F A | G F E D | C2 C2 |`
  },
  {
    id: 'amazing_grace',
    title: 'Amazing Grace',
    category: 'Músicas',
    abc: `X: 1
T: Amazing Grace
M: 3/4
L: 1/4
K: C
G | C2 (E/C/) | E2 D | C2 A, | G,2 G |
C2 (E/C/) | E2 D | G3 | G2 E |
G2 (G/E/) | G2 E | C2 G, | A,2 (C/A,/) |
G,2 G | C2 (E/C/) | E2 D | C3 |`
  },
  {
    id: 'the_godfather',
    title: 'The Godfather Theme',
    category: 'Cinema',
    abc: `X: 1
T: The Godfather Theme
M: 4/4
L: 1/8
K: Am
E | A c B A c A B A | F2 D2 E3 E |
A c B A c A B A | E2 C2 D3 E |
A c B A _B2 G2 | A4- A3 |`
  },
  {
    id: 'c_to_c',
    title: 'Dó a Dó (C4 - C5)',
    category: 'Treino Básico',
    abc: `X: 1
T: Dó a Dó
M: 4/4
L: 1/4
K: C
C D E F | G A B c | c B A G | F E D C |`
  },
  {
    id: 'c_major_scale',
    title: 'Escala de Dó Maior',
    category: 'Escalas',
    abc: `X: 1
T: Escala de Dó Maior
M: 4/4
L: 1/4
K: C
C D E F | G A B c | c B A G | F E D C |`
  },
  {
    id: 'a_minor_scale',
    title: 'Escala de Lá Menor',
    category: 'Escalas',
    abc: `X: 1
T: Escala de Lá Menor
M: 4/4
L: 1/4
K: Am
A, B, C D | E F G A | A G F E | D C B, A, |`
  },
  {
    id: 'g_major_scale',
    title: 'Escala de Sol Maior',
    category: 'Escalas',
    abc: `X: 1
T: Escala de Sol Maior
M: 4/4
L: 1/4
K: G
G, A, B, C | D E ^F G | G ^F E D | C B, A, G, |`
  },
  {
    id: 'c_g_c_intervals',
    title: 'Intervalos: Dó - Sol - Dó',
    category: 'Treino Básico',
    abc: `X: 1
T: Intervalos Dó-Sol-Dó
M: 4/4
L: 1/4
K: C
C2 G2 | c4 | c2 G2 | C4 |`
  },
  {
    id: 'c_major_arpeggio',
    title: 'Arpejo Dó Maior',
    category: 'Treino Básico',
    abc: `X: 1
T: Arpejo Dó Maior
M: 4/4
L: 1/4
K: C
C E G c | c G E C | C4 |`
  }
];
