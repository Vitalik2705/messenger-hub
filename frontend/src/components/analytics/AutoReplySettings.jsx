import { useState, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import autoReplyService from '../../services/autoReplyService';
import analysisService from '../../services/analysisService';
import { radius, numeric } from '../../theme/tokens';
import { t } from '../../i18n';

/**
 * Global controls for generated replies and their acceptance statistics. The master switch is here,
 * not per chat, so it can be turned off in one place.
 */
export default function AutoReplySettings() {
    const [settings, setSettings] = useState(null);
    const [models, setModels] = useState([]);
    const [stats, setStats] = useState({});
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        (async () => {
            try {
                const [settingsResponse, optionsResponse, statsResponse] = await Promise.all([
                    autoReplyService.getSettings(),
                    analysisService.getOptions(),
                    autoReplyService.getStats(),
                ]);
                setSettings(settingsResponse.data);
                setModels(optionsResponse.data.models || []);
                setStats(statsResponse.data);
            } catch {
                setError(t('Не вдалося завантажити налаштування'));
            }
        })();
    }, []);

    const change = (key, value) => {
        setSettings(current => ({ ...current, [key]: value }));
        setSaved(false);
    };

    const save = async () => {
        setSaving(true);
        try {
            // A box left empty means "leave this as it was", not "set it to nothing" —
            // the server treats a missing field as unchanged.
            const payload = { ...settings };
            ['cooldownMinutes', 'dailyLimit', 'contextMessages'].forEach(key => {
                if (payload[key] === '' || payload[key] == null || globalThis.isNaN(payload[key])) {
                    delete payload[key];
                }
            });
            const { data } = await autoReplyService.updateSettings(payload);
            setSettings(data);
            setSaved(true);
            setError('');
        } catch (e) {
            setError(t(e.response?.data?.error) || t('Не вдалося зберегти'));
        } finally {
            setSaving(false);
        }
    };

    if (error && !settings) {
        return <Box sx={{ p: 3 }}><Typography sx={(t) => ({ fontSize: 12.5, color: t.c.danger })}>{error}</Typography></Box>;
    }
    if (!settings) {
        return <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}><CircularProgress size={20} /></Box>;
    }

    const sent = (stats.SENT || 0) + (stats.SENT_EDITED || 0);
    const offered = sent + (stats.REJECTED || 0);

    return (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 2.5 }}>
            <Box sx={{ maxWidth: 1180 }}>
                {/* The master switch, stated as what it does rather than as a label. */}
                <Box sx={(t) => ({
                    display: 'flex', alignItems: 'center', gap: 1.5,
                    p: 1.75, mb: 2.5, borderRadius: radius.md,
                    border: `1px solid ${settings.enabled ? t.c.accent : t.c.border}`,
                    bgcolor: settings.enabled ? t.c.accentSoft : t.c.surface,
                })}>
                    <Box sx={{ flex: 1 }}>
                        <Typography sx={(t) => ({ fontSize: 13.5, fontWeight: 700, color: t.c.text })}>
                            {t('Генерація відповідей')}
                        </Typography>
                        <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textMuted, mt: 0.25, lineHeight: 1.5 })}>
                            {settings.enabled
                                ? t('Увімкнено. Працює лише в чатах, де ви обрали режим у шапці чату.')
                                : t('Вимкнено. Режими окремих чатів не спрацьовують, доки цей перемикач не увімкнено.')}
                        </Typography>
                    </Box>
                    <Box
                        onClick={() => change('enabled', !settings.enabled)}
                        role="button"
                        tabIndex={0}
                        sx={(t) => ({
                            px: 1.6, py: 0.8, borderRadius: radius.md, cursor: 'pointer',
                            fontSize: 12.5, fontWeight: 700, flexShrink: 0,
                            bgcolor: settings.enabled ? t.c.danger : t.c.accent,
                            color: t.c.onAccent,
                            '&:hover': { opacity: 0.9 },
                        })}
                    >
                        {settings.enabled ? t('Вимкнути') : t('Увімкнути')}
                    </Box>
                </Box>

                {/* Two columns: what the model writes on the left, when it is not allowed
                    to on the right. They are read at different moments — one is set up
                    once, the other is what gets adjusted after something goes wrong. */}
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
                    gap: 3,
                    alignItems: 'start',
                }}>
                <Box>
                <Label>{t('Модель')}</Label>
                <Box
                    component="select"
                    value={settings.model || ''}
                    onChange={(e) => change('model', e.target.value)}
                    sx={(t) => ({
                        width: '100%', py: 0.9, px: 1.25, mb: 2,
                        borderRadius: radius.md, border: `1px solid ${t.c.border}`,
                        bgcolor: t.c.bg, color: t.c.text,
                        fontFamily: 'inherit', fontSize: 12.5, outline: 'none',
                    })}
                >
                    <option value="">{t('— не обрано, нічого не генерується —')}</option>
                    {models.map(name => <option key={name} value={name}>{name}</option>)}
                </Box>

                <Label>{t('Як писати')}</Label>
                <Box
                    component="textarea"
                    rows={4}
                    value={settings.instructions || ''}
                    onChange={(e) => change('instructions', e.target.value)}
                    sx={(t) => ({
                        width: '100%', boxSizing: 'border-box', px: 1.25, py: 0.9, mb: 2,
                        borderRadius: radius.md, border: `1px solid ${t.c.border}`,
                        bgcolor: t.c.bg, color: t.c.text,
                        fontFamily: 'inherit', fontSize: 12.5, outline: 'none', resize: 'vertical',
                        '&:focus': { borderColor: t.c.accent },
                    })}
                />

                <Label>{t('Підпис для режиму «з позначкою»')}</Label>
                <Box
                    component="input"
                    value={settings.disclosure || ''}
                    onChange={(e) => change('disclosure', e.target.value)}
                    sx={(t) => ({
                        width: '100%', boxSizing: 'border-box', px: 1.25, py: 0.9, mb: 2,
                        borderRadius: radius.md, border: `1px solid ${t.c.border}`,
                        bgcolor: t.c.bg, color: t.c.text,
                        fontFamily: 'inherit', fontSize: 12.5, outline: 'none',
                    })}
                />

                <Label>{t('Творчість моделі')}</Label>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                    <Box
                        component="input"
                        type="range"
                        min={0} max={1.2} step={0.1}
                        value={settings.temperature ?? 0.4}
                        onChange={(e) => change('temperature', globalThis.Number(e.target.value))}
                        sx={{ flex: 1, accentColor: 'var(--c-accent)' }}
                    />
                    <Typography sx={(t) => ({ ...numeric, fontSize: 12.5, fontWeight: 700, color: t.c.text, width: 30 })}>
                        {(settings.temperature ?? 0.4).toFixed(1)}
                    </Typography>
                </Box>
                <Hint>
                    {t('Нижче — ближче до того, як ви пишете самі. Вище — різноманітніше, але й більше вигаданого.')}
                </Hint>
                </Box>

                <Box>
                {/* Limits, not preferences: these are what stop a loop writing in your name. */}
                <Label>{t('Обмеження')}</Label>
                <Box sx={{ display: 'flex', gap: 1.5, mb: 1.5, flexWrap: 'wrap' }}>
                    <NumberField label={t('Пауза між відповідями, хв')} value={settings.cooldownMinutes}
                            onChange={(v) => change('cooldownMinutes', v)} />
                    <NumberField label={t('Максимум відправок на добу')} value={settings.dailyLimit}
                            onChange={(v) => change('dailyLimit', v)} />
                    <NumberField label={t('Повідомлень контексту')} value={settings.contextMessages}
                            onChange={(v) => change('contextMessages', v)} />
                    <NumberField label={t('Максимум символів у відповіді')} value={settings.maxReplyChars}
                            onChange={(v) => change('maxReplyChars', v)} />
                    <NumberField label={t('Ігнорувати коротші за, символів')} value={settings.minIncomingChars}
                            onChange={(v) => change('minIncomingChars', v)} />
                </Box>
                <Hint>
                    {t('«Ігнорувати коротші» рятує від відповідей на «ок» і «+».')}
                </Hint>

                <Label>{t('Тихі години')}</Label>
                <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, mb: 1 }}>
                    <NumberField label={t('Від, год')} value={settings.quietFromHour}
                            onChange={(v) => change('quietFromHour', v)} />
                    <NumberField label={t('До, год')} value={settings.quietToHour}
                            onChange={(v) => change('quietToHour', v)} />
                </Box>
                <Hint>
                    {t('У ці години нічого не надсилається. Чернетки все одно готуються — вони просто чекають у полі вводу.')}
                </Hint>

                <Label>{t('Стоп-слова')}</Label>
                <Box
                    component="textarea"
                    rows={2}
                    value={settings.stopWords || ''}
                    onChange={(e) => change('stopWords', e.target.value)}
                    sx={(t) => ({
                        width: '100%', boxSizing: 'border-box', px: 1.25, py: 0.9, mb: 1,
                        borderRadius: radius.md, border: `1px solid ${t.c.border}`,
                        bgcolor: t.c.bg, color: t.c.text,
                        fontFamily: 'inherit', fontSize: 12.5, outline: 'none', resize: 'vertical',
                        '&:focus': { borderColor: t.c.accent },
                    })}
                />
                <Hint>
                    {t('Через кому. Якщо вхідне повідомлення містить будь-яке з них, відповідь не генерується взагалі — ні чернетка, ні автовідправка.')}
                </Hint>
                </Box>
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 3 }}>
                    <Box
                        onClick={saving ? undefined : save}
                        role="button"
                        tabIndex={0}
                        sx={(t) => ({
                            display: 'inline-flex', alignItems: 'center', gap: 1,
                            px: 1.75, py: 0.85, borderRadius: radius.md,
                            bgcolor: t.c.accentText, color: t.c.onAccent,
                            fontSize: 12.5, fontWeight: 700, cursor: saving ? 'default' : 'pointer',
                            '&:hover': { bgcolor: t.c.accentHover },
                        })}
                    >
                        {saving && <CircularProgress size={13} sx={{ color: 'inherit' }} />}
                        {t('Зберегти')}
                    </Box>
                    {saved && (
                        <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.success })}>{t('Збережено')}</Typography>
                    )}
                    {error && (
                        <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.danger })}>{error}</Typography>
                    )}
                </Box>

                {/* Evaluation: how many suggestions were sent as-is, edited, or dismissed. */}
                <Label>{t('Як приймаються чернетки')}</Label>
                {offered === 0 ? (
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint })}>
                        {t('Ще жодної чернетки не запропоновано')}
                    </Typography>
                ) : (
                    <Box sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: 1,
                    }}>
                        <Stat label={t('Прийнято без правок')} value={stats.SENT || 0} />
                        <Stat label={t('Відправлено з правками')} value={stats.SENT_EDITED || 0} />
                        <Stat label={t('Відхилено')} value={stats.REJECTED || 0} />
                        <Stat label={t('Частка прийняття')}
                              value={`${Math.round((sent / offered) * 100)}%`} accent />
                        <Stat label={t('Надіслано автоматично')} value={stats.AUTO_SENT || 0} />
                    </Box>
                )}
            </Box>
        </Box>
    );
}

function Hint({ children }) {
    return (
        <Typography sx={(t) => ({
            fontSize: 11, color: t.c.textFaint, lineHeight: 1.5, mb: 2,
        })}>
            {children}
        </Typography>
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

/**
 * A numeric field that allows an empty value while typing. Named NumberField so it does not shadow
 * the global Number.
 */
function NumberField({ label, value, onChange }) {
    return (
        <Box>
            <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint, mb: 0.4 })}>{label}</Typography>
            <Box
                component="input"
                type="number"
                min={1}
                value={value ?? ''}
                onChange={(e) => {
                    const raw = e.target.value;
                    onChange(raw === '' ? '' : globalThis.Number(raw));
                }}
                sx={(t) => ({
                    width: 110, px: 1.25, py: 0.8,
                    borderRadius: radius.md, border: `1px solid ${t.c.border}`,
                    bgcolor: t.c.bg, color: t.c.text,
                    fontFamily: 'inherit', fontSize: 12.5, outline: 'none',
                })}
            />
        </Box>
    );
}

function Stat({ label, value, accent }) {
    return (
        <Box sx={(t) => ({
            p: 1.5, borderRadius: radius.md,
            bgcolor: accent ? t.c.accentSoft : t.c.surface,
            border: `1px solid ${accent ? t.c.accent : t.c.border}`,
        })}>
            <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint })}>{label}</Typography>
            <Typography sx={(t) => ({
                ...numeric, fontSize: 22, fontWeight: 750, mt: 0.25,
                color: accent ? t.c.accent : t.c.text,
            })}>
                {value}
            </Typography>
        </Box>
    );
}
