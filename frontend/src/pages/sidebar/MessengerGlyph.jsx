import TelegramIcon from '@mui/icons-material/Telegram';
import { SiSlack, SiDiscord, SiWhatsapp, SiViber } from 'react-icons/si';
import { MESSENGER_COLORS } from '../../theme/tokens';

/**
 * A messenger's mark at a given size, in its own colour or inherited.
 *
 * Every surface used to hand-roll this switch — the chat row, the filters, the account
 * chips, the search results, the contacts dialog — each with its own sizes and its own
 * copy of the hex values.
 */
export default function MessengerGlyph({ type, size = 12, color }) {
    const tint = color || MESSENGER_COLORS[type] || 'currentColor';

    switch (type) {
        case 'TELEGRAM': return <TelegramIcon sx={{ fontSize: size + 2, color: tint }} />;
        case 'SLACK': return <SiSlack size={size} color={tint} />;
        case 'DISCORD': return <SiDiscord size={size} color={tint} />;
        case 'WHATSAPP': return <SiWhatsapp size={size} color={tint} />;
        case 'VIBER': return <SiViber size={size} color={tint} />;
        default: return null;
    }
}
