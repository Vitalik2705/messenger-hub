import { Box, Typography } from '@mui/material';
import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import { radius } from '../../theme/tokens';

/** A form-level message above the fields: what went wrong, or that it worked. */
export default function FormAlert({ children, success = false }) {
    if (!children) return null;
    const Icon = success ? CheckCircleOutlineRoundedIcon : ErrorOutlineRoundedIcon;
    return (
        <Box role="alert" sx={(t) => {
            const colour = success ? t.c.success : t.c.danger;
            return {
                display: 'flex', alignItems: 'flex-start', gap: 1, mb: 2.5, px: 1.5, py: 1.2,
                borderRadius: radius.md, border: `1px solid ${colour}40`, bgcolor: `${colour}12`, color: colour,
            };
        }}>
            <Icon sx={{ fontSize: 18, mt: '1px' }} />
            <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>{children}</Typography>
        </Box>
    );
}
