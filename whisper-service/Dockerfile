FROM python:3.12-slim
WORKDIR /service

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# No system ffmpeg: faster-whisper decodes through PyAV, whose wheel bundles the codecs,
# OGG/Opus voice notes included.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

RUN useradd --create-home --shell /usr/sbin/nologin service \
    && mkdir -p /home/service/.cache/huggingface \
    && chown -R service:service /home/service/.cache
USER service

EXPOSE 8206

# The model (~500 MB for `small`) downloads on the first transcription into the Hugging
# Face cache. Compose mounts a volume there, so it is fetched once, not on every rebuild.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8206"]
