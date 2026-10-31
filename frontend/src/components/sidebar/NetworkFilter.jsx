import { useState } from 'react';
import { Box, Typography, Menu, MenuItem, Divider } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import CheckIcon from '@mui/icons-material/Check';
import FilterListIcon from '@mui/icons-material/FilterList';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import MessengerGlyph from './MessengerGlyph';
import { MESSENGER_COLORS, MESSENGER_LABELS, radius, numeric } from '../../theme/tokens';
import { formatCount } from '../../utils/format';
import { accountScope } from '../../utils/scope';
import { t } from '../../i18n';

const ORDER = ['TELEGRAM', 'SLACK', 'DISCORD', 'WHATSAPP', 'VIBER'];

/**
 * Narrows the chat list to one network or one account. A menu rather than a row of chips, so any
 * number of accounts fits in a 330px sidebar.
 */
export default function NetworkFilter({ value, onChange, connected, unreadByType, totalUnread,
                                        accountsByType = {}, unreadByAccount = {},
                                        peopleOnly = false, onPeopleOnlyChange, hiddenCount = 0 }) {
    const [anchor, setAnchor] = useState(null);

    const options = [{ key: 'ALL', label: t('Усі чати'), count: totalUnread }];
    ORDER.filter(type => connected[type]).forEach(type => {
        const accounts = accountsByType[type] || [];
        options.push({
            key: type,
            label: MESSENGER_LABELS[type],
            count: unreadByType[type] || 0,
            type,
        });
        // The network row stays even when the accounts are listed: "everything on Telegram"
        // is a filter in its own right, and the chip version had quietly lost it.
        if (accounts.length > 1) {
            accounts.forEach(account => options.push({
                key: accountScope(type, account.id),
                label: account.label,
                count: unreadByAccount[account.id] || 0,
                type,
                nested: true,
            }));
        }
    });

    const current = options.find(option => option.key === value) || options[0];
    const isFiltered = current.key !== 'ALL';

    const choose = (key) => { onChange(key); setAnchor(null); };

    return (
        <Box sx={{ px: 2, pb: 1.5, flexShrink: 0 }}>
            <Box
                onClick={(e) => setAnchor(e.currentTarget)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setAnchor(e.currentTarget)}
                sx={(t) => ({
                    display: 'flex', alignItems: 'center', gap: 1,
                    px: 1.5, py: 0.9, minHeight: 34,
                    borderRadius: radius.md,
                    cursor: 'pointer',
                    bgcolor: isFiltered ? t.c.surfaceActive : 'transparent',
                    border: `1px solid ${isFiltered ? t.c.borderStrong : t.c.border}`,
                    color: t.c.text,
                    transition: 'all .12s',
                    '&:hover': { bgcolor: isFiltered ? t.c.surfaceActive : t.c.surfaceHover },
                })}
            >
                {current.type
                    ? <MessengerGlyph type={current.type} size={15} color={MESSENGER_COLORS[current.type]} />
                    : <FilterListIcon sx={(t) => ({ fontSize: 15, color: t.c.textMuted })} />}

                <Typography noWrap sx={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 650 }}>
                    {current.label}
                    {peopleOnly && (
                        <Box component="span" sx={(t) => ({ color: t.c.textMuted, fontWeight: 500 })}>
                            {t(' · тільки люди')}
                        </Box>
                    )}
                </Typography>

                {current.count > 0 && (
                    <Typography sx={(t) => ({
                        ...numeric, fontSize: 11.5, fontWeight: 700, flexShrink: 0,
                        color: isFiltered ? t.c.accent : t.c.textFaint,
                    })}>
                        {formatCount(current.count)}
                    </Typography>
                )}

                <ExpandMoreIcon sx={(t) => ({ fontSize: 17, color: t.c.textFaint, flexShrink: 0 })} />
            </Box>

            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
                transformOrigin={{ vertical: 'top', horizontal: 'left' }}
                slotProps={{ paper: { sx: { minWidth: 240, maxHeight: 380, mt: 0.5 } } }}
            >
                {options.map(option => {
                    const active = option.key === current.key;
                    return (
                        <MenuItem
                            key={option.key}
                            onClick={() => choose(option.key)}
                            sx={(t) => ({
                                gap: 1.25, py: 0.9,
                                // Accounts sit under their network, so the relationship is
                                // visible rather than something to infer from the label.
                                pl: option.nested ? 4 : 2,
                                fontSize: 13,
                                fontWeight: active ? 700 : 500,
                                color: t.c.text,
                            })}
                        >
                            {option.type
                                ? <MessengerGlyph type={option.type} size={14}
                                                  color={MESSENGER_COLORS[option.type]} />
                                : <FilterListIcon sx={(t) => ({ fontSize: 14, color: t.c.textMuted })} />}

                            <Box sx={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {option.label}
                            </Box>

                            {option.count > 0 && (
                                <Typography sx={(t) => ({
                                    ...numeric, fontSize: 11.5, fontWeight: 700,
                                    color: active ? t.c.accent : t.c.textFaint,
                                })}>
                                    {formatCount(option.count)}
                                </Typography>
                            )}

                            <CheckIcon sx={(t) => ({
                                fontSize: 15,
                                color: t.c.accentText,
                                // Kept in the layout even when hidden, so the rows do not
                                // shift sideways as the selection moves between them.
                                visibility: active ? 'visible' : 'hidden',
                            })} />
                        </MenuItem>
                    );
                })}

                {/* A separate dimension from the scope above: whether only chats with people are
                   shown. */}
                <Divider sx={{ my: 0.5 }} />
                <MenuItem
                    onClick={() => { onPeopleOnlyChange?.(!peopleOnly); setAnchor(null); }}
                    sx={(t) => ({
                        gap: 1.25, py: 0.9, pl: 2,
                        fontSize: 13, fontWeight: peopleOnly ? 700 : 500, color: t.c.text,
                    })}
                >
                    <PersonOutlineIcon sx={(t) => ({ fontSize: 15, color: t.c.textMuted })} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>{t('Тільки люди')}</Box>

                    {/* What the filter costs, so it is never a mystery why chats vanished. */}
                    {peopleOnly && hiddenCount > 0 && (
                        <Typography sx={(t) => ({ ...numeric, fontSize: 11.5, color: t.c.textFaint })}>
                            −{hiddenCount}
                        </Typography>
                    )}

                    <CheckIcon sx={(t) => ({
                        fontSize: 15, color: t.c.accentText,
                        visibility: peopleOnly ? 'visible' : 'hidden',
                    })} />
                </MenuItem>
            </Menu>
        </Box>
    );
}
