import { useState, useEffect, useCallback, useRef } from 'react';
import { Box, Typography, CircularProgress, IconButton } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import digestService from '../../services/digestService';
import analysisService from '../../services/analysisService';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { radius, numeric } from '../../theme/tokens';

const RUNNING = new Set(['PENDING', 'RUNNING']);
const WINDOWS = [[6, 'за 6 годин'], [24, 'за добу'], [72, 'за 3 дні'], [168, 'за тиждень']];

/**
 * Channels post whether or not anyone is there, so counting them answers a question nobody
 * asked — hence people only by default, with the wider views a deliberate choice.
 */
const SCOPES = [
    ['PEOPLE', 'лише особисті чати'],
    ['PEOPLE_AND_GROUPS', 'особисті та групи'],
    ['ALL', 'усі, разом з каналами'],
];

/**
 * What arrived while the user was away, across every network at once.
 *
 * The counts alone are the answer most of the time — who wrote, how much, and whether the
 * last word is still theirs. The model only fills in what counting cannot say: what those
 * messages were about.
 */
export default function DigestPanel() {
    const [digests, setDigests] = useState([]);
    const [models, setModels] = useState([]);
    const [hours, setHours] = useState(24);
    const [scope, setScope] = useState('PEOPLE');
    const [model, setModel] = useState('');
    const [topN, setTopN] = useState(3);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const pollRef = useRef(null);

    const load = useCallback(async () => {
        try {
            const { data } = await digestService.getDigests();
            setDigests(data);
        } catch { /* an empty list is its own message */ }
    }, []);

    useEffect(() => {
        load();
        analysisService.getOptions()
            .then(({ data }) => setModels(data.models || []))
            .catch(() => {});
    }, [load]);

    useEffect(() => {
        const unfinished = digests.some(d => RUNNING.has(d.status));
        if (!unfinished) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return;
        }
        if (pollRef.current) return;
        pollRef.current = setInterval(load, 3000);
        return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    }, [digests, load]);

    const start = async () => {
        setBusy(true);
        try {
            const { data } = await digestService.start({
                hoursBack: hours,
                scope,
                model: model || null,
                topN: model ? topN : 0,
            });
            setDigests(current => [data, ...current]);
            setError('');
        } catch (e) {
            setError(e.response?.data?.error || 'Не вдалося зібрати дайджест');
        } finally {
            setBusy(false);
        }
    };

    const remove = async (id) => {
        await digestService.remove(id);
        setDigests(current => current.filter(d => d.id !== id));
    };

    const latest = digests[0];

    return (
        <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto', px: 3, py: 2.5 }}>
            <Box sx={{ maxWidth: 1180 }}>
                <Typography sx={(t) => ({ fontSize: 13, color: t.c.textMuted, lineHeight: 1.6, mb: 2, maxWidth: 760 })}>
                    Що прийшло, поки вас не було — з усіх мереж разом. Підрахунки безкоштовні
                    й дають відповідь самі по собі; модель лише переказує кілька найактивніших чатів.
                    Рахуються лише особисті чати: канал публікує незалежно від вас, і сотня його
                    дописів ховає три повідомлення, адресовані саме вам.
                </Typography>

                {error && (
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger, mb: 1.5 })}>{error}</Typography>
                )}

                <Box sx={(t) => ({
                    display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 2,
                    p: 2, mb: 3, borderRadius: radius.md,
                    border: `1px solid ${t.c.border}`, bgcolor: t.c.surface,
                })}>
                    <Field label="Період">
                        <Select value={hours} onChange={(v) => setHours(globalThis.Number(v))}>
                            {WINDOWS.map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Які чати">
                        <Select value={scope} onChange={setScope}>
                            {SCOPES.map(([value, label]) => (
                                <option key={value} value={value}>{label}</option>
                            ))}
                        </Select>
                    </Field>

                    <Field label="Переказ моделлю">
                        <Select value={model} onChange={setModel}>
                            <option value="">Без переказу — лише підрахунки</option>
                            {models.map(name => <option key={name} value={name}>{name}</option>)}
                        </Select>
                    </Field>

                    {model && (
                        <Field label="Скільки чатів переказати">
                            <Select value={topN} onChange={(v) => setTopN(globalThis.Number(v))}>
                                {[1, 2, 3, 5, 8].map(n => <option key={n} value={n}>{n}</option>)}
                            </Select>
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
                        Зібрати
                    </Box>
                </Box>

                {digests.length > 1 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2 }}>
                        {digests.slice(1).map(digest => (
                            <Box key={digest.id} sx={(t) => ({
                                display: 'flex', alignItems: 'center', gap: 0.75,
                                px: 1.25, py: 0.5, borderRadius: radius.md,
                                border: `1px solid ${t.c.border}`, bgcolor: t.c.surface,
                                '&:hover .digest-delete': { opacity: 1 },
                            })}>
                                <Typography sx={(t) => ({ ...numeric, fontSize: 11, color: t.c.textMuted })}>
                                    {new Date(digest.createdAt).toLocaleString('uk-UA', {
                                        day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                                    })} · {digest.messagesReceived ?? 0} повід.
                                    {digest.scope && digest.scope !== 'PEOPLE'
                                        ? ` · ${SCOPES.find(([v]) => v === digest.scope)?.[1] ?? ''}`
                                        : ''}
                                </Typography>
                                <IconButton className="digest-delete" size="small"
                                            onClick={() => remove(digest.id)}
                                            sx={(t) => ({ opacity: 0, width: 20, height: 20, '&:hover': { color: t.c.danger } })}>
                                    <DeleteOutlineIcon sx={{ fontSize: 13 }} />
                                </IconButton>
                            </Box>
                        ))}
                    </Box>
                )}

                {latest && <DigestView digest={latest} />}
                {!latest && (
                    <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textFaint })}>
                        Дайджестів ще не було
                    </Typography>
                )}
            </Box>
        </Box>
    );
}

function DigestView({ digest }) {
    if (RUNNING.has(digest.status)) {
        return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 2 }}>
                <CircularProgress size={16} />
                <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textMuted })}>
                    Збираємо…
                </Typography>
            </Box>
        );
    }

    const items = Array.isArray(digest.items) ? digest.items : [];
    const unanswered = items.filter(item => item.unanswered);

    return (
        <Box>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, mb: 2.5 }}>
                <Stat label="Повідомлень" value={digest.messagesReceived ?? 0} />
                <Stat label="Чатів" value={digest.chatsTouched ?? 0} />
                {/* The number that decides whether the digest needs acting on. */}
                <Stat label="Чекають відповіді" value={unanswered.length} accent={unanswered.length > 0} />
                {digest.modelMs > 0 && (
                    <Stat label="Модель" value={`${Math.round(digest.modelMs / 1000)} с`} />
                )}
            </Box>

            {digest.error && (
                <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger, mb: 2 })}>{digest.error}</Typography>
            )}

            {items.length === 0 ? (
                <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.textFaint })}>
                    За цей період нічого не приходило
                </Typography>
            ) : (
                <Box sx={(t) => ({
                    border: `1px solid ${t.c.border}`, borderRadius: radius.md,
                    bgcolor: t.c.surface, overflow: 'hidden',
                })}>
                    {items.map((item, index) => (
                        <Box key={item.chatId} sx={(t) => ({
                            px: 1.75, py: 1.25,
                            borderTop: index === 0 ? 'none' : `1px solid ${t.c.border}`,
                        })}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <MessengerGlyph type={item.messengerType} size={13} />
                                <Typography noWrap sx={(t) => ({
                                    flex: 1, minWidth: 0, fontSize: 13, fontWeight: 650, color: t.c.text,
                                })}>
                                    {item.chatName || '—'}
                                </Typography>

                                {item.unanswered && (
                                    <Typography sx={(t) => ({
                                        fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
                                        textTransform: 'uppercase', color: t.c.accentText,
                                    })}>
                                        без відповіді
                                    </Typography>
                                )}

                                <Typography sx={(t) => ({
                                    ...numeric, fontSize: 12, fontWeight: 700, color: t.c.textMuted, width: 46,
                                    textAlign: 'right',
                                })}>
                                    {item.incoming}
                                </Typography>
                            </Box>

                            {item.summary?.summary && (
                                <Typography sx={(t) => ({
                                    fontSize: 12.5, color: t.c.textMuted, lineHeight: 1.5, mt: 0.5, pl: 3,
                                })}>
                                    {item.summary.summary}
                                    {item.summary.needsReply && (
                                        <Box component="span" sx={(t) => ({ color: t.c.accentText, fontWeight: 650 })}>
                                            {' '}— є питання до вас
                                        </Box>
                                    )}
                                </Typography>
                            )}
                        </Box>
                    ))}
                </Box>
            )}
        </Box>
    );
}

function Stat({ label, value, accent }) {
    return (
        <Box>
            <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint })}>{label}</Typography>
            <Typography sx={(t) => ({
                ...numeric, fontSize: 22, fontWeight: 750,
                color: accent ? t.c.accentText : t.c.text,
            })}>
                {value}
            </Typography>
        </Box>
    );
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
                py: 0.85, px: 1.25, minWidth: 180,
                borderRadius: radius.md, border: `1px solid ${t.c.border}`,
                bgcolor: t.c.bg, color: t.c.text,
                fontFamily: 'inherit', fontSize: 12.5, outline: 'none',
            })}
        >
            {children}
        </Box>
    );
}
