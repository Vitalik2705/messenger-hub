import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, Typography, IconButton, CircularProgress, Tooltip } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import AddIcon from '@mui/icons-material/Add';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import analysisService from '../services/analysisService';
import AnalysisResult from '../components/dialogs/analysis/AnalysisResult';
import AutoReplySettings from '../components/analytics/AutoReplySettings';
import BatchAnalysis from '../components/analytics/BatchAnalysis';
import DigestPanel from '../components/analytics/DigestPanel';
import { radius, numeric } from '../theme/tokens';
import { usePresentation } from '../context/PresentationContext';
import { t, LOCALE } from '../i18n';

const RUNNING = new Set(['PENDING', 'RUNNING']);

/**
 * Analysis history and results on a full page, including side-by-side comparison of two runs of the
 * same chat.
 */
export default function AnalyticsPage() {
    const navigate = useNavigate();
    // The digest opens first: it answers "what did I miss", which is the question
    // someone arriving at this page almost always has.
    const [tab, setTab] = useState('digest');

    return (
        <Box sx={(t) => ({
            height: '100vh', display: 'flex', flexDirection: 'column',
            bgcolor: t.c.bg, overflow: 'hidden',
        })}>
            <Box sx={(t) => ({
                px: 2.5, py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5,
                borderBottom: `1px solid ${t.c.border}`, bgcolor: t.c.surfaceAlt, flexShrink: 0,
            })}>
                <Tooltip title={t('До чатів')}>
                    <IconButton size="small" onClick={() => navigate('/dashboard')}
                                sx={{ width: 32, height: 32 }}>
                        <ArrowBackIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Tooltip>

                <Typography sx={(t) => ({
                    fontSize: 16, fontWeight: 800, letterSpacing: '-0.02em', color: t.c.text,
                })}>
                    {t('Аналітика')}
                </Typography>

                <Box sx={{ flex: 1 }} />

                {[['digest', t('Дайджест')], ['history', t('Історія')], ['batch', t('По всіх чатах')], ['prompts', t('Мої метрики')], ['autoreply', t('Автовідповідь')]].map(([key, label]) => (
                    <Box
                        key={key}
                        onClick={() => setTab(key)}
                        role="button"
                        tabIndex={0}
                        sx={(t) => ({
                            px: 1.5, py: 0.7, borderRadius: radius.md, cursor: 'pointer',
                            fontSize: 12.5, fontWeight: tab === key ? 700 : 500,
                            color: tab === key ? t.c.text : t.c.textMuted,
                            bgcolor: tab === key ? t.c.surfaceActive : 'transparent',
                            '&:hover': { bgcolor: t.c.surfaceHover },
                        })}
                    >
                        {label}
                    </Box>
                ))}
            </Box>

            {tab === 'digest' ? <DigestPanel />
                : tab === 'history' ? <History />
                    : tab === 'batch' ? <BatchAnalysis />
                        : tab === 'prompts' ? <Prompts />
                            : <AutoReplySettings />}
        </Box>
    );
}

// ── History ───────────────────────────────────────────────────────────────────

function History() {
    const { name } = usePresentation();
    const [runs, setRuns] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [loading, setLoading] = useState(true);
    const pollRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const { data } = await analysisService.getRuns();
            setRuns(data);
            setActiveId(current => current ?? data[0]?.id ?? null);
        } catch { /* an empty list is its own message */ } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    // Polls only while something is unfinished — a finished history cannot change on its own.
    useEffect(() => {
        const unfinished = runs.some(run => RUNNING.has(run.status));
        if (!unfinished) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return;
        }
        if (pollRef.current) return;
        pollRef.current = setInterval(load, 2500);
        return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    }, [runs, load]);

    const remove = async (id) => {
        try {
            await analysisService.remove(id);
            setRuns(current => current.filter(run => run.id !== id));
            setActiveId(current => (current === id ? null : current));
        } catch { /* stays until the next load */ }
    };

    const active = runs.find(run => run.id === activeId);
    /**
     * Runs launched together with the selected one. A comparison is stored as separate runs, one
     * per model, and paired up here.
     */
    const siblings = active?.comparisonId
        ? runs.filter(run => run.comparisonId === active.comparisonId)
        : [];

    if (loading) {
        return <Centered><CircularProgress size={20} /></Centered>;
    }
    if (runs.length === 0) {
        return (
            <Centered>
                <Typography sx={(t) => ({ fontSize: 13, color: t.c.textMuted })}>
                    {t('Аналізів ще не було')}
                </Typography>
                <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint, mt: 0.5 })}>
                    {t('Запустіть перший з іконки графіка в шапці будь-якого чату')}
                </Typography>
            </Centered>
        );
    }

    return (
        <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
            <Box sx={(t) => ({
                width: 320, flexShrink: 0, overflowY: 'auto',
                borderRight: `1px solid ${t.c.border}`, bgcolor: t.c.surfaceAlt, py: 1,
            })}>
                {runs.map(run => (
                    <Box
                        key={run.id}
                        onClick={() => setActiveId(run.id)}
                        sx={(t) => ({
                            display: 'flex', alignItems: 'center', gap: 1,
                            px: 2, py: 1.1, cursor: 'pointer',
                            bgcolor: run.id === activeId ? t.c.surfaceActive : 'transparent',
                            borderLeft: `2px solid ${run.id === activeId ? t.c.accent : 'transparent'}`,
                            '&:hover': { bgcolor: run.id === activeId ? t.c.surfaceActive : t.c.surfaceHover },
                            '&:hover .run-delete': { opacity: 1 },
                        })}
                    >
                        <Box sx={(t) => ({
                            width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                            bgcolor: run.status === 'DONE' ? t.c.success
                                : run.status === 'FAILED' ? t.c.danger : t.c.textFaint,
                        })} />
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={(t) => ({
                                fontSize: 12.5, fontWeight: 650, color: t.c.text,
                            })}>
                                {name(run.chatName) || '—'}
                            </Typography>
                            <Typography noWrap sx={(t) => ({
                                ...numeric, fontSize: 10.5, color: t.c.textFaint, mt: 0.1,
                            })}>
                                {run.comparisonId ? '⇄ ' : ''}{describe(run)}
                            </Typography>
                        </Box>
                        {RUNNING.has(run.status) && <CircularProgress size={12} />}
                        <IconButton
                            className="run-delete"
                            size="small"
                            onClick={(e) => { e.stopPropagation(); remove(run.id); }}
                            sx={(t) => ({
                                opacity: 0, width: 24, height: 24, transition: 'opacity .12s',
                                '&:hover': { color: t.c.danger },
                            })}
                        >
                            <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                    </Box>
                ))}
            </Box>

            <Box sx={{ flex: 1, minWidth: 0, overflowY: 'auto', px: 3, py: 2.5 }}>
                {!active ? (
                    <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textFaint })}>
                        {t('Оберіть аналіз зліва')}
                    </Typography>
                ) : RUNNING.has(active.status) ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <CircularProgress size={16} />
                        <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textMuted })}>
                            {active.status === 'PENDING'
                                ? t('У черзі — аналізи виконуються по одному.')
                                : t('Модель працює.')}
                        </Typography>
                    </Box>
                ) : (
                    /* 1180, not 760. The metric cards are a grid now, and a column narrow
                       enough for prose forced them back into a single file with the rest of
                       a wide screen left blank. */
                    <Box sx={{ maxWidth: 1180 }}>
                        <Typography sx={(t) => ({ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: t.c.text })}>
                            {name(active.chatName)}
                        </Typography>

                        {/* The run's own facts as chips: what was read, by which model, how
                           long it took. Previously one grey line doing four jobs. */}
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mt: 1, mb: 2.5 }}>
                            <Chip label={new Date(active.createdAt).toLocaleString(LOCALE, {
                                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
                            })} />
                            {active.messagesAnalysed != null && (
                                <Chip label={t('{0} повідомлень', active.messagesAnalysed)} />
                            )}
                            {active.model && <Chip label={active.model} accent />}
                            {active.modelMs > 0 && <Chip label={t('{0} с', Math.round(active.modelMs / 1000))} />}
                            {active.metrics?.length > 0 && (
                                <Chip label={t('{0} метрик', active.metrics.length)} />
                            )}
                        </Box>

                        {siblings.length > 1
                            ? <Comparison runs={siblings} />
                            : <AnalysisResult run={active} />}
                    </Box>
                )}
            </Box>
        </Box>
    );
}

// ── The user's own questions ──────────────────────────────────────────────────

const EXAMPLES = [
    { name: t('Тон спілкування'), prompt: t('Опиши тон спілкування: формальний чи дружній, чи є напруга або роздратування.') },
    { name: t('Невиконані обіцянки'), prompt: t('Знайди обіцянки, які хтось дав і, судячи з подальшого листування, не виконав.') },
    { name: t('Хто про що просить'), prompt: t('Перелічи прохання, які співрозмовник адресував мені, і чи були вони закриті.') },
];

function Prompts() {
    const [prompts, setPrompts] = useState([]);
    const [editing, setEditing] = useState(null);
    const [name, setName] = useState('');
    const [text, setText] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        try {
            const { data } = await analysisService.getPrompts();
            setPrompts(data);
        } catch { setError(t('Не вдалося завантажити метрики')); }
    }, []);

    useEffect(() => {
        let cancelled = false;
        analysisService.getPrompts()
            .then(({ data }) => { if (!cancelled) setPrompts(data); })
            .catch(() => { if (!cancelled) setError(t('Не вдалося завантажити метрики')); });
        return () => { cancelled = true; };
    }, []);

    const edit = (prompt) => {
        setEditing(prompt?.id ?? 'new');
        setName(prompt?.name || '');
        setText(prompt?.prompt || '');
        setError('');
    };

    const save = async () => {
        try {
            if (editing === 'new') await analysisService.createPrompt({ name, prompt: text });
            else await analysisService.updatePrompt(editing, { name, prompt: text });
            setEditing(null);
            await load();
        } catch (e) {
            setError(t(e.response?.data?.error) || t('Не вдалося зберегти'));
        }
    };

    const remove = async (id) => {
        await analysisService.removePrompt(id);
        await load();
    };

    return (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 2.5 }}>
            <Box sx={{ maxWidth: 1180 }}>
                <Typography sx={(t) => ({ fontSize: 13, color: t.c.textMuted, lineHeight: 1.6, mb: 2, maxWidth: 720 }) }>
                    {t('Вбудовані метрики рахують те, що можна порахувати. Тут — те, що треба прочитати: ви задаєте назву й питання, і модель відповідає на нього по кожному обраному чату. Одне питання = один запит до моделі, тож кожне з них коштує окремого очікування.')}
                </Typography>

                {error && (
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger, mb: 1.5 })}>{error}</Typography>
                )}

                {editing && (
                    <Box sx={(t) => ({
                        p: 2, mb: 2, maxWidth: 620, borderRadius: radius.md,
                        border: `1px solid ${t.c.accent}`, bgcolor: t.c.surface,
                    })}>
                        <Field label={t('Назва')} value={name} onChange={setName}
                               placeholder={t('Наприклад: Невиконані обіцянки')} />
                        <Field label={t('Питання до моделі')} value={text} onChange={setText} multiline
                               placeholder={t('Що саме шукати в листуванні?')} />
                        <Box sx={{ display: 'flex', gap: 1, mt: 1.5 }}>
                            <Action primary onClick={save}>{t('Зберегти')}</Action>
                            <Action onClick={() => setEditing(null)}>{t('Скасувати')}</Action>
                        </Box>
                    </Box>
                )}

                {!editing && (
                    <Box
                        onClick={() => edit(null)}
                        role="button"
                        tabIndex={0}
                        sx={(t) => ({
                            display: 'inline-flex', alignItems: 'center', gap: 0.75,
                            px: 1.5, py: 0.85, mb: 2, borderRadius: radius.md,
                            bgcolor: t.c.accentText, color: t.c.onAccent,
                            fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                            '&:hover': { bgcolor: t.c.accentHover },
                        })}
                    >
                        <AddIcon sx={{ fontSize: 16 }} />
                        {t('Нова метрика')}
                    </Box>
                )}

                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    gap: 1,
                }}>
                    {prompts.map(prompt => (
                        <Box key={prompt.id} sx={(t) => ({
                            p: 1.5, borderRadius: radius.md,
                            border: `1px solid ${t.c.border}`, bgcolor: t.c.surface,
                            '&:hover .prompt-actions': { opacity: 1 },
                        })}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography sx={(t) => ({
                                    flex: 1, fontSize: 13, fontWeight: 700, color: t.c.text,
                                })}>
                                    {prompt.name}
                                </Typography>
                                <Box className="prompt-actions" sx={{ opacity: 0, transition: 'opacity .12s' }}>
                                    <IconButton size="small" onClick={() => edit(prompt)}
                                                sx={{ width: 26, height: 26 }}>
                                        <EditOutlinedIcon sx={{ fontSize: 15 }} />
                                    </IconButton>
                                    <IconButton size="small" onClick={() => remove(prompt.id)}
                                                sx={(t) => ({ width: 26, height: 26, '&:hover': { color: t.c.danger } })}>
                                        <DeleteOutlineIcon sx={{ fontSize: 15 }} />
                                    </IconButton>
                                </Box>
                            </Box>
                            <Typography sx={(t) => ({
                                fontSize: 12, color: t.c.textMuted, mt: 0.4, lineHeight: 1.5,
                            })}>
                                {prompt.prompt}
                            </Typography>
                        </Box>
                    ))}
                </Box>

                {prompts.length === 0 && !editing && (
                    <Box sx={{ mt: 1 }}>
                        <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint, mb: 1 })}>
                            {t('Приклади, з яких можна почати:')}
                        </Typography>
                        <Box sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                            gap: 1,
                        }}>
                        {EXAMPLES.map(example => (
                            <Box
                                key={example.name}
                                onClick={() => { setEditing('new'); setName(example.name); setText(example.prompt); }}
                                sx={(t) => ({
                                    p: 1.25, mb: 0.75, borderRadius: radius.md, cursor: 'pointer',
                                    border: `1px dashed ${t.c.borderStrong}`,
                                    '&:hover': { borderColor: t.c.accent },
                                })}
                            >
                                <Typography sx={(t) => ({ fontSize: 12.5, fontWeight: 650, color: t.c.text })}>
                                    {example.name}
                                </Typography>
                                <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint, mt: 0.2 })}>
                                    {example.prompt}
                                </Typography>
                            </Box>
                        ))}
                        </Box>
                    </Box>
                )}
            </Box>
        </Box>
    );
}

// ── Shared bits ───────────────────────────────────────────────────────────────

function describe(run) {
    return [
        new Date(run.createdAt).toLocaleString(LOCALE, {
            day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
        }),
        run.model,
        run.messagesAnalysed != null && t('{0} повід.', run.messagesAnalysed),
        run.modelMs && t('{0} с', Math.round(run.modelMs / 1000)),
    ].filter(Boolean).join(' · ');
}

/**
 * Two runs of the same chat side by side. Metrics are identical by construction, so they are shown
 * once.
 */
function Comparison({ runs }) {
    const fastest = Math.min(...runs.map(run => run.modelMs || Infinity));
    return (
        <Box>
            <AnalysisResult run={{ ...runs[0], insights: null, custom: null, error: null }} />

            <Typography sx={(t) => ({
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: t.c.textFaint, mt: 2.5, mb: 1,
            })}>
                {t('Що сказали моделі')}
            </Typography>

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${runs.length}, minmax(0, 1fr))`,
                gap: 1.5,
                alignItems: 'start',
            }}>
                {runs.map(run => (
                    <Box key={run.id}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 1 }}>
                            <Typography sx={(t) => ({
                                fontSize: 13, fontWeight: 750, color: t.c.text,
                            })}>
                                {run.model}
                            </Typography>
                            {/* Which one was quicker, stated rather than left to arithmetic
                                across two corners of the screen. */}
                            <Chip
                                accent={run.modelMs === fastest}
                                label={run.modelMs ? t('{0} с', Math.round(run.modelMs / 1000)) : '—'}
                            />
                            {run.status !== 'DONE' && <Chip label={run.status} />}
                        </Box>
                        <AnalysisResult run={{ ...run, metricsResult: null }} />
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

function Chip({ label, accent }) {
    return (
        <Box sx={(t) => ({
            ...numeric,
            px: 1, py: 0.4, borderRadius: radius.pill,
            fontSize: 11, fontWeight: 600,
            bgcolor: accent ? t.c.accentSoft : t.c.surfaceSunken,
            color: accent ? t.c.accent : t.c.textMuted,
            border: `1px solid ${accent ? t.c.accent : 'transparent'}`,
        })}>
            {label}
        </Box>
    );
}

function Centered({ children }) {
    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center' }}>
            {children}
        </Box>
    );
}

function Field({ label, value, onChange, placeholder, multiline }) {
    return (
        <Box sx={{ mb: 1.25 }}>
            <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint, mb: 0.4 })}>
                {label}
            </Typography>
            <Box
                component={multiline ? 'textarea' : 'input'}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                rows={multiline ? 3 : undefined}
                sx={(t) => ({
                    width: '100%', boxSizing: 'border-box',
                    px: 1.25, py: 0.9, borderRadius: radius.md,
                    border: `1px solid ${t.c.border}`, bgcolor: t.c.bg, color: t.c.text,
                    fontFamily: 'inherit', fontSize: 12.5, outline: 'none', resize: 'vertical',
                    '&:focus': { borderColor: t.c.accent },
                })}
            />
        </Box>
    );
}

function Action({ children, onClick, primary }) {
    return (
        <Box
            onClick={onClick}
            role="button"
            tabIndex={0}
            sx={(t) => ({
                px: 1.5, py: 0.7, borderRadius: radius.md, cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700,
                bgcolor: primary ? t.c.accent : 'transparent',
                color: primary ? t.c.onAccent : t.c.textMuted,
                border: `1px solid ${primary ? 'transparent' : t.c.border}`,
                '&:hover': { bgcolor: primary ? t.c.accentHover : t.c.surfaceHover },
            })}
        >
            {children}
        </Box>
    );
}
