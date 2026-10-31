import { useState, useEffect, useRef } from 'react';
import { Dialog, Box, Typography, Avatar } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { MESSENGER_COLORS, MESSENGER_LABELS, radius, numeric } from '../../theme/tokens';
import { avatarTint, initialsOf, formatListTime } from '../../utils/format';
import { usePresentation } from '../../context/PresentationContext';
import { t } from '../../i18n';

const ORDER = ['TELEGRAM', 'SLACK', 'DISCORD', 'WHATSAPP', 'VIBER'];

/**
 * "Write to…": pick a person, then the network. Chats linked to one contact are one entry; the
 * network filter narrows the same list for when the user knows where to write.
 */
export default function ComposeDialog({ open, onClose, targets = [], accountLabels = {}, onPick }) {
    const [query, setQuery] = useState('');
    const { presenting, name } = usePresentation();
    const [network, setNetwork] = useState(null);
    const [active, setActive] = useState(0);
    const rowsRef = useRef([]);

    // Narrowing the list moves the highlight back to its first row.
    const narrow = (nextQuery, nextNetwork) => { setQuery(nextQuery); setNetwork(nextNetwork); setActive(0); };
    // Every way out starts the next opening from an empty field.
    const close = () => { narrow('', null); onClose(); };

    const networksPresent = ORDER.filter(type =>
        targets.some(target => target.chats.some(chat => chat.messengerType === type)));

    const needle = query.trim().toLowerCase();
    const visible = targets
        .map(target => ({
            ...target,
            // Filtering the chats, not just the person: picking Slack should offer the Slack
            // chat, never leave a person on screen whose only shown route is Telegram.
            chats: network ? target.chats.filter(c => c.messengerType === network) : target.chats,
        }))
        .filter(target => target.chats.length > 0)
        .filter(target => !needle || target.name.toLowerCase().includes(needle))
        .slice(0, 60);

    useEffect(() => {
        rowsRef.current[active]?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    const pick = (chat) => { onPick(chat.id); close(); };

    const onKeyDown = (event) => {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive(i => Math.min(i + 1, visible.length - 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive(i => Math.max(i - 1, 0));
        } else if (event.key === 'Enter' && visible[active]) {
            event.preventDefault();
            // The most recent chat is the default route: where the conversation already
            // lives is a far better guess than any ranking of networks.
            pick(visible[active].chats[0]);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={close}
            maxWidth="xs"
            fullWidth
            slotProps={{
                paper: {
                    sx: (t) => ({
                        // Anchored high: the list grows downward, so the field the user is
                        // typing in does not move as results appear.
                        alignSelf: 'flex-start', mt: '10vh',
                        bgcolor: t.c.surfaceAlt,
                        borderRadius: radius.lg,
                        border: `1px solid ${t.c.border}`,
                        boxShadow: t.c.shadowRaised,
                        backgroundImage: 'none',
                        overflow: 'hidden',
                    }),
                },
            }}
        >
            <Box sx={(t) => ({
                display: 'flex', alignItems: 'center', gap: 1.25,
                px: 2, py: 1.5,
                borderBottom: `1px solid ${t.c.border}`,
            })}>
                <SearchIcon sx={(t) => ({ fontSize: 18, color: t.c.textFaint, flexShrink: 0 })} />
                <Box
                    component="input"
                    autoFocus
                    value={query}
                    onChange={(e) => narrow(e.target.value, network)}
                    onKeyDown={onKeyDown}
                    placeholder={t('Кому написати?')}
                    sx={(t) => ({
                        flex: 1, minWidth: 0,
                        border: 'none', outline: 'none', background: 'transparent',
                        fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: t.c.text,
                        '&::placeholder': { color: t.c.textFaint, fontWeight: 450 },
                    })}
                />
            </Box>

            {networksPresent.length > 1 && (
                <Box sx={(t) => ({
                    display: 'flex', alignItems: 'center', gap: 0.5,
                    px: 1.5, py: 1,
                    borderBottom: `1px solid ${t.c.border}`,
                })}>
                    {networksPresent.map(type => {
                        const on = network === type;
                        return (
                            <Box
                                key={type}
                                onClick={() => narrow(query, on ? null : type)}
                                role="button"
                                tabIndex={-1}
                                sx={(t) => ({
                                    display: 'flex', alignItems: 'center', gap: 0.5,
                                    px: 1, py: 0.5,
                                    borderRadius: radius.pill,
                                    cursor: 'pointer',
                                    bgcolor: on ? t.c.surfaceActive : 'transparent',
                                    border: `1px solid ${on ? t.c.borderStrong : 'transparent'}`,
                                    '&:hover': { bgcolor: on ? t.c.surfaceActive : t.c.surfaceHover },
                                })}
                            >
                                <MessengerGlyph type={type} size={12}
                                                color={on ? MESSENGER_COLORS[type] : undefined} />
                                <Typography sx={(t) => ({
                                    fontSize: 11.5, fontWeight: on ? 700 : 500,
                                    color: on ? t.c.text : t.c.textMuted,
                                })}>
                                    {MESSENGER_LABELS[type]}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>
            )}

            <Box sx={{ maxHeight: '46vh', overflowY: 'auto', py: 0.75 }}>
                {visible.length === 0 ? (
                    <Typography sx={(t) => ({
                        fontSize: 12.5, color: t.c.textFaint, textAlign: 'center', py: 4,
                    })}>
                        {t('Нікого не знайдено')}
                    </Typography>
                ) : visible.map((target, index) => (
                    <Box
                        key={target.key}
                        ref={(node) => { rowsRef.current[index] = node; }}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => pick(target.chats[0])}
                        sx={(t) => ({
                            display: 'flex', alignItems: 'center', gap: 1.25,
                            px: 2, py: 1,
                            cursor: 'pointer',
                            bgcolor: index === active ? t.c.surfaceHover : 'transparent',
                        })}
                    >
                        <Avatar
                            variant="rounded"
                            sx={(t) => ({
                                width: 32, height: 32, flexShrink: 0,
                                borderRadius: `${radius.md}`,
                                bgcolor: avatarTint(target.chats[0].messengerType),
                                color: MESSENGER_COLORS[target.chats[0].messengerType],
                                fontSize: 11, fontWeight: 750,
                                border: `1px solid ${t.c.border}`,
                            })}
                        >
                            {target.chats[0].avatarBase64 && !presenting
                                ? <img src={`data:image/jpeg;base64,${target.chats[0].avatarBase64}`} alt=""
                                       style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : initialsOf(name(target.name))}
                        </Avatar>

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography noWrap sx={(t) => ({
                                fontSize: 13, fontWeight: 650, color: t.c.text,
                            })}>
                                {name(target.name)}
                            </Typography>

                            {/* One chip per route. A person linked across networks is the
                                only reason this dialog exists, so the choice is offered
                                inline rather than behind another step. */}
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.3, flexWrap: 'wrap' }}>
                                {target.chats.map(chat => (
                                    <Box
                                        key={chat.id}
                                        onClick={(e) => { e.stopPropagation(); pick(chat); }}
                                        title={[
                                            t('Написати в {0}', MESSENGER_LABELS[chat.messengerType]),
                                            accountLabels[chat.messengerAccountId]
                                                && t('через {0}', accountLabels[chat.messengerAccountId]),
                                        ].filter(Boolean).join(' · ')}
                                        sx={(t) => ({
                                            display: 'flex', alignItems: 'center', gap: 0.4,
                                            px: 0.7, py: 0.15,
                                            borderRadius: radius.pill,
                                            border: `1px solid ${t.c.border}`,
                                            bgcolor: t.c.surface,
                                            '&:hover': { borderColor: t.c.accent },
                                        })}
                                    >
                                        <MessengerGlyph type={chat.messengerType} size={10} />
                                        {/* The account is named only where it disambiguates —
                                            two Telegram chips are otherwise identical. */}
                                        {accountLabels[chat.messengerAccountId] && (
                                            <Typography noWrap sx={(t) => ({
                                                fontSize: 10, fontWeight: 600, color: t.c.textFaint, maxWidth: 90,
                                            })}>
                                                {accountLabels[chat.messengerAccountId]}
                                            </Typography>
                                        )}
                                    </Box>
                                ))}
                            </Box>
                        </Box>

                        <Typography sx={(t) => ({
                            ...numeric, fontSize: 10.5, color: t.c.textFaint, flexShrink: 0,
                        })}>
                            {formatListTime(target.chats[0].lastMessageAt)}
                        </Typography>
                    </Box>
                ))}
            </Box>

            <Box sx={(t) => ({
                px: 2, py: 1, borderTop: `1px solid ${t.c.border}`,
                display: 'flex', gap: 1.5,
            })}>
                {[['↑↓', t('вибір')], ['Enter', t('відкрити')], ['Esc', t('закрити')]].map(([key, what]) => (
                    <Typography key={key} sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint })}>
                        <Box component="span" sx={(t) => ({
                            ...numeric, fontWeight: 700, color: t.c.textMuted,
                        })}>{key}</Box>
                        {` ${what}`}
                    </Typography>
                ))}
            </Box>
        </Dialog>
    );
}
