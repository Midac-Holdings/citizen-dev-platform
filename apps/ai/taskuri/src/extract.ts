/**
 * 実際のメールからタスクを作る流れ：
 *   1. Microsoft 365 にサインイン（必要なときだけ Microsoft の画面へ移動）
 *   2. 受信メールを Microsoft Graph で取得（このブラウザ内）
 *   3. 5通ずつ基盤の API（/api/ai-taskuri/extract → 社内の Azure OpenAI）に送って、タスクを受け取る
 */
import { MAILS_PER_REQUEST, MAX_MAILS } from './config';
import { getGraphToken, getMe, listInboxMails, type MailForAi } from './graph';
import { toDateKey, type Task } from './tasks';

export type Progress =
  | { phase: 'signing-in' }
  | { phase: 'reading' }
  | { phase: 'extracting'; done: number; total: number }
  | { phase: 'done'; mails: number; tasks: number }
  | { phase: 'error'; message: string };

export interface ApiTask {
  mailId: string;
  title: string;
  detail: string;
  actionType: Task['actionType'];
  dueDate: string | null;
  priority: Task['priority'];
  recipientRole: string;
  interpretation: string;
  reason: string;
}

/** API の結果と元メールを合わせて、画面のタスクにする */
export function toTasks(apiTasks: ApiTask[], mails: MailForAi[]): Task[] {
  const byId = new Map(mails.map((m) => [m.id, m]));
  const seen = new Map<string, number>();
  return apiTasks.flatMap((t) => {
    const mail = byId.get(t.mailId);
    if (!mail) return [];
    const n = (seen.get(t.mailId) ?? 0) + 1;
    seen.set(t.mailId, n);
    return [
      {
        id: `${t.mailId}#${n}`,
        title: t.title,
        detail: t.detail,
        actionType: t.actionType,
        dueDate: t.dueDate,
        priority: t.priority,
        status: '未着手' as const,
        recipientRole: t.recipientRole,
        interpretation: t.interpretation,
        reason: t.reason,
        mailSubject: mail.subject,
        mailFrom: mail.from.replace(/\s*<[^>]*>$/, ''),
        mailReceivedAt: mail.receivedAt,
        mailLink: mail.webLink || undefined,
      },
    ];
  });
}

async function extractBatch(today: Date, me: { name: string; email: string }, mails: MailForAi[]): Promise<ApiTask[]> {
  const res = await fetch('/api/ai-taskuri/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      today: toDateKey(today),
      me,
      // 画面用のリンクは AI に送らない
      mails: mails.map(({ webLink: _webLink, ...m }) => m),
    }),
  });
  const data = (await res.json().catch(() => ({}))) as { tasks?: ApiTask[]; error?: string };
  if (!res.ok) throw new Error(data.error ?? `AI での抽出に失敗しました（HTTP ${res.status}）`);
  return data.tasks ?? [];
}

/**
 * メールからタスクを作る。サインインのために Microsoft の画面へ移動する場合は null を返す
 * （戻ってきたら、もう一度呼ぶ）。
 */
export async function extractFromMail(
  days: number,
  today: Date,
  onProgress: (p: Progress) => void,
): Promise<{ tasks: Task[]; mails: number } | null> {
  onProgress({ phase: 'signing-in' });
  const token = await getGraphToken();
  if (!token) return null;

  onProgress({ phase: 'reading' });
  const me = await getMe(token);
  const mails = await listInboxMails(token, me, days, MAX_MAILS);

  const apiTasks: ApiTask[] = [];
  for (let i = 0; i < mails.length; i += MAILS_PER_REQUEST) {
    onProgress({ phase: 'extracting', done: i, total: mails.length });
    apiTasks.push(...(await extractBatch(today, me, mails.slice(i, i + MAILS_PER_REQUEST))));
  }
  const tasks = toTasks(apiTasks, mails);
  onProgress({ phase: 'done', mails: mails.length, tasks: tasks.length });
  return { tasks, mails: mails.length };
}
