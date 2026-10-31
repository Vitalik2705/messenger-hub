import { useState, useEffect } from 'react';
import { Box, Typography, Menu, MenuItem, Tooltip, IconButton } from '@mui/material';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import CheckIcon from '@mui/icons-material/Check';
import autoReplyService from '../../services/autoReplyService';
import { t } from '../../i18n';

/**
 * How far the model may go in this chat. Set per chat only, on purpose: the sending modes write to
 * a specific person under the user's name.
 */
const MODES = [
    { key: 'OFF', label: t('Вимкнено'), hint: t('Нічого не генерується') },
    { key: 'DRAFT', label: t('Чернетка'), hint: t('Пропонує варіант, відправляєте ви') },
    { key: 'AUTO_LABELED', label: t('Автовідповідь із позначкою'), hint: t('Надсилає сам, підписано «автовідповідь»') },
    { key: 'AUTO', label: t('Автовідповідь без позначки'), hint: t('Надсилає від вашого імені, без позначки') },
];

export default function AutoReplyMenu({ chatId }) {
    const [anchor, setAnchor] = useState(null);
    const [mode, setMode] = useState('OFF');
    const [error, setError] = useState('');

    useEffect(() => {
        if (!chatId) return;
        let cancelled = false;
        autoReplyService.getChatMode(chatId)
            .then(({ data }) => { if (!cancelled) setMode(data.mode); })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [chatId]);

    const choose = async (key) => {
        try {
            await autoReplyService.setChatMode(chatId, key);
            setMode(key);
            setError('');
            setAnchor(null);
        } catch (e) {
            // The server refuses sending modes for groups and channels; say which and why
            // rather than silently leaving the menu on the old value.
            setError(t(e.response?.data?.error) || t('Не вдалося змінити режим'));
        }
    };

    const active = MODES.find(m => m.key === mode) || MODES[0];
    const on = mode !== 'OFF';

    return (
        <>
            <Tooltip title={t('Автовідповідь: {0}', active.label)}>
                <IconButton
                    size="small"
                    onClick={(e) => setAnchor(e.currentTarget)}
                    sx={(t) => ({
                        width: 32, height: 32, flexShrink: 0,
                        color: on ? t.c.accent : undefined,
                    })}
                >
                    <SmartToyOutlinedIcon sx={{ fontSize: 18 }} />
                </IconButton>
            </Tooltip>

            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={() => { setAnchor(null); setError(''); }}
                slotProps={{ paper: { sx: { minWidth: 290, mt: 0.5 } } }}
            >
                {MODES.map(option => (
                    <MenuItem
                        key={option.key}
                        onClick={() => choose(option.key)}
                        sx={{ gap: 1.25, py: 1, alignItems: 'flex-start' }}
                    >
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography sx={(t) => ({
                                fontSize: 12.5, fontWeight: option.key === mode ? 700 : 550,
                                color: option.key === 'AUTO' ? t.c.danger : t.c.text,
                            })}>
                                {option.label}
                            </Typography>
                            <Typography sx={(t) => ({
                                fontSize: 11, color: t.c.textFaint, whiteSpace: 'normal',
                            })}>
                                {option.hint}
                            </Typography>
                        </Box>
                        <CheckIcon sx={(t) => ({
                            fontSize: 15, color: t.c.accentText, mt: 0.25,
                            visibility: option.key === mode ? 'visible' : 'hidden',
                        })} />
                    </MenuItem>
                ))}

                <Box sx={(t) => ({ px: 2, py: 1, borderTop: `1px solid ${t.c.border}`, mt: 0.5 })}>
                    {error ? (
                        <Typography sx={(t) => ({ fontSize: 11, color: t.c.danger })}>{error}</Typography>
                    ) : (
                        // Stated where the switch is, not buried in settings: without the
                        // master switch on, choosing a mode here changes nothing at all.
                        <Typography sx={(t) => ({ fontSize: 10.5, color: t.c.textFaint, lineHeight: 1.5 })}>
                            {t('Працює лише коли автовідповідь увімкнена глобально й обрано модель — на сторінці аналітики.')}
                        </Typography>
                    )}
                </Box>
            </Menu>
        </>
    );
}
