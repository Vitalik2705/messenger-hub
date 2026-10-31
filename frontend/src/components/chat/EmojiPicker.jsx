import { useState } from 'react';
import { Box, Popover, Typography } from '@mui/material';
import { radius } from '../../theme/tokens';
import { t } from '../../i18n';

/** A small dependency-free emoji picker: the commonly used emoji, grouped. */
const GROUPS = [
    [t('Часті'), '😀 😂 🥰 😍 😊 😉 😎 🤔 😅 😭 😢 😡 👍 👎 👏 🙏 💪 🤝 ❤️ 🔥 🎉 ✅ ❌ 💯'],
    [t('Обличчя'), '🙂 🙃 😇 🤩 😘 😋 😜 🤪 🤗 🤭 🤫 😐 😑 😶 😏 😒 🙄 😬 😴 🤤 😷 🤒 🤯 🥳 🥺 😳 😱 😤 🤬 💀 🤡'],
    [t('Жести'), '👌 ✌️ 🤞 🤟 🤘 👋 🤙 👉 👈 👆 👇 ☝️ ✋ 🖐 👊 🤛 🤜 🙌 🫶 💅'],
    [t('Серця'), '💛 💚 💙 💜 🖤 🤍 🤎 🧡 💔 ❣️ 💕 💞 💓 💗 💖 💘'],
    [t('Різне'), '☀️ 🌙 ⭐ ⚡ 🌈 ☕ 🍕 🍺 🎂 🎁 ⚽ 🎮 🎧 📚 💻 📱 📎 📌 🗓 ⏰ 🚗 ✈️ 🏠 💰'],
];

export default function EmojiPicker({ anchor, onClose, onPick }) {
    const [group, setGroup] = useState(0);
    const emojis = GROUPS[group][1].split(' ');

    return (
        <Popover
            open={Boolean(anchor)}
            anchorEl={anchor}
            onClose={onClose}
            anchorOrigin={{ vertical: 'top', horizontal: 'left' }}
            transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}
            slotProps={{
                paper: {
                    sx: (t) => ({
                        mb: 1, width: 300, p: 1, borderRadius: radius.lg, bgcolor: t.c.surface,
                        border: `1px solid ${t.c.border}`, boxShadow: t.c.shadowRaised, backgroundImage: 'none',
                    }),
                },
            }}
        >
            <Box sx={{ display: 'flex', gap: 0.5, mb: 1, flexWrap: 'wrap' }}>
                {GROUPS.map(([name], i) => (
                    <Typography key={name} onClick={() => setGroup(i)} role="button"
                                sx={(t) => ({
                                    fontSize: 11, fontWeight: group === i ? 700 : 550, px: 1, py: 0.3,
                                    borderRadius: radius.pill, cursor: 'pointer',
                                    color: group === i ? t.c.text : t.c.textFaint,
                                    bgcolor: group === i ? t.c.surfaceSunken : 'transparent',
                                })}>
                        {name}
                    </Typography>
                ))}
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px' }}>
                {emojis.map((emoji) => (
                    <Box key={emoji} role="button" onClick={() => onPick(emoji)}
                         sx={(t) => ({
                             fontSize: 21, lineHeight: '34px', textAlign: 'center', cursor: 'pointer',
                             borderRadius: radius.sm, transition: 'transform .1s',
                             '&:hover': { bgcolor: t.c.surfaceHover, transform: 'scale(1.15)' },
                         })}>
                        {emoji}
                    </Box>
                ))}
            </Box>
        </Popover>
    );
}
