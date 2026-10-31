/**
 * What the chat list is narrowed to. A scope is one of:
 * 'ALL' — every chat from every account
 * '<MESSENGER_TYPE>' — one network, all of its accounts
 * 'ACC:<TYPE>:<accountId>' — a single account
 *
 * The network is carried inside the account scope so these helpers stay pure.
 */

const ACCOUNT_PREFIX = 'ACC:';

export const ALL_SCOPE = 'ALL';

export const accountScope = (messengerType, accountId) =>
    `${ACCOUNT_PREFIX}${messengerType}:${accountId}`;

export const isAccountScope = (scope) => scope.startsWith(ACCOUNT_PREFIX);

export function matchesScope(chat, scope) {
    if (scope === ALL_SCOPE) return true;
    if (!isAccountScope(scope)) return chat.messengerType === scope;
    const [, messengerType, accountId] = scope.split(':');
    return chat.messengerType === messengerType
        && String(chat.messengerAccountId) === accountId;
}

/** The network a scope belongs to, or undefined for 'ALL'. */
export function networkOf(scope) {
    if (scope === ALL_SCOPE) return undefined;
    return isAccountScope(scope) ? scope.split(':')[1] : scope;
}
