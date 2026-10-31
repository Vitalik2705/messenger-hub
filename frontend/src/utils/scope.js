/**
 * What the chat list is currently narrowed to.
 *
 * A scope is one of:
 *   'ALL'                    — every chat from every connected account
 *   '<MESSENGER_TYPE>'       — one network, all of its accounts
 *   'ACC:<TYPE>:<accountId>' — a single account
 *
 * The account form exists because two accounts on the same network are indistinguishable
 * under a plain type filter, and that is precisely when narrowing matters: their chats
 * interleave in one list with nothing to tell them apart.
 *
 * The network is carried inside the account scope rather than looked up from the account
 * id. That keeps every helper here pure, so the side that builds a scope and the side that
 * applies it never have to agree on anything beyond this file.
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
