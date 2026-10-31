import { Box, Typography, CircularProgress } from '@mui/material';
import SearchOffIcon from '@mui/icons-material/SearchOff';
import { radius } from '../../theme/tokens';
import { t } from '../../i18n';

/**
 * What the chat list shows when empty, with a different message for: no accounts, first sync
 * running, and nothing matching the search.
 */
export default function EmptyList({ searching, hasAccounts, syncing, onAdd }) {
    if (syncing) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.25, py: 5 }}>
                <CircularProgress size={14} />
                <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textFaint })}>
                    {t('Завантаження чатів…')}
                </Typography>
            </Box>
        );
    }

    if (searching) {
        return (
            <Box sx={{ textAlign: 'center', px: 3, py: 5 }}>
                <SearchOffIcon sx={(t) => ({ fontSize: 22, color: t.c.textFaint, mb: 1 })} />
                <Typography sx={(t) => ({ fontSize: 13, fontWeight: 600, color: t.c.textMuted })}>
                    {t('Чатів із такою назвою немає')}
                </Typography>
                <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint, mt: 0.5 })}>
                    {t('Пошук по історії повідомлень — нижче')}
                </Typography>
            </Box>
        );
    }

    if (!hasAccounts) {
        return (
            <Box sx={{ textAlign: 'center', px: 3, py: 5 }}>
                <Typography sx={(t) => ({ fontSize: 13, fontWeight: 650, color: t.c.text })}>
                    {t('Жодного месенджера не підключено')}
                </Typography>
                <Typography sx={(t) => ({ fontSize: 12, color: t.c.textMuted, mt: 0.5, mb: 1.75, lineHeight: 1.5 })}>
                    {t('Підключіть перший — чати з усіх мереж зберуться в цьому списку')}
                </Typography>
                <Box
                    onClick={onAdd}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onAdd()}
                    sx={(t) => ({
                        display: 'inline-flex', alignItems: 'center',
                        px: 1.75, py: 0.75, borderRadius: radius.md,
                        bgcolor: t.c.accentText, color: t.c.onAccent,
                        fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                        '&:hover': { bgcolor: t.c.accentHover },
                    })}
                >
                    {t('Підключити месенджер')}
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ textAlign: 'center', px: 3, py: 5 }}>
            <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textFaint })}>
                {t('У цій мережі поки немає чатів')}
            </Typography>
        </Box>
    );
}
