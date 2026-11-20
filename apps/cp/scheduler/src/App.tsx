import { type FormEvent, useEffect, useRef, useState } from 'react';
import { mergeResult, parseRequest, type ParseResult, toDateString, toMinutes } from './parse';
import {
  findConflicts,
  loadReservations,
  loadRooms,
  newId,
  type Reservation,
  saveReservations,
  saveRooms,
  sortReservations,
  toCsv,
} from './reservations';

type Message = { id: number; from: 'user' | 'bot'; text: string };

const LABELS: Record<ParseResult['missing'][number], string> = {
  date: '日付',
  start: '開始時刻',
  end: '終了時刻（または「1時間」などの長さ）',
  room: '会議室',
};

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];
export function formatDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  return `${m}/${d}（${WEEK[new Date(y, m - 1, d).getDay()]}）`;
}

const describe = (r: Pick<Reservation, 'date' | 'start' | 'end' | 'room' | 'title'>) =>
  `${formatDate(r.date)} ${r.start}〜${r.end}　${r.room}${r.title ? `　「${r.title}」` : ''}`;

const CANCEL_WORDS = /^(やめる|やめます|キャンセル|中止|取り消し)$/;

export default function App({ now }: { now?: () => Date } = {}) {
  const getNow = now ?? (() => new Date());
  const [rooms, setRooms] = useState<string[]>(loadRooms);
  const [reservations, setReservations] = useState<Reservation[]>(loadReservations);
  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: 0,
      from: 'bot',
      text: '会議室の予約をお手伝いします。「明日14時から1時間 会議室A 定例会議」のように送ってください。',
    },
  ]);
  const [draft, setDraft] = useState<ParseResult | null>(null);
  const [confirming, setConfirming] = useState<Reservation | null>(null);
  const [input, setInput] = useState('');
  const [newRoom, setNewRoom] = useState('');
  const nextId = useRef(1);
  const logEnd = useRef<HTMLDivElement>(null);

  useEffect(() => saveReservations(reservations), [reservations]);
  useEffect(() => saveRooms(rooms), [rooms]);
  useEffect(() => logEnd.current?.scrollIntoView?.({ block: 'end' }), [messages]);

  const say = (...items: Array<Omit<Message, 'id'>>) =>
    setMessages((prev) => [...prev, ...items.map((m) => ({ ...m, id: nextId.current++ }))]);

  function handleSend(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    const user = { from: 'user' as const, text };

    if (CANCEL_WORDS.test(text)) {
      setDraft(null);
      setConfirming(null);
      say(user, { from: 'bot', text: 'わかりました。予約は取りやめました。' });
      return;
    }

    const parsed = parseRequest(text, rooms, getNow());
    const result = draft ? mergeResult(draft, parsed) : parsed;
    setConfirming(null);

    if (result.missing.length) {
      setDraft(result);
      const known = [
        result.date && formatDate(result.date),
        result.start && `${result.start}〜${result.end ?? ''}`,
        result.room,
      ].filter(Boolean);
      say(user, {
        from: 'bot',
        text:
          (known.length ? `「${known.join(' ')}」ですね。` : '') +
          `${result.missing.map((k) => LABELS[k]).join('・')}を教えてください。` +
          (result.missing.includes('room') ? `（会議室：${rooms.join('、')}）` : ''),
      });
      return;
    }

    const { date, start, end, room } = result as Required<ParseResult>;
    if (toMinutes(end) <= toMinutes(start)) {
      setDraft({ ...result, end: undefined, missing: ['end'] });
      say(user, { from: 'bot', text: '終了時刻が開始時刻より前になっています。終了時刻を教えてください。' });
      return;
    }
    if (date < toDateString(getNow())) {
      setDraft({ ...result, date: undefined, missing: ['date'] });
      say(user, { from: 'bot', text: '過去の日付は予約できません。日付を教えてください。' });
      return;
    }
    const conflicts = findConflicts(reservations, { date, start, end, room });
    if (conflicts.length) {
      setDraft({ ...result, start: undefined, end: undefined, missing: ['start', 'end'] });
      say(user, {
        from: 'bot',
        text: `${room} は ${conflicts.map((c) => `${c.start}〜${c.end}`).join('、')} に予約が入っています。別の時間を教えてください（やめる場合は「やめる」）。`,
      });
      return;
    }
    const candidate: Reservation = {
      id: newId(),
      date,
      start,
      end,
      room,
      title: result.title ?? '',
      createdAt: getNow().toISOString(),
    };
    setDraft(null);
    setConfirming(candidate);
    say(user, { from: 'bot', text: `${describe(candidate)} で予約しますか？` });
  }

  function confirm() {
    if (!confirming) return;
    setReservations((prev) => sortReservations([...prev, confirming]));
    say({ from: 'bot', text: `予約しました：${describe(confirming)}` });
    setConfirming(null);
  }

  function cancelConfirm() {
    setConfirming(null);
    say({ from: 'bot', text: 'わかりました。予約は取りやめました。' });
  }

  function remove(id: string) {
    setReservations((prev) => prev.filter((r) => r.id !== id));
  }

  const today = toDateString(getNow());
  const upcoming = reservations.filter((r) => r.date >= today);

  function downloadCsv() {
    const blob = new Blob([toCsv(upcoming)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `会議室予約_${today.replace(/-/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function addRoom(e: FormEvent) {
    e.preventDefault();
    const name = newRoom.trim();
    if (!name || rooms.includes(name)) return;
    setRooms([...rooms, name]);
    setNewRoom('');
  }

  return (
    <div className="page">
      <p className="notice">予約はこのブラウザ内（localStorage）にだけ保存されます。DeskNet's へは CSV を出力して取り込んでください。</p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>🗓️ 会議室予約</h1>
      </header>
      <main className="main">
        <section className="card chat" aria-label="チャット">
          <h2>チャットで予約</h2>
          <div className="log" role="log" aria-live="polite">
            {messages.map((m) => (
              <p key={m.id} className={`bubble ${m.from}`}>
                {m.text}
              </p>
            ))}
            {confirming && (
              <div className="actions">
                <button type="button" onClick={confirm}>予約する</button>
                <button type="button" className="secondary" onClick={cancelConfirm}>やめる</button>
              </div>
            )}
            <div ref={logEnd} />
          </div>
          <form className="send" onSubmit={handleSend}>
            <input
              aria-label="メッセージ"
              placeholder="例：明日14時から1時間 会議室A 定例会議"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit">送信</button>
          </form>
        </section>

        <section className="card" aria-label="予約一覧">
          <h2>これからの予約</h2>
          {upcoming.length === 0 ? (
            <p className="muted">予約はまだありません。</p>
          ) : (
            <ul className="list">
              {upcoming.map((r) => (
                <li key={r.id}>
                  <span>{describe(r)}</span>
                  <button type="button" className="secondary small" onClick={() => remove(r.id)} aria-label={`${describe(r)} を削除`}>
                    削除
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={downloadCsv} disabled={upcoming.length === 0}>
            DeskNet's 取り込み用 CSV をダウンロード
          </button>
          <p className="muted small-text">
            DeskNet's のスケジュール（設備予約）の CSV 取り込み画面で、このファイルを読み込んでください。列の対応は取り込み画面で合わせます。
          </p>
        </section>

        <section className="card" aria-label="会議室の設定">
          <h2>会議室の設定</h2>
          <ul className="list">
            {rooms.map((room) => (
              <li key={room}>
                <span>{room}</span>
                <button
                  type="button"
                  className="secondary small"
                  onClick={() => setRooms(rooms.filter((x) => x !== room))}
                  disabled={rooms.length <= 1}
                  aria-label={`${room} を削除`}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
          <form className="send" onSubmit={addRoom}>
            <input aria-label="追加する会議室" placeholder="例：会議室C" value={newRoom} onChange={(e) => setNewRoom(e.target.value)} />
            <button type="submit">追加</button>
          </form>
          <p className="muted small-text">会議室の名前は DeskNet's の設備名と同じにしておくと、取り込みが楽になります。</p>
        </section>
      </main>
    </div>
  );
}
