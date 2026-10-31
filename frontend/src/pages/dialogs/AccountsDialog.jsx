import { useState } from 'react';
import { Dialog, Box, Typography, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AddIcon from '@mui/icons-material/Add';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import MessengerGlyph from '../sidebar/MessengerGlyph';
import { MESSENGER_LABELS, radius, numeric } from '../../theme/tokens';

/**
 * Everything that used to sit permanently above the chat list, in a place that can afford it.
 *
 * The sidebar strip had room for a handle and a × and nothing else, so it cost five rows to
 * say less than this dialog says in one. Here each account can carry what it actually
 * contributes — its chats and its unread — which is the thing worth knowing before deciding
 * to disconnect it.
 */
export default function AccountsDialog({ open, onClose, accounts, onAdd }) {
    // Which account is awaiting confirmation. Disconnecting drops a session and, for
    // WhatsApp, its stored pairing — too much to hang on a single click on a small ×,
    // which is what the old strip did.
    const [confirming, setConfirming] = useState(null);

    const close = () => { setConfirming(null); onClose(); };

    return (
        <Dialog
            open={open}
            onClose={close}
            maxWidth="xs"
            fullWidth
            slotProps={{
                paper: {
                    sx: (t) => ({
                        bgcolor: t.c.surfaceAlt,
                        borderRadius: radius.lg,
                        border: `1px solid ${t.c.border}`,
                        boxShadow: t.c.shadowRaised,
                        backgroundImage: 'none',
                    }),
                },
            }}
        >
            <Box sx={(t) => ({
                px: 2.5, py: 2, display: 'flex', alignItems: 'center', gap: 1,
                borderBottom: `1px solid ${t.c.border}`,
            })}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={(t) => ({ fontSize: 15, fontWeight: 750, color: t.c.text })}>
                        Акаунти
                    </Typography>
                    <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint, mt: 0.2 })}>
                        {accounts.length === 0
                            ? 'Жодного месенджера не підключено'
                            : `Підключено: ${accounts.length}`}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={close} sx={{ width: 28, height: 28 }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Box>

            <Box sx={{ px: 1.5, py: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                {accounts.map(account => {
                    const isConfirming = confirming === account.id;
                    return (
                        <Box
                            key={`${account.messengerType}-${account.id}`}
                            sx={(t) => ({
                                display: 'flex', alignItems: 'center', gap: 1.25,
                                px: 1.25, py: 1,
                                borderRadius: radius.md,
                                bgcolor: isConfirming ? t.c.accentSoft : 'transparent',
                                '&:hover': { bgcolor: isConfirming ? t.c.accentSoft : t.c.surfaceHover },
                                '&:hover .account-actions': { opacity: 1 },
                            })}
                        >
                            <Box sx={(t) => ({
                                width: 30, height: 30, borderRadius: radius.sm, flexShrink: 0,
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                bgcolor: t.c.surface, border: `1px solid ${t.c.border}`,
                            })}>
                                <MessengerGlyph type={account.messengerType} size={15} />
                            </Box>

                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                <Typography noWrap sx={(t) => ({
                                    fontSize: 13, fontWeight: 650, color: t.c.text,
                                })}>
                                    {account.label}
                                </Typography>
                                <Typography sx={(t) => ({
                                    ...numeric, fontSize: 11, color: t.c.textFaint, mt: 0.1,
                                })}>
                                    {MESSENGER_LABELS[account.messengerType]}
                                    {account.chats > 0 && ` · ${account.chats} чатів`}
                                    {account.unread > 0 && ` · ${account.unread} нових`}
                                </Typography>
                            </Box>

                            {isConfirming ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                                    <Action
                                        danger
                                        onClick={() => { account.onDisconnect(account.id); setConfirming(null); }}
                                    >
                                        Відключити
                                    </Action>
                                    <Action onClick={() => setConfirming(null)}>Скасувати</Action>
                                </Box>
                            ) : (
                                <IconButton
                                    className="account-actions"
                                    size="small"
                                    onClick={() => setConfirming(account.id)}
                                    title="Відключити акаунт"
                                    sx={(t) => ({
                                        // Revealed on hover: the row is here to be read far
                                        // more often than it is here to be acted on.
                                        opacity: 0, width: 26, height: 26, flexShrink: 0,
                                        transition: 'opacity .12s',
                                        '&:hover': { color: t.c.danger },
                                        '&:focus-visible': { opacity: 1 },
                                    })}
                                >
                                    <LinkOffIcon sx={{ fontSize: 15 }} />
                                </IconButton>
                            )}
                        </Box>
                    );
                })}

                <Box
                    onClick={() => { close(); onAdd(); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (close(), onAdd())}
                    sx={(t) => ({
                        display: 'flex', alignItems: 'center', gap: 1.25,
                        px: 1.25, py: 1,
                        mt: accounts.length > 0 ? 0.5 : 0,
                        borderRadius: radius.md,
                        border: `1px dashed ${t.c.borderStrong}`,
                        color: t.c.textMuted,
                        cursor: 'pointer',
                        transition: 'all .12s',
                        '&:hover': { color: t.c.accentText, borderColor: t.c.accent, bgcolor: t.c.accentSoft },
                    })}
                >
                    <Box sx={{
                        width: 30, height: 30, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <AddIcon sx={{ fontSize: 18 }} />
                    </Box>
                    <Typography sx={{ fontSize: 13, fontWeight: 650, color: 'inherit' }}>
                        {accounts.length === 0 ? 'Підключити месенджер' : 'Підключити ще один'}
                    </Typography>
                </Box>
            </Box>
        </Dialog>
    );
}

function Action({ children, onClick, danger }) {
    return (
        <Box
            onClick={onClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
            sx={(t) => ({
                px: 1.1, py: 0.5, borderRadius: radius.sm,
                fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                color: danger ? t.c.onAccent : t.c.textMuted,
                bgcolor: danger ? t.c.danger : 'transparent',
                border: `1px solid ${danger ? 'transparent' : t.c.borderStrong}`,
                '&:hover': { opacity: danger ? 0.9 : 1, bgcolor: danger ? t.c.danger : t.c.surfaceHover },
            })}
        >
            {children}
        </Box>
    );
}
