from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import User
from telethon.errors import SessionPasswordNeededError
import os
import base64
import asyncio
import io
import shutil
import subprocess
import tempfile
from dotenv import load_dotenv
from datetime import timezone, datetime

load_dotenv()

app = FastAPI()

_api_id = os.getenv("API_ID")
API_HASH = os.getenv("API_HASH")

# Без цих значень Telethon працювати не може. Перевіряємо одразу й зрозумілим текстом:
# int(None) на старті дав би TypeError, який у логах контейнера нічого не пояснює.
if not _api_id or not API_HASH:
    raise RuntimeError(
        "Не задано API_ID / API_HASH для Telegram. "
        "Візьміть їх на my.telegram.org → API development tools "
        "і додайте TELEGRAM_API_ID та TELEGRAM_API_HASH у .env"
    )

API_ID = int(_api_id)

# Тимчасові клієнти для процесу автентифікації
auth_clients: dict = {}

# Persistent клієнти для авторизованих користувачів (session_str -> client)
persistent_clients: dict = {}
persistent_locks: dict = {}


async def get_persistent_client(session_str: str) -> TelegramClient:
    """Повертає існуючий підключений клієнт або створює новий."""
    if session_str not in persistent_locks:
        persistent_locks[session_str] = asyncio.Lock()

    async with persistent_locks[session_str]:
        client = persistent_clients.get(session_str)

        if client and client.is_connected():
            return client

        # Створюємо новий клієнт і підключаємо
        client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
        await client.connect()

        # Прогріваємо кеш entities одразу
        try:
            await client.get_dialogs(limit=100)
        except Exception as e:
            print(f"Could not preload dialogs: {e}")

        persistent_clients[session_str] = client
        return client


class SendCodeRequest(BaseModel):
    phone: str

class SignInRequest(BaseModel):
    phone: str
    code: str
    phone_code_hash: str
    session: str | None = None

class SignInPasswordRequest(BaseModel):
    phone: str
    password: str
    session: str

class SendMessageRequest(BaseModel):
    session: str
    chat_id: int
    text: str
    reply_to_msg_id: int | None = None


class SendMediaRequest(BaseModel):
    session: str
    chat_id: int
    data_base64: str
    mime_type: str = "application/octet-stream"
    file_name: str = "file.bin"
    kind: str = "FILE"           # VOICE | IMAGE | VIDEO | AUDIO | FILE
    duration_seconds: int | None = None
    caption: str | None = None
    reply_to_msg_id: int | None = None


class DeleteMessageRequest(BaseModel):
    session: str
    chat_id: int
    message_id: int
    revoke: bool = True


def get_display_name(entity):
    if isinstance(entity, User):
        parts = [entity.first_name, entity.last_name]
        return " ".join(p for p in parts if p) or entity.username or "Unknown"
    return getattr(entity, 'title', None) or getattr(entity, 'username', None) or "Unknown"


# Офіційний акаунт сповіщень Telegram — формально це User, але не людина.
TELEGRAM_SERVICE_USER_ID = 777000


def get_chat_kind(entity):
    """Що це за співрозмовник: людина, бот, канал, група чи службовий акаунт.

    Telegram сам знає відповідь — прапорці `bot`, `broadcast` і `megagroup`
    приходять разом із сутністю. Раніше ми зводили це до PERSONAL/GROUP і
    втрачали різницю, через яку новинний канал, бот і жива людина виглядали
    в списку однаково, а зв'язування контактів пропонувало об'єднати
    службовий чат «Telegram» з таким самим чатом іншого акаунта.

    Це метадані, а не здогадка: класифікувати їх моделлю було б повільніше
    й менш точно за те, що API віддає безкоштовно.
    """
    if isinstance(entity, User):
        if entity.id == TELEGRAM_SERVICE_USER_ID or getattr(entity, 'support', False):
            return "SERVICE"
        if getattr(entity, 'bot', False):
            return "BOT"
        return "PERSON"

    # Канал мовить в один бік; супергрупа — розмова. Обидва Channel у Telethon.
    if getattr(entity, 'broadcast', False):
        return "CHANNEL"
    return "GROUP"


@app.post("/delete")
async def delete_message(req: DeleteMessageRequest):
    client = await get_persistent_client(req.session)
    try:
        await client.delete_messages(req.chat_id, [req.message_id], revoke=req.revoke)
        return {"success": True}
    except Exception as e:
        print(f"Delete error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/auth/send-code")
async def send_code(req: SendCodeRequest):
    if req.phone in auth_clients:
        try:
            await auth_clients[req.phone].disconnect()
        except:
            pass
    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()
    result = await client.send_code_request(req.phone)
    session_str = client.session.save()
    auth_clients[req.phone] = client
    return {"phone_code_hash": result.phone_code_hash, "session": session_str}


@app.post("/auth/sign-in")
async def sign_in(req: SignInRequest):
    client = auth_clients.get(req.phone)
    if client and client.is_connected():
        print(f"Reusing existing client for {req.phone}")
    else:
        print(f"Creating new client for {req.phone}")
        client = TelegramClient(StringSession(req.session), API_ID, API_HASH)
        await client.connect()

    try:
        await client.sign_in(phone=req.phone, code=req.code, phone_code_hash=req.phone_code_hash)
    except SessionPasswordNeededError:
        auth_clients[req.phone + "_2fa"] = client
        session_str = client.session.save()
        return {"requires_password": True, "session": session_str, "phone": req.phone}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    me = await client.get_me()
    session_str = client.session.save()
    auth_clients.pop(req.phone, None)
    await client.disconnect()
    return {"requires_password": False, "session": session_str, "user_id": me.id,
            "username": me.username, "first_name": me.first_name, "phone": me.phone}


@app.post("/auth/sign-in-password")
async def sign_in_password(req: SignInPasswordRequest):
    client = auth_clients.get(req.phone + "_2fa")
    if not client or not client.is_connected():
        client = TelegramClient(StringSession(req.session), API_ID, API_HASH)
        await client.connect()

    try:
        await client.sign_in(password=req.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    me = await client.get_me()
    session_str = client.session.save()
    auth_clients.pop(req.phone + "_2fa", None)
    await client.disconnect()
    return {"session": session_str, "user_id": me.id, "username": me.username,
            "first_name": me.first_name, "phone": me.phone}


@app.get("/chats")
async def get_chats(x_session: str = Header(...)):
    client = await get_persistent_client(x_session)
    try:
        dialogs = await client.get_dialogs(limit=50)
        result = []
        for d in dialogs:
            entity = d.entity
            last_message_at = None
            if d.message and d.message.date:
                last_message_at = d.message.date.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + "Z"
            result.append({
                "id": d.id,
                "name": get_display_name(entity),
                "type": "PERSONAL" if isinstance(entity, User) else "GROUP",
                "kind": get_chat_kind(entity),
                "unread_count": d.unread_count,
                "last_message": d.message.text if d.message and d.message.text else None,
                "last_message_at": last_message_at,
                "avatar_base64": None,
            })
        return result
    except Exception as e:
        # Якщо клієнт відвалився — видаляємо з кешу
        persistent_clients.pop(x_session, None)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/avatar")
async def get_avatar(chat_id: int, x_session: str = Header(...)):
    client = await get_persistent_client(x_session)
    try:
        entity = await client.get_entity(chat_id)
        photo_bytes = await client.download_profile_photo(entity, file=bytes)
        if photo_bytes:
            return {"avatar_base64": base64.b64encode(photo_bytes).decode('utf-8')}
        return {"avatar_base64": None}
    except Exception as e:
        print(f"Avatar error for {chat_id}: {e}")
        return {"avatar_base64": None}


@app.get("/messages")
async def get_messages(chat_id: int, limit: int = 50, offset: int = 0, x_session: str = Header(...)):
    client = await get_persistent_client(x_session)
    try:
        me = await client.get_me()

        read_outbox_max_id = 0
        try:
            from telethon.tl.functions.messages import GetPeerDialogsRequest
            from telethon.tl.types import InputDialogPeer

            peer = await client.get_input_entity(chat_id)
            result = await client(GetPeerDialogsRequest(peers=[InputDialogPeer(peer=peer)]))
            if result.dialogs:
                read_outbox_max_id = getattr(result.dialogs[0], 'read_outbox_max_id', 0)
        except Exception as e:
            print(f"Could not get read_outbox_max_id for {chat_id}: {e}")
            read_outbox_max_id = 0

        try:
            messages = await client.get_messages(chat_id, limit=limit, add_offset=offset)
        except ValueError as e:
            print(f"Could not get messages for {chat_id}: {e}")
            return []

        msg_map = {m.id: m for m in messages}

        missing_reply_ids = []
        for m in messages:
            if m.reply_to and hasattr(m.reply_to, 'reply_to_msg_id'):
                rid = m.reply_to.reply_to_msg_id
                if rid and rid not in msg_map:
                    missing_reply_ids.append(rid)

        if missing_reply_ids:
            try:
                fetched = await client.get_messages(chat_id, ids=missing_reply_ids)
                if fetched:
                    for fm in (fetched if isinstance(fetched, list) else [fetched]):
                        if fm:
                            msg_map[fm.id] = fm
            except:
                pass

        result = []
        for m in messages:
            if not m.text and not m.media:
                continue

            media_type = None
            if m.media:
                from telethon.tl.types import (
                    MessageMediaPhoto, MessageMediaDocument,
                    DocumentAttributeAudio, DocumentAttributeVideo,
                    DocumentAttributeSticker,
                )
                if isinstance(m.media, MessageMediaPhoto):
                    media_type = "photo"
                elif isinstance(m.media, MessageMediaDocument):
                    doc = m.media.document
                    media_type = "file"
                    for attr in doc.attributes:
                        if isinstance(attr, DocumentAttributeAudio):
                            media_type = "audio"
                        elif isinstance(attr, DocumentAttributeVideo):
                            media_type = "video"
                        elif isinstance(attr, DocumentAttributeSticker):
                            media_type = "sticker"

            is_read = None
            if m.sender_id == me.id:
                if read_outbox_max_id > 0:
                    is_read = m.id <= read_outbox_max_id
                else:
                    is_read = False

            reply_to_msg_id = None
            reply_to_text = None
            reply_to_sender_name = None
            if m.reply_to and hasattr(m.reply_to, 'reply_to_msg_id'):
                rid = m.reply_to.reply_to_msg_id
                if rid:
                    reply_to_msg_id = str(rid)
                    replied_msg = msg_map.get(rid)
                    if replied_msg:
                        reply_to_text = replied_msg.text or replied_msg.message or ""
                        if replied_msg.media and not reply_to_text:
                            reply_to_text = "📎 Media"
                        try:
                            sender = await replied_msg.get_sender()
                            if sender:
                                if hasattr(sender, 'first_name'):
                                    reply_to_sender_name = f"{sender.first_name or ''} {sender.last_name or ''}".strip()
                                elif hasattr(sender, 'title'):
                                    reply_to_sender_name = sender.title
                        except:
                            pass

            result.append({
                "id": m.id,
                "text": m.text or None,
                "sender_id": str(m.sender_id),
                "sender_name": None,
                "is_from_user": m.sender_id == me.id,
                "timestamp": m.date.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + "Z",
                "media_type": media_type,
                "media_base64": None,
                "media_mime": None,
                "file_name": None,
                "duration": None,
                "is_read": is_read,
                "reply_to_msg_id": reply_to_msg_id,
                "reply_to_text": reply_to_text,
                "reply_to_sender_name": reply_to_sender_name,
            })
        return list(reversed(result))
    except Exception as e:
        persistent_clients.pop(x_session, None)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/message-media")
async def get_message_media(chat_id: int, message_id: int, x_session: str = Header(...)):
    client = await get_persistent_client(x_session)
    try:
        messages = await client.get_messages(chat_id, ids=message_id)
        m = messages if not isinstance(messages, list) else messages[0]

        if not m or not m.media:
            return {"media_base64": None, "media_mime": None, "file_name": None, "duration": None}

        from telethon.tl.types import (
            MessageMediaPhoto, MessageMediaDocument,
            DocumentAttributeAudio, DocumentAttributeVideo,
            DocumentAttributeFilename,
        )

        if isinstance(m.media, MessageMediaPhoto):
            photo_bytes = await client.download_media(m.media, file=bytes)
            if photo_bytes:
                return {"media_base64": base64.b64encode(photo_bytes).decode('utf-8'),
                        "media_mime": "image/jpeg", "file_name": None, "duration": None}

        elif isinstance(m.media, MessageMediaDocument):
            doc = m.media.document
            mime = doc.mime_type or "application/octet-stream"
            file_name = None
            duration = None
            for attr in doc.attributes:
                if isinstance(attr, (DocumentAttributeAudio, DocumentAttributeVideo)):
                    duration = attr.duration
                elif isinstance(attr, DocumentAttributeFilename):
                    file_name = attr.file_name

            if doc.size < 5 * 1024 * 1024:
                media_bytes = await client.download_media(m.media, file=bytes)
                if media_bytes:
                    return {"media_base64": base64.b64encode(media_bytes).decode('utf-8'),
                            "media_mime": mime, "file_name": file_name, "duration": duration}
            else:
                return {"media_base64": None, "media_mime": mime,
                        "file_name": file_name or "file", "duration": duration}

        return {"media_base64": None, "media_mime": None, "file_name": None, "duration": None}
    except Exception as e:
        print(f"Media error for message {message_id}: {e}")
        return {"media_base64": None, "media_mime": None, "file_name": None, "duration": None}


@app.post("/send")
async def send_message(req: SendMessageRequest):
    client = await get_persistent_client(req.session)
    try:
        msg = await client.send_message(
            req.chat_id,
            req.text,
            reply_to=req.reply_to_msg_id
        )
        return {"message_id": msg.id, "timestamp": msg.date.isoformat()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _to_ogg_opus(raw: bytes, mime_type: str) -> tuple[bytes, bool]:
    """Перепаковує запис у OGG/Opus — контейнер, який Telegram приймає як голосове.

    Браузери пишуть по-різному: Chrome віддає audio/webm з кодеком Opus, Firefox —
    вже готовий audio/ogg. Тобто в більшості випадків потрібна лише зміна контейнера,
    без перекодування, тому спершу пробуємо -c:a copy: це швидко й без втрати якості.
    Перекодування в libopus — запасний шлях для Safari, який пише AAC у mp4.

    Повертає (байти, чи це справді OGG/Opus). Якщо ffmpeg недоступний, повертає
    оригінал з False: краще надіслати звичайним аудіофайлом, ніж не надіслати нічого.
    """
    if "ogg" in mime_type or "opus" in mime_type:
        return raw, True

    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("[Telegram] ffmpeg не знайдено — голосове піде як аудіофайл")
        return raw, False

    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "input")
        dst = os.path.join(tmp, "output.ogg")
        with open(src, "wb") as f:
            f.write(raw)

        for codec_args in (["-c:a", "copy"], ["-c:a", "libopus", "-b:a", "48k"]):
            result = subprocess.run(
                [ffmpeg, "-y", "-i", src, *codec_args, "-f", "ogg", dst],
                capture_output=True,
            )
            if result.returncode == 0 and os.path.exists(dst) and os.path.getsize(dst) > 0:
                with open(dst, "rb") as f:
                    return f.read(), True
            if os.path.exists(dst):
                os.remove(dst)

        print("[Telegram] ffmpeg не зміг перепакувати запис — надсилаю як аудіофайл")
        return raw, False


@app.post("/send-media")
async def send_media(req: SendMediaRequest):
    """Надсилає вкладення: фото, файл або голосове."""
    from telethon.tl.types import DocumentAttributeAudio

    client = await get_persistent_client(req.session)

    try:
        raw = base64.b64decode(req.data_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Не вдалося декодувати вкладення")
    if not raw:
        raise HTTPException(status_code=400, detail="Порожнє вкладення")

    file_name = req.file_name
    attributes = None
    voice_note = False

    if req.kind == "VOICE":
        # У потоці, бо ffmpeg блокує, а клієнт Telethon живе в тому самому event loop.
        raw, is_ogg = await asyncio.to_thread(_to_ogg_opus, raw, req.mime_type)
        if is_ogg:
            file_name = "voice.ogg"
            voice_note = True
            attributes = [DocumentAttributeAudio(
                duration=req.duration_seconds or 0, voice=True)]

    upload = io.BytesIO(raw)
    upload.name = file_name

    try:
        msg = await client.send_file(
            req.chat_id,
            upload,
            caption=req.caption,
            reply_to=req.reply_to_msg_id,
            voice_note=voice_note,
            attributes=attributes,
            # Інакше Telegram стисне надісланий PNG як фото й зіпсує те,
            # що користувач свідомо надіслав файлом.
            force_document=(req.kind == "FILE"),
        )
        return {
            "message_id": msg.id,
            "timestamp": msg.date.isoformat(),
            "voice_note": voice_note,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/mark-read")
async def mark_read(chat_id: int, x_session: str = Header(...)):
    client = await get_persistent_client(x_session)
    try:
        await client.send_read_acknowledge(chat_id)
        return {"success": True}
    except Exception as e:
        print(f"Mark read error: {e}")
        return {"success": False}


@app.get("/user-status")
async def get_user_status(chat_id: int, x_session: str = Header(...)):
    client = await get_persistent_client(x_session)
    try:
        entity = await client.get_entity(chat_id)

        if not isinstance(entity, User):
            return {"status": "group"}

        status = entity.status
        if status is None:
            return {"status": "unknown"}

        from telethon.tl.types import (
            UserStatusOnline, UserStatusOffline,
            UserStatusRecently, UserStatusLastWeek, UserStatusLastMonth
        )

        if isinstance(status, UserStatusOnline):
            return {"status": "online"}
        elif isinstance(status, UserStatusOffline):
            last_seen = status.was_online
            now = datetime.now(timezone.utc)
            diff = now - last_seen.replace(tzinfo=timezone.utc)
            minutes = int(diff.total_seconds() / 60)
            hours = int(minutes / 60)
            days = int(hours / 24)
            if minutes < 1:
                text = "last seen just now"
            elif minutes < 60:
                text = f"last seen {minutes}m ago"
            elif hours < 24:
                text = f"last seen {hours}h ago"
            elif days == 1:
                text = "last seen yesterday"
            else:
                text = f"last seen {last_seen.strftime('%d %b')}"
            return {"status": "offline", "last_seen": text}
        elif isinstance(status, UserStatusRecently):
            return {"status": "offline", "last_seen": "last seen recently"}
        elif isinstance(status, UserStatusLastWeek):
            return {"status": "offline", "last_seen": "last seen last week"}
        elif isinstance(status, UserStatusLastMonth):
            return {"status": "offline", "last_seen": "last seen last month"}
        else:
            return {"status": "unknown"}
    except Exception as e:
        print(f"User status error for {chat_id}: {e}")
        return {"status": "unknown"}


@app.on_event("shutdown")
async def shutdown():
    """Закриваємо всі persistent клієнти при зупинці сервера."""
    for client in persistent_clients.values():
        try:
            await client.disconnect()
        except:
            pass