import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, Box, Typography, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import LinkOffIcon from '@mui/icons-material/LinkOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import TelegramIcon from '@mui/icons-material/Telegram';
import { SiSlack, SiDiscord, SiWhatsapp, SiViber } from 'react-icons/si';
import contactService from '../../services/contactService';
import { usePresentation } from '../../context/PresentationContext';
import { t } from '../../i18n';

const MESSENGER = {
    TELEGRAM: { icon: <TelegramIcon sx={{ fontSize: 13, color: '#229ED9' }} />, label: 'Telegram' },
    SLACK: { icon: <SiSlack size={11} color="#611f69" />, label: 'Slack' },
    DISCORD: { icon: <SiDiscord size={11} color="#5865F2" />, label: 'Discord' },
    WHATSAPP: { icon: <SiWhatsapp size={11} color="#25D366" />, label: 'WhatsApp' },
    VIBER: { icon: <SiViber size={11} color="#7360F2" />, label: 'Viber' },
};

const sectionTitle = {
    fontSize: 10, fontWeight: 700, letterSpacing: '0.6px', color: 'var(--c-text-faint)',
    textTransform: 'uppercase',
};

const button = (enabled, tone) => ({
    px: 1.6, py: 0.7, borderRadius: 2, fontSize: 12, fontWeight: 600,
    textAlign: 'center',
    cursor: enabled ? 'pointer' : 'default', transition: 'all 0.15s',
    bgcolor: !enabled ? 'var(--c-surface-sunken)' : tone === 'primary' ? 'var(--c-accent)' : 'transparent',
    color: !enabled ? 'var(--c-text-faint)' : tone === 'primary' ? 'var(--c-on-accent)' : 'var(--c-text-faint)',
    border: tone === 'primary' ? 'none' : '1px solid var(--c-border)',
    '&:hover': enabled ? { bgcolor: tone === 'primary' ? 'var(--c-accent-hover)' : 'var(--c-surface-sunken)' } : {},
});

/** One account, shown as icon + the name it carries in that network. */
function IdentityChip({ identity, accountLabels = {} }) {
    const messenger = MESSENGER[identity.messengerType] || {};
    // Present only where the network has a second account — see accountLabelById.
    const account = accountLabels[identity.messengerAccountId];
    const { name } = usePresentation();
    return (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.7, minWidth: 0 }}>
            {messenger.icon}
            <Typography sx={{ fontSize: 12.5, color: 'var(--c-text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {name(identity.displayName)}
            </Typography>
            {account && (
                <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {t('· через ')}{account}
                </Typography>
            )}
        </Box>
    );
}

export default function ContactsDialog({ open, onClose, onOpenChat, onChanged, accountLabels = {} }) {
    const [suggestions, setSuggestions] = useState([]);
    const { name } = usePresentation();
    const [contacts, setContacts] = useState([]);
    const [identities, setIdentities] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState('');

    // Manual linking
    const [pickA, setPickA] = useState('');
    const [pickB, setPickB] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [s, c, i] = await Promise.all([
                contactService.getSuggestions(),
                contactService.getContacts(),
                contactService.getIdentities(),
            ]);
            setSuggestions(s.data);
            setContacts(c.data);
            setIdentities(i.data);
            setError('');
        } catch {
            setError(t('Не вдалося завантажити контакти'));
        } finally {
            setLoading(false);
        }
    }, []);

    // A rescan on open keeps the list in step with chats added since last time, so the
    // user never has to know the button exists to see new suggestions.
    useEffect(() => {
        if (!open) return;
        (async () => {
            setLoading(true);
            try { await contactService.rescan(); } catch { /* stale data still beats none */ }
            await load();
        })();
    }, [open, load]);

    const act = async (key, run) => {
        setBusyId(key);
        try {
            await run();
            await load();
            // The chat header shows these links too, so a confirm here has to reach it.
            onChanged?.();
            setError('');
        } catch (e) {
            setError(t(e.response?.data?.error) || t('Дію не вдалося виконати'));
        } finally {
            setBusyId(null);
        }
    };

    const unlinked = identities.filter(i => i.contactId == null);
    const canLink = pickA && pickB && pickA !== pickB;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth
                PaperProps={{ sx: { bgcolor: 'var(--c-surface-alt)', borderRadius: 3, border: '1px solid var(--c-border)', boxShadow: '0 20px 60px rgba(26,18,8,0.12)' } }}>

            <Box sx={{ px: 3, py: 2.5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-surface-sunken)' }}>
                <Box>
                    <Typography sx={{ fontSize: 16, fontWeight: 700, color: 'var(--c-text)' }}>
                        {t('Контакти')}
                    </Typography>
                    <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                        {t('Один запис на людину, скільки б мереж вона не мала')}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <RefreshIcon onClick={loading ? undefined : load}
                                 sx={{ fontSize: 17, color: 'var(--c-text-faint)', cursor: 'pointer', '&:hover': { color: 'var(--c-accent-text)' } }} />
                    <CloseIcon onClick={onClose}
                               sx={{ fontSize: 18, color: 'var(--c-text-faint)', cursor: 'pointer', '&:hover': { color: 'var(--c-accent-text)' } }} />
                </Box>
            </Box>

            <DialogContent sx={{ pt: 2.5, pb: 3 }}>
                {error && (
                    <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-accent-soft)', border: '1px solid var(--c-border)', borderRadius: 2 }}>
                        <Typography sx={{ fontSize: 12, color: 'var(--c-danger)' }}>⚠ {error}</Typography>
                    </Box>
                )}

                {loading && (
                    <Box sx={{ display: 'flex', justifyContent: 'center', py: 3 }}>
                        <CircularProgress size={18} sx={{ color: 'var(--c-border-strong)' }} />
                    </Box>
                )}

                {!loading && (
                    <>
                        {/* ── Suggestions ── */}
                        <Typography sx={{ ...sectionTitle, mb: 1 }}>
                            {t('Схоже, це одна людина')}
                        </Typography>

                        {suggestions.length === 0 ? (
                            <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 3 }}>
                                {t('Нових збігів немає')}
                            </Typography>
                        ) : (
                            <Box sx={{ mb: 3 }}>
                                {suggestions.map(s => (
                                    <Box key={s.id} sx={{ p: 1.5, mb: 1, bgcolor: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 1 }}>
                                            <Box sx={{ flex: 1, minWidth: 0 }}><IdentityChip identity={s.identityA} accountLabels={accountLabels} /></Box>
                                            <Typography sx={{ fontSize: 13, color: 'var(--c-text-faint)' }}>↔</Typography>
                                            <Box sx={{ flex: 1, minWidth: 0 }}><IdentityChip identity={s.identityB} accountLabels={accountLabels} /></Box>
                                        </Box>
                                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
                                            {/* The grounds are shown, not just the score: the user is being asked
                                                to judge the match, which needs something to judge. */}
                                            <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                                                {s.reasons} · {Math.round(s.score * 100)}%
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 0.8 }}>
                                                <Box sx={button(busyId !== s.id, 'ghost')}
                                                     onClick={busyId === s.id ? undefined : () => act(s.id, () => contactService.reject(s.id))}>
                                                    {t('Різні')}
                                                </Box>
                                                <Box sx={button(busyId !== s.id, 'primary')}
                                                     onClick={busyId === s.id ? undefined : () => act(s.id, () => contactService.confirm(s.id))}>
                                                    {t('Та сама людина')}
                                                </Box>
                                            </Box>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        )}

                        {/* ── Linked contacts ── */}
                        <Typography sx={{ ...sectionTitle, mb: 1 }}>
                            {t('Об\'єднані контакти')}
                        </Typography>

                        {contacts.length === 0 ? (
                            <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)', mb: 3 }}>
                                {t('Поки жодного')}
                            </Typography>
                        ) : (
                            <Box sx={{ mb: 3 }}>
                                {contacts.map(c => (
                                    <Box key={c.id} sx={{ p: 1.5, mb: 1, bgcolor: 'var(--c-bg)', border: '1px solid var(--c-border)', borderRadius: 2 }}>
                                        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.8, mb: 0.8 }}>
                                            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'var(--c-text)' }}>
                                                {name(c.displayName)}
                                            </Typography>
                                            <Typography sx={{ fontSize: 11, color: 'var(--c-text-faint)' }}>
                                                {c.identities.length}{t(' чати')}
                                            </Typography>
                                        </Box>

                                        {/* Each row opens its chat. Before this the merged list was a
                                            dead end: it could report that two chats were one person
                                            but offered no way to reach either of them. */}
                                        {c.identities.map(i => (
                                            <Box
                                                key={i.id}
                                                onClick={() => { onOpenChat?.(i.chatId); onClose(); }}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (onOpenChat?.(i.chatId), onClose())}
                                                sx={{
                                                    display: 'flex', alignItems: 'center', gap: 1,
                                                    px: 0.75, py: 0.5, mx: -0.75,
                                                    borderRadius: 1.5, cursor: 'pointer',
                                                    '&:hover': { bgcolor: 'var(--c-surface-hover)' },
                                                    '&:hover .open-hint': { opacity: 1 },
                                                }}
                                            >
                                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                                    <IdentityChip identity={i} accountLabels={accountLabels} />
                                                </Box>

                                                <Typography className="open-hint" sx={{
                                                    fontSize: 11, fontWeight: 600, color: 'var(--c-text-faint)',
                                                    opacity: 0, transition: 'opacity .12s', flexShrink: 0,
                                                }}>
                                                    {t('Відкрити ›')}
                                                </Typography>

                                                <LinkOffIcon
                                                    titleAccess={t('Роз\'єднати')}
                                                    onClick={busyId === i.id ? undefined : (e) => {
                                                        // The row navigates; this one control does not.
                                                        e.stopPropagation();
                                                        act(i.id, () => contactService.unlink(i.id));
                                                    }}
                                                    sx={{ fontSize: 15, color: 'var(--c-text-faint)', cursor: 'pointer', flexShrink: 0, '&:hover': { color: 'var(--c-accent-text)' } }} />
                                            </Box>
                                        ))}
                                    </Box>
                                ))}
                            </Box>
                        )}

                        {/* ── Manual linking ── */}
                        <Typography sx={{ ...sectionTitle, mb: 1 }}>
                            {t('Зв\'язати вручну')}
                        </Typography>

                        {unlinked.length < 2 ? (
                            <Typography sx={{ fontSize: 12, color: 'var(--c-text-faint)' }}>
                                {t('Потрібно щонайменше два незв\'язані чати')}
                            </Typography>
                        ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {[[pickA, setPickA], [pickB, setPickB]].map(([value, set], index) => (
                                    <select
                                        key={index}
                                        value={value}
                                        onChange={e => set(e.target.value)}
                                        style={{
                                            flex: 1, minWidth: 0, background: 'var(--c-bg)', border: '1px solid var(--c-border)',
                                            borderRadius: 8, padding: '8px 10px', color: 'var(--c-text)', fontSize: 12,
                                            outline: 'none',
                                        }}
                                    >
                                        <option value="">{t('— оберіть чат —')}</option>
                                        {unlinked.map(i => (
                                            <option key={i.id} value={i.id}>
                                                {MESSENGER[i.messengerType]?.label || i.messengerType} · {name(i.displayName)}
                                            </option>
                                        ))}
                                    </select>
                                ))}
                                <Box sx={{ ...button(canLink && busyId !== 'link', 'primary'), flexShrink: 0 }}
                                     onClick={!canLink || busyId === 'link' ? undefined : () => act('link', async () => {
                                         await contactService.link(Number(pickA), Number(pickB));
                                         setPickA('');
                                         setPickB('');
                                     })}>
                                    {t('Зв\'язати')}
                                </Box>
                            </Box>
                        )}
                    </>
                )}
            </DialogContent>
        </Dialog>
    );
}
