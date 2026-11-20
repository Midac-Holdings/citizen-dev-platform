import { useRef, useState } from 'react';
import { exportFileName, fmtDateTime, toXlsxBlob } from './excel';
import { checkFile, extractContract, type ExtractResult } from './extract';
import { FIELDS, NOT_FOUND, displayValue, type FieldKey, type Values } from './fields';
import { loadEntries, saveEntries, type Entry } from './storage';

type Props = {
  fetchFn?: typeof fetch;
  /** ファイルを保存する処理（テスト用に差し替えられる） */
  download?: (blob: Blob, fileName: string) => void;
  now?: () => Date;
};

function saveFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function App({ fetchFn, download = saveFile, now = () => new Date() }: Props) {
  const [entries, setEntries] = useState<Entry[]>(() => loadEntries());
  const [file, setFile] = useState<File | null>(null);
  const [draft, setDraft] = useState<(ExtractResult & { fileName: string }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const update = (next: Entry[]) => {
    saveEntries(next);
    setEntries(next);
  };

  const onPick = (f: File | null) => {
    setMessage('');
    setError(f ? checkFile(f) ?? '' : '');
    setFile(f);
  };

  const read = async () => {
    if (!file) return;
    const problem = checkFile(file);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const r = await extractContract(file, fetchFn ?? fetch);
      setDraft({ ...r, fileName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : '読み取りに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const edit = (key: FieldKey, value: string) => {
    if (draft) setDraft({ ...draft, values: { ...draft.values, [key]: value } as Values });
  };

  const add = () => {
    if (!draft) return;
    const entry: Entry = { ...draft.values, id: newId(), fileName: draft.fileName, addedAt: now().toISOString(), note: draft.note };
    update([...entries, entry]);
    setDraft(null);
    setFile(null);
    if (inputRef.current) inputRef.current.value = '';
    setMessage(`台帳に追加しました（全 ${entries.length + 1} 件）`);
  };

  const remove = (id: string) => {
    if (!window.confirm('この件を台帳から削除しますか？')) return;
    update(entries.filter((e) => e.id !== id));
  };

  const clearAll = () => {
    if (!window.confirm('台帳をすべて消しますか？（元に戻せません。先に Excel に出力しておくことをおすすめします）')) return;
    update([]);
  };

  const exportExcel = async () => {
    setError('');
    try {
      const blob = await toXlsxBlob(entries);
      download(blob, exportFileName(now()));
      setMessage(`Excel に出力しました（${entries.length} 件）`);
    } catch {
      setError('Excel の出力に失敗しました。');
    }
  };

  return (
    <div className="page">
      <p className="notice">台帳のデータは、このブラウザの中にだけ保存されます（ほかの人・ほかのパソコンとは共有されません）。</p>
      <header className="header">
        <a className="back" href="/">← ポータルに戻る</a>
        <h1>📑 契約情報抽出</h1>
        <p className="lead">契約書の写し（PDF）から、AI が5つの項目を読み取ります。確認・修正して台帳に追加し、Excel に出力できます。</p>
      </header>
      <main className="main">
        <section className="card">
          <h2>1. 契約書を読み取る</h2>
          <label>
            契約書の写し（PDF・8MB まで）
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={(e) => onPick(e.target.files?.[0] ?? null)}
              disabled={loading}
            />
          </label>
          <button type="button" onClick={() => void read()} disabled={!file || loading || !!checkFile(file)}>
            {loading ? '読み取り中…（10〜40秒かかります）' : 'AI で読み取る'}
          </button>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && <p className="done">{message}</p>}
          <p className="muted small">PDF は社内の AI（Azure OpenAI）にだけ送られ、保存されません。</p>
        </section>

        {draft && (
          <section className="card" aria-label="読み取り結果">
            <h2>2. 結果を確認・修正する</h2>
            <p className="muted small">ファイル：{draft.fileName}</p>
            <p className="warn">AI の読み取りは間違えることがあります。原本と見比べてから追加してください。</p>
            {FIELDS.map((f) => (
              <label key={f.key}>
                {f.label}
                <textarea rows={2} value={draft.values[f.key]} onChange={(e) => edit(f.key, e.target.value)} placeholder={`${NOT_FOUND}（このまま追加すると「${NOT_FOUND}」と表示）`} />
              </label>
            ))}
            {draft.note && <p className="muted small">AI からの補足：{draft.note}</p>}
            <div className="actions">
              <button type="button" onClick={add}>
                台帳に追加
              </button>
              <button type="button" className="secondary" onClick={() => setDraft(null)}>
                取り消す
              </button>
            </div>
          </section>
        )}

        <section className="card wide">
          <h2>3. 台帳（{entries.length} 件）</h2>
          <div className="actions">
            <button type="button" onClick={() => void exportExcel()} disabled={entries.length === 0}>
              Excel に出力（{entries.length} 件）
            </button>
            <button type="button" className="secondary" onClick={clearAll} disabled={entries.length === 0}>
              台帳をすべて消す
            </button>
          </div>
          <p className="muted small">Excel には、これまでに追加したすべての件が出力されます（追加するたびに行が増えます）。</p>
          {entries.length === 0 ? (
            <p className="muted">まだありません。契約書を読み取って追加してください。</p>
          ) : (
            <ol className="entries">
              {entries.map((e, i) => (
                <li key={e.id} className="entry">
                  <div className="entry-head">
                    <span className="no">No.{i + 1}</span>
                    <span className="muted small">
                      {fmtDateTime(e.addedAt)} ／ {e.fileName}
                    </span>
                    <button type="button" className="link" onClick={() => remove(e.id)} aria-label={`No.${i + 1} を削除`}>
                      削除
                    </button>
                  </div>
                  <dl>
                    {FIELDS.map((f) => (
                      <div key={f.key}>
                        <dt>{f.label}</dt>
                        <dd className={e[f.key].trim() ? undefined : 'muted'}>{displayValue(e[f.key])}</dd>
                      </div>
                    ))}
                  </dl>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>
    </div>
  );
}
