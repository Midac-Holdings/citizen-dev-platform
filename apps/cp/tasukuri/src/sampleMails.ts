/**
 * サンプルのタスクに対応する、サンプルの元メール（架空の内容）。
 * サインインしなくても「元のメールを見る」の見え方を確認できるようにする（プレビュー環境での確認用）。
 */
import type { OriginalMail } from './graph';
import type { Task } from './tasks';

const ME = '山田 <yamada@example.com>';

const SAMPLES: Record<string, Pick<OriginalMail, 'to' | 'cc' | 'hasAttachments' | 'body'>> = {
  s1: {
    to: [ME],
    cc: [],
    hasAttachments: true,
    body: '山田さん\n\nお疲れさまです。営業部の佐藤です。\n\n先週A社からご依頼いただいた産廃収集運搬のお見積りについて、\n先方より「本日中にご回答ください」と連絡がありました。\n\n添付の条件で見積書を作成し、本日中にA社の担当者へ送付をお願いします。\n\nよろしくお願いいたします。\n佐藤',
  },
  s2: {
    to: ['業務部 部長 <bucho@example.com>'],
    cc: [ME],
    hasAttachments: true,
    body: '部長\n\n来週の名古屋出張（2名）の申請です。\n\n山田さん、今回の出張は山田さんの承認が必要とのことですので、\n承認をお願いします。\n\n業務部 鈴木',
  },
  s3: {
    to: [ME],
    cc: [],
    hasAttachments: false,
    body: '山田さん\n\n総務Gの田中です。\n議事郎で文字起こしをしたところ、話者名が入れ替わって表示される箇所がありました。\n\n再現状況を確認のうえ、昨日中にご回答いただけますと助かります。\n\n田中',
  },
  s4: {
    to: [ME, '鈴木 <suzuki@example.com>', '佐藤 <sato@example.com>'],
    cc: [],
    hasAttachments: true,
    body: '皆さん\n\n来週の部内会議の資料（第3四半期の実績）を添付します。\n皆さん、事前にご確認ください。修正点があれば明日までに返信をお願いします。\n\n経営企画 高橋',
  },
  s5: {
    to: ['全社員 <all@example.com>'],
    cc: [],
    hasAttachments: false,
    body: '各位\n\n安全衛生委員会を下記のとおり開催します。\n出欠を、このメールへの返信でご回答ください。\n\n日時：今週金曜日 15:00〜16:00\n場所：本社 3階 会議室\n\n安全衛生事務局',
  },
  s6: {
    to: ['全社員 <all@example.com>'],
    cc: [],
    hasAttachments: true,
    body: '各位\n\n年末調整の書類の提出をお願いします。\n添付の保険料控除申告書を記入し、総務Gへ提出してください。\n\n総務G',
  },
  s7: {
    to: [ME],
    cc: [],
    hasAttachments: false,
    body: '山田さん\n\n人事Gの伊藤です。\n新しく配属された2名のAzureChatのアカウント追加をお願いします。\n\n伊藤',
  },
};

/** サンプルのタスクの元メール。対応するサンプルがなければ null */
export function sampleOriginalMail(t: Task): OriginalMail | null {
  const s = SAMPLES[t.id];
  if (!s) return null;
  return { subject: t.mailSubject, from: t.mailFrom, receivedAt: t.mailReceivedAt, ...s };
}
