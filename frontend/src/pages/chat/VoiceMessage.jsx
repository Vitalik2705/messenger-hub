import { useState, useRef, useEffect } from 'react';
import { Box, Typography, CircularProgress } from '@mui/material';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import PauseRoundedIcon from '@mui/icons-material/PauseRounded';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import transcriptionService from '../../services/transcriptionService';
import { radius, numeric } from '../../theme/tokens';

/**
 * A voice message that looks like one.
 *
 * The browser's own `<audio controls>` was doing this job: a grey slab with a volume
 * slider, a download button and a context menu, none of which belong in a conversation. It
 * also renders differently in every browser, so the one element in the chat nobody styled
 * was the one that looked least like the rest.
 *
 * The bars are decorative and honest about it — they are a fixed pattern, not an analysis
 * of the audio. Drawing a real waveform would mean decoding every clip in the browser to
 * produce something nobody reads.
 */
const BARS = [0.35, 0.6, 0.85, 0.5, 1, 0.7, 0.45, 0.8, 0.55, 0.9, 0.4, 0.65,
    0.95, 0.5, 0.75, 0.35, 0.6, 0.85, 0.45, 0.7];

const clock = (seconds) => {
    if (!seconds || !Number.isFinite(seconds)) return '0:00';
    const whole = Math.floor(seconds);
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

export default function VoiceMessage({ message, chat, src, transcript }) {
    const audioRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [position, setPosition] = useState(0);
    const [length, setLength] = useState(message.duration || 0);

    const [text, setText] = useState(transcript || null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    // A transcript produced by the background job arrives as a prop later; it must not be
    // ignored just because this component already rendered without one.
    useEffect(() => { if (transcript) setText(transcript); }, [transcript]);

    const toggle = () => {
        const audio = audioRef.current;
        if (!audio) return;
        if (audio.paused) { audio.play(); setPlaying(true); }
        else { audio.pause(); setPlaying(false); }
    };

    const seek = (event) => {
        const audio = audioRef.current;
        if (!audio || !length) return;
        const box = event.currentTarget.getBoundingClientRect();
        const share = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        audio.currentTime = share * length;
        setPosition(audio.currentTime);
    };

    const transcribe = async () => {
        setBusy(true);
        setError('');
        try {
            const { data } = await transcriptionService.transcribeMessage({
                accountId: chat.messengerAccountId,
                externalChatId: chat.externalChatId,
                externalMessageId: message.externalMessageId,
            });
            if (data.error) setError(data.error);
            else if (data.empty) setError('Модель не розібрала мову в цьому записі');
            else setText(data.text);
        } catch (e) {
            setError(e.response?.data?.error || 'Не вдалося розшифрувати');
        } finally {
            setBusy(false);
        }
    };

    const progress = length ? Math.min(1, position / length) : 0;

    return (
        <Box sx={{ minWidth: 240, maxWidth: 340 }}>
            <Box sx={(t) => ({
                display: 'flex', alignItems: 'center', gap: 1.25,
                p: '8px 12px 8px 8px',
                borderRadius: radius.lg,
                bgcolor: t.c.bg,
                border: `1px solid ${t.c.border}`,
            })}>
                <Box
                    onClick={src ? toggle : undefined}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => src && (e.key === 'Enter' || e.key === ' ') && toggle()}
                    sx={(t) => ({
                        width: 34, height: 34, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        borderRadius: '50%',
                        bgcolor: src ? t.c.accent : t.c.surfaceSunken,
                        color: src ? t.c.onAccent : t.c.textFaint,
                        cursor: src ? 'pointer' : 'default',
                        '&:hover': src ? { bgcolor: t.c.accentHover } : {},
                    })}
                >
                    {!src ? <CircularProgress size={14} sx={{ color: 'inherit' }} />
                        : playing ? <PauseRoundedIcon sx={{ fontSize: 20 }} />
                            : <PlayArrowRoundedIcon sx={{ fontSize: 22, ml: '2px' }} />}
                </Box>

                <Box sx={{ flex: 1, minWidth: 0 }}>
                    {/* Clickable along its whole width: the bars are the seek control, which
                        is the only interaction the default player had that was worth keeping. */}
                    <Box
                        onClick={seek}
                        sx={{
                            display: 'flex', alignItems: 'center', gap: '2px',
                            height: 22, cursor: src ? 'pointer' : 'default',
                        }}
                    >
                        {BARS.map((height, index) => (
                            <Box
                                key={index}
                                sx={(t) => ({
                                    flex: 1,
                                    height: `${height * 100}%`,
                                    borderRadius: '1px',
                                    bgcolor: index / BARS.length <= progress ? t.c.accent : t.c.borderStrong,
                                    opacity: index / BARS.length <= progress ? 1 : 0.55,
                                    transition: 'background-color .1s',
                                })}
                            />
                        ))}
                    </Box>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.3 }}>
                        <Typography sx={(t) => ({ ...numeric, fontSize: 10.5, color: t.c.textFaint })}>
                            {playing || position > 0 ? clock(position) : clock(length)}
                        </Typography>
                        <Box sx={{ flex: 1 }} />

                        {/* Offered only while there is nothing to show: once the text is
                            here, the button has nothing left to do. */}
                        {!text && (
                            <Box
                                onClick={busy || !src ? undefined : transcribe}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => !busy && src && (e.key === 'Enter') && transcribe()}
                                sx={(t) => ({
                                    display: 'flex', alignItems: 'center', gap: 0.4,
                                    px: 0.75, py: '2px', borderRadius: radius.pill,
                                    border: `1px solid ${t.c.border}`,
                                    color: t.c.textMuted,
                                    fontSize: 10.5, fontWeight: 650,
                                    cursor: busy || !src ? 'default' : 'pointer',
                                    '&:hover': busy || !src ? {} : { borderColor: t.c.accent, color: t.c.accentText },
                                })}
                            >
                                {busy
                                    ? <CircularProgress size={9} sx={{ color: 'inherit' }} />
                                    : <GraphicEqIcon sx={{ fontSize: 12 }} />}
                                {busy ? 'Слухаю…' : 'Текстом'}
                            </Box>
                        )}
                    </Box>
                </Box>
            </Box>

            {src && (
                <audio
                    ref={audioRef}
                    src={src}
                    preload="metadata"
                    onLoadedMetadata={(e) => {
                        // Telegram's reported duration and the file's own can disagree;
                        // the file wins, since that is what the scrubber maps onto.
                        if (Number.isFinite(e.currentTarget.duration)) setLength(e.currentTarget.duration);
                    }}
                    onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
                    onEnded={() => { setPlaying(false); setPosition(0); }}
                    style={{ display: 'none' }}
                />
            )}

            {error && (
                <Typography sx={(t) => ({ fontSize: 11, color: t.c.danger, mt: 0.6 })}>
                    {error}
                </Typography>
            )}

            {/* Labelled as a transcription, never as the message. It is a machine's reading
                of speech and it can be wrong — the audio above stays the record. */}
            {text && (
                <Box sx={(t) => ({ mt: 0.75, pl: 1.25, borderLeft: `2px solid ${t.c.borderStrong}` })}>
                    <Typography sx={(t) => ({
                        fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: t.c.textFaint, mb: 0.2,
                    })}>
                        Розшифровка
                    </Typography>
                    <Typography sx={(t) => ({ fontSize: 12.5, color: t.c.text, lineHeight: 1.5 })}>
                        {text}
                    </Typography>
                </Box>
            )}
        </Box>
    );
}
