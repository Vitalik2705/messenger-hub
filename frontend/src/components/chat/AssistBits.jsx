import { useState } from 'react';
import { Box, Typography, IconButton, CircularProgress } from '@mui/material';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import CloseIcon from '@mui/icons-material/Close';
import assistService from '../../services/assistService';
import LlmProgress from '../analytics/LlmProgress';
import { radius, numeric } from '../../theme/tokens';
import { t } from '../../i18n';

const errorOf = (e) => t(e.response?.data?.message) || t('Локальна модель не відповіла');

/**
 * "What did I miss?", offered when a chat opens with many unread messages. Offered rather than run
 * automatically: a summary takes tens of seconds on a CPU.
 */
export function CatchUpBanner({ messages, unread, chatName, onClose }) {
    const [state, setState] = useState({ phase: 'idle' });

    const run = async () => {
        setState({ phase: 'loading', since: new Date().toISOString() });
        try {
            const data = await assistService.catchUp(messages, chatName);
            setState({ phase: 'done', data });
        } catch (e) {
            setState({ phase: 'error', error: errorOf(e) });
        }
    };

    return (
        <Box sx={(t) => ({
            mx: 2.5, mt: 1.5, px: 1.75, py: 1.25, zIndex: 4, position: 'relative',
            bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: radius.lg,
            boxShadow: t.c.shadow, borderLeft: `3px solid ${t.c.accent}`,
            animation: 'bannerIn .2s ease-out',
            '@keyframes bannerIn': { from: { opacity: 0, transform: 'translateY(-6px)' }, to: { opacity: 1, transform: 'none' } },
        })}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <AutoAwesomeIcon sx={(t) => ({ fontSize: 16, color: t.c.accentText })} />
                <Typography sx={(t) => ({ flex: 1, fontSize: 13, fontWeight: 650, color: t.c.text })}>
                    {state.phase === 'done' ? t('Коротко, що ви пропустили') : t('{0} непрочитаних повідомлень', unread)}
                </Typography>
                {state.phase === 'idle' && (
                    <Box role="button" tabIndex={0} onClick={run}
                         onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && run()}
                         sx={(t) => ({
                             px: 1.25, py: 0.5, borderRadius: radius.pill, cursor: 'pointer',
                             bgcolor: t.c.accent, color: t.c.onAccent, fontSize: 12, fontWeight: 700,
                             '&:hover': { bgcolor: t.c.accentHover },
                         })}>
                        {t('✨ Що я пропустив?')}
                    </Box>
                )}
                <IconButton size="small" onClick={onClose} sx={{ width: 26, height: 26 }}>
                    <CloseIcon sx={{ fontSize: 15 }} />
                </IconButton>
            </Box>

            {state.phase === 'loading' && <LlmProgress since={state.since} subject={t('{0} повідомлень', messages.length)} />}
            {state.phase === 'error' && (
                <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger, mt: 0.75 })}>{state.error}</Typography>
            )}
            {state.phase === 'done' && (
                <Box sx={{ mt: 0.75 }}>
                    <Typography data-private sx={(t) => ({ fontSize: 13, lineHeight: 1.55, color: t.c.text })}>
                        {state.data.summary || t('Модель не знайшла, що підсумувати.')}
                    </Typography>
                    {state.data.asks?.length > 0 && (
                        <Box data-private sx={{ mt: 1 }}>
                            <Typography sx={(t) => ({ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.c.textFaint, mb: 0.5 })}>
                                {t('Від вас чекають')}
                            </Typography>
                            {state.data.asks.map((ask, i) => (
                                <Typography key={i} sx={(t) => ({ fontSize: 12.5, color: t.c.textMuted, pl: 1.25, position: 'relative', '&::before': { content: '"•"', position: 'absolute', left: 0, color: t.c.accentText } })}>
                                    {ask}
                                </Typography>
                            ))}
                        </Box>
                    )}
                    <Typography sx={(t) => ({ ...numeric, fontSize: 10.5, color: t.c.textFaint, mt: 1 })}>
                        {[state.data.tone && t('Тон: {0}', state.data.tone), state.data.model, state.data.ms && t('{0} с', Math.round(state.data.ms / 1000)), t('локально')]
                            .filter(Boolean).join(' · ')}
                    </Typography>
                </Box>
            )}
        </Box>
    );
}

/**
 * Two or three short replies the local model would send, as chips above the composer.
 * A click puts the text into the composer — it is never sent on the user's behalf.
 */
export function ReplySuggestions({ messages, chatName, onPick }) {
    const [state, setState] = useState({ phase: 'idle' });

    const run = async () => {
        setState({ phase: 'loading', since: Date.now() });
        try {
            const data = await assistService.suggestReplies(messages.slice(-20), chatName);
            setState(data.replies?.length ? { phase: 'done', data } : { phase: 'error', error: t('Модель не запропонувала варіантів') });
        } catch (e) {
            setState({ phase: 'error', error: errorOf(e) });
        }
    };

    const chip = (t, active) => ({
        px: 1.25, py: 0.55, borderRadius: radius.pill, cursor: 'pointer', fontSize: 12.5,
        bgcolor: active ? t.c.accentSoft : t.c.surface, color: active ? t.c.accentText : t.c.textMuted,
        border: `1px solid ${active ? 'transparent' : t.c.border}`, fontWeight: 600,
        transition: 'transform .1s, border-color .1s', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 360,
        '&:hover': { borderColor: t.c.accent, transform: 'translateY(-1px)' },
    });

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 2.5, pt: 1.25, flexWrap: 'wrap' }}>
            {state.phase === 'idle' && (
                <Box role="button" tabIndex={0} onClick={run} sx={(t) => chip(t, true)}>{t('✨ Варіанти відповіді')}</Box>
            )}
            {state.phase === 'loading' && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CircularProgress size={13} />
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint })}>{t('Локальна модель пише варіанти…')}</Typography>
                </Box>
            )}
            {state.phase === 'error' && (
                <Typography onClick={run} sx={(t) => ({ fontSize: 12, color: t.c.textFaint, cursor: 'pointer' })}>
                    {state.error}{t(' · спробувати ще')}
                </Typography>
            )}
            {state.phase === 'done' && state.data.replies.map((reply) => (
                <Box key={reply} data-private role="button" tabIndex={0} title={reply} onClick={() => onPick(reply)} sx={(t) => chip(t, false)}>
                    {reply}
                </Box>
            ))}
        </Box>
    );
}
