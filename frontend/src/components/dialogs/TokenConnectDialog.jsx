import { useState } from 'react';
import { Typography, Box } from '@mui/material';
import { SiSlack, SiDiscord, SiViber } from 'react-icons/si';
import ConnectDialogShell, { ErrorNote, PrimaryButton, Field } from './ConnectDialogShell';
import { serviceFor } from '../../services/messengerServices';
import { t } from '../../i18n';

const strong = (text) => <strong style={{ color: 'var(--c-text)' }}>{text}</strong>;

/**
 * The networks that connect by pasting a token. They differ only in where the token comes
 * from, so that — and the colours — is all each entry says.
 */
const NETWORKS = {
    SLACK: {
        title: t('Підключити Slack'),
        subtitle: t('Вставте ваш User OAuth Token'),
        icon: <SiSlack size={18} color="#611f69" />, iconBg: '#f5eef6',
        gradient: 'linear-gradient(135deg, #611f69, #9b59b6)',
        placeholder: 'xoxp-…',
        howTo: <>{t('Перейдіть на ')}{strong('api.slack.com/apps')}{t(' → OAuth & Permissions → скопіюйте ')}{strong('User OAuth Token')}{t(' (починається з xoxp-)')}</>,
    },
    DISCORD: {
        title: t('Підключити Discord'),
        subtitle: t('Вставте токен бота'),
        icon: <SiDiscord size={18} color="#5865F2" />, iconBg: '#eef0fb',
        gradient: 'linear-gradient(135deg, #5865F2, #7289da)',
        placeholder: t('Токен бота…'),
        howTo: <>
            {t('1. Перейдіть на ')}{strong('discord.com/developers/applications')}<br />
            {t('2. Створіть додаток → Bot → ')}{strong('Reset Token')}<br />
            {t('3. Увімкніть ')}{strong('Message Content Intent')}{t(' у налаштуваннях бота')}<br />
            {t('4. Запросіть бота на сервери з правом ')}{strong('Read Messages')}<br />
            {t('5. Вставте токен бота нижче')}
        </>,
    },
    VIBER: {
        title: t('Підключити Viber-бота'),
        subtitle: t('Вставте токен бота'),
        icon: <SiViber size={18} color="#7360F2" />, iconBg: '#f0edf8',
        gradient: 'linear-gradient(135deg, #7360F2, #9b88ff)',
        placeholder: t('Токен авторизації Viber…'),
        howTo: <>{t('Перейдіть на ')}{strong('partners.viber.com')}{t(' → Create Bot Account → скопіюйте ')}{strong('Auth Token')}{t('. Повідомлення надходитимуть після того, як користувачі напишуть боту. Для локальної роботи відкрийте порт 8205 через ngrok.')}</>,
    },
};

/** Connects Slack, Discord or Viber by token; reports only success upward. */
export default function TokenConnectDialog({ type, open, onClose, onConnected }) {
    const network = NETWORKS[type];
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const close = () => { setToken(''); setError(''); onClose(); };

    const connect = async () => {
        if (!token.trim() || busy) return;
        setError(''); setBusy(true);
        try {
            await serviceFor(type).connect(token.trim());
            setToken('');
            onConnected();
        } catch (e) {
            const data = e.response?.data;
            setError(t(data?.detail || data?.error || data?.message) || t('Не вдалося підключитися'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <ConnectDialogShell open={open} onClose={close} icon={network.icon} iconBg={network.iconBg}
                            title={network.title} subtitle={network.subtitle}>
            <ErrorNote>{error}</ErrorNote>
            <Box sx={{ mb: 2, p: 1.5, bgcolor: 'var(--c-surface-sunken)', borderRadius: 2 }}>
                <Typography sx={{ fontSize: 12, color: 'var(--c-text-muted)', lineHeight: 1.7 }}>{network.howTo}</Typography>
            </Box>
            <Field
                autoFocus
                type="password"
                autoComplete="off"
                placeholder={network.placeholder}
                value={token}
                onChange={e => setToken(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && connect()}
                style={{ fontFamily: 'monospace' }}
            />
            <PrimaryButton onClick={connect} disabled={!token.trim()} busy={busy} gradient={network.gradient}>
                {t('Підключити →')}
            </PrimaryButton>
        </ConnectDialogShell>
    );
}
