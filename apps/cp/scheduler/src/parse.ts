// チャットの文章から、予約の日付・時間・会議室・用件を読み取る。
// AI は使わず、決まったルールで読み取る（例：「明日14時から1時間 会議室A 定例会議」）。

export type ParseResult = {
  date?: string; // YYYY-MM-DD
  start?: string; // HH:MM
  end?: string; // HH:MM
  room?: string;
  title?: string;
  missing: Array<'date' | 'start' | 'end' | 'room'>;
};

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateString = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toTimeString = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export const toMinutes = (time: string) => {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

/** 全角の数字・記号を半角にそろえる */
export function normalize(text: string): string {
  return text
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/：/g, ':')
    .replace(/／/g, '/')
    .replace(/[～〜]/g, '~')
    .replace(/－/g, '-')
    .replace(/　/g, ' ');
}

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function addDays(base: Date, days: number) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

function parseDate(text: string, now: Date): { date?: string; rest: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const relative: Array<[RegExp, number]> = [
    [/明々後日|しあさって/, 3],
    [/明後日|あさって/, 2],
    [/明日|あした|あす/, 1],
    [/今日|きょう|本日/, 0],
  ];
  for (const [re, days] of relative) {
    if (re.test(text)) return { date: toDateString(addDays(today, days)), rest: text.replace(re, ' ') };
  }

  // 2026/11/25、2026-11-25、2026年11月25日
  let m = text.match(/(\d{4})\s*[/\-年]\s*(\d{1,2})\s*[/\-月]\s*(\d{1,2})\s*日?/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getMonth() === Number(m[2]) - 1) return { date: toDateString(d), rest: text.replace(m[0], ' ') };
  }
  // 11/25、11月25日（年がなければ、過ぎた日付は来年とみなす）
  m = text.match(/(\d{1,2})\s*(?:\/|月)\s*(\d{1,2})\s*日?/);
  if (m) {
    const month = Number(m[1]) - 1;
    let d = new Date(today.getFullYear(), month, Number(m[2]));
    if (d.getMonth() === month) {
      if (d < today) d = new Date(today.getFullYear() + 1, month, Number(m[2]));
      return { date: toDateString(d), rest: text.replace(m[0], ' ') };
    }
  }
  // 25日
  m = text.match(/(?<![\d時:])(\d{1,2})\s*日(?!間)/);
  if (m) {
    const day = Number(m[1]);
    let d = new Date(today.getFullYear(), today.getMonth(), day);
    if (d.getDate() === day) {
      if (d < today) d = new Date(today.getFullYear(), today.getMonth() + 1, day);
      if (d.getDate() === day) return { date: toDateString(d), rest: text.replace(m[0], ' ') };
    }
  }
  // 来週の水曜、再来週金曜日、水曜日
  m = text.match(/(再来週|来週|今週)?\s*の?\s*([日月火水木金土])曜日?/);
  if (m) {
    const target = WEEKDAYS.indexOf(m[2]);
    const current = today.getDay();
    let diff: number;
    if (m[1] === '来週' || m[1] === '再来週' || m[1] === '今週') {
      // 週は月曜はじまりとして数える
      const mondayOffset = (current + 6) % 7;
      const weeks = m[1] === '再来週' ? 2 : m[1] === '来週' ? 1 : 0;
      diff = -mondayOffset + weeks * 7 + ((target + 6) % 7);
    } else {
      diff = (target - current + 7) % 7; // 今日と同じ曜日なら今日
    }
    return { date: toDateString(addDays(today, diff)), rest: text.replace(m[0], ' ') };
  }
  return { rest: text };
}

// 時刻：14時、14時半、14時30分、14:30、午後2時
const TIME = String.raw`(午前|午後)?\s*(\d{1,2})\s*(?:時(?!間)\s*(半|(\d{1,2})\s*分)?|:(\d{2}))`;

function timeToMinutes(m: RegExpMatchArray, offset = 0): number | undefined {
  const ampm = m[offset + 1];
  let h = Number(m[offset + 2]);
  const min = m[offset + 3] === '半' ? 30 : Number(m[offset + 4] ?? m[offset + 5] ?? 0);
  if (ampm === '午後' && h < 12) h += 12;
  if (ampm === '午前' && h === 12) h = 0;
  // 「1時〜6時」のような書き方は午後とみなす（会議室の利用時間帯）
  if (!ampm && h >= 1 && h <= 6) h += 12;
  if (h > 23 || min > 59) return undefined;
  return h * 60 + min;
}

function parseTime(text: string): { start?: number; end?: number; rest: string } {
  // 14時~15時、14:00-15:30、14時から15時まで
  const range = new RegExp(`${TIME}\\s*(?:~|-|から)\\s*${TIME}\\s*(?:まで)?`);
  let m = text.match(range);
  if (m) {
    const start = timeToMinutes(m, 0);
    let end = timeToMinutes(m, 5);
    if (start !== undefined && end !== undefined && end <= start && end + 12 * 60 < 24 * 60 && !m[6]) end += 12 * 60;
    return { start, end, rest: text.replace(m[0], ' ') };
  }
  m = text.match(new RegExp(TIME));
  if (!m) return { rest: text };
  const start = timeToMinutes(m, 0);
  let rest = text.replace(m[0], ' ');
  // 1時間、1時間半、90分、2時間30分
  const dur = rest.match(/(?:から)?\s*(?:(\d+(?:\.\d+)?)\s*時間\s*(半)?\s*(?:(\d+)\s*分)?|(\d+)\s*分)(?:間)?/);
  let end: number | undefined;
  if (dur && start !== undefined) {
    const minutes = dur[4] !== undefined
      ? Number(dur[4])
      : Math.round(Number(dur[1]) * 60) + (dur[2] ? 30 : 0) + Number(dur[3] ?? 0);
    if (minutes > 0) end = start + minutes;
    rest = rest.replace(dur[0], ' ');
  }
  rest = rest.replace(/^\s*から/, ' ');
  return { start, end, rest };
}

function findRoom(text: string, rooms: string[]): { room?: string; rest: string } {
  const norm = (s: string) => normalize(s).replace(/\s/g, '').toLowerCase();
  const target = norm(text);
  // 長い名前から順に探す（「会議室A」と「会議室AB」を取り違えない）
  const sorted = [...rooms].sort((a, b) => b.length - a.length);
  for (const room of sorted) {
    if (target.includes(norm(room))) {
      const escaped = room.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
      return { room, rest: text.replace(new RegExp(escaped, 'i'), ' ') };
    }
  }
  return { rest: text };
}

function cleanTitle(text: string): string | undefined {
  const quoted = text.match(/[「『"](.+?)[」』"]/);
  if (quoted) return quoted[1].trim();
  const t = text
    .replace(/(を|で|に|の)?\s*(予約|おさえ|押さえ|確保)(して|したい|する|お願い|ください|下さい|をお願いします|お願いします)*[。.!！]*/g, ' ')
    .replace(/(用件|件名|内容|目的)\s*[:は]?/g, ' ')
    .replace(/[、,。]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(で|に|の|を|は)\s*/, '')
    .replace(/\s*(で|に|の|を|は)$/, '')
    .trim();
  return t || undefined;
}

export function parseRequest(input: string, rooms: string[], now: Date = new Date()): ParseResult {
  const text = normalize(input);
  const r1 = findRoom(text, rooms);
  const r2 = parseDate(r1.rest, now);
  const r3 = parseTime(r2.rest);
  const result: ParseResult = {
    date: r2.date,
    start: r3.start !== undefined ? toTimeString(r3.start) : undefined,
    end: r3.end !== undefined && r3.end <= 24 * 60 ? toTimeString(Math.min(r3.end, 24 * 60 - 1)) : undefined,
    room: r1.room,
    title: cleanTitle(r3.rest),
    missing: [],
  };
  if (!result.date) result.missing.push('date');
  if (!result.start) result.missing.push('start');
  if (!result.end) result.missing.push('end');
  if (!result.room) result.missing.push('room');
  return result;
}

/** 前の内容に、あとから送られた内容を足す（足りない項目を聞き返したとき用） */
export function mergeResult(prev: ParseResult, next: ParseResult): ParseResult {
  const merged: ParseResult = {
    date: next.date ?? prev.date,
    start: next.start ?? prev.start,
    end: next.end ?? prev.end,
    room: next.room ?? prev.room,
    title: prev.title ?? next.title,
    missing: [],
  };
  // 開始だけ変わって終了が前のままで逆転したら、終了は聞き直す
  if (merged.start && merged.end && toMinutes(merged.end) <= toMinutes(merged.start)) merged.end = undefined;
  if (!merged.date) merged.missing.push('date');
  if (!merged.start) merged.missing.push('start');
  if (!merged.end) merged.missing.push('end');
  if (!merged.room) merged.missing.push('room');
  return merged;
}
