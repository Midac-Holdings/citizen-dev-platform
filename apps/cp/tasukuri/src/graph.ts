/**
 * Microsoft 365 へのサインイン（MSAL）と、Microsoft Graph での受信メールの取得。
 * 基盤の管理者が許可したアプリだけが使える例外（tools/app-capabilities.json の microsoft-graph-mail）。
 * メールはこのブラウザで読むだけで、どこにも保存しない。
 */
import { InteractionRequiredAuthError, PublicClientApplication, type AuthenticationResult } from '@azure/msal-browser';
import { ENTRA, GRAPH_SCOPES } from './config';

const GRAPH = 'https://graph.microsoft.com/v1.0';

let pca: PublicClientApplication | null = null;
let redirectResult: Promise<AuthenticationResult | null> | null = null;

async function getClient(): Promise<PublicClientApplication> {
  if (!pca) {
    pca = new PublicClientApplication({
      auth: {
        clientId: ENTRA.clientId,
        authority: `https://login.microsoftonline.com/${ENTRA.tenantId}`,
        redirectUri: window.location.origin + import.meta.env.BASE_URL,
      },
      cache: { cacheLocation: 'sessionStorage' },
    });
    await pca.initialize();
    // サインインの戻りを必ず最初に処理する。前回のサインインが途中で終わっていても、ここで片付く
    // （片付けないと次のサインインで interaction_in_progress になる）
    redirectResult = pca.handleRedirectPromise();
    await redirectResult.catch(() => null);
  }
  return pca;
}

/** サインインのエラーを、利用者に分かる日本語にする */
export function authErrorMessage(e: unknown): string {
  const code = (e as { errorCode?: string })?.errorCode ?? '';
  const text = `${code} ${e instanceof Error ? e.message : String(e)}`;
  if (/AADSTS50105/.test(text)) {
    return 'タスクリ（メールの読み取り）の利用が許可されていません。利用したい場合は、AI担当に依頼してください';
  }
  if (/AADSTS65001|consent_required|AADSTS90094/.test(text)) {
    return 'メールの読み取りの許可（同意）が必要です。組織の設定により、管理者の同意が必要な場合があります。AI担当に連絡してください';
  }
  if (/user_cancelled|access_denied/.test(text)) return 'サインインがキャンセルされました。もう一度お試しください';
  if (/interaction_in_progress/.test(text)) return 'サインインの途中です。ページを再読み込みしてから、もう一度お試しください';
  return `Microsoft 365 へのサインインでエラーが発生しました（${code || '詳細不明'}）`;
}

/** サインインから戻ってきたところか（URL にサインインの結果が付いている） */
export function isReturningFromSignIn(): boolean {
  const s = window.location.hash + window.location.search;
  return /[#?&](code|error)=/.test(s);
}

/** サインインから戻ってきたときに呼ぶ。サインインできていれば true */
export async function completeSignIn(): Promise<boolean> {
  try {
    const client = await getClient();
    const result = await redirectResult;
    if (result?.account) client.setActiveAccount(result.account);
    return Boolean(result?.account);
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }
}

/**
 * Graph のアクセストークンを取る。サインインが必要なら Microsoft の画面へ移動し、null を返す
 * （戻ってきたら completeSignIn → もう一度この関数）。
 */
export async function getGraphToken(): Promise<string | null> {
  try {
    const client = await getClient();
    const account = client.getActiveAccount() ?? client.getAllAccounts()[0];
    if (account) {
      try {
        const r = await client.acquireTokenSilent({ scopes: GRAPH_SCOPES, account });
        return r.accessToken;
      } catch (e) {
        if (!(e instanceof InteractionRequiredAuthError)) throw e;
      }
    }
    await client.acquireTokenRedirect({ scopes: GRAPH_SCOPES });
    return null;
  } catch (e) {
    throw new Error(authErrorMessage(e));
  }
}

export interface Me {
  name: string;
  email: string;
}

export interface MailForAi {
  id: string;
  receivedAt: string;
  from: string;
  subject: string;
  /** 宛先上の本人の立場 */
  position: 'to-only' | 'to-multi' | 'cc' | 'other';
  toCount: number;
  ccCount: number;
  importance: string;
  body: string;
  /** 画面用（AI には送らない） */
  webLink: string;
}

interface GraphRecipient {
  emailAddress?: { name?: string; address?: string };
}

interface GraphMessage {
  id: string;
  subject?: string;
  receivedDateTime: string;
  importance?: string;
  webLink?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  body?: { content?: string };
}

async function graphGet<T>(token: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.body-content-type="text"' },
  });
  if (!res.ok) throw new Error(`メールを読み込めませんでした（Microsoft Graph：HTTP ${res.status}）`);
  return (await res.json()) as T;
}

export async function getMe(token: string): Promise<Me> {
  const me = await graphGet<{ displayName?: string; mail?: string; userPrincipalName?: string }>(
    token,
    `${GRAPH}/me?$select=displayName,mail,userPrincipalName`,
  );
  return { name: me.displayName ?? '', email: (me.mail ?? me.userPrincipalName ?? '').toLowerCase() };
}

/** 本文を AI に渡しやすく整える（空白の連続をまとめ、過去のやり取りの引用を落とす） */
export function cleanBody(text: string): string {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const cut = lines.findIndex((l) => /^(-{2,}\s*Original Message|From:\s|差出人:\s|-----\s*元のメッセージ)/i.test(l.trim()));
  const kept = (cut > 0 ? lines.slice(0, cut) : lines).filter((l) => !l.trimStart().startsWith('>'));
  return kept.join('\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

export function positionOf(m: GraphMessage, myEmail: string): MailForAi['position'] {
  const has = (list?: GraphRecipient[]) => (list ?? []).some((r) => r.emailAddress?.address?.toLowerCase() === myEmail);
  if (has(m.toRecipients)) return (m.toRecipients?.length ?? 0) === 1 ? 'to-only' : 'to-multi';
  if (has(m.ccRecipients)) return 'cc';
  return 'other';
}

export function toMailForAi(m: GraphMessage, myEmail: string): MailForAi {
  const from = m.from?.emailAddress;
  return {
    id: m.id,
    receivedAt: m.receivedDateTime,
    from: from?.name ? `${from.name}${from.address ? ` <${from.address}>` : ''}` : (from?.address ?? ''),
    subject: m.subject ?? '（件名なし）',
    position: positionOf(m, myEmail),
    toCount: m.toRecipients?.length ?? 0,
    ccCount: m.ccRecipients?.length ?? 0,
    importance: m.importance ?? 'normal',
    body: cleanBody(m.body?.content ?? ''),
    webLink: m.webLink ?? '',
  };
}

/** 受信トレイから、指定日数以内のメールを新しい順に最大 max 件取る */
export async function listInboxMails(token: string, me: Me, days: number, max: number): Promise<MailForAi[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    $filter: `receivedDateTime ge ${since}`,
    $orderby: 'receivedDateTime desc',
    $top: '50',
    $select: 'id,subject,from,toRecipients,ccRecipients,receivedDateTime,body,importance,webLink',
  });
  let url: string | undefined = `${GRAPH}/me/mailFolders/inbox/messages?${params}`;
  const mails: MailForAi[] = [];
  while (url && mails.length < max) {
    const page: { value: GraphMessage[]; '@odata.nextLink'?: string } = await graphGet(token, url);
    mails.push(...page.value.map((m) => toMailForAi(m, me.email)));
    url = page['@odata.nextLink'];
  }
  return mails.slice(0, max);
}
