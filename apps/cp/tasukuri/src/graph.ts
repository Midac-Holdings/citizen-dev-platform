/**
 * Microsoft 365 へのサインイン（MSAL）と、Microsoft Graph での受信メールの取得。
 * 基盤の管理者が許可したアプリだけが使える例外（tools/app-capabilities.json の microsoft-graph-mail）。
 * メールはこのブラウザで読むだけで、どこにも保存しない。
 */
import { InteractionRequiredAuthError, PublicClientApplication } from '@azure/msal-browser';
import { ENTRA, GRAPH_SCOPES } from './config';

const GRAPH = 'https://graph.microsoft.com/v1.0';

let pca: PublicClientApplication | null = null;

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
  }
  return pca;
}

/** サインインから戻ってきたところか（URL にサインインの結果が付いている） */
export function isReturningFromSignIn(): boolean {
  const s = window.location.hash + window.location.search;
  return /[#?&](code|error)=/.test(s);
}

/** サインインから戻ってきたときに呼ぶ。サインインできていれば true */
export async function completeSignIn(): Promise<boolean> {
  const client = await getClient();
  const result = await client.handleRedirectPromise();
  if (result?.account) client.setActiveAccount(result.account);
  return Boolean(result?.account);
}

/**
 * Graph のアクセストークンを取る。サインインが必要なら Microsoft の画面へ移動し、null を返す
 * （戻ってきたら completeSignIn → もう一度この関数）。
 */
export async function getGraphToken(): Promise<string | null> {
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
