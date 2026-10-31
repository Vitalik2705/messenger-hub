import { useState } from 'react';
import { Switch, Button, Typography } from '@mui/material';
import SettingsCard, { SettingRow } from './SettingsCard';
import notificationService from '../../services/notificationService';
import { t } from '../../i18n';

const PERMISSION_TEXT = {
    granted: t('Браузер дозволив сповіщення.'),
    denied: t('Браузер заблокував сповіщення для цього сайту — дозвольте їх у налаштуваннях сайту (значок замка в адресному рядку).'),
    default: t('Браузер ще не питали. Сповіщення з’являються, лише коли вкладка неактивна.'),
    unsupported: t('Цей браузер не підтримує системні сповіщення.'),
};

export default function NotificationsSection() {
    const [permission, setPermission] = useState(notificationService.permission);
    const [enabled, setEnabled] = useState(notificationService.isEnabled);
    const [preview, setPreview] = useState(notificationService.showsPreview);

    const ask = async () => {
        await notificationService.requestPermission();
        setPermission(notificationService.permission());
    };

    return (
        <SettingsCard id="notifications" title={t('Сповіщення')} description={t('Системні сповіщення про нові повідомлення, поки вкладка у фоні.')}>
            <SettingRow first title={t('Дозвіл браузера')} hint={PERMISSION_TEXT[permission]}>
                {permission === 'default' && (
                    <Button variant="contained" disableElevation onClick={ask}
                            sx={{ textTransform: 'none', fontWeight: 650, borderRadius: '9px', flexShrink: 0 }}>
                        {t('Дозволити')}
                    </Button>
                )}
                {permission === 'granted' && <Typography sx={(t) => ({ fontSize: 13, fontWeight: 650, color: t.c.success })}>{t('Увімкнено')}</Typography>}
            </SettingRow>
            <SettingRow title={t('Сповіщати про нові повідомлення')} hint={t('Вимкніть, якщо достатньо лічильника в списку чатів.')}>
                <Switch checked={enabled} disabled={permission !== 'granted'}
                        onChange={(e) => { notificationService.setEnabled(e.target.checked); setEnabled(e.target.checked); }} />
            </SettingRow>
            <SettingRow title={t('Показувати текст повідомлення')} hint={t('Вимкнено — у сповіщенні лише ім’я відправника. Корисно, коли екран бачать інші.')}>
                <Switch checked={preview} disabled={permission !== 'granted' || !enabled}
                        onChange={(e) => { notificationService.setShowsPreview(e.target.checked); setPreview(e.target.checked); }} />
            </SettingRow>
        </SettingsCard>
    );
}
