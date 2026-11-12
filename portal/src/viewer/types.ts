/**
 * 画面を見ている利用者。
 *
 * - swa: Azure Static Web Apps のログイン情報（/.auth/me）から作る
 * - demo: ローカル開発用のデモ利用者（認証なし）
 *
 * 将来、Entra ID のグループから付けたロールに変わっても、この形は変わらない。
 */
export interface Viewer {
  id: string;
  displayName: string;
  roles: readonly string[];
  source: 'swa' | 'demo';
}
