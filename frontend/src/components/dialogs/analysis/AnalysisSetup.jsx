import { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress, Tooltip } from '@mui/material';
import CheckBoxIcon from '@mui/icons-material/CheckBox';
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank';
import analysisService from '../../../services/analysisService';
import { radius, numeric } from '../../../theme/tokens';
import { t } from '../../../i18n';

const LIMITS = [100, 200, 400];

/** The analysis form, shared by the chat dialog and the analytics page. */
export default function AnalysisSetup({ chat, onStarted, compact }) {
    const [options, setOptions] = useState({ metrics: [], models: [] });
    const [prompts, setPrompts] = useState([]);
    const [selected, setSelected] = useState(new Set());
    const [chosenPrompts, setChosenPrompts] = useState(new Set());
    const [summary, setSummary] = useState(true);
    const [model, setModel] = useState('');
    /** Optional second model, judged on exactly the same conversation. */
    const [rival, setRival] = useState('');
    const [limit, setLimit] = useState(200);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const [optionsResponse, promptsResponse] = await Promise.all([
                    analysisService.getOptions(),
                    analysisService.getPrompts(),
                ]);
                setOptions(optionsResponse.data);
                setPrompts(promptsResponse.data);
                setSelected(new Set(optionsResponse.data.metrics.map(m => m.key)));
                setModel(optionsResponse.data.models?.[0] || '');
            } catch {
                setError(t('Не вдалося завантажити налаштування аналізу'));
            }
        })();
    }, []);

    const toggle = (set, apply) => (key) => {
        const next = new Set(set);
        next.has(key) ? next.delete(key) : next.add(key);
        apply(next);
    };

    // Every model call is a separate generation, so the cost of adding a question is one
    // more wait — stated up front rather than discovered.
    const perModelCalls = model ? (summary ? 1 : 0) + chosenPrompts.size : 0;
    const modelCalls = perModelCalls * (rival ? 2 : 1);
    const canStart = chat && !busy && (selected.size > 0 || modelCalls > 0);

    const start = async () => {
        setBusy(true);
        try {
            const { data } = await analysisService.start({
                chatId: chat.id,
                metrics: [...selected],
                models: [model, rival].filter(Boolean),
                messageLimit: limit,
                includeSummary: summary,
                promptIds: [...chosenPrompts],
            });
            setError('');
            (Array.isArray(data) ? data : [data]).forEach(run => onStarted?.(run));
        } catch (e) {
            setError(t(e.response?.data?.error) || t('Не вдалося запустити аналіз'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Box>
            {error && (
                <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger, mb: 1.5 })}>
                    {error}
                </Typography>
            )}

            <Label>{t('Метрики — рахуються точно, без моделі')}</Label>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                {options.metrics.map(metric => (
                    <Toggle
                        key={metric.key}
                        on={selected.has(metric.key)}
                        onClick={() => toggle(selected, setSelected)(metric.key)}
                        label={metric.label}
                    />
                ))}
            </Box>

            <Label>{t('Модель')}</Label>
            {options.models.length === 0 ? (
                <Box sx={(t) => ({
                    p: 1.25, mb: 2, borderRadius: radius.md,
                    bgcolor: t.c.surfaceSunken, border: `1px solid ${t.c.border}`,
                })}>
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.textMuted, lineHeight: 1.5 })}>
                        {t('Локальної моделі не знайдено. Метрики працюють і без неї.')}
                        <br />
                        {t('Встановіть Ollama і виконайте')}{' '}
                        <Box component="span" sx={(t) => ({ ...numeric, fontWeight: 700, color: t.c.text })}>
                            ollama pull qwen2.5:7b
                        </Box>
                    </Typography>
                </Box>
            ) : (
                <>
                    <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
                        <Select value={model} onChange={setModel} sx={{ flex: 1 }}>
                            <option value="">{t('Без моделі — тільки метрики')}</option>
                            {options.models.map(name => <option key={name} value={name}>{name}</option>)}
                        </Select>
                        <Tooltip title={t('Скільки останніх повідомлень прочитає модель')}>
                            <Box>
                                <Select value={limit} onChange={(v) => setLimit(Number(v))}>
                                    {LIMITS.map(value => (
                                        <option key={value} value={value}>{value}{t(' повід.')}</option>
                                    ))}
                                </Select>
                            </Box>
                        </Tooltip>
                    </Box>

                    {/* A second model on the same chat, the same questions, the same slice of
                        history — the only way a comparison says anything about the models
                        rather than about the conversation drifting between runs. */}
                    {model && options.models.length > 1 && (
                        <Box sx={{ mb: 1.5 }}>
                            <Select value={rival} onChange={setRival} sx={{ width: '100%' }}>
                                <option value="">{t('Без порівняння')}</option>
                                {options.models.filter(name => name !== model).map(name => (
                                    <option key={name} value={name}>{t('Порівняти з ')}{name}</option>
                                ))}
                            </Select>
                        </Box>
                    )}

                    {model && (
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mb: 2 }}>
                            <Toggle on={summary} onClick={() => setSummary(v => !v)}
                                    label={t('Загальний підсумок')} />
                            {prompts.map(prompt => (
                                <Tooltip key={prompt.id} title={prompt.prompt}>
                                    <Box>
                                        <Toggle
                                            on={chosenPrompts.has(prompt.id)}
                                            onClick={() => toggle(chosenPrompts, setChosenPrompts)(prompt.id)}
                                            label={prompt.name}
                                        />
                                    </Box>
                                </Tooltip>
                            ))}
                            {prompts.length === 0 && (
                                <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint, py: 0.5 })}>
                                    {t('Власних метрик ще немає — створіть їх на сторінці аналітики')}
                                </Typography>
                            )}
                        </Box>
                    )}
                </>
            )}

            <Box
                onClick={canStart ? start : undefined}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => canStart && (e.key === 'Enter' || e.key === ' ') && start()}
                sx={(t) => ({
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1,
                    py: compact ? 0.9 : 1.1, borderRadius: radius.md,
                    bgcolor: canStart ? t.c.accent : t.c.surfaceSunken,
                    color: canStart ? t.c.onAccent : t.c.textFaint,
                    fontSize: 13, fontWeight: 700,
                    cursor: canStart ? 'pointer' : 'default',
                    '&:hover': canStart ? { bgcolor: t.c.accentHover } : {},
                })}
            >
                {busy && <CircularProgress size={13} sx={{ color: 'inherit' }} />}
                {t('Запустити аналіз')}
            </Box>

            {modelCalls > 1 && (
                <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint, mt: 0.75, textAlign: 'center' })}>
                    {rival
                        ? t('{0} запити — дві моделі по {1}, виконуються послідовно', modelCalls, perModelCalls)
                        : t('{0} запити до моделі — кожне питання виконується окремо', modelCalls)}
                </Typography>
            )}
        </Box>
    );
}

function Label({ children }) {
    return (
        <Typography sx={(t) => ({
            fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
            textTransform: 'uppercase', color: t.c.textFaint, mb: 0.75,
        })}>
            {children}
        </Typography>
    );
}

function Toggle({ on, onClick, label }) {
    return (
        <Box
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
            sx={(t) => ({
                display: 'flex', alignItems: 'center', gap: 0.6,
                px: 1, py: 0.5, borderRadius: radius.pill, cursor: 'pointer',
                bgcolor: on ? t.c.accentSoft : 'transparent',
                border: `1px solid ${on ? t.c.accent : t.c.border}`,
                color: on ? t.c.accent : t.c.textMuted,
                '&:hover': { borderColor: t.c.accent },
            })}
        >
            {on ? <CheckBoxIcon sx={{ fontSize: 14 }} /> : <CheckBoxOutlineBlankIcon sx={{ fontSize: 14 }} />}
            <Typography noWrap sx={{ fontSize: 11.5, fontWeight: 600, color: 'inherit', maxWidth: 170 }}>
                {label}
            </Typography>
        </Box>
    );
}

function Select({ value, onChange, children, sx }) {
    return (
        <Box
            component="select"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            sx={(t) => ({
                py: 0.9, px: 1.25, minWidth: 0,
                borderRadius: radius.md,
                border: `1px solid ${t.c.border}`,
                bgcolor: t.c.bg, color: t.c.text,
                fontFamily: 'inherit', fontSize: 12.5, outline: 'none',
                ...sx,
            })}
        >
            {children}
        </Box>
    );
}
