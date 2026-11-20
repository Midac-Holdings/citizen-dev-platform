import { beforeEach, describe, expect, it } from 'vitest';
import { buildMessages, buildSchema, handleAiExtract, normalizeInput, resetRate, sanitizeValues } from './aiExtract.js';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF').toString('base64');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64');
const fields = [
  { key: 'haishutsu', label: '排出事業者', hint: '委託する側' },
  { key: 'seikyu', label: '請求先' },
];
const principal = (roles = ['authenticated']) =>
  Buffer.from(JSON.stringify({ userId: 'u1', userDetails: 'a@example.com', userRoles: roles })).toString('base64');
const env = { AZURE_OPENAI_ENDPOINT: 'https://x.openai.azure.com', AZURE_OPENAI_API_KEY: 'k', AZURE_OPENAI_DEPLOYMENT: 'd' };
const okFetch = (out) => async () =>
  new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(out) }] }] }), { status: 200 });

const AL = { 'cp-contract': ['authenticated'] };

beforeEach(() => resetRate());

describe('AI 読み取り：入力の検証', () => {
  it('PDF と項目を受け付ける', () => {
    const r = normalizeInput({ fields, file: { name: '契約書.pdf', type: 'application/pdf', data: `data:application/pdf;base64,${pdf}` } });
    expect(r.error).toBeUndefined();
    expect(r.fields.map((f) => f.key)).toEqual(['haishutsu', 'seikyu']);
    expect(r.file.name).toBe('契約書.pdf');
  });

  it('形式・中身・キーの誤りを断る', () => {
    expect(normalizeInput({ fields, file: { type: 'text/html', data: pdf } }).error).toContain('PDF・PNG・JPEG');
    expect(normalizeInput({ fields, file: { type: 'application/pdf', data: png } }).error).toContain('一致しません');
    expect(normalizeInput({ fields: [{ key: 'Bad-Key', label: 'x' }], file: { type: 'image/png', data: png } }).error).toContain('キー');
    expect(normalizeInput({ fields: [...fields, fields[0]], file: { type: 'image/png', data: png } }).error).toContain('重複');
    expect(normalizeInput({ fields: [], file: { type: 'image/png', data: png } }).error).toContain('空');
  });

  it('大きすぎるファイルを断る', () => {
    const big = Buffer.alloc(9 * 1024 * 1024);
    big.write('%PDF-');
    expect(normalizeInput({ fields, file: { type: 'application/pdf', data: big.toString('base64') } }).error).toContain('8MB');
  });
});

describe('AI 読み取り：AI への指示と出力', () => {
  it('項目からスキーマを作り、PDF はファイルとして添付する', () => {
    const s = buildSchema(fields);
    expect(s.properties.values.required).toEqual(['haishutsu', 'seikyu']);
    const input = normalizeInput({ fields, file: { name: 'a.pdf', type: 'application/pdf', data: pdf } });
    const m = buildMessages(input);
    expect(m[1].content[1].type).toBe('input_file');
    expect(m[1].content[1].file_data.startsWith('data:application/pdf;base64,')).toBe(true);
  });

  it('指定した項目だけを文字列で返す', () => {
    expect(sanitizeValues({ values: { haishutsu: ' A社 ', extra: 'x', seikyu: 3 }, note: 'n' }, fields)).toEqual({
      values: { haishutsu: 'A社', seikyu: '' },
      note: 'n',
    });
  });
});

describe('AI 読み取り：呼び出し1回分', () => {
  const body = { fields, file: { name: 'a.pdf', type: 'application/pdf', data: pdf } };

  it('ログインしていない・許可のないアプリは断る', async () => {
    expect((await handleAiExtract({ appId: 'cp-contract', principalHeader: null, body, allowlist: AL, env })).status).toBe(401);
    const r = await handleAiExtract({ appId: 'cp-other', principalHeader: principal(), body, allowlist: AL, env });
    expect(r.status).toBe(403);
  });

  it('アプリの access のロールがない人は断る（必要なロールを表示する）', async () => {
    const r = await handleAiExtract({ appId: 'cp-contract', principalHeader: principal(), body, allowlist: { 'cp-contract': ['cp_contract'] }, env });
    expect(r.status).toBe(403);
    expect(r.jsonBody.error).toContain('必要なロール：cp_contract');
    expect(r.jsonBody.error).toContain('あなたのロール：authenticated');
    const ok = await handleAiExtract({
      appId: 'cp-contract',
      principalHeader: principal(['authenticated', 'cp_contract']),
      body,
      allowlist: { 'cp-contract': ['cp_contract'] },
      env,
      fetchFn: okFetch({ values: {}, note: '' }),
    });
    expect(ok.status).toBe(200);
    const proto = await handleAiExtract({ appId: 'constructor', principalHeader: principal(), body, allowlist: AL, env });
    expect(proto.status).toBe(403);
  });

  it('許可されたアプリは読み取れる。ログに内容は残さない', async () => {
    const logs = [];
    const r = await handleAiExtract({
      appId: 'cp-contract',
      principalHeader: principal(),
      body,
      allowlist: AL,
      env,
      fetchFn: okFetch({ values: { haishutsu: '株式会社A', seikyu: '' }, note: '' }),
      log: (m) => logs.push(m),
    });
    expect(r.status).toBe(200);
    expect(r.jsonBody.values.haishutsu).toBe('株式会社A');
    expect(logs.join()).toContain('filled=1');
    expect(logs.join()).not.toContain('株式会社A');
  });

  it('設定がなければ 503、回数の上限を超えたら 429', async () => {
    expect((await handleAiExtract({ appId: 'cp-contract', principalHeader: principal(), body, allowlist: AL, env: {} })).status).toBe(503);
    let last;
    for (let i = 0; i < 11; i++) {
      last = await handleAiExtract({ appId: 'cp-contract', principalHeader: principal(), body, allowlist: AL, env, fetchFn: okFetch({ values: {}, note: '' }), now: 0 });
    }
    expect(last.status).toBe(429);
  });
});
