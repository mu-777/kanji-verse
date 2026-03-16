// Hepburn romanization for hiragana/katakana

const DIGRAPHS: Record<string, string> = {
  'きゃ':'kya', 'きゅ':'kyu', 'きょ':'kyo',
  'しゃ':'sha', 'しゅ':'shu', 'しょ':'sho',
  'ちゃ':'cha', 'ちゅ':'chu', 'ちょ':'cho',
  'にゃ':'nya', 'にゅ':'nyu', 'にょ':'nyo',
  'ひゃ':'hya', 'ひゅ':'hyu', 'ひょ':'hyo',
  'みゃ':'mya', 'みゅ':'myu', 'みょ':'myo',
  'りゃ':'rya', 'りゅ':'ryu', 'りょ':'ryo',
  'ぎゃ':'gya', 'ぎゅ':'gyu', 'ぎょ':'gyo',
  'じゃ':'ja',  'じゅ':'ju',  'じょ':'jo',
  'ぢゃ':'ja',  'ぢゅ':'ju',  'ぢょ':'jo',
  'びゃ':'bya', 'びゅ':'byu', 'びょ':'byo',
  'ぴゃ':'pya', 'ぴゅ':'pyu', 'ぴょ':'pyo',
};

const MONOGRAPHS: Record<string, string> = {
  'あ':'a',  'い':'i',  'う':'u',  'え':'e',  'お':'o',
  'か':'ka', 'き':'ki', 'く':'ku', 'け':'ke', 'こ':'ko',
  'さ':'sa', 'し':'shi','す':'su', 'せ':'se', 'そ':'so',
  'た':'ta', 'ち':'chi','つ':'tsu','て':'te', 'と':'to',
  'な':'na', 'に':'ni', 'ぬ':'nu', 'ね':'ne', 'の':'no',
  'は':'ha', 'ひ':'hi', 'ふ':'fu', 'へ':'he', 'ほ':'ho',
  'ま':'ma', 'み':'mi', 'む':'mu', 'め':'me', 'も':'mo',
  'や':'ya', 'ゆ':'yu', 'よ':'yo',
  'ら':'ra', 'り':'ri', 'る':'ru', 'れ':'re', 'ろ':'ro',
  'わ':'wa', 'ゐ':'i',  'ゑ':'e',  'を':'o',
  'ん':'n',
  'が':'ga', 'ぎ':'gi', 'ぐ':'gu', 'げ':'ge', 'ご':'go',
  'ざ':'za', 'じ':'ji', 'ず':'zu', 'ぜ':'ze', 'ぞ':'zo',
  'だ':'da', 'ぢ':'ji', 'づ':'zu', 'で':'de', 'ど':'do',
  'ば':'ba', 'び':'bi', 'ぶ':'bu', 'べ':'be', 'ぼ':'bo',
  'ぱ':'pa', 'ぴ':'pi', 'ぷ':'pu', 'ぺ':'pe', 'ぽ':'po',
  'ゔ':'vu',
};

const LONG_VOWEL: Record<string, string> = {
  'a':'aa', 'i':'ii', 'u':'uu', 'e':'ee', 'o':'oo',
};

function kataToHira(str: string): string {
  return str.replace(/[\u30A1-\u30F6]/g, (c) =>
    String.fromCharCode(c.charCodeAt(0) - 0x60)
  );
}

export function toRomaji(kana: string): string {
  // Strip okurigana separator (e.g. "あか.るい" → "あかるい")
  const hira = kataToHira(kana.replace(/\./g, ''));
  let result = '';
  let i = 0;

  while (i < hira.length) {
    const ch = hira[i];

    // Long vowel mark ー
    if (ch === '\u30FC' || ch === 'ー') {
      const lastVowel = result.slice(-1);
      result += LONG_VOWEL[lastVowel] ? lastVowel : '-';
      i++; continue;
    }

    // Small tsu っ — double the first consonant of next syllable
    if (ch === 'っ') {
      const next = DIGRAPHS[hira.slice(i + 1, i + 3)] ?? MONOGRAPHS[hira[i + 1]] ?? '';
      result += next[0] ?? '';
      i++; continue;
    }

    // Digraph (e.g. きゃ)
    const di = DIGRAPHS[hira.slice(i, i + 2)];
    if (di) { result += di; i += 2; continue; }

    // Monograph
    const mo = MONOGRAPHS[ch];
    if (mo) { result += mo; i++; continue; }

    // Unknown — pass through
    result += ch;
    i++;
  }

  return result;
}
