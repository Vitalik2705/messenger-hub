import { Box, Typography } from '@mui/material';
import TelegramIcon from '@mui/icons-material/Telegram';
import { SiSlack } from 'react-icons/si';

const WelcomeScreen = ({ telegramConnected, slackConnected }) => (
    <Box sx={{
        flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        bgcolor: '#f5f0eb', position: 'relative', overflow: 'hidden',
    }}>
        {/* Decorative circles */}
        <Box sx={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', border: '1px solid rgba(232,71,10,0.06)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', border: '1px solid rgba(232,71,10,0.08)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />
        <Box sx={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', border: '1px solid rgba(232,71,10,0.12)', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', pointerEvents: 'none' }} />

        <Box sx={{ textAlign: 'center', position: 'relative', zIndex: 1, maxWidth: 360, px: 3 }}>
            <Box sx={{
                width: 80, height: 80, borderRadius: '28px', margin: '0 auto 28px',
                background: 'linear-gradient(135deg, #e8470a, #f4855a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 12px 40px rgba(232,71,10,0.25)',
            }}>
                <Typography sx={{ fontSize: 36 }}>💬</Typography>
            </Box>

            <Typography sx={{
                fontFamily: '"Playfair Display", serif',
                fontSize: 28, fontWeight: 700, mb: 1.5,
                color: '#1a1208', letterSpacing: '-0.5px', lineHeight: 1.2,
            }}>
                All your chats,<br />one place.
            </Typography>
            <Typography sx={{ fontSize: 14, color: '#9a8878', lineHeight: 1.7, mb: 3, fontFamily: '"DM Sans", sans-serif' }}>
                Select a conversation from the sidebar to start messaging across all your platforms.
            </Typography>

            {(telegramConnected || slackConnected) && (
                <Box sx={{ display: 'flex', gap: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {telegramConnected && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, bgcolor: '#e8f4fb', border: '1px solid #b8dcf0', borderRadius: 2, px: 1.5, py: 0.7 }}>
                            <TelegramIcon sx={{ fontSize: 14, color: '#0088cc' }} />
                            <Typography sx={{ fontSize: 12, color: '#0070aa', fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>Telegram</Typography>
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#22c55e' }} />
                        </Box>
                    )}
                    {slackConnected && (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8, bgcolor: '#f5eef6', border: '1px solid #dfc0e0', borderRadius: 2, px: 1.5, py: 0.7 }}>
                            <SiSlack size={13} color="#611f69" />
                            <Typography sx={{ fontSize: 12, color: '#611f69', fontWeight: 600, fontFamily: '"DM Sans", sans-serif' }}>Slack</Typography>
                            <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: '#22c55e' }} />
                        </Box>
                    )}
                </Box>
            )}
        </Box>
    </Box>
);

export default WelcomeScreen;