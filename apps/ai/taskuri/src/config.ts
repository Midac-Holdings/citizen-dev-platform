/**
 * Microsoft 365 へのサインイン設定（Entra ID のアプリ登録）。
 * テナントID・クライアントIDは秘密情報ではない（ブラウザに渡る公開の識別子）。
 * 空のままだと「メールから抽出」は使えない（管理者の設定待ちと表示する）。
 */
export const ENTRA = {
  tenantId: '',
  clientId: '',
};

/** メールの読み取りに使う権限（委任された権限：本人のメールだけ読める） */
export const GRAPH_SCOPES = ['User.Read', 'Mail.Read'];

/** 一度に読むメールの上限（AI の利用料と待ち時間を抑えるため） */
export const MAX_MAILS = 100;

/** API 1回あたりのメール数（基盤の API の上限と同じ） */
export const MAILS_PER_REQUEST = 10;

export const isEntraConfigured = () => ENTRA.tenantId !== '' && ENTRA.clientId !== '';
