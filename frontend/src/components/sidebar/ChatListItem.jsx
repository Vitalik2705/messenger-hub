import { plainText } from '../../utils/richText';
import { useState } from 'react';
import { Box, Avatar, Typography, Menu, MenuItem, IconButton } from '@mui/material';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import MoreHorizIcon from '@mui/icons-material/MoreHoriz';
import MessengerGlyph from './MessengerGlyph';
import { MESSENGER_COLORS, MESSENGER_LABELS, radius, numeric } from '../../theme/tokens';
import { formatListTime, formatCount, avatarTint, initialsOf } from '../../utils/format';
import { usePresentation } from '../../context/PresentationContext';
import { t } from '../../i18n';

/**
 * One conversation in the unified list. The network is a coloured rail on the left edge, which
 * lines up into a scannable column.
 */
const ChatListItem = ({ chat, isSelected, onClick, onTogglePin, showNetwork = false }) => {
    const [menuAnchor, setMenuAnchor] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const { presenting, name } = usePresentation();

    const hasUnread = (chat.unreadCount || 0) > 0;
    const isPinned = chat.isPinned === true;
    const canPin = chat.messengerType === 'TELEGRAM';
    const networkColor = MESSENGER_COLORS[chat.messengerType] || '#8A8F98';

    const openMenu = (event) => {
        event.stopPropagation();
        setMenuAnchor(event.currentTarget);
    };
    const closeMenus = () => { setMenuAnchor(null); setContextMenu(null); };

    const handleContextMenu = (event) => {
        event.preventDefault();
        setContextMenu({ top: event.clientY, left: event.clientX });
    };

    const handlePinToggle = () => { onTogglePin?.(chat); closeMenus(); };

    const menuItems = canPin ? (
        <MenuItem onClick={handlePinToggle}
                  sx={(t) => ({ fontSize: 13, gap: 1.25, py: 0.9, color: t.c.text })}>
            {isPinned
                ? <><PushPinOutlinedIcon sx={{ fontSize: 16 }} />{t(' Відкріпити')}</>
                : <><PushPinIcon sx={{ fontSize: 16, transform: 'rotate(45deg)' }} />{t(' Закріпити')}</>}
        </MenuItem>
    ) : (
        <MenuItem disabled sx={{ fontSize: 12.5 }}>{t('Дій немає')}</MenuItem>
    );

    return (
        <>
            <Box
                onClick={onClick}
                onContextMenu={handleContextMenu}
                sx={(t) => ({
                    position: 'relative',
                    display: 'flex', alignItems: 'center', gap: 1.25,
                    pl: 2, pr: 1.5, py: 1.1,
                    cursor: 'pointer',
                    bgcolor: isSelected ? t.c.surfaceActive : 'transparent',
                    transition: 'background-color .12s ease',
                    '&:hover': { bgcolor: isSelected ? t.c.surfaceActive : t.c.surfaceHover },
                    '&:hover .row-actions': { opacity: 1 },
                    // The rail is the network. It thickens on selection instead of changing
                    // colour, so "which network" and "which row" never contradict each other.
                    '&::before': {
                        content: '""',
                        position: 'absolute', left: 0, top: 4, bottom: 4,
                        width: isSelected ? 3 : 2,
                        borderRadius: '0 3px 3px 0',
                        bgcolor: networkColor,
                        opacity: isSelected ? 1 : 0.55,
                        transition: 'all .12s ease',
                    },
                })}
            >
                <Box sx={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar
                        variant="rounded"
                        sx={(t) => ({
                            width: 40, height: 40,
                            borderRadius: `${radius.lg}`,
                            bgcolor: avatarTint(chat.messengerType),
                            color: networkColor,
                            fontSize: 13, fontWeight: 750,
                            border: `1px solid ${t.c.border}`,
                        })}
                    >
                        {chat.avatarBase64 && !presenting
                            ? <img src={`data:image/jpeg;base64,${chat.avatarBase64}`} alt=""
                                   style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : initialsOf(name(chat.name, chat.chatKind))}
                    </Avatar>

                    {/* The network mark, drawn only when more than one network is connected. */}
                    {showNetwork && (
                        <Box
                            title={MESSENGER_LABELS[chat.messengerType] || chat.messengerType}
                            sx={(t) => ({
                                position: 'absolute', right: -3, bottom: -3,
                                width: 17, height: 17, borderRadius: '50%',
                                // A solid disc rather than a ring: the row behind it changes
                                // colour on hover and selection, and a matched ring would
                                // then be the one thing that looks wrong.
                                bgcolor: t.c.surface,
                                boxShadow: t.c.shadow,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            })}
                        >
                            <MessengerGlyph type={chat.messengerType} size={10} />
                        </Box>
                    )}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
                        <Typography
                            noWrap
                            sx={(t) => ({
                                flex: 1, minWidth: 0,
                                fontSize: 13.5,
                                fontWeight: hasUnread ? 750 : 550,
                                color: t.c.text,
                            })}
                        >
                            {name(chat.name, chat.chatKind)}
                        </Typography>

                        {isPinned && (
                            <PushPinIcon sx={(t) => ({
                                fontSize: 12, color: t.c.textFaint,
                                transform: 'rotate(45deg)', flexShrink: 0,
                            })} />
                        )}

                        {/* Muted even when unread: the badge below already carries that
                            signal, and two accents in one row cancel each other out. */}
                        <Typography sx={(t) => ({
                            ...numeric,
                            fontSize: 11, flexShrink: 0,
                            color: t.c.textFaint,
                            fontWeight: 500,
                        })}>
                            {formatListTime(chat.lastMessageAt)}
                        </Typography>
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.25 }}>
                        <Typography
                            noWrap
                            data-private
                            sx={(t) => ({
                                flex: 1, minWidth: 0,
                                fontSize: 12,
                                color: hasUnread ? t.c.textMuted : t.c.textFaint,
                                fontWeight: hasUnread ? 550 : 450,
                            })}
                        >
                            {plainText(chat.lastMessage) || t('Повідомлень ще немає')}
                        </Typography>

                        <Box className="row-actions"
                             sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                            {/* Right-click alone hid these actions from anyone who did not
                                think to try it. */}
                            <IconButton
                                size="small"
                                onClick={openMenu}
                                className="row-actions"
                                sx={{ opacity: 0, width: 20, height: 20, transition: 'opacity .12s' }}
                            >
                                <MoreHorizIcon sx={{ fontSize: 15 }} />
                            </IconButton>

                            {hasUnread && (
                                <Box sx={(t) => ({
                                    ...numeric,
                                    minWidth: 18, height: 18, px: 0.65,
                                    borderRadius: radius.pill,
                                    bgcolor: t.c.accentText, color: t.c.onAccent,
                                    fontSize: 10.5, fontWeight: 750,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                })}>
                                    {formatCount(chat.unreadCount)}
                                </Box>
                            )}
                        </Box>
                    </Box>
                </Box>
            </Box>

            <Menu
                anchorEl={menuAnchor}
                open={Boolean(menuAnchor)}
                onClose={closeMenus}
                slotProps={{ paper: { sx: { minWidth: 170 } } }}
            >
                <Box sx={(t) => ({ px: 1.5, py: 0.75, color: t.c.textFaint, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' })}>
                    {MESSENGER_LABELS[chat.messengerType] || chat.messengerType}
                </Box>
                {menuItems}
            </Menu>

            <Menu
                open={contextMenu !== null}
                onClose={closeMenus}
                anchorReference="anchorPosition"
                anchorPosition={contextMenu ?? undefined}
                slotProps={{ paper: { sx: { minWidth: 170 } } }}
            >
                {menuItems}
            </Menu>
        </>
    );
};

export default ChatListItem;
