export function DemoNotice({ mode }: { mode: 'swa' | 'demo' }) {
  return (
    <div className="demo-notice" role="note">
      <span aria-hidden="true">⚠️</span>
      <span>
        {mode === 'demo'
          ? 'デモ用の権限表示です。実際の認証・アクセス制御は未実装（ローカル開発モード）'
          : 'デモ構成：アプリごとの利用制限はサーバー側で設定済み。ただし社外のMicrosoftアカウントでもログインできる状態です'}
      </span>
    </div>
  );
}
