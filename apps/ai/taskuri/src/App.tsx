import { useMemo, useState, type FormEvent } from 'react';
import {
  VIEWS,
  dueLabel,
  filterTasks,
  isOverdue,
  loadSettings,
  loadTasks,
  saveSettings,
  saveStatus,
  validateRunTime,
  type Status,
  type Task,
  type View,
} from './tasks';

interface Props {
  /** テスト用に「今日」を固定できるようにする */
  today?: Date;
}

export default function App({ today: todayProp }: Props) {
  const today = useMemo(() => todayProp ?? new Date(), [todayProp]);
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(today));
  const [view, setView] = useState<View>('今日やる');

  const shown = filterTasks(tasks, view, today);
  const counts = {
    今日やる: filterTasks(tasks, '今日やる', today).length,
    未着手: filterTasks(tasks, '未着手', today).length,
    完了済み: filterTasks(tasks, '完了済み', today).length,
  } satisfies Record<View, number>;
  const overdue = tasks.filter((t) => isOverdue(t, today)).length;

  function setStatus(id: string, status: Status) {
    const next = tasks.map((t) => (t.id === id ? { ...t, status } : t));
    setTasks(next);
    saveStatus(next);
  }

  const dateText = today.toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });

  return (
    <div className="page">
      <p className="notice" role="note">
        デモ：サンプルデータを表示しています。完了の操作や設定は、このブラウザ内にだけ保存されます
      </p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>📋 タスクリ</h1>
        <p className="lead">{dateText}　今日やること {counts['今日やる']}件{overdue > 0 && `（うち期限切れ ${overdue}件）`}</p>
      </header>

      <main className="main">
        <nav className="tabs" aria-label="表示の切り替え">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              className={v === view ? 'tab active' : 'tab'}
              aria-pressed={v === view}
              onClick={() => setView(v)}
            >
              {v}
              <span className="count">{counts[v]}</span>
            </button>
          ))}
        </nav>

        <section aria-label={`${view}の一覧`} className="list">
          {shown.length === 0 ? (
            <p className="empty">
              {view === '今日やる' ? '🎉 今日やるタスクはありません' : 'タスクはありません'}
            </p>
          ) : (
            shown.map((t) => <TaskCard key={t.id} task={t} today={today} onStatus={setStatus} />)
          )}
        </section>

        <SettingsCard />
      </main>
    </div>
  );
}

function TaskCard({ task: t, today, onStatus }: { task: Task; today: Date; onStatus: (id: string, s: Status) => void }) {
  const overdue = isOverdue(t, today);
  const closed = t.status !== '未着手';
  return (
    <article className={`task${closed ? ' closed' : ''}`} aria-label={t.title}>
      <div className="task-head">
        <span className={`badge p-${t.priority}`}>優先度 {t.priority}</span>
        <span className="chip">{t.actionType}</span>
        <span className={`due${overdue ? ' overdue' : ''}`}>{dueLabel(t.dueDate, today)}</span>
        {closed && <span className="chip state">{t.status}</span>}
      </div>
      <h2 className="task-title">{t.title}</h2>
      <p className="detail">{t.detail}</p>
      <p className="mail">
        ✉️ {t.mailFrom}「{t.mailSubject}」
      </p>
      <details className="why">
        <summary>
          AIの判断：{t.interpretation}（{t.recipientRole}）
        </summary>
        <p>{t.reason}</p>
      </details>
      <div className="actions">
        {closed ? (
          <button type="button" className="secondary" onClick={() => onStatus(t.id, '未着手')}>
            未着手に戻す
          </button>
        ) : (
          <>
            <button type="button" onClick={() => onStatus(t.id, '完了')}>
              ✓ 完了
            </button>
            <button type="button" className="secondary" onClick={() => onStatus(t.id, '対象外')}>
              対象外にする
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function SettingsCard() {
  const [settings, setSettings] = useState(loadSettings);
  const [runTime, setRunTime] = useState(settings.runTime);
  const [weekdaysOnly, setWeekdaysOnly] = useState(settings.weekdaysOnly);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const message = validateRunTime(runTime);
    setError(message);
    setSaved(false);
    if (message) return;
    const next = { runTime, weekdaysOnly };
    saveSettings(next);
    setSettings(next);
    setSaved(true);
  }

  return (
    <form className="card settings" onSubmit={submit} noValidate aria-label="設定">
      <h2>⚙️ 設定</h2>
      <p className="muted">
        毎朝 {settings.runTime} ごろ（{settings.weekdaysOnly ? '平日のみ' : '毎日'}）に、受信メールからタスクを作ります。
      </p>
      <label>
        実行時刻
        <input
          type="time"
          step={900}
          value={runTime}
          onChange={(e) => {
            setRunTime(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={weekdaysOnly}
          onChange={(e) => {
            setWeekdaysOnly(e.target.checked);
            setSaved(false);
          }}
        />
        平日のみ実行する
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {saved && <p className="done" role="status">保存しました（デモ：このブラウザ内のみ）</p>}
      <button type="submit">保存する</button>
    </form>
  );
}
