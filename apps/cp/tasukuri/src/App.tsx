import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { isEntraConfigured } from './config';
import { extractFromMail, fetchOriginalMail, type Progress } from './extract';
import { completeSignIn, isReturningFromSignIn, type OriginalMail } from './graph';
import { sampleOriginalMail } from './sampleMails';
import {
  VIEWS,
  clearMailExtraction,
  loadMailExtraction,
  saveMailExtraction,
  dueLabel,
  filterTasks,
  isOverdue,
  loadSettings,
  originalMailIdOf,
  loadTasks,
  saveSettings,
  saveStatus,
  validateRunTime,
  type Status,
  type Task,
  type View,
} from './tasks';

/** メールからの抽出に使う部品（テストで差し替えられるようにする） */
export interface MailDeps {
  configured: () => boolean;
  returning: () => boolean;
  completeSignIn: () => Promise<boolean>;
  extract: typeof extractFromMail;
  /** 元のメールを1通読む（サインインのため移動するときは null） */
  original: (mailId: string) => Promise<OriginalMail | null>;
}

const defaultMailDeps: MailDeps = {
  configured: isEntraConfigured,
  returning: isReturningFromSignIn,
  completeSignIn,
  extract: extractFromMail,
  original: fetchOriginalMail,
};

const PENDING_KEY = 'cp-tasukuri.pendingDays';
/** 元のメールを見ようとしてサインインに移動したとき、どのタスクかを覚えておく */
const PENDING_MAIL_KEY = 'cp-tasukuri.pendingMail';

/** 元のメールの表示状態 */
type Viewing =
  | { task: Task; phase: 'loading' }
  | { task: Task; phase: 'ok'; mail: OriginalMail; sample: boolean }
  | { task: Task; phase: 'error'; message: string };

const removePending = (key: string) => {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // 何もしない
  }
};
const DAY_OPTIONS = [7, 14, 30] as const;

interface Props {
  /** テスト用に「今日」を固定できるようにする */
  today?: Date;
  mail?: MailDeps;
}

export default function App({ today: todayProp, mail = defaultMailDeps }: Props) {
  const today = useMemo(() => todayProp ?? new Date(), [todayProp]);
  const [tasks, setTasks] = useState<Task[]>(() => loadTasks(today));
  const [view, setView] = useState<View>('今日やる');
  const [extraction, setExtraction] = useState(loadMailExtraction);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [days, setDays] = useState<number>(30);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const started = useRef(false);

  async function openOriginal(task: Task) {
    const sample = sampleOriginalMail(task);
    const mailId = originalMailIdOf(task);
    if (!mailId) {
      setViewing(sample ? { task, phase: 'ok', mail: sample, sample: true } : { task, phase: 'error', message: '元のメールの情報がありません' });
      return;
    }
    setViewing({ task, phase: 'loading' });
    try {
      removePending(PENDING_KEY);
      sessionStorage.setItem(PENDING_MAIL_KEY, task.id);
    } catch {
      // 保存できなくても続ける
    }
    try {
      const found = await mail.original(mailId);
      if (!found) return; // サインインのため Microsoft の画面へ移動中
      removePending(PENDING_MAIL_KEY);
      setViewing((v) => (v?.task.id === task.id ? { task, phase: 'ok', mail: found, sample: false } : v));
    } catch (e) {
      removePending(PENDING_MAIL_KEY);
      const message = e instanceof Error ? e.message : String(e);
      setViewing((v) => (v?.task.id === task.id ? { task, phase: 'error', message } : v));
    }
  }

  async function runExtraction(d: number) {
    try {
      removePending(PENDING_MAIL_KEY);
      sessionStorage.setItem(PENDING_KEY, String(d));
    } catch {
      // 保存できなくても続ける
    }
    try {
      const result = await mail.extract(d, today, setProgress);
      if (!result) return; // サインインのため Microsoft の画面へ移動中
      sessionStorage.removeItem(PENDING_KEY);
      const x = { extractedAt: new Date().toISOString(), days: d, mails: result.mails, tasks: result.tasks };
      saveMailExtraction(x);
      setExtraction(x);
      setTasks(loadTasks(today));
      setView('今日やる');
    } catch (e) {
      sessionStorage.removeItem(PENDING_KEY);
      setProgress({ phase: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  }

  // サインインから戻ってきたら、続きを自動で実行する
  useEffect(() => {
    if (started.current || !mail.configured() || !mail.returning()) return;
    started.current = true;
    // 元のメールを見ようとしてサインインした場合は、そのメールを開き直す
    const pendingTask = sessionStorage.getItem(PENDING_MAIL_KEY);
    const task = pendingTask ? loadTasks(today).find((t) => t.id === pendingTask) : undefined;
    if (task) {
      setViewing({ task, phase: 'loading' });
      mail
        .completeSignIn()
        .then((ok) => {
          window.history.replaceState(null, '', window.location.pathname);
          if (ok) return openOriginal(task);
          removePending(PENDING_MAIL_KEY);
          setViewing({ task, phase: 'error', message: 'サインインできませんでした。もう一度お試しください' });
        })
        .catch((e: unknown) => {
          removePending(PENDING_MAIL_KEY);
          setViewing({ task, phase: 'error', message: e instanceof Error ? e.message : String(e) });
        });
      return;
    }
    removePending(PENDING_MAIL_KEY);
    const pending = Number(sessionStorage.getItem(PENDING_KEY) ?? '30') || 30;
    setDays(pending);
    setProgress({ phase: 'signing-in' });
    mail
      .completeSignIn()
      .then((ok) => {
        window.history.replaceState(null, '', window.location.pathname);
        if (ok) return runExtraction(pending);
        setProgress({ phase: 'error', message: 'サインインできませんでした。もう一度お試しください' });
      })
      .catch((e: unknown) => setProgress({ phase: 'error', message: e instanceof Error ? e.message : String(e) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function backToSample() {
    clearMailExtraction();
    setExtraction(null);
    setProgress(null);
    setTasks(loadTasks(today));
  }

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
        {extraction
          ? 'デモ：あなたの受信メールを AI が読み取った結果です。結果と完了の操作は、このブラウザ内にだけ保存されます'
          : 'デモ：サンプルデータを表示しています。完了の操作や設定は、このブラウザ内にだけ保存されます'}
      </p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>📋 タスクリ</h1>
        <p className="lead">{dateText}　今日やること {counts['今日やる']}件{overdue > 0 && `（うち期限切れ ${overdue}件）`}</p>
      </header>

      <main className="main">
        <MailCard
          configured={mail.configured()}
          extraction={extraction}
          progress={progress}
          days={days}
          onDays={setDays}
          onRun={() => runExtraction(days)}
          onSample={backToSample}
        />

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
            shown.map((t) => <TaskCard key={t.id} task={t} today={today} onStatus={setStatus} onOpenMail={openOriginal} />)
          )}
        </section>

        <SettingsCard />
      </main>

      {viewing && <MailViewer viewing={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function TaskCard(props: { task: Task; today: Date; onStatus: (id: string, s: Status) => void; onOpenMail: (t: Task) => void }) {
  const { task: t, today, onStatus, onOpenMail } = props;
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
        ✉️ {t.mailFrom}「{t.mailSubject}」{' '}
        <button type="button" className="link" onClick={() => onOpenMail(t)} aria-label={`元のメールを見る（${t.mailSubject}）`}>
          元のメールを見る
        </button>
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

function progressText(p: Progress): string {
  switch (p.phase) {
    case 'signing-in':
      return 'Microsoft 365 にサインインしています…';
    case 'reading':
      return '受信メールを読み込んでいます…';
    case 'extracting':
      return `AI がタスクを探しています…（${p.done} / ${p.total} 通）`;
    case 'done':
      return `完了：メール ${p.mails} 通から、タスクを ${p.tasks} 件見つけました`;
    case 'error':
      return p.message;
  }
}

function MailCard(props: {
  configured: boolean;
  extraction: ReturnType<typeof loadMailExtraction>;
  progress: Progress | null;
  days: number;
  onDays: (d: number) => void;
  onRun: () => void;
  onSample: () => void;
}) {
  const { configured, extraction, progress, days, onDays, onRun, onSample } = props;
  const busy = progress !== null && progress.phase !== 'done' && progress.phase !== 'error';
  return (
    <section className="card mailcard" aria-label="メールから抽出">
      <h2>📥 実際のメールから抽出</h2>
      {extraction ? (
        <p className="muted">
          {new Date(extraction.extractedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          に、過去{extraction.days}日のメール {extraction.mails} 通から {extraction.tasks.length} 件を抽出しました。
        </p>
      ) : (
        <p className="muted">
          Microsoft 365 にサインインし、受信トレイのメール（最大100通）を AI が読んでタスクを探します。
          メール本文は社内の Azure OpenAI に送られ、保存はされません。
        </p>
      )}
      {!configured && (
        <p className="error" role="alert">
          管理者の設定待ちです（Microsoft 365 へのサインインの設定がまだありません）
        </p>
      )}
      <div className="row">
        <label>
          期間
          <select value={days} onChange={(e) => onDays(Number(e.target.value))} disabled={busy}>
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>
                過去{d}日
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={onRun} disabled={!configured || busy}>
          {extraction ? 'もう一度抽出する' : 'メールを読み込んで抽出する'}
        </button>
        {extraction && (
          <button type="button" className="secondary" onClick={onSample} disabled={busy}>
            サンプルに戻す
          </button>
        )}
      </div>
      {progress && (
        <p className={progress.phase === 'error' ? 'error' : 'done'} role={progress.phase === 'error' ? 'alert' : 'status'}>
          {progressText(progress)}
        </p>
      )}
    </section>
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
        （デモ：自動実行はまだありません。上の「実際のメールから抽出」で手動で実行します）
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

/** 元のメールを、タスクリの画面の中に表示する（文字だけ。保存しない） */
function MailViewer({ viewing, onClose }: { viewing: Viewing; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<'' | 'ok' | 'ng'>('');

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const subject = viewing.phase === 'ok' ? viewing.mail.subject : viewing.task.mailSubject;

  async function copySubject() {
    try {
      await navigator.clipboard.writeText(subject);
      setCopied('ok');
    } catch {
      setCopied('ng');
    }
  }

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="viewer" role="dialog" aria-modal="true" aria-labelledby="viewer-title">
        <div className="viewer-head">
          <h2 id="viewer-title">✉️ 元のメール</h2>
          <button ref={closeRef} type="button" className="secondary" onClick={onClose}>
            閉じる
          </button>
        </div>

        {viewing.phase === 'loading' && (
          <p className="muted" role="status">
            メールを読み込んでいます…
          </p>
        )}
        {viewing.phase === 'error' && (
          <p className="error" role="alert">
            {viewing.message}
          </p>
        )}
        {viewing.phase === 'ok' && (
          <>
            {viewing.sample && <p className="viewer-note">サンプルのメールです（架空の内容）</p>}
            <h3 className="viewer-subject">{viewing.mail.subject}</h3>
            <dl className="viewer-meta">
              <dt>差出人</dt>
              <dd>{viewing.mail.from || '（不明）'}</dd>
              <dt>宛先</dt>
              <dd>{viewing.mail.to.join('、') || '（なし）'}</dd>
              {viewing.mail.cc.length > 0 && (
                <>
                  <dt>CC</dt>
                  <dd>{viewing.mail.cc.join('、')}</dd>
                </>
              )}
              <dt>受信日時</dt>
              <dd>{new Date(viewing.mail.receivedAt).toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })}</dd>
            </dl>
            {viewing.mail.hasAttachments && (
              <p className="viewer-attach">📎 添付ファイルがあります（添付は Outlook で件名を検索して開いてください）</p>
            )}
            <div className="viewer-body" aria-label="本文">
              {viewing.mail.body || '（本文なし）'}
            </div>
          </>
        )}

        <div className="viewer-actions">
          <button type="button" onClick={copySubject} disabled={viewing.phase === 'loading'}>
            件名をコピー
          </button>
          {copied === 'ok' && (
            <span className="done" role="status">
              コピーしました。Outlook の検索欄に貼り付けると、このメールが見つかります
            </span>
          )}
          {copied === 'ng' && (
            <span className="error" role="status">
              コピーできませんでした。件名を選択してコピーしてください
            </span>
          )}
        </div>
        <p className="muted small">メールはこの画面に表示するだけで、保存はしません。</p>
      </section>
    </div>
  );
}
