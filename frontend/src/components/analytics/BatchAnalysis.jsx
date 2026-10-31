import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, CircularProgress, IconButton, Tooltip } from '@mui/material';
import LlmProgress from './LlmProgress';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import analysisService from '../../services/analysisService';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { radius, numeric } from '../../theme/tokens';
import { usePresentation } from '../../context/PresentationContext';
import { t, LOCALE } from '../../i18n';

const RUNNING = new Set(['PENDING', 'RUNNING']);

/**
 * One question asked of every chat at once ("where should I look?"). Metrics are computed for all
 * chats; the model reads only the top of the ranking, which keeps it feasible without a GPU.
 */
export default function BatchAnalysis() {
    const [rankings, setRankings] = useState([]);
    const [models, setModels] = useState([]);
    const [prompts, setPrompts] = useState([]);

    const [ranking, setRanking] = useState('UNANSWERED');
    const [peopleOnly, setPeopleOnly] = useState(true);
    const [minMessages, setMinMessages] = useState(10);
    const [topN, setTopN] = useState(3);
    const [model, setModel] = useState('');
    const [chosenPrompts, setChosenPrompts] = useState(new Set());

    const [batches, setBatches] = useState([]);
    const [activeId, setActiveId] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pollRef = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const [rankingsResponse, optionsResponse, promptsResponse] = await Promise.all([
                    analysisService.getRankings(),
                    analysisService.getOptions(),
                    analysisService.getPrompts(),
                ]);
                setRankings(rankingsResponse.data);
                setModels(optionsResponse.data.models || []);
                setPrompts(promptsResponse.data);
            } catch {
                setError(t('Не вдалося завантажити налаштування'));
            }
        })();
    }, []);

    const load = useCallback(async () => {
        try {
            const { data } = await analysisService.getBatches();
            setBatches(data);
            setActiveId(current => current ?? data[0]?.id ?? null);
        } catch { /* an empty list speaks for itself */ }
    }, []);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const unfinished = batches.some(batch => RUNNING.has(batch.status));
        if (!unfinished) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return;
        }
        if (pollRef.current) return;
        pollRef.current = setInterval(load, 3000);
        return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    }, [batches, load]);

    const start = async () => {
        setBusy(true);
        try {
            const { data } = await analysisService.startBatch({
                ranking, peopleOnly, minMessages,
                topN: model ? topN : 0,
                model: model || null,
                promptIds: [...chosenPrompts],
                includeSummary: true,
                messageLimit: 200,
            });
            setBatches(current => [data, ...current]);
            setActiveId(data.id);
            setError('');
        } catch (e) {
            setError(t(e.response?.data?.error) || t('Не вдалося запустити'));
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id) => {
        await analysisService.removeBatch(id);
        setBatches(current => current.filter(b => b.id !== id));
        setActiveId(current => (current === id ? null : current));
    };

    const active = batches.find(batch => batch.id === activeId);
    const rows = Array.isArray(active?.rows) ? active.rows : [];

    return (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 2.5 }}>
            <Box sx={{ maxWidth: 1180 }}>
                <Typography sx={(t) => ({ fontSize: 13, color: t.c.textMuted, lineHeight: 1.6, mb: 2, maxWidth: 760 })}>
                    {t('Одне питання до всіх чатів одразу. Метрики рахуються для кожного — це швидко й безкоштовно, — а модель читає лише кілька верхніх. Саме тому це працює на процесорі.')}
                </Typography>

                {error && (
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger, mb: 1.5 })}>{error}</Typography>
                )}

                <Box sx={(t) => ({
                    p: 2, mb: 3, borderRadius: radius.md,
                    border: `1px solid ${t.c.border}`, bgcolor: t.c.surface,
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: 2, alignItems: 'end',
                })}>
                    <Field label={t('Що шукаємо')}>
                        <Select value={ranking} onChange={setRanking}>
                            {rankings.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                        </Select>
                    </Field>

                    <Field label={t('Які чати')}>
                        <Select value={peopleOnly ? 'people' : 'all'}
                                onChange={(v) => setPeopleOnly(v === 'people')}>
                            <option value="people">{t('Тільки люди')}</option>
                            <option value="all">{t('Усі, крім службових')}</option>
                        </Select>
                    </Field>

                    <Field label={t('Мінімум повідомлень')}>
                        <NumberBox value={minMessages} onChange={setMinMessages} />
                    </Field>

                    <Field label={t('Модель читає')}>
                        <Select value={model} onChange={setModel}>
                            <option value="">{t('Нікого — лише метрики')}</option>
                            {models.map(name => <option key={name} value={name}>{name}</option>)}
                        </Select>
                    </Field>

                    {model && (
                        <Field label={t('Скільки верхніх чатів')}>
                            <NumberBox value={topN} onChange={setTopN} />
                        </Field>
                    )}

                    <Box
                        onClick={busy ? undefined : start}
                        role="button"
                        tabIndex={0}
                        sx={(t) => ({
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75,
                            py: 0.9, px: 2, borderRadius: radius.md,
                            bgcolor: t.c.accent, color: t.c.onAccent,
                            fontSize: 12.5, fontWeight: 700, cursor: busy ? 'default' : 'pointer',
                            '&:hover': { bgcolor: t.c.accentHover },
                        })}
                    >
                        {busy ? <CircularProgress size={13} sx={{ color: 'inherit' }} />
                            : <PlayArrowIcon sx={{ fontSize: 17 }} />}
                        {t('Сканувати')}
                    </Box>
                </Box>

                {model && prompts.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 3, mt: -1.5 }}>
                        <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint, alignSelf: 'center', mr: 0.5 })}>
                            {t('Питання до верхніх чатів:')}
                        </Typography>
                        {prompts.map(prompt => {
                            const on = chosenPrompts.has(prompt.id);
                            return (
                                <Box
                                    key={prompt.id}
                                    onClick={() => setChosenPrompts(current => {
                                        const next = new Set(current);
                                        next.has(prompt.id) ? next.delete(prompt.id) : next.add(prompt.id);
                                        return next;
                                    })}
                                    sx={(t) => ({
                                        px: 1, py: 0.4, borderRadius: radius.pill, cursor: 'pointer',
                                        fontSize: 11.5, fontWeight: 600,
                                        bgcolor: on ? t.c.accentSoft : 'transparent',
                                        border: `1px solid ${on ? t.c.accent : t.c.border}`,
                                        color: on ? t.c.accentText : t.c.textMuted,
                                    })}
                                >
                                    {prompt.name}
                                </Box>
                            );
                        })}
                    </Box>
                )}

                {batches.length > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                        {batches.map(batch => (
                            <Box
                                key={batch.id}
                                onClick={() => setActiveId(batch.id)}
                                sx={(t) => ({
                                    display: 'flex', alignItems: 'center', gap: 0.75,
                                    px: 1.25, py: 0.6, borderRadius: radius.md, cursor: 'pointer',
                                    bgcolor: batch.id === activeId ? t.c.surfaceActive : t.c.surface,
                                    border: `1px solid ${batch.id === activeId ? t.c.borderStrong : t.c.border}`,
                                    '&:hover .batch-delete': { opacity: 1 },
                                })}
                            >
                                <Box sx={(t) => ({
                                    width: 6, height: 6, borderRadius: '50%',
                                    bgcolor: batch.status === 'DONE' ? t.c.success
                                        : batch.status === 'FAILED' ? t.c.danger : t.c.textFaint,
                                })} />
                                <Typography sx={(t) => ({ fontSize: 11.5, fontWeight: 650, color: t.c.text })}>
                                    {batch.rankingLabel}
                                </Typography>
                                <Typography sx={(t) => ({ ...numeric, fontSize: 10.5, color: t.c.textFaint })}>
                                    {new Date(batch.createdAt).toLocaleString(LOCALE, {
                                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                                    })}
                                </Typography>
                                {RUNNING.has(batch.status) && <CircularProgress size={11} />}
                                <IconButton
                                    className="batch-delete" size="small"
                                    onClick={(e) => { e.stopPropagation(); remove(batch.id); }}
                                    sx={(t) => ({ opacity: 0, width: 20, height: 20, '&:hover': { color: t.c.danger } })}
                                >
                                    <DeleteOutlineIcon sx={{ fontSize: 13 }} />
                                </IconButton>
                            </Box>
                        ))}
                    </Box>
                )}

                {active && RUNNING.has(active.status) && (
                    <LlmProgress since={active.createdAt} queued={active.status === 'PENDING'}
                        subject={t('найактивніші чати (метрики вже пораховано)')} />
                )}

                {active?.error && (
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger, mb: 2 })}>{active.error}</Typography>
                )}

                {rows.length > 0 && (
                    <>
                        <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint, mb: 1 })}>
                            {active.scannedCount}{t(' чатів · ')}{active.rankingLabel.toLowerCase()}
                            {active.model && t(' · модель читала {0}', active.modelTopN)}
                        </Typography>

                        <Box sx={(t) => ({
                            border: `1px solid ${t.c.border}`, borderRadius: radius.md,
                            bgcolor: t.c.surface, overflow: 'hidden',
                        })}>
                            {rows.map((row, index) => (
                                <Row key={row.chatId} row={row} index={index}
                                     ranking={active.ranking} />
                            ))}
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}

/**
 * One chat in the ranking, its score shown in the ranking's own units (hours, seconds, a share).
 */
function Row({ row, index, ranking }) {
    const { name } = usePresentation();
    const scored = row.score != null;

    return (
        <Box sx={(t) => ({
            display: 'flex', alignItems: 'center', gap: 1.5,
            px: 1.75, py: 1.1,
            borderTop: index === 0 ? 'none' : `1px solid ${t.c.border}`,
            bgcolor: row.runId ? t.c.accentSoft : 'transparent',
        })}>
            <Typography sx={(t) => ({
                ...numeric, width: 22, fontSize: 12, fontWeight: 700,
                color: index < 3 && scored ? t.c.accentText : t.c.textFaint,
            })}>
                {index + 1}
            </Typography>

            <MessengerGlyph type={row.messengerType} size={13} />

            <Typography noWrap sx={(t) => ({
                flex: 1, minWidth: 0, fontSize: 13, fontWeight: 650, color: t.c.text,
            })}>
                {name(row.chatName) || '—'}
            </Typography>

            {/* Marked, not hidden: knowing the model read this one is what tells you where
                to look for a written answer rather than a number. */}
            {row.runId && (
                <Tooltip title={t('Модель прочитала цей чат — результат в «Історії»')}>
                    <Typography sx={(t) => ({
                        fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                        textTransform: 'uppercase', color: t.c.accentText,
                    })}>
                        {t('прочитано')}
                    </Typography>
                </Tooltip>
            )}

            <Typography sx={(t) => ({ ...numeric, fontSize: 11, color: t.c.textFaint, width: 76, textAlign: 'right' })}>
                {row.messages}{t(' повід.')}
            </Typography>

            <Typography sx={(t) => ({
                ...numeric, fontSize: 13, fontWeight: 700, width: 96, textAlign: 'right',
                color: scored ? t.c.text : t.c.textFaint,
            })}>
                {formatScore(ranking, row.score)}
            </Typography>
        </Box>
    );
}

function formatScore(ranking, score) {
    if (score == null) return '—';
    switch (ranking) {
        case 'UNANSWERED': return score < 24
            ? t('{0} год', Math.round(score))
            : t('{0} дн', Math.round(score / 24));
        case 'MY_RESPONSE': return score < 60 ? t('{0} с', Math.round(score))
            : score < 3600 ? t('{0} хв', Math.round(score / 60))
                : t('{0} год', (score / 3600).toFixed(1));
        case 'MY_SHARE':
        case 'NIGHT': return `${Math.round(score * 100)}%`;
        case 'FADING': return t('{0}/тижд', (-score).toFixed(1));
        default: return String(Math.round(score));
    }
}

function Field({ label, children }) {
    return (
        <Box>
            <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint, mb: 0.4 })}>{label}</Typography>
            {children}
        </Box>
    );
}

function Select({ value, onChange, children }) {
    return (
        <Box
            component="select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            sx={(t) => ({
                width: '100%', py: 0.85, px: 1.25,
                borderRadius: radius.md, border: `1px solid ${t.c.border}`,
                bgcolor: t.c.bg, color: t.c.text,
                fontFamily: 'inherit', fontSize: 12.5, outline: 'none',
            })}
        >
            {children}
        </Box>
    );
}

function NumberBox({ value, onChange }) {
    return (
        <Box
            component="input"
            type="number"
            min={1}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value === '' ? '' : globalThis.Number(e.target.value))}
            sx={(t) => ({
                width: '100%', boxSizing: 'border-box', py: 0.85, px: 1.25,
                borderRadius: radius.md, border: `1px solid ${t.c.border}`,
                bgcolor: t.c.bg, color: t.c.text,
                fontFamily: 'inherit', fontSize: 12.5, outline: 'none',
            })}
        />
    );
}
