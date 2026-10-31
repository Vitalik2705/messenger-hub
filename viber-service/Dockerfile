FROM python:3.12-slim
WORKDIR /service

ENV PYTHONUNBUFFERED=1     PYTHONDONTWRITEBYTECODE=1

# Requirements before source: dependency installation is the slow layer and must not
# be redone every time main.py changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY main.py ./

RUN useradd --create-home --shell /usr/sbin/nologin service
USER service

EXPOSE 8205

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8205"]
