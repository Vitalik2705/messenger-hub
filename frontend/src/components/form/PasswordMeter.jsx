import { Box, Typography } from '@mui/material';
import { passwordStrength } from '../../utils/formErrors';

/** Four bars under a new password, filling as it gets harder to guess. */
export default function PasswordMeter({ password }) {
    const { score, label } = passwordStrength(password);
    if (!password) return null;
    return (
        <Box sx={{ mt: -1, mb: 2 }}>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
                {[1, 2, 3, 4].map(level => (
                    <Box key={level} sx={(t) => ({
                        flex: 1, height: 4, borderRadius: 2, transition: 'background-color .2s',
                        bgcolor: level > score ? t.c.border
                            : score <= 1 ? t.c.danger : score === 2 ? '#E0A100' : t.c.success,
                    })} />
                ))}
            </Box>
            <Typography sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint, mt: 0.5 })}>{label}</Typography>
        </Box>
    );
}
