import { plainText } from '../../utils/richText';
import { Box, Typography, CircularProgress } from '@mui/material';
import MessengerGlyph from './MessengerGlyph';
import { formatListTime } from '../../utils/format';
import { usePresentation } from '../../context/PresentationContext';
import { t } from '../../i18n';

/**
 * Renders a snippet with the parts Postgres marked as matches highlighted. Built from React nodes,
 * never dangerouslySetInnerHTML, so message text is always escaped.
 */
function Snippet({ text }) {
    if (!text) return null;

    const pieces = text.split(/\[\[hl\]\]|\[\[\/hl\]\]/);
    // The split alternates plain / highlighted / plain..., since a match is always
    // bracketed by an opening and a closing marker.
    return (
        <>
            {pieces.map((piece, i) =>
                i % 2 === 1
                    ? <Box key={i} component="span" sx={{ bgcolor: 'var(--c-accent-soft)', color: 'var(--c-text)', fontWeight: 600, borderRadius: '2px' }}>{piece}</Box>
                    : <span key={i}>{piece}</span>
            )}
        </>
    );
}

/** Enough of a message to recognise it, without turning the sidebar into a transcript. */
function clip(text, limit = 160) {
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

/**
 * History search results, shown beneath the chat list while a query is active.
 *
 * @param {object[]} results   hits from GET /api/search/messages
 * @param {number}   total     hits matching the query, which may exceed results.length
 * @param {boolean}  loading
 * @param {string}   error
 * @param {function} onSelect  called with a hit when the user opens it
 */
export default function MessageSearchResults({ results, total, loading, error, onSelect,
                                              mode = 'hybrid', onModeChange }) {
    const { name } = usePresentation();
    return (
        <Box sx={{ borderTop: '1px solid var(--c-border)', pt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pb: 0.5 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', color: 'var(--c-text-faint)', textTransform: 'uppercase' }}>
                    {t('Повідомлення')}
                </Typography>
                {loading && <CircularProgress size={9} sx={{ color: 'var(--c-border-strong)' }} />}
                {!loading && total > 0 && (
                    <Typography sx={{ fontSize: 10, color: 'var(--c-text-faint)' }}>
                        {total > results.length ? t('{0} з {1}', results.length, total) : total}
                    </Typography>
                )}

                <Box sx={{ flex: 1 }} />

                {/* Search mode switch: all (hybrid), words, meaning. */}
                {onModeChange && (
                    <Box sx={{
                        display: 'flex', gap: '2px', p: '2px',
                        borderRadius: '999px',
                        bgcolor: 'var(--c-surface-sunken)',
                        border: '1px solid var(--c-border)',
                    }}>
                        {[['hybrid', t('усе')], ['text', t('слова')], ['semantic', t('зміст')]].map(([key, label]) => (
                            <Box
                                key={key}
                                onClick={() => onModeChange(key)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onModeChange(key)}
                                title={key === 'hybrid'
                                    ? t('Обидва пошуки разом: точні збіги слів і збіги за змістом в одному списку')
                                    : key === 'text'
                                        ? t('Пошук за словами, які є в повідомленні')
                                        : t('Пошук за змістом — знаходить, навіть якщо слова інші')}
                                sx={{
                                    px: 1, py: '3px', borderRadius: '999px', cursor: 'pointer',
                                    fontSize: 11,
                                    fontWeight: mode === key ? 700 : 550,
                                    lineHeight: 1.3,
                                    color: mode === key ? 'var(--c-text)' : 'var(--c-text-faint)',
                                    bgcolor: mode === key ? 'var(--c-surface)' : 'transparent',
                                    boxShadow: mode === key ? '0 1px 2px rgba(17,19,24,0.08)' : 'none',
                                    transition: 'background-color .12s, color .12s',
                                    '&:hover': { color: 'var(--c-text)' },
                                }}
                            >
                                {label}
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>

            {error && (
                <Typography sx={{ px: 2, py: 1, fontSize: 11, color: 'var(--c-danger)' }}>{error}</Typography>
            )}

            {!error && !loading && results.length === 0 && (
                <Typography sx={{ px: 2, py: 1, fontSize: 11, color: 'var(--c-text-faint)' }}>
                    {mode !== 'text'
                        ? t('Нічого не знайдено — можливо, архів ще індексується')
                        : t('В історії нічого не знайдено')}
                </Typography>
            )}

            {results.map(hit => (
                <Box
                    key={hit.messageId}
                    onClick={() => onSelect(hit)}
                    sx={{ px: 2, py: 1, cursor: 'pointer', transition: 'background 0.12s', '&:hover': { bgcolor: 'var(--c-surface-sunken)' } }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, mb: 0.3 }}>
                        <MessengerGlyph type={hit.messengerType} size={11} />
                        <Typography sx={{ fontSize: 11, fontWeight: 600, color: 'var(--c-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexGrow: 1 }}>
                            {name(hit.chatName) || t('Без назви')}
                        </Typography>
                        {/* In the merged list, say which hits have none of the typed words —
                            otherwise a result without them looks like a mistake. */}
                        {hit.matchedBy === 'semantic' && (
                            <Typography sx={{
                                fontSize: 9.5, fontWeight: 600, color: 'var(--c-text-faint)', flexShrink: 0,
                                px: 0.6, borderRadius: '999px', border: '1px solid var(--c-border)',
                            }}>
                                {t('за змістом')}
                            </Typography>
                        )}
                        <Typography sx={{ fontSize: 10, color: 'var(--c-text-faint)', flexShrink: 0 }}>
                            {formatListTime(hit.timestamp)}
                        </Typography>
                    </Box>
                    <Typography data-private sx={{ fontSize: 11.5, color: 'var(--c-text-muted)', lineHeight: 1.4 }}>
                        {hit.senderName && (
                            <Box component="span" sx={{ color: 'var(--c-text-faint)', fontWeight: 500 }}>
                                {hit.isFromUser ? t('Ви') : name(hit.senderName)}:{' '}
                            </Box>
                        )}
                        {/* Semantic hits carry no snippet: nothing was matched literally, so
                            highlighting words the user never typed would misdescribe how the
                            result was found. The message text stands as it is. */}
                        {hit.snippet
                            ? <Snippet text={plainText(hit.snippet)} />
                            : <Box component="span">{clip(plainText(hit.text))}</Box>}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
}
