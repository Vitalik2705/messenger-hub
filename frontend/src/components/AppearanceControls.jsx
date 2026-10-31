import { Box, Typography, Tooltip } from '@mui/material';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { useThemeMode } from '../context/ThemeModeContext';
import { ACCENTS, radius, type } from '../theme/tokens';
import { t, LANGUAGE, LANGUAGES, setLanguage } from '../i18n';

const label = (t) => ({ ...type.micro, color: t.c.textFaint, mb: 1 });

/** Two or three options side by side, the chosen one raised. */
export function Segmented({ options, value, onChange }) {
    return (
        <Box role="radiogroup" sx={(t) => ({
            display: 'flex', gap: '3px', p: '3px', borderRadius: radius.md,
            bgcolor: t.c.surfaceSunken, border: `1px solid ${t.c.border}`,
        })}>
            {options.map(([key, text, icon]) => (
                <Box
                    key={key}
                    role="radio"
                    aria-checked={value === key}
                    tabIndex={0}
                    onClick={() => onChange(key)}
                    onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(key)}
                    sx={(t) => ({
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.6,
                        py: 0.7, borderRadius: radius.sm, cursor: 'pointer',
                        fontSize: 12, fontWeight: value === key ? 700 : 550,
                        color: value === key ? t.c.text : t.c.textMuted,
                        bgcolor: value === key ? t.c.surface : 'transparent',
                        boxShadow: value === key ? t.c.shadow : 'none',
                        transition: 'background-color .12s, color .12s',
                    })}
                >
                    {icon}{text}
                </Box>
            ))}
        </Box>
    );
}

/** Theme, accent and bubble style controls, shared by the sidebar popover and the settings page. */
export default function AppearanceControls() {
    const { mode, setMode, accent, setAccent, bubbles, setBubbles } = useThemeMode();

    return (
        <>
            <Typography sx={label}>{t('Тема')}</Typography>
            <Segmented
                value={mode}
                onChange={setMode}
                options={[
                    ['light', t('Світла'), <LightModeOutlinedIcon key="l" sx={{ fontSize: 15 }} />],
                    ['dark', t('Темна'), <DarkModeOutlinedIcon key="d" sx={{ fontSize: 15 }} />],
                ]}
            />

            <Typography sx={(t) => ({ ...label(t), mt: 2 })}>{t('Колір акценту')}</Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
                {Object.entries(ACCENTS).map(([key, preset]) => {
                    const colours = mode === 'dark' ? preset.dark : preset.light;
                    return (
                        <Tooltip key={key} title={preset.label}>
                            <Box
                                role="button"
                                tabIndex={0}
                                aria-label={preset.label}
                                aria-pressed={accent === key}
                                onClick={() => setAccent(key)}
                                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setAccent(key)}
                                sx={(t) => ({
                                    width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
                                    bgcolor: colours.accent,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: accent === key ? `0 0 0 2px ${t.c.surface}, 0 0 0 4px ${colours.accent}` : 'none',
                                    transition: 'transform .12s',
                                    '&:hover': { transform: 'scale(1.08)' },
                                })}
                            >
                                {accent === key && <CheckIcon sx={{ fontSize: 16, color: colours.onAccent }} />}
                            </Box>
                        </Tooltip>
                    );
                })}
            </Box>

            <Typography sx={(t) => ({ ...label(t), mt: 2 })}>{t('Мої повідомлення')}</Typography>
            <Segmented
                value={bubbles}
                onChange={setBubbles}
                options={[['filled', t('Заповнені')], ['soft', t('Мʼякі')]]}
            />

            <Typography sx={(theme) => ({ ...label(theme), mt: 2 })}>{t('Мова інтерфейсу')}</Typography>
            <Segmented value={LANGUAGE} onChange={(l) => l !== LANGUAGE && setLanguage(l)} options={LANGUAGES} />
        </>
    );
}
