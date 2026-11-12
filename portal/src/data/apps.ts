/**
 * アプリ台帳。各アプリの app.manifest.json から自動生成される（tools/generate.mjs）。
 * 誰が使えるか（access）も同じ申告から作られ、Azure 側のアクセス設定と一致する。
 */
import generated from '../generated/apps.json';

export const APP_CATEGORIES = ['申請・手続き', '施設・設備', 'お知らせ・情報', 'サポート', '管理'] as const;

export type AppCategory = (typeof APP_CATEGORIES)[number];

/** available: 公開中 / preparing: 準備中（開けない） */
export type AppStatus = 'available' | 'preparing';

export interface AppEntry {
  id: string;
  dept: string;
  /** サイト内のパス（例: /bm/equipment/） */
  path: string;
  name: string;
  description: string;
  category: AppCategory;
  status: AppStatus;
  icon: string;
  color: string;
  /** 利用できるロール。authenticated は全社員（ログインした人全員）。 */
  access: readonly string[];
}

export const portalApps = generated as AppEntry[];
