import { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, Box, Typography, CircularProgress, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import systemService from '../../services/systemService';
import { MESSENGER_LABELS } from '../../theme/tokens';
import { t, LOCALE } from '../../i18n';

const POLL_MS = 5000;

const JOB_LABELS = { backfill: t('Архівування історії'), embedding: t('Індексація для пошуку'), transcription: t('Розшифровка голосових') };

const sectionTitle = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', color: 'var(--c-text-faint)',
    textTransform: 'uppercase', mb: 1,
};

const card = {
    p: 1.75, borderRadius: 2, bgcolor: 'var(--c-surface)', border: '1px solid var(--c-border)',
};

const fmt = (n) => (n ?? 0).toLocaleString(LOCALE);

const ago = (iso) => {
    if (!iso) return t('ще не запускалось');
    const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return t('{0} с тому', s);
    if (s < 3600) return t('{0} хв тому', Math.round(s / 60));
    return t('{0} год тому', Math.round(s / 3600));
};

function Dot({ ok }) {
    return (
        <Box sx={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            bgcolor: ok ? 'var(--c-success)' : 'var(--c-danger)',
            boxShadow: ok ? '0 0 0 3px rgba(27,158,90,0.15)' : '0 0 0 3px rgba(200,52,31,0.15)',
        }} />
    );
}

function Stat({ label, value, hint }) {
    return (
        <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 700, color: 'var(--c-text)', fontVariantNumeric: 'tabular-nums' }}>{value}</Typography>
            <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>{label}</Typography>
            {hint && <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-faint)', mt: 0.25 }}>{hint}</Typography>}
        </Box>
    );
}

/**
 * Every part of the system on one screen: services, local models, archive and background jobs.
 * Refreshes while open, which makes it a pre-demo check.
 */
export default function SystemStatusDialog({ open, onClose }) {
    const [status, setStatus] = useState(null);
    const [error, setError] = useState('');
    const timerRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        let cancelled = false;
        const load = async () => {
            try {
                const data = await systemService.getStatus();
                if (!cancelled) { setStatus(data); setError(''); }
            } catch (e) {
                if (!cancelled) setError(t(e.response?.data?.message) || t('Бекенд не відповідає'));
            }
        };
        load();
        timerRef.current = setInterval(load, POLL_MS);
        return () => { cancelled = true; clearInterval(timerRef.current); };
    }, [open]);

    const services = status?.services || [];
    const down = services.filter(s => !s.up);
    const ai = status?.ai;
    const data = status?.data;
    const bg = status?.background;
    const indexedShare = data && (data.embedded + data.pendingEmbeddings) > 0
        ? Math.round(100 * data.embedded / (data.embedded + data.pendingEmbeddings)) : 100;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { bgcolor: 'var(--c-surface-alt)', borderRadius: 3, border: '1px solid var(--c-border)' } }}>
            <Box sx={{ px: 3, py: 2.25, display: 'flex', alignItems: 'center', gap: 1.5, borderBottom: '1px solid var(--c-border)' }}>
                <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>{t('Стан системи')}</Typography>
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-faint)' }}>
                        {!status ? t('Перевіряємо…')
                            : down.length === 0 ? t('Усі {0} компонентів працюють · перевірено за {1} мс', services.length, status.tookMs)
                                : t('Не відповідає: {0}', down.map(s => s.name).join(', '))}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose}><CloseIcon sx={{ fontSize: 18 }} /></IconButton>
            </Box>

            <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {error && (
                    <Box sx={{ ...card, borderColor: 'var(--c-danger)' }}>
                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-danger)' }}>⚠ {error}</Typography>
                    </Box>
                )}
                {!status && !error && <CircularProgress size={24} sx={{ alignSelf: 'center', my: 4 }} />}

                {ai && (
                    <Box sx={{
                        ...card, display: 'flex', alignItems: 'center', gap: 1.5,
                        borderColor: ai.local ? 'var(--c-success)' : 'var(--c-danger)',
                    }}>
                        {ai.local
                            ? <LockOutlinedIcon sx={{ color: 'var(--c-success)', fontSize: 22 }} />
                            : <WarningAmberIcon sx={{ color: 'var(--c-danger)', fontSize: 22 }} />}
                        <Box>
                            <Typography sx={{ fontSize: 13.5, fontWeight: 700, color: 'var(--c-text)' }}>
                                {ai.local ? t('Усі мовні моделі працюють локально') : t('Модель працює на віддаленому сервері')}
                            </Typography>
                            <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-faint)' }}>
                                Ollama: {ai.ollamaUrl}{t(' · Whisper: власний контейнер · листування не залишає цей комп\'ютер')}
                            </Typography>
                        </Box>
                    </Box>
                )}

                {services.length > 0 && (
                    <Box>
                        <Typography sx={sectionTitle}>{t('Мікросервіси')}</Typography>
                        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 1 }}>
                            {services.map(s => (
                                <Box key={s.key} sx={{ ...card, display: 'flex', alignItems: 'center', gap: 1.25, py: 1.25 }}>
                                    <Dot ok={s.up} />
                                    <Box sx={{ flex: 1, minWidth: 0 }}>
                                        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>{s.name}</Typography>
                                        <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {s.detail ? `${s.role} · ${s.detail}` : s.role}
                                        </Typography>
                                    </Box>
                                    <Typography sx={{ fontSize: 10.5, color: 'var(--c-text-faint)', fontVariantNumeric: 'tabular-nums' }}>
                                        {s.latencyMs}{t(' мс')}
                                    </Typography>
                                </Box>
                            ))}
                        </Box>
                    </Box>
                )}

                {ai && (
                    <Box>
                        <Typography sx={sectionTitle}>{t('Локальні моделі')}</Typography>
                        <Box sx={{ ...card, display: 'flex', flexDirection: 'column', gap: 1 }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                <Dot ok={ai.reachable} />
                                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)', flex: 1 }}>
                                    {t('Мовні моделі (аналіз, дайджест, автовідповідь): ')}{ai.models.length ? ai.models.join(', ') : t('Ollama не відповідає')}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                <Dot ok={ai.reachable} />
                                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)', flex: 1 }}>
                                    {t('Вектори для пошуку за змістом: ')}{ai.embeddingModel}
                                </Typography>
                            </Box>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                <Dot ok={ai.whisperUp} />
                                <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)', flex: 1 }}>
                                    {t('Розпізнавання мовлення: Whisper ')}{ai.whisperModel}
                                </Typography>
                            </Box>
                            <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)', mt: 0.5 }}>
                                {t('Зараз у пам\'яті: ')}{ai.loaded.length ? ai.loaded.join(', ') : t('жодної — перший запит завантажить модель з диска')}
                            </Typography>
                        </Box>
                    </Box>
                )}

                {data && (
                    <Box>
                        <Typography sx={sectionTitle}>{t('Локальний архів')}</Typography>
                        <Box sx={{ ...card, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2 }}>
                            <Stat label={t('повідомлень')} value={fmt(data.messages)} />
                            <Stat label={t('чатів з історією')} value={fmt(data.chatsWithMessages)} />
                            <Stat label={t('проіндексовано за змістом')} value={`${indexedShare}%`}
                                hint={data.pendingEmbeddings ? t('ще {0} у черзі', fmt(data.pendingEmbeddings)) : t('{0} векторів', fmt(data.embedded))} />
                            <Stat label={t('голосових розшифровано')} value={`${fmt(data.transcribed)} / ${fmt(data.voiceMessages)}`} />
                        </Box>
                    </Box>
                )}

                {bg && (
                    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
                        <Box>
                            <Typography sx={sectionTitle}>{t('Фонові задачі')}</Typography>
                            <Box sx={{ ...card, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 0.25 }}>
                                    {bg.running ? t('Зараз працює: {0}', JOB_LABELS[bg.running] || bg.running)
                                        : bg.userActive ? t('Чекають, поки ви не активні — щоб не гальмувати інтерфейс')
                                            : t('Простій — задачі запускаються за розкладом')}
                                </Typography>
                                {Object.keys(JOB_LABELS).map(job => (
                                    <Box key={job} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)' }}>{JOB_LABELS[job]}</Typography>
                                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
                                            {bg.running === job ? t('працює…') : ago(bg.lastRuns?.[job])}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                        <Box>
                            <Typography sx={sectionTitle}>{t('Підключені акаунти')}</Typography>
                            <Box sx={{ ...card, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                                {(status.accounts || []).length === 0 && (
                                    <Typography sx={{ fontSize: 12.5, color: 'var(--c-text-faint)' }}>{t('Жодного')}</Typography>
                                )}
                                {(status.accounts || []).map((a, i) => (
                                    <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                                        <Dot ok={a.connected} />
                                        <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)', flex: 1 }}>
                                            {MESSENGER_LABELS[a.messengerType] || a.messengerType}
                                        </Typography>
                                        <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>
                                            {a.label}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    </Box>
                )}
            </DialogContent>
        </Dialog>
    );
}
