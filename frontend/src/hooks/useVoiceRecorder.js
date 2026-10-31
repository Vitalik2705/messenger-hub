import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Browsers do not agree on what they can record.
 *
 * Firefox produces OGG/Opus, which is exactly what Telegram and WhatsApp want, so asking
 * for it first means no repackaging on the server at all. Chrome only offers WebM — the
 * same Opus audio in a different container, which the backend remuxes. Safari ignores both
 * and records AAC in mp4, which has to be re-encoded.
 *
 * Preferring the format that needs least work is worth the four lines it costs.
 */
const PREFERRED_TYPES = [
    'audio/ogg;codecs=opus',
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
];

function pickMimeType() {
    if (typeof MediaRecorder === 'undefined') return null;
    return PREFERRED_TYPES.find(type => MediaRecorder.isTypeSupported(type)) || null;
}

/**
 * Records a voice message.
 *
 * `stop()` resolves with the recording; `cancel()` throws it away. Both release the
 * microphone — without stopping every track the browser keeps its "recording" indicator
 * lit long after the user has finished, which reads as the app still listening.
 */
export default function useVoiceRecorder() {
    const [isRecording, setIsRecording] = useState(false);
    const [seconds, setSeconds] = useState(0);
    const [error, setError] = useState('');

    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const streamRef = useRef(null);
    const tickRef = useRef(null);
    const cancelledRef = useRef(false);

    const releaseMicrophone = useCallback(() => {
        streamRef.current?.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        clearInterval(tickRef.current);
        tickRef.current = null;
    }, []);

    // A component unmounted mid-recording — a chat closed, say — must not leave the
    // microphone open behind it.
    useEffect(() => releaseMicrophone, [releaseMicrophone]);

    const start = useCallback(async () => {
        setError('');
        if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            setError('Браузер не підтримує запис звуку');
            return false;
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mimeType = pickMimeType();
            const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

            chunksRef.current = [];
            cancelledRef.current = false;
            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) chunksRef.current.push(event.data);
            };

            recorderRef.current = recorder;
            streamRef.current = stream;
            recorder.start();

            setSeconds(0);
            setIsRecording(true);
            tickRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
            return true;
        } catch (e) {
            // Denied permission and absent hardware arrive as the same rejection, and the
            // user can act on neither without being told which.
            setError(e.name === 'NotAllowedError'
                ? 'Немає доступу до мікрофона'
                : 'Не вдалося почати запис');
            releaseMicrophone();
            return false;
        }
    }, [releaseMicrophone]);

    const stop = useCallback(() => new Promise((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === 'inactive') {
            resolve(null);
            return;
        }

        const recordedSeconds = seconds;
        recorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
            chunksRef.current = [];
            releaseMicrophone();
            setIsRecording(false);
            setSeconds(0);

            if (cancelledRef.current || blob.size === 0) {
                resolve(null);
                return;
            }
            // Rounded up: a recording the user hears as one second must not report zero.
            resolve({ blob, mimeType: recorder.mimeType, seconds: Math.max(1, recordedSeconds) });
        };
        recorder.stop();
    }), [seconds, releaseMicrophone]);

    const cancel = useCallback(() => {
        cancelledRef.current = true;
        return stop();
    }, [stop]);

    return { isRecording, seconds, error, start, stop, cancel, setError };
}
