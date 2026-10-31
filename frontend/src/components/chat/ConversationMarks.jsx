import { Box, Typography } from '@mui/material';
import KeyboardArrowDownRoundedIcon from '@mui/icons-material/KeyboardArrowDownRounded';
import CloudUploadOutlinedIcon from '@mui/icons-material/CloudUploadOutlined';
import { radius } from '../../theme/tokens';
import { formatDayLabel } from '../../utils/format';
import { t } from '../../i18n';

/* Everything drawn over or between the messages that is not a message itself. */

const pill = { fontSize: 10, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', borderRadius: 999, px: 1.25, py: 0.35 };

/** «Сьогодні», «Вчора», «12 жовтня» between days. */
export function DayDivider({ timestamp }) {
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, my: 2.5 }}>
            <Box sx={(t) => ({ flex: 1, height: 1, bgcolor: t.c.border })} />
            <Typography sx={(t) => ({ ...pill, color: t.c.textFaint, bgcolor: t.c.surface, border: `1px solid ${t.c.border}` })}>
                {formatDayLabel(timestamp)}
            </Typography>
            <Box sx={(t) => ({ flex: 1, height: 1, bgcolor: t.c.border })} />
        </Box>
    );
}

/** Where the unread part of the conversation begins; the chat opens scrolled to it. */
export function UnreadDivider() {
    return (
        <Box data-unread-divider sx={{ display: 'flex', alignItems: 'center', gap: 1.5, my: 2 }}>
            <Box sx={(t) => ({ flex: 1, height: 2, borderRadius: 1, bgcolor: t.c.accentSoft })} />
            <Typography sx={(t) => ({ fontSize: 11, fontWeight: 700, color: t.c.accentText, bgcolor: t.c.accentSoft, borderRadius: 999, px: 1.5, py: 0.35 })}>
                {t('Непрочитані повідомлення')}
            </Typography>
            <Box sx={(t) => ({ flex: 1, height: 2, borderRadius: 1, bgcolor: t.c.accentSoft })} />
        </Box>
    );
}

/** Back to the newest messages, with how many arrived while the user was reading above. */
export function JumpToLatest({ unseen, onClick }) {
    return (
        <Box
            role="button"
            tabIndex={0}
            title={t('До останніх повідомлень')}
            onClick={onClick}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
            sx={(t) => ({
                position: 'absolute', right: 24, bottom: 96, zIndex: 20,
                width: 42, height: 42, borderRadius: '50%', cursor: 'pointer',
                bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, boxShadow: t.c.shadowRaised,
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.c.textMuted,
                animation: 'jumpIn .18s ease-out',
                '@keyframes jumpIn': { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'none' } },
                '&:hover': { color: t.c.text, transform: 'translateY(-1px)' },
            })}
        >
            <KeyboardArrowDownRoundedIcon sx={{ fontSize: 26 }} />
            {unseen > 0 && (
                <Box sx={(t) => ({
                    position: 'absolute', top: -6, right: -4, minWidth: 20, height: 20, px: 0.5,
                    borderRadius: radius.pill, bgcolor: t.c.accent, color: t.c.onAccent,
                    fontSize: 11, fontWeight: 750, display: 'flex', alignItems: 'center', justifyContent: 'center',
                })}>
                    {unseen > 99 ? '99+' : unseen}
                </Box>
            )}
        </Box>
    );
}

/** Shown while a file is dragged over the chat. */
export function DropOverlay() {
    return (
        <Box sx={(t) => ({
            position: 'absolute', inset: 12, zIndex: 50, pointerEvents: 'none',
            border: `2px dashed ${t.c.accent}`, borderRadius: radius.xl, bgcolor: t.c.accentSoft,
            backdropFilter: 'blur(2px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        })}>
            <CloudUploadOutlinedIcon sx={(t) => ({ fontSize: 44, color: t.c.accentText })} />
            <Typography sx={(t) => ({ fontSize: 15, fontWeight: 700, color: t.c.accentText })}>{t('Відпустіть, щоб прикріпити')}</Typography>
        </Box>
    );
}
