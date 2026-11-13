/**
 * タスクのデータと操作。
 *
 * いまはサンプルデータ（張りぼて）。項目は基盤の SharePoint リスト「TaskuriTasks」と同じにしてあるので、
 * 本番では loadTasks() の中身を AI担当が用意する部品（getMyTasks）に差し替えるだけで済む。
 * 完了・対象外の操作と設定は、このブラウザ内（localStorage）にだけ保存する。
 */

export const ACTION_TYPES = ['返信', '対応', '確認', '承認', '提出', '参加', 'その他'] as const;
export const PRIORITIES = ['高', '中', '低'] as const;
export const STATUSES = ['未着手', '完了', '対象外'] as const;

export type ActionType = (typeof ACTION_TYPES)[number];
export type Priority = (typeof PRIORITIES)[number];
export type Status = (typeof STATUSES)[number];

export interface Task {
  id: string;
  title: string;
  detail: string;
  actionType: ActionType;
  /** YYYY-MM-DD。期限なしは null */
  dueDate: string | null;
  priority: Priority;
  status: Status;
  /** 宛先上の立場（例: To（自分だけ）/ CC） */
  recipientRole: string;
  /** AIの判定（例: 自分への個別依頼） */
  interpretation: string;
  /** AIの判定理由 */
  reason: string;
  mailSubject: string;
  mailFrom: string;
  /** ISO 日時 */
  mailReceivedAt: string;
}

// ---------------------------------------------------------------- 日付

const pad = (n: number) => String(n).padStart(2, '0');

/** 端末の現地時刻での YYYY-MM-DD */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** 期限の表示（今日／明日／昨日／M月D日） */
export function dueLabel(dueDate: string | null, today: Date): string {
  if (!dueDate) return '期限なし';
  if (dueDate === toDateKey(today)) return '今日まで';
  if (dueDate === toDateKey(addDays(today, 1))) return '明日まで';
  if (dueDate === toDateKey(addDays(today, -1))) return '昨日まで（期限切れ）';
  const [, m, d] = dueDate.split('-').map(Number);
  return dueDate < toDateKey(today) ? `${m}月${d}日まで（期限切れ）` : `${m}月${d}日まで`;
}

export function isOverdue(t: Task, today: Date): boolean {
  return t.status === '未着手' && t.dueDate !== null && t.dueDate < toDateKey(today);
}

// ---------------------------------------------------------------- サンプルデータ

/** 今日を基準にしたサンプル。いつ開いても「今日やる」に何件か出るように相対日付で作る。 */
export function sampleTasks(today: Date): Task[] {
  const day = (n: number) => toDateKey(addDays(today, n));
  const at = (n: number, hh: number, mm: number) => {
    const d = addDays(today, n);
    d.setHours(hh, mm, 0, 0);
    return d.toISOString();
  };
  return [
    {
      id: 's1',
      title: 'A社への見積回答を送付する',
      detail: '先週依頼のあった産廃収集運搬の見積を、本日中にA社の担当者へメールで送る。',
      actionType: '返信',
      dueDate: day(0),
      priority: '高',
      status: '未着手',
      recipientRole: 'To（自分だけ）',
      interpretation: '自分への個別依頼',
      reason: '宛先が本人だけで、「本日中にご回答ください」と期限付きで依頼されているため。',
      mailSubject: '【至急】お見積りのご回答について',
      mailFrom: '営業部 佐藤',
      mailReceivedAt: at(-1, 17, 42),
    },
    {
      id: 's2',
      title: '出張申請を承認する',
      detail: '来週の名古屋出張（2名）の申請。CCだが本文で承認者として名指しされている。',
      actionType: '承認',
      dueDate: day(0),
      priority: '高',
      status: '未着手',
      recipientRole: 'CC',
      interpretation: '自分への個別依頼',
      reason: 'CCで受信しているが、本文で「山田さん、承認をお願いします」と本人に依頼しているため。',
      mailSubject: '出張申請（名古屋・2名）',
      mailFrom: '業務部 鈴木',
      mailReceivedAt: at(0, 8, 5),
    },
    {
      id: 's3',
      title: '不具合報告に回答する',
      detail: '議事郎で話者名が入れ替わる件。再現状況を確認して回答する。',
      actionType: '対応',
      dueDate: day(-1),
      priority: '高',
      status: '未着手',
      recipientRole: 'To（自分だけ）',
      interpretation: '自分への個別依頼',
      reason: '本人宛ての問い合わせで、昨日までの回答を求められているため。',
      mailSubject: '議事郎の話者名について',
      mailFrom: '総務G 田中',
      mailReceivedAt: at(-3, 10, 20),
    },
    {
      id: 's4',
      title: '来週の会議資料を確認する',
      detail: '部内会議の資料（第3四半期の実績）に目を通し、修正点があれば返信する。',
      actionType: '確認',
      dueDate: day(1),
      priority: '中',
      status: '未着手',
      recipientRole: 'To（複数宛て）',
      interpretation: '全員への依頼（同報）',
      reason: '複数宛てで「皆さん、事前にご確認ください」と全員に求めているため。',
      mailSubject: '部内会議資料の事前確認のお願い',
      mailFrom: '経営企画 高橋',
      mailReceivedAt: at(0, 7, 58),
    },
    {
      id: 's5',
      title: '安全衛生委員会の出欠を回答する',
      detail: 'フォームではなくメールへの返信で出欠を伝える。',
      actionType: '参加',
      dueDate: day(2),
      priority: '中',
      status: '未着手',
      recipientRole: 'BCC・グループ経由',
      interpretation: '全員への依頼（同報）',
      reason: '一斉配信だが、全員に出欠の回答を明確に求めているため。',
      mailSubject: '【ご回答ください】安全衛生委員会のご案内',
      mailFrom: '安全衛生事務局',
      mailReceivedAt: at(-1, 13, 0),
    },
    {
      id: 's6',
      title: '年末調整の書類を提出する',
      detail: '保険料控除申告書を記入して総務Gへ提出する。',
      actionType: '提出',
      dueDate: day(5),
      priority: '低',
      status: '未着手',
      recipientRole: 'BCC・グループ経由',
      interpretation: '全員への依頼（同報）',
      reason: '全社員への提出依頼で、期限まで1週間近くあるため優先度は低。',
      mailSubject: '年末調整書類の提出について',
      mailFrom: '総務G',
      mailReceivedAt: at(-2, 9, 0),
    },
    {
      id: 's7',
      title: 'AzureChatの利用者を追加する',
      detail: '新しく配属された2名のアカウントを追加する。',
      actionType: '対応',
      dueDate: null,
      priority: '中',
      status: '未着手',
      recipientRole: 'To（自分だけ）',
      interpretation: '自分への個別依頼',
      reason: '本人への作業依頼。期限の記載はない。',
      mailSubject: 'AzureChatのアカウント追加のお願い',
      mailFrom: '人事G 伊藤',
      mailReceivedAt: at(0, 8, 30),
    },
  ];
}

// ---------------------------------------------------------------- 一覧の絞り込み

export const VIEWS = ['今日やる', '未着手', '完了済み'] as const;
export type View = (typeof VIEWS)[number];

const PRIORITY_ORDER: Record<Priority, number> = { 高: 0, 中: 1, 低: 2 };

/** 期限切れ → 期限が近い順 → 優先度順（期限なしは最後） */
export function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const da = a.dueDate ?? '9999-12-31';
    const db = b.dueDate ?? '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  });
}

/**
 * 今日やる: 未着手で、期限が今日以前のもの＋期限なしで優先度「高・中」のもの
 */
export function filterTasks(tasks: Task[], view: View, today: Date): Task[] {
  const todayKey = toDateKey(today);
  const picked = tasks.filter((t) => {
    if (view === '完了済み') return t.status !== '未着手';
    if (t.status !== '未着手') return false;
    if (view === '未着手') return true;
    return t.dueDate !== null ? t.dueDate <= todayKey : t.priority !== '低';
  });
  return sortTasks(picked);
}

// ---------------------------------------------------------------- 保存（このブラウザ内のみ）

const STATUS_KEY = 'ai-taskuri.status';
const SETTINGS_KEY = 'ai-taskuri.settings';

type StatusMap = Record<string, Status>;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境（プライベートモード等）では画面上だけで保持する
  }
}

/** タスクを読み込む（いまはサンプル＋このブラウザで変えた状態） */
export function loadTasks(today: Date): Task[] {
  const saved = readJson<StatusMap>(STATUS_KEY, {});
  return sampleTasks(today).map((t) => {
    const s = saved[t.id];
    return s && (STATUSES as readonly string[]).includes(s) ? { ...t, status: s } : t;
  });
}

export function saveStatus(tasks: Task[]): void {
  const map: StatusMap = {};
  for (const t of tasks) if (t.status !== '未着手') map[t.id] = t.status;
  writeJson(STATUS_KEY, map);
}

export interface Settings {
  /** 毎朝の実行時刻 HH:MM */
  runTime: string;
  weekdaysOnly: boolean;
}

export const DEFAULT_SETTINGS: Settings = { runTime: '07:30', weekdaysOnly: true };

export function loadSettings(): Settings {
  const s = readJson<Partial<Settings>>(SETTINGS_KEY, {});
  return {
    runTime: typeof s.runTime === 'string' && /^\d{2}:\d{2}$/.test(s.runTime) ? s.runTime : DEFAULT_SETTINGS.runTime,
    weekdaysOnly: typeof s.weekdaysOnly === 'boolean' ? s.weekdaysOnly : DEFAULT_SETTINGS.weekdaysOnly,
  };
}

export function saveSettings(s: Settings): void {
  writeJson(SETTINGS_KEY, s);
}

/** 実行時刻の入力チェック（基盤は15分おきに確認するので、15分単位を推奨） */
export function validateRunTime(value: string): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(value);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return '時刻を「07:30」の形で入力してください';
  return null;
}
