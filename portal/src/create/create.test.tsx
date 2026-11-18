import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import CreatePage from './CreatePage';
import { EMPTY, buildRequest, requirementsSection, validate, type Requirements } from './requirements';

const filled: Requirements = {
  appName: '会議室予約',
  summary: '空き状況を見て\n予約・取消できる',
  access: '部署全員',
  accessDetail: 'BM部の全員',
  currentWork: 'Excel の予約表への手入力',
  hoursPerMonth: '10',
  dept: 'bm',
  slug: 'meeting-room',
  readFrom: '',
};

describe('申請内容（①〜⑤）', () => {
  it('未入力の項目を指摘する', () => {
    expect(Object.keys(validate(EMPTY)).sort()).toEqual(['appName', 'currentWork', 'dept', 'hoursPerMonth', 'slug', 'summary']);
    expect(validate({ ...filled, accessDetail: '' }).accessDetail).toBeTruthy();
    expect(validate({ ...filled, hoursPerMonth: '0' }).hoursPerMonth).toBeTruthy();
    expect(validate({ ...filled, slug: 'Meeting Room' }).slug).toBeTruthy();
    expect(validate(filled)).toEqual({});
  });

  it('PR テンプレートと同じ形の「申請内容（必須）」欄を作る（改行は1行にまとめる）', () => {
    expect(requirementsSection(filled)).toBe(
      [
        '## 申請内容（必須）',
        '- ① アプリ名：会議室予約',
        '- ② 機能概要：空き状況を見て 予約・取消できる',
        '- ③ 利用可能ユーザー：部署全員（BM部の全員）',
        '- ④ 削減される既存業務：Excel の予約表への手入力',
        '- ⑤ 削減が期待される時間（時間/月）：10',
        '- フォルダ：apps/bm/meeting-room/',
        '- 読むサイト（任意。外部サイトを読む場合だけ）：',
      ].join('\n'),
    );
  });

  it('依頼文に、作り方と下書き PR の指示が入る', () => {
    const text = buildRequest(filled);
    expect(text).toContain('npm run new-app -- bm meeting-room');
    expect(text).toContain('下書き（Draft）PR');
    expect(text).toContain('## 申請内容（必須）');
    expect(text).toContain('"request": {"summary":"空き状況を見て 予約・取消できる","access":"部署全員（BM部の全員）","currentWork":"Excel の予約表への手入力","hoursPerMonth":10}');
  });
});

describe('読むサイト（readFrom）', () => {
  it('URL でもホスト名でも受け付け、ホスト名にそろえる', async () => {
    const { parseReadFrom } = await import('./requirements');
    expect(parseReadFrom('https://www.midac.jp/news/\nwww.mhlw.go.jp, https://www.midac.jp/')).toEqual({ hosts: ['www.midac.jp', 'www.mhlw.go.jp'], invalid: [] });
    expect(parseReadFrom('10.0.0.1 intranet server.local').invalid).toHaveLength(3);
  });

  it('依頼文に readFrom の宣言と、読み取り API を使う指示が入る', () => {
    const text = buildRequest({ ...filled, readFrom: 'https://www.midac.jp/news/' });
    expect(text).toContain('"readFrom": ["www.midac.jp"]');
    expect(text).toContain('/api/read/bm-meeting-room?url=');
    expect(text).toContain('- 読むサイト（任意。外部サイトを読む場合だけ）：www.midac.jp');
    expect(buildRequest(filled)).not.toContain('readFrom');
  });

  it('使えないサイトはエラー', () => {
    expect(validate({ ...filled, readFrom: '192.168.0.1' }).readFrom).toContain('192.168.0.1');
  });
});

describe('「アプリを作る」ページ', () => {
  it('未入力で押すとエラーを表示し、依頼文は出さない', async () => {
    const user = userEvent.setup();
    render(<CreatePage />);
    await user.click(screen.getByRole('button', { name: 'Claude Code への依頼文を作る' }));
    expect(screen.getAllByRole('alert').length).toBeGreaterThanOrEqual(5);
    expect(screen.queryByRole('region', { name: 'Claude Code への依頼文' })).not.toBeInTheDocument();
  });

  it('入力すると依頼文ができ、入力は下書きとして残る', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<CreatePage />);
    await user.type(screen.getByLabelText('① アプリ名'), '会議室予約');
    await user.type(screen.getByLabelText('② 機能概要'), '予約・取消ができる');
    await user.type(screen.getByLabelText('④ 削減される既存業務'), '手入力');
    await user.type(screen.getByLabelText('⑤ 削減が期待される時間（時間/月）'), '10');
    await user.type(screen.getByLabelText('部署コード（URL に使う）'), 'bm');
    await user.type(screen.getByLabelText('アプリの英字名（URL に使う）'), 'meeting-room');
    expect(screen.getByText('公開後の URL：/bm/meeting-room/')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Claude Code への依頼文を作る' }));
    expect((screen.getByLabelText('依頼文') as HTMLTextAreaElement).value).toContain('- ① アプリ名：会議室予約');
    expect(screen.getByRole('link', { name: 'Claude Code を開く' })).toHaveAttribute('target', '_blank');

    unmount();
    render(<CreatePage />);
    expect(screen.getByLabelText('① アプリ名')).toHaveValue('会議室予約');
  });
});
