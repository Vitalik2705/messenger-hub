import { useState, useMemo, useEffect, useRef } from 'react';
import { Dialog, Box, Typography } from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import KeyboardReturnIcon from '@mui/icons-material/KeyboardReturn';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { radius, numeric } from '../../theme/tokens';
import { plainText } from '../../utils/richText';
import { usePresentation } from '../../context/PresentationContext';
import { t } from '../../i18n';

/**
 * Ctrl+K: open any chat or run any action from the keyboard. Chats first, then actions; arrows
 * move, Enter runs, Escape closes.
 */
export default function CommandPalette({ open, onClose, chats = [], actions = [], onOpenChat }) {
    const [query, setQuery] = useState('');
    const { name } = usePresentation();
    const [active, setActive] = useState(0);
    const listRef = useRef(null);

    const q = query.trim().toLowerCase();
    const items = useMemo(() => {
        const chatItems = chats
            .filter(c => !q || c.name?.toLowerCase().includes(q))
            .sort((a, b) => (b.unreadCount || 0) - (a.unreadCount || 0)
                || new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))
            .slice(0, q ? 8 : 5)
            .map(c => ({ kind: 'chat', key: `chat-${c.id}`, chat: c, run: () => onOpenChat(c.id) }));
        const actionItems = actions
            .filter(a => !q || a.label.toLowerCase().includes(q) || a.keywords?.some(k => k.includes(q)))
            .map(a => ({ kind: 'action', key: `act-${a.label}`, action: a, run: a.run }));
        return [...chatItems, ...actionItems];
    }, [q, chats, actions, onOpenChat]);

    useEffect(() => {
        listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
    }, [active]);

    const close = () => { setQuery(''); setActive(0); onClose(); };
    const runAt = (i) => { const item = items[i]; if (!item) return; close(); item.run(); };

    return (
        <Dialog open={open} onClose={close} maxWidth="sm" fullWidth
                slotProps={{ paper: { sx: { alignSelf: 'flex-start', mt: '12vh', overflow: 'hidden' } } }}>
            <Box sx={(t) => ({ display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.5, borderBottom: `1px solid ${t.c.border}` })}>
                <SearchIcon sx={(t) => ({ fontSize: 20, color: t.c.textFaint })} />
                <input
                    autoFocus
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                    onKeyDown={(e) => {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(i + 1, items.length - 1)); }
                        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(i - 1, 0)); }
                        else if (e.key === 'Enter') { e.preventDefault(); runAt(active); }
                    }}
                    placeholder={t('Чат або дія… (наприклад, «темна» чи ім\'я)')}
                    style={{ flex: 1, border: 'none', outline: 'none', background: 'none', color: 'inherit', fontSize: 15, fontFamily: 'inherit' }}
                />
                <Typography sx={(t) => ({ fontSize: 11, color: t.c.textFaint, border: `1px solid ${t.c.border}`, borderRadius: radius.sm, px: 0.6 })}>Esc</Typography>
            </Box>
            <Box ref={listRef} sx={{ maxHeight: 420, overflowY: 'auto', py: 0.75 }}>
                {items.length === 0 && (
                    <Typography sx={(t) => ({ fontSize: 13, color: t.c.textFaint, px: 2.5, py: 2 })}>{t('Нічого не знайдено')}</Typography>
                )}
                {items.map((item, i) => {
                    const first = i === 0 || items[i - 1].kind !== item.kind;
                    return (
                        <Box key={item.key}>
                            {first && (
                                <Typography sx={(t) => ({ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: t.c.textFaint, px: 2.5, pt: i ? 1.25 : 0.5, pb: 0.5 })}>
                                    {item.kind === 'chat' ? t('Чати') : t('Дії')}
                                </Typography>
                            )}
                            <Box
                                data-index={i}
                                onMouseEnter={() => setActive(i)}
                                onClick={() => runAt(i)}
                                sx={(t) => ({
                                    display: 'flex', alignItems: 'center', gap: 1.5, mx: 1, px: 1.5, py: 1, borderRadius: radius.md, cursor: 'pointer',
                                    bgcolor: i === active ? t.c.surfaceHover : 'transparent',
                                })}
                            >
                                {item.kind === 'chat' ? (
                                    <>
                                        <MessengerGlyph type={item.chat.messengerType} size={14} />
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography noWrap sx={(t) => ({ fontSize: 13.5, fontWeight: 600, color: t.c.text })}>{name(item.chat.name, item.chat.chatKind)}</Typography>
                                            {item.chat.lastMessage && (
                                                <Typography noWrap data-private sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>{plainText(item.chat.lastMessage)}</Typography>
                                            )}
                                        </Box>
                                        {item.chat.unreadCount > 0 && (
                                            <Typography sx={(t) => ({ ...numeric, fontSize: 11, fontWeight: 750, color: t.c.onAccent, bgcolor: t.c.accent, borderRadius: radius.pill, px: 0.75 })}>
                                                {item.chat.unreadCount}
                                            </Typography>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Box sx={(t) => ({ display: 'flex', color: t.c.textMuted })}>{item.action.icon}</Box>
                                        <Typography sx={(t) => ({ flex: 1, fontSize: 13.5, color: t.c.text })}>{item.action.label}</Typography>
                                    </>
                                )}
                                {i === active && <KeyboardReturnIcon sx={(t) => ({ fontSize: 15, color: t.c.textFaint })} />}
                            </Box>
                        </Box>
                    );
                })}
            </Box>
        </Dialog>
    );
}
