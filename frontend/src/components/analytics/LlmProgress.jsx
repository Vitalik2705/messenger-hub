import { useState, useEffect } from 'react';
import { Box, Typography, LinearProgress } from '@mui/material';
import { numeric } from '../../theme/tokens';
import { t } from '../../i18n';

/**
 * Progress of a long local-model run: a running clock and the current phase. Queued vs running
 * comes from the server; the rest is elapsed time.
 *
 * @param since when the run was created (ISO, server local time)
 * @param queued true while the run waits for the one model slot
 * @param subject what the model is reading, e.g. "до 300 повідомлень"
 */
export default function LlmProgress({ since, queued = false, subject }) {
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const started = since ? new Date(since).getTime() : now;
    const seconds = Math.max(0, Math.round((now - started) / 1000));

    const line = queued
        ? t('У черзі — локальна модель виконує запити по одному')
        : seconds < 60
            ? t('Локальна модель читає {0}', subject || t('листування'))
            : t('Довше, ніж зазвичай: модель працює на процесорі, без відеокарти');

    return (
        <Box sx={{ py: 1.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textMuted, flex: 1 })}>
                    {line}
                </Typography>
                <Typography sx={(t) => ({ ...numeric, fontSize: 12.5, fontWeight: 700, color: t.c.text })}>
                    {seconds}{t(' с')}
                </Typography>
            </Box>
            <LinearProgress
                variant={queued ? 'determinate' : 'indeterminate'}
                value={0}
                sx={(t) => ({
                    height: 3, borderRadius: 2, bgcolor: t.c.surfaceSunken,
                    '& .MuiLinearProgress-bar': { bgcolor: t.c.accent },
                })}
            />
            <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint, mt: 0.75 })}>
                {t('Зазвичай 20–60 с. Дані не залишають цей комп\'ютер.')}
            </Typography>
        </Box>
    );
}
