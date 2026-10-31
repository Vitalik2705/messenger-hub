import { useState } from 'react';
import { IconButton, Tooltip, Popover } from '@mui/material';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import AppearanceControls from '../AppearanceControls';
import { radius } from '../../theme/tokens';
import { t } from '../../i18n';

/**
 * The appearance settings one click from the chat list. The same controls live on the
 * settings page; this is the shortcut for trying a colour without leaving the inbox.
 */
export default function AppearanceMenu() {
    const [anchor, setAnchor] = useState(null);

    return (
        <>
            <Tooltip title={t('Оформлення')}>
                <IconButton size="small" onClick={(e) => setAnchor(e.currentTarget)}
                            sx={{ width: 30, height: 30, borderRadius: radius.md }}>
                    <PaletteOutlinedIcon sx={{ fontSize: 17 }} />
                </IconButton>
            </Tooltip>
            <Popover
                open={Boolean(anchor)}
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                slotProps={{
                    paper: {
                        sx: (t) => ({
                            mt: 1, p: 2, width: 270, borderRadius: radius.lg,
                            bgcolor: t.c.surface, border: `1px solid ${t.c.border}`,
                            boxShadow: t.c.shadowRaised, backgroundImage: 'none',
                        }),
                    },
                }}
            >
                <AppearanceControls />
            </Popover>
        </>
    );
}
