/**
 * Microsoft 365 へのサインイン設定（Entra ID のアプリ登録）。
 * テナントID・クライアントIDは秘密情報ではない（ブラウザに渡る公開の識別子）。
 * 空のままだと「メールから抽出」は使えない（管理者の設定待ちと表示する）。
 */
export const ENTRA = {
  tenantId: 'f707c071-6cbe-4bde-8cb1-172b56021583',
  clientId: 'b43a7140-b3f7-474c-882e-c483b8f17e5e',
};

/** メールの読み取りに使う権限（委任された権限：本人のメールだけ読める） */
export const GRAPH_SCOPES = ['User.Read', 'Mail.Read'];

/** 一度に読むメールの上限（AI の利用料と待ち時間を抑えるため） */
export const MAX_MAILS = 100;

/** API 1回あたりのメール数（AI の応答を関数の時間制限（約45秒）に収めるため少なめ。API の上限は10） */
export const MAILS_PER_REQUEST = 5;

export const isEntraConfigured = () => ENTRA.tenantId !== '' && ENTRA.clientId !== '';
