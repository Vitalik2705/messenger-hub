import { Box, Typography } from '@mui/material';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import { radius, numeric } from '../../../theme/tokens';
import { t, LOCALE } from '../../../i18n';

/**
 * One finished run: the computed metrics, then the model's interpretation, kept visually apart
 * because only the first is exact.
 */
export default function AnalysisResult({ run }) {
    const metrics = run.metricsResult || {};
    const insights = run.insights || null;

    return (
        <Box data-private sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {Object.keys(metrics).length > 0 && (
                /* A grid, not a stack. Each metric card holds four short figures, so a
                   full-width row wastes most of its line and pushes the next card off the
                   screen — on a wide display the stack was mostly empty space. */
                <Box sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                    gap: 1,
                    // The rhythm chart needs the full row to be readable at all.
                    '& > .metric-rhythm': { gridColumn: '1 / -1' },
                }}>
                    {METRIC_VIEWS.filter(view => metrics[view.key]).map(view => (
                        <Card key={view.key} title={view.title}
                              className={view.key === 'rhythm' ? 'metric-rhythm' : undefined}>
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
                                {view.rows(metrics[view.key]).filter(Boolean).map(([label, value]) => (
                                    <Stat key={label} label={label} value={value} />
                                ))}
                            </Box>
                            {view.key === 'rhythm' && <HourBars counts={metrics.rhythm.byHour} />}
                        </Card>
                    ))}
                </Box>
            )}

            {run.error && (
                <Box sx={(t) => ({
                    p: 1.25, borderRadius: radius.md,
                    bgcolor: t.c.accentSoft, border: `1px solid ${t.c.border}`,
                })}>
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger })}>
                        {run.error}
                    </Typography>
                </Box>
            )}

            {/* The user's own questions, each with the wording it was asked in. Kept above
                the built-in summary: they were asked deliberately, the summary comes free. */}
            {Array.isArray(run.custom) && run.custom.map((entry, i) => (
                <Card
                    key={i}
                    title={entry.name}
                    note={entry.ms ? t('{0} с', Math.round(entry.ms / 1000)) : undefined}
                >
                    {entry.error ? (
                        <Typography sx={(t) => ({ fontSize: 12, color: t.c.danger })}>
                            {entry.error}
                        </Typography>
                    ) : (
                        <>
                            <Typography sx={(t) => ({
                                fontSize: 13, color: t.c.text, lineHeight: 1.55,
                            })}>
                                {entry.result?.answer || '—'}
                            </Typography>

                            {entry.result?.quotes?.length > 0 && (
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, mt: 1 }}>
                                    {entry.result.quotes.map((quote, q) => (
                                        <Box key={q} sx={{ display: 'flex', gap: 0.5 }}>
                                            <FormatQuoteIcon sx={(t) => ({
                                                fontSize: 12, color: t.c.textFaint, flexShrink: 0, mt: '2px',
                                            })} />
                                            <Typography sx={(t) => ({
                                                fontSize: 11.5, color: t.c.textFaint, fontStyle: 'italic',
                                            })}>
                                                {quote}
                                            </Typography>
                                        </Box>
                                    ))}
                                </Box>
                            )}

                            {/* The question as it was worded at the time. Editing the metric
                                later must not rewrite what an old answer appears to answer. */}
                            {entry.prompt && (
                                <Typography sx={(t) => ({
                                    fontSize: 10.5, color: t.c.textFaint, mt: 1, opacity: 0.8,
                                })}>
                                    {t('Питання: ')}{entry.prompt}
                                </Typography>
                            )}
                        </>
                    )}
                </Card>
            ))}

            {insights && (
                <Card
                    title={t('Що побачила модель')}
                    note={[run.model, run.modelMs && t('{0} с', Math.round(run.modelMs / 1000))]
                        .filter(Boolean).join(' · ')}
                >
                    {insights.raw ? (
                        <Typography sx={(t) => ({
                            fontSize: 12, color: t.c.textMuted, whiteSpace: 'pre-wrap',
                            fontFamily: 'monospace',
                        })}>
                            {insights.raw}
                        </Typography>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                            {insights.summary && (
                                <Typography sx={(t) => ({ fontSize: 13, color: t.c.text, lineHeight: 1.55 })}>
                                    {insights.summary}
                                </Typography>
                            )}

                            {insights.tone && (
                                <Stat label={t('Тон')} value={insights.tone} />
                            )}

                            {insights.topics?.length > 0 && (
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {insights.topics.map((topic, i) => (
                                        <Box key={i} sx={(t) => ({
                                            px: 1, py: 0.35, borderRadius: radius.pill,
                                            bgcolor: t.c.surfaceSunken,
                                            fontSize: 11.5, color: t.c.textMuted,
                                        })}>
                                            {topic}
                                        </Box>
                                    ))}
                                </Box>
                            )}

                            <Quoted title={t('Домовленості й обіцянки')} items={insights.agreements} />
                            <Quoted title={t('Питання без відповіді')} items={insights.openQuestions} />
                        </Box>
                    )}

                    {/* Said once, plainly, on every model result. */}
                    <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint, mt: 1.25 })}>
                        {t('Згенеровано локальною моделлю — звіряйте з цитатами.')}
                    </Typography>
                </Card>
            )}
        </Box>
    );
}

/** A model's claim next to the quoted message it is based on, so it can be checked. */
function Quoted({ title, items }) {
    if (!items?.length) return null;
    return (
        <Box>
            <Typography sx={(t) => ({
                fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                textTransform: 'uppercase', color: t.c.textFaint, mb: 0.75,
            })}>
                {title}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {items.map((item, i) => (
                    <Box key={i} sx={(t) => ({
                        pl: 1.25, borderLeft: `2px solid ${t.c.borderStrong}`,
                    })}>
                        <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.text, fontWeight: 550 })}>
                            {item.what}
                        </Typography>
                        {item.quote && (
                            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25 }}>
                                <FormatQuoteIcon sx={(t) => ({
                                    fontSize: 12, color: t.c.textFaint, flexShrink: 0, mt: '2px',
                                })} />
                                <Typography sx={(t) => ({
                                    fontSize: 11.5, color: t.c.textFaint, fontStyle: 'italic',
                                })}>
                                    {item.quote}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                ))}
            </Box>
        </Box>
    );
}

function Card({ title, note, children, className }) {
    return (
        <Box className={className} sx={(t) => ({
            p: 1.5, borderRadius: radius.md,
            bgcolor: t.c.bg, border: `1px solid ${t.c.border}`,
        })}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
                <Typography sx={(t) => ({
                    fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: t.c.textFaint,
                })}>
                    {title}
                </Typography>
                {note && (
                    <Typography sx={(t) => ({ ...numeric, fontSize: 10.5, color: t.c.textFaint })}>
                        {note}
                    </Typography>
                )}
            </Box>
            {children}
        </Box>
    );
}

function Stat({ label, value }) {
    return (
        <Box sx={{ minWidth: 78 }}>
            <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint })}>{label}</Typography>
            <Typography sx={(t) => ({
                ...numeric, fontSize: 14, fontWeight: 700, color: t.c.text,
            })}>
                {value}
            </Typography>
        </Box>
    );
}

/** Twenty-four bars say "evenings and weekends" faster than any number could. */
function HourBars({ counts }) {
    if (!counts?.length) return null;
    const peak = Math.max(...counts, 1);
    return (
        <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: 34, mt: 1.5 }}>
            {counts.map((count, hour) => (
                <Box
                    key={hour}
                    title={`${String(hour).padStart(2, '0')}:00 — ${count}`}
                    sx={(t) => ({
                        flex: 1,
                        height: `${Math.max(2, (count / peak) * 100)}%`,
                        borderRadius: '2px',
                        bgcolor: count === 0 ? t.c.surfaceSunken : t.c.accent,
                        opacity: count === 0 ? 1 : 0.35 + 0.65 * (count / peak),
                    })}
                />
            ))}
        </Box>
    );
}

// ── Formatting ────────────────────────────────────────────────────────────────

const percent = (value) => (value == null ? '—' : `${Math.round(value * 100)}%`);
const count = (value) => (value == null ? '—' : value);

/** Seconds are unreadable past a minute; nobody thinks in 4500 s. */
function duration(seconds) {
    if (seconds == null) return '—';
    if (seconds < 60) return t('{0} с', seconds);
    if (seconds < 3600) return t('{0} хв', Math.round(seconds / 60));
    return t('{0} год', (seconds / 3600).toFixed(1));
}

function date(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString(LOCALE, { day: 'numeric', month: 'short', year: '2-digit' });
}

const METRIC_VIEWS = [
    {
        key: 'volume',
        title: t('Обсяг і баланс'),
        rows: (m) => [
            [t('Всього'), count(m.total)],
            [t('Мої'), count(m.mine)],
            [t('Його/її'), count(m.theirs)],
            [t('Моя частка'), percent(m.myShare)],
        ],
    },
    {
        key: 'initiative',
        title: t('Ініціатива'),
        rows: (m) => [
            [t('Розмов'), count(m.conversations)],
            [t('Почав я'), count(m.startedByMe)],
            [t('Почали мені'), count(m.startedByThem)],
            // Null when there were too few conversations to call it a habit.
            m.myShare != null && [t('Моя частка'), percent(m.myShare)],
        ],
    },
    {
        key: 'responseTime',
        title: t('Час відповіді'),
        rows: (m) => [
            [t('Я відповідаю'), duration(m.myMedianSeconds)],
            [t('Мені відповідають'), duration(m.theirMedianSeconds)],
            [t('Моїх відповідей'), count(m.myRepliesCounted)],
            [t('Їхніх відповідей'), count(m.theirRepliesCounted)],
        ],
    },
    {
        key: 'rhythm',
        title: t('Ритм'),
        rows: (m) => [
            [t('Пік'), `${String(m.busiestHour).padStart(2, '0')}:00`],
            [t('Вночі'), percent(m.nightShare)],
        ],
    },
    {
        key: 'style',
        title: t('Стиль'),
        rows: (m) => [
            [t('Моя довжина'), m.myAvgChars == null ? '—' : `${Math.round(m.myAvgChars)}`],
            [t('Їхня довжина'), m.theirAvgChars == null ? '—' : `${Math.round(m.theirAvgChars)}`],
            [t('Мої питання'), percent(m.myQuestionShare)],
            [t('Їхні питання'), percent(m.theirQuestionShare)],
        ],
    },
    {
        key: 'span',
        title: t('Тривалість'),
        rows: (m) => [
            [t('Перше'), date(m.firstMessageAt)],
            [t('Останнє'), date(m.lastMessageAt)],
            [t('Активних днів'), `${m.activeDays} / ${m.calendarDays}`],
            [t('Щільність'), percent(m.activeDayShare)],
        ],
    },
    {
        key: 'trend',
        title: t('Динаміка'),
        rows: (m) => [
            [t('Тижнів'), count(m.weeks)],
            m.messagesPerWeekSlope != null && [
                t('За тиждень'),
                `${m.messagesPerWeekSlope > 0 ? '+' : ''}${m.messagesPerWeekSlope}`,
            ],
        ],
    },
];
