import telegramService from './telegramService';
import slackService from './slackService';
import discordService from './discordService';
import whatsappService from './whatsappService';
import viberService from './viberService';

/**
 * One place that knows which service handles which network.
 *
 * Before this, every action repeated the same if-chain over messengerType, and deletion
 * had no chain at all — it called Telegram for every chat, so deleting a Slack message
 * asked Telegram to remove an id it had never seen.
 */
const SERVICES = {
    TELEGRAM: telegramService,
    SLACK: slackService,
    DISCORD: discordService,
    WHATSAPP: whatsappService,
    VIBER: viberService,
};

export function serviceFor(messengerType) {
    return SERVICES[messengerType] || null;
}

/** Viber's bot API can neither upload attachments nor recall a sent message. */
export const SUPPORTS_MEDIA = { TELEGRAM: true, SLACK: true, DISCORD: true, WHATSAPP: true, VIBER: false };
export const SUPPORTS_DELETE = { TELEGRAM: true, SLACK: true, DISCORD: true, WHATSAPP: true, VIBER: false };

export default SERVICES;
