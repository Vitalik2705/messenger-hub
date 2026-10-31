import { Box, Typography, Tooltip } from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MessengerGlyph from './MessengerGlyph';
import { MESSENGER_LABELS, radius } from '../../theme/tokens';
import { t } from '../../i18n';

/**
 * The connected networks as overlapping marks on one line, one per network. The full account list
 * with disconnect lives in the accounts dialog.
 */
export default function AccountsButton({ accounts, onClick }) {
    const networks = [...new Set(accounts.map(a => a.messengerType))];

    if (accounts.length === 0) {
        return (
            <Pill onClick={onClick} accented>
                <AddIcon sx={{ fontSize: 14 }} />
                <Typography sx={{ fontSize: 11.5, fontWeight: 700, color: 'inherit' }}>
                    {t('Підключити')}
                </Typography>
            </Pill>
        );
    }

    const summary = accounts.length === networks.length
        ? networks.map(type => MESSENGER_LABELS[type]).join(', ')
        : t('{0} акаунтів у {1} мережах', accounts.length, networks.length);

    return (
        <Tooltip title={t('{0} — натисніть, щоб керувати', summary)}>
            <Box component="span" sx={{ display: 'inline-flex' }}>
                <Pill onClick={onClick}>
                    {networks.map((type, index) => (
                        <Box
                            key={type}
                            sx={(t) => ({
                                width: 19, height: 19, borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                bgcolor: t.c.surface,
                                border: `1px solid ${t.c.border}`,
                                // Overlapped rather than spaced: the marks read as one group
                                // belonging to one account set, and five of them still fit
                                // beside the chat counter.
                                ml: index === 0 ? 0 : '-6px',
                                zIndex: networks.length - index,
                            })}
                        >
                            <MessengerGlyph type={type} size={11} />
                        </Box>
                    ))}
                    {/* Only shown when it says something the marks do not — a second account
                        on a network the stack already shows once. */}
                    {accounts.length > networks.length && (
                        <Typography sx={(t) => ({
                            fontSize: 11, fontWeight: 700, color: t.c.textFaint, ml: 0.5,
                        })}>
                            {accounts.length}
                        </Typography>
                    )}
                </Pill>
            </Box>
        </Tooltip>
    );
}

function Pill({ children, onClick, accented }) {
    return (
        <Box
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
            sx={(t) => ({
                display: 'inline-flex', alignItems: 'center', gap: accented ? 0.35 : 0,
                px: 0.85, py: 0.3,
                borderRadius: radius.pill,
                cursor: 'pointer',
                color: accented ? t.c.accent : 'inherit',
                border: `1px ${accented ? 'dashed' : 'solid'} ${accented ? t.c.accent : 'transparent'}`,
                transition: 'background-color .12s, border-color .12s',
                '&:hover': {
                    bgcolor: accented ? t.c.accentSoft : t.c.surfaceHover,
                    borderColor: accented ? t.c.accent : t.c.border,
                },
            })}
        >
            {children}
        </Box>
    );
}
