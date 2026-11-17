import { useState, type FormEvent } from 'react';
import { ACCESS_OPTIONS, EMPTY, buildRequest, validate, type AccessOption, type Requirements } from './requirements';

const LINKS = {
  claudeCode: 'https://claude.ai/code',
  repo: 'https://github.com/Midac-Holdings/citizen-dev-platform',
  myPulls: 'https://github.com/Midac-Holdings/citizen-dev-platform/pulls/@me',
};

const DRAFT_KEY = 'portal.create.draft';

function loadDraft(): Requirements {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as Partial<Requirements>) } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function saveDraft(r: Requirements) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(r));
  } catch {
    // 保存できなくても入力は続けられる
  }
}

const STEPS = [
  ['申請内容を書く', 'このページで ①〜⑤ を入力し、Claude Code への依頼文を作ります。管理台帳（Excel）にも同じ内容を記入してください。'],
  ['Claude Code に依頼する', '依頼文をコピーして Claude Code に貼ると、アプリを作って下書き PR を出してくれます。'],
  ['部内テスト', 'PR にコメントされるプレビュー URL で、部内の人に試してもらいます。'],
  ['承認を依頼する', 'PR の「部内テスト（必須）」欄を記入して「Ready for review」を押すと、AI担当に承認依頼が届きます。'],
  ['公開', 'AI担当が承認してマージすると、自動で公開され、このポータルにカードが並びます。'],
] as const;

export default function CreatePage() {
  const [form, setForm] = useState<Requirements>(loadDraft);
  const [errors, setErrors] = useState<ReturnType<typeof validate>>({});
  const [request, setRequest] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function update<K extends keyof Requirements>(key: K, value: Requirements[K]) {
    const next = { ...form, [key]: value };
    setForm(next);
    saveDraft(next);
    setRequest(null);
    setCopied(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate(form);
    setErrors(found);
    setRequest(Object.keys(found).length === 0 ? buildRequest(form) : null);
    setCopied(false);
  }

  async function copy() {
    if (!request) return;
    try {
      await navigator.clipboard.writeText(request);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const field = (key: keyof Requirements) => (errors[key] ? <p className="field-error" role="alert">{errors[key]}</p> : null);

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__inner">
          <a className="hero__back" href="/">← アプリ一覧に戻る</a>
          <h1 className="hero__title">＋ アプリを作る</h1>
          <p className="hero__lead">業務を楽にするアプリを、Claude Code で作って申請できます。</p>
        </div>
      </header>

      <main className="main create">
        <section className="create-card" aria-label="作り方の流れ">
          <h2>作り方の流れ</h2>
          <ol className="steps">
            {STEPS.map(([title, text]) => (
              <li key={title}>
                <strong>{title}</strong>
                <span>{text}</span>
              </li>
            ))}
          </ol>
        </section>

        <form className="create-card" aria-label="申請内容" onSubmit={submit} noValidate>
          <h2>1. 申請内容を書く</h2>
          <label>
            ① アプリ名
            <input value={form.appName} onChange={(e) => update('appName', e.target.value)} placeholder="例：会議室予約" />
          </label>
          {field('appName')}
          <label>
            ② 機能概要
            <textarea rows={3} value={form.summary} onChange={(e) => update('summary', e.target.value)} placeholder="例：会議室の空き状況を一覧で見て、予約・取消ができる" />
          </label>
          {field('summary')}
          <fieldset>
            <legend>③ 利用可能ユーザー</legend>
            <div className="radios">
              {ACCESS_OPTIONS.map((o) => (
                <label key={o} className="radio">
                  <input type="radio" name="access" checked={form.access === o} onChange={() => update('access', o as AccessOption)} />
                  {o}
                </label>
              ))}
            </div>
            {form.access !== '全社員' && (
              <label>
                対象（部署名・グループ・役職など）
                <input value={form.accessDetail} onChange={(e) => update('accessDetail', e.target.value)} placeholder="例：BM部の全員" />
              </label>
            )}
          </fieldset>
          {field('accessDetail')}
          <label>
            ④ 削減される既存業務
            <textarea rows={2} value={form.currentWork} onChange={(e) => update('currentWork', e.target.value)} placeholder="例：Excel の予約表への手入力と、空き状況の電話での問い合わせ" />
          </label>
          {field('currentWork')}
          <label>
            ⑤ 削減が期待される時間（時間/月）
            <input type="number" min={0} step={0.5} inputMode="decimal" value={form.hoursPerMonth} onChange={(e) => update('hoursPerMonth', e.target.value)} placeholder="例：10" />
          </label>
          {field('hoursPerMonth')}

          <div className="two">
            <label>
              部署コード（URL に使う）
              <input value={form.dept} onChange={(e) => update('dept', e.target.value.trim().toLowerCase())} placeholder="例：bm" />
            </label>
            <label>
              アプリの英字名（URL に使う）
              <input value={form.slug} onChange={(e) => update('slug', e.target.value.trim().toLowerCase())} placeholder="例：meeting-room" />
            </label>
          </div>
          {field('dept')}
          {field('slug')}
          {form.dept && form.slug && <p className="hint">公開後の URL：/{form.dept}/{form.slug}/</p>}

          <button type="submit" className="primary">Claude Code への依頼文を作る</button>
        </form>

        {request && (
          <section className="create-card" aria-label="Claude Code への依頼文">
            <h2>2. Claude Code に依頼する</h2>
            <p className="hint">下の依頼文をコピーし、Claude Code（このリポジトリを選んだ状態）に貼り付けてください。</p>
            <textarea className="request" rows={16} readOnly value={request} aria-label="依頼文" />
            <div className="actions">
              <button type="button" className="primary" onClick={copy}>
                依頼文をコピー
              </button>
              <a className="button-link" href={LINKS.claudeCode} target="_blank" rel="noopener noreferrer">
                Claude Code を開く
              </a>
            </div>
            {copied && <p className="done" role="status">コピーしました</p>}
          </section>
        )}

        <section className="create-card" aria-label="リンク">
          <h2>リンク</h2>
          <ul className="links">
            <li><a href={LINKS.repo} target="_blank" rel="noopener noreferrer">GitHub のリポジトリ（市民開発基盤APP）</a></li>
            <li><a href={LINKS.myPulls} target="_blank" rel="noopener noreferrer">自分が出した PR の一覧（部内テスト・承認の状況）</a></li>
          </ul>
        </section>
      </main>
    </div>
  );
}
