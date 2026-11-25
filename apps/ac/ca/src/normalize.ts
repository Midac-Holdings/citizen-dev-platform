// 取引先名・振込名義の照合用の正規化

const SMALL_KANA: Record<string, string> = {
  ァ: 'ア', ィ: 'イ', ゥ: 'ウ', ェ: 'エ', ォ: 'オ', ッ: 'ツ', ャ: 'ヤ', ュ: 'ユ', ョ: 'ヨ', ヮ: 'ワ', ヵ: 'カ', ヶ: 'ケ',
};

// 法人格（略称・カナ表記を含む）。長いものから順に取り除く。
const ENTITY_WORDS = [
  'カブシキガイシヤ', 'カブシキカイシヤ', 'ユウゲンガイシヤ', 'ユウゲンカイシヤ', 'ゴウドウガイシヤ', 'ゴウドウカイシヤ',
  'イツパンシヤダンホウジン', 'イツパンザイダンホウジン',
  '株式会社', '有限会社', '合同会社', '合資会社', '合名会社', '一般社団法人', '一般財団法人',
  '(株)', '(有)', '(同)', '(カ)', '(ユ)', '(ド)', 'カ)', 'ユ)', 'ド)', '(カ', '(ユ', '(ド',
  '㈱', '㈲',
];

/** 照合用のキー：全角半角・ひらがなカタカナ・小書き文字・法人格・記号・空白の違いをなくす。 */
export function nameKey(name: string): string {
  let s = name.normalize('NFKC').toUpperCase();
  s = s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)); // ひらがな→カタカナ
  s = s.replace(/[ァィゥェォッャュョヮヵヶ]/g, (c) => SMALL_KANA[c]);
  s = s.replace(/[\s　]/g, '');
  for (const w of ENTITY_WORDS) s = s.split(w).join('');
  return s.replace(/[()（）「」・.,，．、。\-ー－‐_/／'"]/g, '');
}

/** 振込名義と取引先名（またはカナ）が同じ相手を指していそうか。銀行の名義は途中で切れることがあるので前方一致も認める。 */
export function namesMatch(payer: string, ...names: (string | undefined)[]): boolean {
  const p = nameKey(payer);
  if (p.length < 2) return false;
  return names.some((n) => {
    if (!n) return false;
    const k = nameKey(n);
    if (k.length < 2) return false;
    return p === k || p.startsWith(k) || k.startsWith(p);
  });
}

/** 金額の文字列を整数（円）にする。読めなければ NaN。 */
export function parseAmount(v: string): number {
  const s = v.normalize('NFKC').replace(/[,¥\\円\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return NaN;
  return Math.round(Number(s));
}
