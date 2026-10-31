"""
Turns voice messages into text, on this machine.

Voice notes are the one part of the archive nothing else can reach. They are invisible to
search, absent from every metric, and a blank in the context a model is shown — a chat that
is half voice is a chat the rest of this application cannot see. Transcribing them makes
them ordinary text everywhere downstream.

Local for the same reason as every other model here: this is private correspondence, and
the people who recorded it never agreed to have their voices uploaded anywhere.
"""

import base64
import os
import tempfile
import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Whisper Service")

# ── Model ────────────────────────────────────────────────────────────────────

# `small` is the smallest size that handles Ukrainian acceptably; `base` mishears names
# and numbers often enough to be worse than nothing. int8 quantisation roughly halves the
# time on a CPU for a barely measurable loss.
MODEL_SIZE = os.getenv("WHISPER_MODEL", "small")
COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE", "int8")
DEFAULT_LANGUAGE = os.getenv("WHISPER_LANGUAGE", "uk")

_model = None


def get_model():
    """
    Loads the model on first use, not at import.

    Startup would otherwise block for the length of a download the first time, and the
    service would look hung rather than busy. It also means the process costs nothing until
    a voice message actually arrives.
    """
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        print(f"Loading Whisper model '{MODEL_SIZE}' ({COMPUTE_TYPE})…", flush=True)
        started = time.time()
        _model = WhisperModel(MODEL_SIZE, device="cpu", compute_type=COMPUTE_TYPE)
        print(f"Model ready in {time.time() - started:.1f}s", flush=True)
    return _model


# ── API ──────────────────────────────────────────────────────────────────────

class TranscribeRequest(BaseModel):
    audio_base64: str
    mime: str | None = None
    file_name: str | None = None
    # Forcing the language beats detection on short clips: a three-second "ага" is
    # detected as half a dozen different languages depending on the noise.
    language: str | None = None


class TranscribeResponse(BaseModel):
    text: str
    language: str
    duration: float
    took_seconds: float
    segments: int


@app.get("/health")
async def health():
    """Reports readiness without loading the model — the loading itself is the slow part."""
    return {
        "status": "ok",
        "model": MODEL_SIZE,
        "compute": COMPUTE_TYPE,
        "loaded": _model is not None,
    }


@app.post("/transcribe", response_model=TranscribeResponse)
async def transcribe(request: TranscribeRequest):
    try:
        audio = base64.b64decode(request.audio_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="audio_base64 is not valid base64")

    if not audio:
        raise HTTPException(status_code=400, detail="empty audio")

    suffix = _suffix_for(request.mime, request.file_name)
    started = time.time()

    # Written to disk rather than streamed: ffmpeg reads the container to find the codec,
    # and Telegram voice notes are OGG/Opus, which cannot be decoded from a bare buffer.
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as handle:
        handle.write(audio)
        path = handle.name

    try:
        segments, info = get_model().transcribe(
            path,
            language=request.language or DEFAULT_LANGUAGE,
            # Voice notes are short and often noisy; VAD removes the silence that
            # otherwise makes the model hallucinate filler at the end.
            vad_filter=True,
            beam_size=5,
        )
        parts = [segment.text.strip() for segment in segments]
        text = " ".join(part for part in parts if part)

        return TranscribeResponse(
            text=text,
            language=info.language,
            duration=round(info.duration, 2),
            took_seconds=round(time.time() - started, 2),
            segments=len(parts),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"transcription failed: {e}")
    finally:
        try:
            os.unlink(path)
        except OSError:
            pass


def _suffix_for(mime: Optional[str], file_name: Optional[str]) -> str:
    if file_name and "." in file_name:
        return file_name[file_name.rindex("."):]
    if not mime:
        return ".ogg"
    known = {
        "audio/ogg": ".ogg",
        "audio/opus": ".ogg",
        "audio/mpeg": ".mp3",
        "audio/mp4": ".m4a",
        "audio/x-m4a": ".m4a",
        "audio/wav": ".wav",
        "audio/x-wav": ".wav",
        "audio/webm": ".webm",
    }
    return known.get(mime.split(";")[0].strip().lower(), ".ogg")
