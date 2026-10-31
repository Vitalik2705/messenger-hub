FROM python:3.12-slim
WORKDIR /service

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Голосові з браузера приходять у webm, а Telegram показує їх голосовими лише в
# OGG/Opus. ffmpeg перепаковує контейнер. Без нього сервіс працює, але запис
# долітає звичайним аудіофайлом.
RUN apt-get update && apt-get install --no-install-recommends -y ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Requirements before source: dependency installation is the slow layer and must not
# be redone every time main.py changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

RUN useradd --create-home --shell /usr/sbin/nologin service
USER service

EXPOSE 8201

# Telethon keeps its sessions as strings held by the backend, so this container owns
# no state and can be restarted freely.
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8201"]
