import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, Box, Typography, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import NorthEastIcon from '@mui/icons-material/NorthEast';
import analysisService from '../../services/analysisService';
import AnalysisSetup from './analysis/AnalysisSetup';
import AnalysisResult from './analysis/AnalysisResult';
import { radius, numeric } from '../../theme/tokens';

const RUNNING = new Set(['PENDING', 'RUNNING']);
/** Enough to see that the last few runs happened; the page is where they are read. */
const RECENT = 5;

/**
 * Start an analysis of the chat you are reading.
 *
 * Scoped to this chat on purpose. The full history moved to its own page once results grew
 * to a page of reading each — a column beside a conversation is the wrong place to compare
 * two runs, and mixing every chat's runs into it made the dialog answer a question nobody
 * asked while standing in a chat.
 */
export default function AnalysisDialog({ open, onClose, chat }) {
    const navigate = useNavigate();
    const [runs, setRuns] = useState([]);
    const [expanded, setExpanded] = useState(null);
    const pollRef = useRef(null);

    const loadRuns = useCallback(async () => {
        if (!chat?.id) return;
        try {
            const { data } = await analysisService.getRuns(chat.id);
            setRuns(data.slice(0, RECENT));
        } catch { /* the setup half still works */ }
    }, [chat?.id]);

    useEffect(() => { if (open) loadRuns(); }, [open, loadRuns]);

    useEffect(() => {
        const unfinished = runs.some(run => RUNNING.has(run.status));
        if (!open || !unfinished) {
            if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
            return;
        }
        if (pollRef.current) return;
        pollRef.current = setInterval(loadRuns, 2500);
        return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
    }, [open, runs, loadRuns]);

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="sm"
            fullWidth
            slotProps={{
                paper: {
                    sx: (t) => ({
                        bgcolor: t.c.surfaceAlt,
                        borderRadius: radius.lg,
                        border: `1px solid ${t.c.border}`,
                        boxShadow: t.c.shadowRaised,
                        backgroundImage: 'none',
                    }),
                },
            }}
        >
            <Box sx={(t) => ({
                px: 2.5, py: 2, display: 'flex', alignItems: 'center', gap: 1,
                borderBottom: `1px solid ${t.c.border}`,
            })}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={(t) => ({ fontSize: 15, fontWeight: 750, color: t.c.text })}>
                        Аналітика чату
                    </Typography>
                    <Typography noWrap sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint, mt: 0.2 })}>
                        {chat?.name || '—'}
                    </Typography>
                </Box>
                <IconButton size="small" onClick={onClose} sx={{ width: 28, height: 28 }}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                </IconButton>
            </Box>

            <Box sx={{ px: 2.5, py: 2, maxHeight: '70vh', overflowY: 'auto' }}>
                <AnalysisSetup
                    chat={chat}
                    compact
                    onStarted={(run) => { setRuns(current => [run, ...current].slice(0, RECENT)); setExpanded(run.id); }}
                />

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 2.5, mb: 1 }}>
                    <Typography sx={(t) => ({
                        fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em',
                        textTransform: 'uppercase', color: t.c.textFaint,
                    })}>
                        Останні по цьому чату
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    <Box
                        onClick={() => { onClose(); navigate('/analytics'); }}
                        role="button"
                        tabIndex={0}
                        sx={(t) => ({
                            display: 'flex', alignItems: 'center', gap: 0.35, cursor: 'pointer',
                            fontSize: 11, fontWeight: 650, color: t.c.accentText,
                        })}
                    >
                        Уся історія
                        <NorthEastIcon sx={{ fontSize: 12 }} />
                    </Box>
                </Box>

                {runs.length === 0 ? (
                    <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint, py: 1 })}>
                        Цей чат ще не аналізували
                    </Typography>
                ) : (
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        {runs.map(run => (
                            <Box key={run.id} sx={(t) => ({
                                borderRadius: radius.md,
                                border: `1px solid ${t.c.border}`,
                                bgcolor: t.c.surface,
                                overflow: 'hidden',
                            })}>
                                <Box
                                    onClick={() => setExpanded(expanded === run.id ? null : run.id)}
                                    sx={(t) => ({
                                        display: 'flex', alignItems: 'center', gap: 1,
                                        px: 1.5, py: 1, cursor: 'pointer',
                                        '&:hover': { bgcolor: t.c.surfaceHover },
                                    })}
                                >
                                    <Box sx={(t) => ({
                                        width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                                        bgcolor: run.status === 'DONE' ? t.c.success
                                            : run.status === 'FAILED' ? t.c.danger : t.c.textFaint,
                                    })} />
                                    <Typography noWrap sx={(t) => ({
                                        ...numeric, flex: 1, fontSize: 11.5, color: t.c.textMuted,
                                    })}>
                                        {[
                                            new Date(run.createdAt).toLocaleString('uk-UA', {
                                                day: 'numeric', month: 'short',
                                                hour: '2-digit', minute: '2-digit',
                                            }),
                                            run.model,
                                            run.modelMs && `${Math.round(run.modelMs / 1000)} с`,
                                        ].filter(Boolean).join(' · ')}
                                    </Typography>
                                    {RUNNING.has(run.status) && <CircularProgress size={12} />}
                                    <ExpandMoreIcon sx={(t) => ({
                                        fontSize: 16, color: t.c.textFaint, flexShrink: 0,
                                        transform: expanded === run.id ? 'rotate(180deg)' : 'none',
                                        transition: 'transform .15s',
                                    })} />
                                </Box>

                                {expanded === run.id && (
                                    <Box sx={{ px: 1.5, pb: 1.5 }}>
                                        {RUNNING.has(run.status) ? (
                                            <Typography sx={(t) => ({ fontSize: 12, color: t.c.textFaint })}>
                                                {run.status === 'PENDING'
                                                    ? 'У черзі — аналізи виконуються по одному.'
                                                    : 'Модель працює.'}
                                            </Typography>
                                        ) : (
                                            <AnalysisResult run={run} />
                                        )}
                                    </Box>
                                )}
                            </Box>
                        ))}
                    </Box>
                )}
            </Box>
        </Dialog>
    );
}
