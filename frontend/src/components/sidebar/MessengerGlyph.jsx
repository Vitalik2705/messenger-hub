import TelegramIcon from '@mui/icons-material/Telegram';
import { SiSlack, SiDiscord, SiWhatsapp, SiViber } from 'react-icons/si';
import { MESSENGER_COLORS } from '../../theme/tokens';

/** A messenger's mark at a given size, in its own colour or a given one. */
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
