import { Box, Typography, CircularProgress } from '@mui/material';
import MessengerGlyph from './MessengerGlyph';
import { formatListTime } from '../../utils/format';

/**
 * Renders a snippet, highlighting the parts Postgres marked as matches.
 *
 * The snippet carries text that came from a messenger, so it is never handed to
 * dangerouslySetInnerHTML. Splitting on the markers and returning React nodes means every
 * piece is escaped as text — a message containing markup shows up as characters, not markup.
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
                                              mode = 'text', onModeChange }) {
    return (
        <Box sx={{ borderTop: '1px solid var(--c-border)', pt: 1 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 2, pb: 0.5 }}>
                <Typography sx={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', color: 'var(--c-text-faint)', textTransform: 'uppercase' }}>
                    Повідомлення
                </Typography>
                {loading && <CircularProgress size={9} sx={{ color: 'var(--c-border-strong)' }} />}
                {!loading && total > 0 && (
                    <Typography sx={{ fontSize: 10, color: 'var(--c-text-faint)' }}>
                        {total > results.length ? `${results.length} з ${total}` : total}
                    </Typography>
                )}

                <Box sx={{ flex: 1 }} />

                {/* Two searches, not one with a switch: word search finds what was written,
                    meaning search finds what was meant, and neither contains the other.

                    Drawn as a segmented control rather than two tinted words. The previous
                    version was a pair of 10px labels differing only in colour — it was on
                    screen, and users looked straight at it while asking where the button
                    was. A control has to announce that it is one. */}
                {onModeChange && (
                    <Box sx={{
                        display: 'flex', gap: '2px', p: '2px',
                        borderRadius: '999px',
                        bgcolor: 'var(--c-surface-sunken)',
                        border: '1px solid var(--c-border)',
                    }}>
                        {[['text', 'слова'], ['semantic', 'зміст']].map(([key, label]) => (
                            <Box
                                key={key}
                                onClick={() => onModeChange(key)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onModeChange(key)}
                                title={key === 'text'
                                    ? 'Пошук за словами, які є в повідомленні'
                                    : 'Пошук за змістом — знаходить, навіть якщо слова інші'}
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
                    {mode === 'semantic'
                        ? 'За змістом нічого не знайдено — можливо, архів ще індексується'
                        : 'В історії нічого не знайдено'}
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
                            {hit.chatName || 'Без назви'}
                        </Typography>
                        <Typography sx={{ fontSize: 10, color: 'var(--c-text-faint)', flexShrink: 0 }}>
                            {formatListTime(hit.timestamp)}
                        </Typography>
                    </Box>
                    <Typography sx={{ fontSize: 11.5, color: 'var(--c-text-muted)', lineHeight: 1.4 }}>
                        {hit.senderName && (
                            <Box component="span" sx={{ color: 'var(--c-text-faint)', fontWeight: 500 }}>
                                {hit.isFromUser ? 'Ви' : hit.senderName}:{' '}
                            </Box>
                        )}
                        {/* Semantic hits carry no snippet: nothing was matched literally, so
                            highlighting words the user never typed would misdescribe how the
                            result was found. The message text stands as it is. */}
                        {hit.snippet
                            ? <Snippet text={hit.snippet} />
                            : <Box component="span">{clip(hit.text)}</Box>}
                    </Typography>
                </Box>
            ))}
        </Box>
    );
}
