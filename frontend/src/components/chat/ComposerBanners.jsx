import { Box, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { radius, numeric } from '../../theme/tokens';
import { formatBytes } from '../../utils/format';
import { plainText } from '../../utils/richText';
import { t } from '../../i18n';

/*
 * The strips that sit above the message field and say what the next send will do: answer a
 * message, replace one, carry an attachment, or start from a model's draft.
 */

const KIND_LABELS = { IMAGE: t('Фото'), VIDEO: t('Відео'), AUDIO: t('Аудіо'), FILE: t('Файл') };

function CloseButton({ onClick, title, disabled = false, danger = false }) {
    return (
        <Box onClick={disabled ? undefined : onClick} title={title}
             sx={(t) => ({
                 cursor: disabled ? 'default' : 'pointer', color: t.c.textFaint,
                 display: 'flex', flexShrink: 0, p: 0.5, borderRadius: '50%', transition: 'all .12s',
                 '&:hover': disabled ? {} : { color: danger ? t.c.danger : t.c.accentText, bgcolor: t.c.accentSoft },
             })}>
            <CloseIcon sx={{ fontSize: 16 }} />
        </Box>
    );
}

/** A quoted message: the one being answered, or the one being edited. */
export function QuoteBanner({ title, text, editing = false, onClose }) {
    return (
        <Box sx={{ px: 2.5, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            {editing && <EditOutlinedIcon sx={(t) => ({ fontSize: 16, color: t.c.accentText })} />}
            <Box sx={(t) => ({ flex: 1, pl: 1.25, py: 0.55, pr: 1, borderLeft: `2px solid ${t.c.accent}`, bgcolor: t.c.accentSoft, borderRadius: '0 6px 6px 0', minWidth: 0 })}>
                <Typography sx={(t) => ({ fontSize: 11, fontWeight: 700, color: t.c.accentText })}>{title}</Typography>
                <Typography noWrap sx={(t) => ({ fontSize: 11.5, color: t.c.textFaint })}>{plainText(text) || t('📎 Медіа')}</Typography>
            </Box>
            <CloseButton onClick={onClose} title={editing ? t('Скасувати (Esc)') : t('Скасувати відповідь')} />
        </Box>
    );
}

/** The model wrote what is in the field; says which model and lets it be thrown away. */
export function DraftBanner({ draft, onDismiss }) {
    return (
        <Box sx={{ px: 2.5, pt: 1.5, pb: 0.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <AutoAwesomeIcon sx={(t) => ({ fontSize: 14, color: t.c.accentText, flexShrink: 0 })} />
            <Typography sx={(t) => ({ fontSize: 11, fontWeight: 650, color: t.c.accentText })}>
                {t('Чернетка від моделі')}
            </Typography>
            <Typography sx={(t) => ({ ...numeric, fontSize: 10.5, color: t.c.textFaint })}>
                {[draft.model, draft.modelMs && t('{0} с', Math.round(draft.modelMs / 1000))].filter(Boolean).join(' · ')}
            </Typography>
            <Box sx={{ flex: 1 }} />
            <Typography onClick={onDismiss}
                        sx={(t) => ({ fontSize: 11, fontWeight: 600, color: t.c.textMuted, cursor: 'pointer', '&:hover': { color: t.c.danger } })}>
                {t('Прибрати')}
            </Typography>
        </Box>
    );
}

/** A file staged for sending: a thumbnail where there is one, its name, kind and size. */
export function PendingAttachment({ pending, withCaption, sending, onRemove }) {
    const thumb = { width: 52, height: 52, objectFit: 'cover', borderRadius: radius.md, flexShrink: 0 };
    return (
        <Box sx={(t) => ({
            mx: 2.5, mt: 1.5, p: 1, display: 'flex', alignItems: 'center', gap: 1.5,
            bgcolor: t.c.surface, border: `1px solid ${t.c.border}`, borderRadius: radius.lg,
        })}>
            {pending.url && pending.kind === 'IMAGE' && <Box component="img" src={pending.url} alt="" sx={thumb} />}
            {pending.url && pending.kind === 'VIDEO' && <Box component="video" src={pending.url} muted sx={{ ...thumb, bgcolor: '#000' }} />}
            {!pending.url && (
                <Box sx={(t) => ({ ...thumb, bgcolor: t.c.surfaceSunken, color: t.c.textMuted, display: 'flex', alignItems: 'center', justifyContent: 'center' })}>
                    <AttachFileIcon sx={{ fontSize: 20 }} />
                </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography noWrap sx={(t) => ({ fontSize: 12.5, fontWeight: 650, color: t.c.text })}>{pending.fileName}</Typography>
                <Typography sx={(t) => ({ ...numeric, fontSize: 11, color: t.c.textFaint })}>
                    {KIND_LABELS[pending.kind]} · {formatBytes(pending.file.size)}{withCaption ? t(' · з підписом') : ''}
                </Typography>
            </Box>
            <CloseButton onClick={onRemove} title={t('Прибрати вкладення')} disabled={sending} danger />
        </Box>
    );
}
