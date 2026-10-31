import telegramService from './telegramService';
import slackService from './slackService';
import discordService from './discordService';
import whatsappService from './whatsappService';
import viberService from './viberService';

/** Which frontend service handles which network. */
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
