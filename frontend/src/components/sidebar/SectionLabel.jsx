import { Typography } from '@mui/material';
import { type } from '../../theme/tokens';

/** Small caps heading that separates groups inside the sidebar. */
export default function SectionLabel({ children, ...props }) {
    return (
        <Typography
            sx={(t) => ({ ...type.micro, color: t.c.textFaint, px: 2, pt: 1.75, pb: 0.75 })}
            {...props}
        >
            {children}
        </Typography>
    );
}
