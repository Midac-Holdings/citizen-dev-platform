// アプリごとの例外（ケイパビリティ）。
// 標準の市民アプリは「外部と通信しない」前提で、⑤禁止パターンと⑥CSPで止めている。
// 管理者（AI担当）が審査して許可したアプリだけ、tools/app-capabilities.json に登録して例外を与える。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CAPABILITIES = {
  // Microsoft 365 にサインインし、本人のメールを Microsoft Graph で読む（委任された権限 Mail.Read）
  'microsoft-graph-mail': {
    allowRules: ['network', 'auth', 'external-url'],
    allowHosts: ['graph.microsoft.com', 'login.microsoftonline.com'],
    connectSrc: ['https://graph.microsoft.com', 'https://login.microsoftonline.com'],
    frameSrc: ['https://login.microsoftonline.com'],
  },
  // 基盤の API（/api/<部署コード>-<アプリ名>/...）を呼ぶ。API 本体は api/ に管理者が置く
  'platform-api': {
    allowRules: ['network'],
    allowHosts: [],
    connectSrc: [],
    frameSrc: [],
  },
  // 基盤の AI 読み取り API（/api/ai/<部署コード>-<アプリ名>/extract）で、PDF・画像から項目を読み取る。
  // 社内の Azure OpenAI を使う（費用がかかるため、AI担当が許可したアプリだけ）
  'ai-document': {
    allowRules: ['network'],
    allowHosts: [],
    connectSrc: [],
    frameSrc: [],
  },
};

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadAppCapabilities(path = join(root, 'tools/app-capabilities.json')) {
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const map = {};
  for (const [appId, caps] of Object.entries(raw)) {
    if (appId.startsWith('$')) continue;
    for (const c of caps) {
      if (!CAPABILITIES[c]) throw new Error(`tools/app-capabilities.json: 未定義のケイパビリティ "${c}"（${appId}）`);
    }
    map[appId] = caps;
  }
  return map;
}

/** アプリに許可された例外をまとめる。 */
export function capabilitiesFor(appId, appCapabilities) {
  const caps = (appCapabilities[appId] ?? []).map((c) => CAPABILITIES[c]);
  const uniq = (xs) => [...new Set(xs)];
  return {
    names: appCapabilities[appId] ?? [],
    allowRules: uniq(caps.flatMap((c) => c.allowRules)),
    allowHosts: uniq(caps.flatMap((c) => c.allowHosts)),
    connectSrc: uniq(caps.flatMap((c) => c.connectSrc)),
    frameSrc: uniq(caps.flatMap((c) => c.frameSrc)),
    api: (appCapabilities[appId] ?? []).includes('platform-api'),
    ai: (appCapabilities[appId] ?? []).includes('ai-document'),
  };
}

/**
 * 宣言制の読み取り（app.manifest.json の readFrom）を、例外に加える。
 * 申請不要：基盤の読み取り API（/api/read/...）を呼ぶ通信と、宣言したサイトの URL をコードに書くことを許可する。
 * ブラウザから外部へ直接通信することは、引き続き CSP で禁止。
 */
export function withReadFrom(caps, readFrom = []) {
  if (!Array.isArray(readFrom) || readFrom.length === 0) return caps;
  const uniq = (xs) => [...new Set(xs)];
  return {
    ...caps,
    allowRules: uniq([...caps.allowRules, 'network', 'external-url']),
    allowHosts: uniq([...caps.allowHosts, ...readFrom]),
  };
}
