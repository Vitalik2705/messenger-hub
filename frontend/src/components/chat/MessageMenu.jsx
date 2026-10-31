import { Box, Menu, MenuItem, ListItemIcon, Divider } from '@mui/material';
import ReplyIcon from '@mui/icons-material/Reply';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import { radius } from '../../theme/tokens';
import { t } from '../../i18n';

/** Quick reactions offered in the message menu — Telegram accepts these in most chats. */
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '🙏'];

/**
 * Actions for one message, opened by right click or the ⋯ button. Each is offered only where it can
 * succeed: reactions and editing on Telegram, deleting where the service supports it, "find
 * similar" when there is text.
 *
 * @param anchor `{ x, y, message }` while open, null otherwise
 */
export default function MessageMenu({ anchor, onClose, canReact, canEdit, canDelete,
                                      onReact, onReply, onCopy, onEdit, onFindSimilar, onDelete }) {
    const message = anchor?.message;
    const run = (action) => () => { action(message); onClose(); };

    return (
        <Menu
            open={Boolean(anchor)}
            onClose={onClose}
            anchorReference="anchorPosition"
            anchorPosition={anchor ? { top: anchor.y, left: anchor.x } : undefined}
            slotProps={{ paper: { sx: (t) => ({ minWidth: 220, borderRadius: radius.lg, bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, boxShadow: t.c.shadowRaised, backgroundImage: 'none' }) } }}
        >
            {canReact && message && (
                <Box sx={{ display: 'flex', gap: 0.25, px: 1, pb: 0.75 }}>
                    {QUICK_REACTIONS.map((emoji) => (
                        <Box key={emoji} role="button" onClick={() => { onReact(message, emoji); onClose(); }}
                             sx={(t) => ({ fontSize: 20, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', cursor: 'pointer', transition: 'transform .1s', '&:hover': { bgcolor: t.c.surfaceHover, transform: 'scale(1.2)' } })}>
                            {emoji}
                        </Box>
                    ))}
                </Box>
            )}
            {canReact && <Divider sx={{ my: 0.5 }} />}
            <MenuItem onClick={run(onReply)}>
                <ListItemIcon><ReplyIcon fontSize="small" /></ListItemIcon>{t('Відповісти')}
            </MenuItem>
            {message?.text && (
                <MenuItem onClick={run(onCopy)}>
                    <ListItemIcon><ContentCopyIcon fontSize="small" /></ListItemIcon>{t('Копіювати текст')}
                </MenuItem>
            )}
            {canEdit && (
                <MenuItem onClick={run(onEdit)}>
                    <ListItemIcon><EditOutlinedIcon fontSize="small" /></ListItemIcon>{t('Редагувати')}
                </MenuItem>
            )}
            {message?.text && onFindSimilar && (
                <MenuItem onClick={run(onFindSimilar)}>
                    <ListItemIcon><TravelExploreIcon fontSize="small" /></ListItemIcon>{t('Знайти схожі в усіх чатах')}
                </MenuItem>
            )}
            {canDelete && (
                <MenuItem onClick={run(onDelete)} sx={(t) => ({ color: t.c.danger })}>
                    <ListItemIcon><DeleteOutlineIcon fontSize="small" sx={(t) => ({ color: t.c.danger })} /></ListItemIcon>{t('Видалити')}
                </MenuItem>
            )}
        </Menu>
    );
}
