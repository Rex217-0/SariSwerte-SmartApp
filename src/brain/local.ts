/**
 * INDAY's fallback brain.
 *
 * SeaLLM on Kaggle is the real brain, but a tunnel can be cold, sleeping, or
 * not configured at all. When that happens INDAY must still answer and still
 * speak, otherwise she looks broken rather than offline. This module answers
 * from the operator's own Convai story blocks so the persona stays intact.
 *
 * It never invents prices: the store has no price list in the app, and the
 * SeaLLM prompt forbids it too. Price questions get a straight "I'll check"
 * instead of a made-up number.
 */

export interface LocalReply {
  text: string;
  /** Which story block the answer came from, for the HUD. */
  block: number;
}

const STOCK = ['Century Tuna', 'Lucky Me', 'Piattos', 'Nova', 'Skyflakes', 'Coke', 'Sprite'];

const has = (t: string, ...words: string[]) => words.some((w) => t.includes(w));

/** Every answer is at most two short sentences, per the story blocks. */
export function answerLocally(message: string, blockNumber: number): LocalReply {
  const t = message.toLowerCase();

  // Safety first: the story blocks escalate threats before anything else.
  if (has(t, 'sunog', 'holdap', 'baril', 'saksak', 'away', 'lasing', 'banta', 'bully'))
    return { block: 10, text: 'Ingat po kayo. Tumawag agad tayo ng barangay o 911, huwag na po natin harapin.' };

  // Money owed / credit, which is block 5's territory.
  if (has(t, 'utang', 'lista', 'pautang', 'bayad', 'gcash', 'maya', 'load'))
    return { block: 5, text: 'Puwede po tayong maglista, basta isulat ko lang sa notebook. Magkano po ang gusto ninyong i-load o ipautang?' };

  // Name the item before talking about price, so "magkano ang bigas" answers
  // about rice instead of a generic "which item?".
  const wantsPrice = has(t, 'magkano', 'presyo', 'halaga', 'magkanu');
  const item =
    STOCK.find((s) => t.includes(s.toLowerCase())) ??
    (has(t, 'bigas', 'rice') ? '5kg Sinandomeng na bigas' : undefined) ??
    (has(t, 'itlog', 'egg') ? 'itlog' : undefined) ??
    (has(t, 'tinapay', 'pandesal') ? 'pandesal' : undefined);

  if (item) {
    if (wantsPrice)
      return { block: 3, text: `Meron po tayong ${item}, pero sa listahan ko lang nakasulat ang presyo para hindi ako magkamali. Titingnan ko po agad para sa inyo.` };
    return { block: 3, text: `Meron po tayong ${item}, bagong dating. Ilan po ang kukunin ninyo?` };
  }

  if (wantsPrice)
    return { block: 3, text: 'Titingnan ko po ang presyo sa listahan ko para sigurado, huwag lang ako mag-imbento ng halaga. Ano pong item ang kukunin ninyo?' };

  if (has(t, 'salamat', 'thank'))
    return { block: 2, text: 'Walang anuman po! Bumalik kayo agad, nandito lang si INDAY.' };
  if (has(t, 'kumusta', 'musta', 'hello', 'hi ', 'hoy'))
    return { block: 1, text: 'Ayos lang po ako, mainit lang ang panahon ngayon! Ano pong kailangan ninyo?' };

  return { block: blockNumber, text: 'Naririnig po kita, pero offline ang utak ko ngayon. Sabihin lang po ang kailangan at i-check ko sa listahan.' };
}
