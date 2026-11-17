/**
 * アプリの申請内容（①〜⑤）。
 * PR テンプレート（.github/pull_request_template.md）の「申請内容（必須）」欄、
 * PR の自動チェック（tools/check-dept-test.mjs）と、項目名をそろえている。
 */

export const ACCESS_OPTIONS = ['全社員', '部署全員', '特定メンバー'] as const;
export type AccessOption = (typeof ACCESS_OPTIONS)[number];

export interface Requirements {
  /** ① アプリ名（日本語） */
  appName: string;
  /** ② 機能概要 */
  summary: string;
  /** ③ 利用可能ユーザー */
  access: AccessOption;
  /** ③ の補足（部署全員・特定メンバーのとき、対象を書く） */
  accessDetail: string;
  /** ④ 削減される既存業務 */
  currentWork: string;
  /** ⑤ 削減が期待される時間（時間/月） */
  hoursPerMonth: string;
  /** 部署コード（URL に使う。半角英小文字） */
  dept: string;
  /** アプリの英字名（URL に使う） */
  slug: string;
}

export const EMPTY: Requirements = {
  appName: '',
  summary: '',
  access: '全社員',
  accessDetail: '',
  currentWork: '',
  hoursPerMonth: '',
  dept: '',
  slug: '',
};

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** 入力チェック。項目ごとのエラー文を返す（空なら OK） */
export function validate(r: Requirements): Partial<Record<keyof Requirements, string>> {
  const e: Partial<Record<keyof Requirements, string>> = {};
  if (!r.appName.trim()) e.appName = '① アプリ名を入力してください';
  if (!r.summary.trim()) e.summary = '② 機能概要を入力してください';
  if (r.access !== '全社員' && !r.accessDetail.trim()) e.accessDetail = '③ 対象の部署やメンバーを入力してください';
  if (!r.currentWork.trim()) e.currentWork = '④ 削減される既存業務を入力してください';
  const h = Number(r.hoursPerMonth);
  if (r.hoursPerMonth.trim() === '' || !Number.isFinite(h) || h <= 0) e.hoursPerMonth = '⑤ 削減が期待される時間を、0より大きい数で入力してください';
  if (!SLUG.test(r.dept)) e.dept = '部署コードは半角英小文字・数字・ハイフンで入力してください（例：bm）';
  if (!SLUG.test(r.slug)) e.slug = 'アプリの英字名は半角英小文字・数字・ハイフンで入力してください（例：meeting-room）';
  return e;
}

export function accessText(r: Requirements): string {
  return r.access === '全社員' ? '全社員' : `${r.access}（${r.accessDetail.trim()}）`;
}

/** PR 本文の「申請内容（必須）」欄（テンプレートと同じ形） */
export function requirementsSection(r: Requirements): string {
  return [
    '## 申請内容（必須）',
    `- ① アプリ名：${r.appName.trim()}`,
    `- ② 機能概要：${r.summary.trim().replace(/\s*\n\s*/g, ' ')}`,
    `- ③ 利用可能ユーザー：${accessText(r)}`,
    `- ④ 削減される既存業務：${r.currentWork.trim().replace(/\s*\n\s*/g, ' ')}`,
    `- ⑤ 削減が期待される時間（時間/月）：${Number(r.hoursPerMonth)}`,
    `- フォルダ：apps/${r.dept}/${r.slug}/`,
  ].join('\n');
}

/** Claude Code に貼る依頼文 */
export function buildRequest(r: Requirements): string {
  return [
    'このリポジトリのルール（CLAUDE.md）に従って、次の社内アプリを作ってください。',
    '',
    requirementsSection(r),
    '',
    '進め方：',
    `1. npm run new-app -- ${r.dept} ${r.slug} でテンプレートから作る`,
    '2. ② の機能を実装し、テストを書く。npm test と npm run build が通ることを確認する',
    `3. app.manifest.json を書く（利用可能ユーザーが「全社員」以外の場合、access は AI担当に相談が必要と私に伝える）`,
    '4. PR テンプレートの欄をすべて残し、「申請内容（必須）」欄に上の内容をそのまま書いて、下書き（Draft）PR を出す',
    '5. PR の URL を教えてください（部内テストは私が行います）',
    '',
    'わからない点や、ルール上できないこと（外部との通信など）があれば、作る前に質問してください。',
  ].join('\n');
}
