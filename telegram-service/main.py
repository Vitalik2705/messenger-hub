from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from telethon import TelegramClient
from telethon.sessions import StringSession
from telethon.tl.types import User
from telethon.errors import SessionPasswordNeededError
from telethon import functions, types, events
import time
import os
import base64
import uuid

import qrcode
import qrcode.image.svg
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

# Telethon cannot run without these. Checked up front with a readable message:
# int(None) would otherwise fail with a TypeError that explains nothing in the logs.
if not _api_id or not API_HASH:
    raise RuntimeError(
        "Не задано API_ID / API_HASH для Telegram. "
        "Візьміть їх на my.telegram.org → API development tools "
        "і додайте TELEGRAM_API_ID та TELEGRAM_API_HASH у .env"
    )

API_ID = int(_api_id)

# Short-lived clients for the sign-in flow
auth_clients: dict = {}

# Long-lived clients for signed-in accounts (session_str -> client)
persistent_clients: dict = {}
persistent_locks: dict = {}


typing_seen: dict = {}
TYPING_WINDOW = 6  # seconds a typing event stays true


async def get_persistent_client(session_str: str) -> TelegramClient:
    """Returns the connected client for this session, creating one if needed."""
    if session_str not in persistent_locks:
        persistent_locks[session_str] = asyncio.Lock()

    async with persistent_locks[session_str]:
        client = persistent_clients.get(session_str)

        if client and client.is_connected():
            return client

        # New client, connected
        client = TelegramClient(StringSession(session_str), API_ID, API_HASH)
        await client.connect()

        # Warm the entity cache right away
        try:
            await client.get_dialogs(limit=100)
        except Exception as e:
            print(f"Could not preload dialogs: {e}")

        # "Typing…" is pushed by Telegram, never asked for: remember when each chat was
        # last seen typing, so the client can poll this service cheaply.
        @client.on(events.UserUpdate)
        async def _remember_typing(event, _session=session_str):
            try:
                if event.typing:
                    typing_seen[(_session, event.chat_id)] = time.time()
            except Exception:
                pass

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


class ReactRequest(BaseModel):
    session: str
    chat_id: int
    message_id: int
    emoji: str | None = None   # None or "" removes the reaction


class EditRequest(BaseModel):
    session: str
    chat_id: int
    message_id: int
    text: str


class TypingRequest(BaseModel):
    session: str
    chat_id: int


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


# Telegram's own notifications account is a User, but not a person.
TELEGRAM_SERVICE_USER_ID = 777000


def get_chat_kind(entity):
    """What is on the other side: person, bot, channel, group or service account.

    Taken from the entity's own `bot`, `broadcast` and `megagroup` flags — metadata,
    not a guess.
    """
    if isinstance(entity, User):
        if entity.id == TELEGRAM_SERVICE_USER_ID or getattr(entity, 'support', False):
            return "SERVICE"
        if getattr(entity, 'bot', False):
            return "BOT"
        return "PERSON"

    # A channel broadcasts; a supergroup is a conversation. Both are Channel in Telethon.
    if getattr(entity, 'broadcast', False):
        return "CHANNEL"
    return "GROUP"


def _reactions(m) -> list:
    """Emoji reactions with counts; `mine` marks the ones this account placed."""
    out = []
    results = getattr(getattr(m, "reactions", None), "results", None) or []
    for rc in results:
        emoji = getattr(rc.reaction, "emoticon", None)
        if emoji:
            out.append({"emoji": emoji, "count": rc.count, "mine": rc.chosen_order is not None})
    return out


@app.post("/react")
async def react(req: ReactRequest):
    client = await get_persistent_client(req.session)
    try:
        reaction = [types.ReactionEmoji(emoticon=req.emoji)] if req.emoji else []
        await client(functions.messages.SendReactionRequest(
            peer=req.chat_id, msg_id=req.message_id, reaction=reaction))
        message = await client.get_messages(req.chat_id, ids=req.message_id)
        return {"success": True, "reactions": _reactions(message) if message else []}
    except Exception as e:
        print(f"React error: {e}")
        raise HTTPException(status_code=400, detail="Telegram не прийняв реакцію в цьому чаті")


@app.post("/edit")
async def edit_message(req: EditRequest):
    client = await get_persistent_client(req.session)
    try:
        await client.edit_message(req.chat_id, req.message_id, req.text)
        return {"success": True}
    except Exception as e:
        print(f"Edit error: {e}")
        raise HTTPException(status_code=400, detail="Telegram не дозволив змінити повідомлення")


@app.get("/typing")
async def is_typing(chat_id: int, x_session: str = Header(...)):
    await get_persistent_client(x_session)  # make sure updates are being received
    seen = typing_seen.get((x_session, chat_id), 0)
    return {"typing": time.time() - seen < TYPING_WINDOW}


@app.post("/typing")
async def send_typing(req: TypingRequest):
    client = await get_persistent_client(req.session)
    try:
        await client(functions.messages.SetTypingRequest(peer=req.chat_id, action=types.SendMessageTypingAction()))
    except Exception as e:
        print(f"Typing error: {e}")
    return {"success": True}


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
    print(f"Code for {req.phone[:4]}***: {describe_delivery(result)}", flush=True)
    return {"phone_code_hash": result.phone_code_hash, "session": session_str,
            **describe_delivery(result)}


class ResendCodeRequest(BaseModel):
    phone: str
    phone_code_hash: str


@app.post("/auth/resend-code")
async def resend_code(req: ResendCodeRequest):
    """Asks Telegram for the code again, by the next channel it offers (usually SMS)."""
    client = auth_clients.get(req.phone)
    if not client or not client.is_connected():
        raise HTTPException(status_code=400, detail="Сесія входу застаріла — почніть спочатку")
    try:
        result = await client(functions.auth.ResendCodeRequest(req.phone, req.phone_code_hash))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    print(f"Code resent for {req.phone[:4]}***: {describe_delivery(result)}", flush=True)
    return {"phone_code_hash": result.phone_code_hash, **describe_delivery(result)}


# Where Telegram actually sent the login code. It is rarely an SMS: an account logged in
# anywhere else gets it in the official "Telegram" chat there, and many accounts now get
# it by email. Without this the dialog could only guess, and a guess that says "check the
# app" while the code sits in a mailbox looks exactly like the code never arriving.
_DELIVERY_BY_TYPE = {
    "SentCodeTypeApp": "app",
    "SentCodeTypeSms": "sms",
    "SentCodeTypeSmsWord": "sms",
    "SentCodeTypeSmsPhrase": "sms",
    "SentCodeTypeFirebaseSms": "sms",
    "SentCodeTypeCall": "call",
    "SentCodeTypeFlashCall": "call",
    "SentCodeTypeMissedCall": "call",
    "SentCodeTypeEmailCode": "email",
    "SentCodeTypeSetUpEmailRequired": "email_setup",
    "SentCodeTypeFragmentSms": "fragment",
}
_NEXT_BY_TYPE = {
    "CodeTypeSms": "sms",
    "CodeTypeCall": "call",
    "CodeTypeFlashCall": "call",
    "CodeTypeMissedCall": "call",
    "CodeTypeFragmentSms": "fragment",
}


def describe_delivery(sent) -> dict:
    sent_type = getattr(sent, "type", None)
    next_type = getattr(sent, "next_type", None)
    return {
        "delivery": _DELIVERY_BY_TYPE.get(type(sent_type).__name__, "unknown"),
        # e.g. "v***@g***.com" — enough for the user to know which mailbox to open.
        "delivery_hint": getattr(sent_type, "email_pattern", None),
        "next_delivery": _NEXT_BY_TYPE.get(type(next_type).__name__) if next_type else None,
    }


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


# ── QR login ─────────────────────────────────────────────────────────────────
#
# The phone scans a code (Settings → Devices → Link Desktop Device) and no login code is
# sent at all. That matters more than it sounds: after a run of logins through a third-party
# client Telegram can answer "code sent" and then never deliver it, and every retry extends
# the lockout. A QR login sidesteps the code channel entirely.

QR_LOGIN_LIFETIME_SECONDS = 300

qr_logins: dict = {}


def _qr_svg(url: str) -> str:
    """The tg://login URL as an SVG data URL — rendered here so the frontend needs no library."""
    buffer = io.BytesIO()
    qrcode.make(url, image_factory=qrcode.image.svg.SvgPathImage, box_size=12, border=2).save(buffer)
    return "data:image/svg+xml;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


async def _qr_wait_loop(state: dict):
    """Keeps the code fresh until it is scanned: each token lives about thirty seconds."""
    deadline = asyncio.get_running_loop().time() + QR_LOGIN_LIFETIME_SECONDS
    qr = state["qr"]
    while True:
        try:
            await qr.wait()
            state["status"] = "authorized"
            return
        except asyncio.TimeoutError:
            if asyncio.get_running_loop().time() > deadline:
                state["status"] = "expired"
                return
            await qr.recreate()
            state["qr_image"] = _qr_svg(qr.url)
        except SessionPasswordNeededError:
            state["status"] = "password_required"
            return
        except Exception as e:
            state["status"] = "failed"
            state["error"] = str(e)
            return


async def _qr_finish(login_id: str, state: dict) -> dict:
    client = state["client"]
    me = await client.get_me()
    session_str = client.session.save()
    qr_logins.pop(login_id, None)
    await client.disconnect()
    return {"status": "authorized", "session": session_str, "user_id": me.id,
            "username": me.username, "first_name": me.first_name, "phone": me.phone}


@app.post("/auth/qr-start")
async def qr_start():
    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()
    qr = await client.qr_login()
    login_id = uuid.uuid4().hex
    state = {"client": client, "qr": qr, "status": "pending", "qr_image": _qr_svg(qr.url)}
    state["task"] = asyncio.create_task(_qr_wait_loop(state))
    qr_logins[login_id] = state
    return {"login_id": login_id, "status": "pending", "qr_image": state["qr_image"]}


@app.get("/auth/qr-status")
async def qr_status(login_id: str):
    state = qr_logins.get(login_id)
    if not state:
        raise HTTPException(status_code=404, detail="Сесія входу застаріла — почніть спочатку")
    status = state["status"]
    if status == "authorized":
        return await _qr_finish(login_id, state)
    if status in ("expired", "failed"):
        qr_logins.pop(login_id, None)
        await state["client"].disconnect()
        return {"status": status, "error": state.get("error")}
    if status == "password_required":
        return {"status": status}
    return {"status": "pending", "qr_image": state["qr_image"]}


class QrPasswordRequest(BaseModel):
    login_id: str
    password: str


@app.post("/auth/qr-password")
async def qr_password(req: QrPasswordRequest):
    state = qr_logins.get(req.login_id)
    if not state or state["status"] != "password_required":
        raise HTTPException(status_code=400, detail="Сесія входу застаріла — почніть спочатку")
    try:
        await state["client"].sign_in(password=req.password)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    return await _qr_finish(req.login_id, state)


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
        # A client that dropped is removed from the cache
        persistent_clients.pop(x_session, None)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/avatar")
async def get_avatar(chat_id: int, x_session: str = Header(...)):
    client = await get_persistent_client(x_session)
    try:
        entity = await client.get_entity(chat_id)
        # The small (160 px) version: the list draws avatars at 40 px, and the full photo
        # averaged 93 KB — 4 MB of base64 in the first chat-list response for 50 chats.
        photo_bytes = await client.download_profile_photo(entity, file=bytes, download_big=False)
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
            # Known before the bytes arrive, so the client can reserve the right box and
            # the conversation does not jump as each picture loads.
            media_width = media_height = file_size = file_name = duration = None
            link_preview = None
            if m.media:
                from telethon.tl.types import (
                    MessageMediaPhoto, MessageMediaDocument,
                    DocumentAttributeAudio, DocumentAttributeVideo,
                    DocumentAttributeSticker, DocumentAttributeImageSize,
                    DocumentAttributeFilename, MessageMediaWebPage, WebPage,
                )
                if isinstance(m.media, MessageMediaWebPage) and isinstance(m.media.webpage, WebPage):
                    # The preview Telegram built for a link: title and picture come from
                    # Telegram, so showing it sends nothing to the linked site.
                    wp = m.media.webpage
                    link_preview = {
                        "url": wp.url, "site": wp.site_name, "title": wp.title,
                        "description": (wp.description or "")[:300] or None,
                    }
                    if wp.photo:
                        media_type = "webpage"
                        sizes = [s for s in (getattr(wp.photo, "sizes", None) or []) if getattr(s, "w", None)]
                        if sizes:
                            media_width, media_height = sizes[-1].w, sizes[-1].h
                elif isinstance(m.media, MessageMediaPhoto):
                    media_type = "photo"
                    sizes = [s for s in (getattr(m.media.photo, "sizes", None) or []) if getattr(s, "w", None)]
                    if sizes:
                        media_width, media_height = sizes[-1].w, sizes[-1].h
                elif isinstance(m.media, MessageMediaDocument) and m.media.document:
                    doc = m.media.document
                    media_type = "file"
                    file_size = getattr(doc, "size", None)
                    for attr in doc.attributes:
                        if isinstance(attr, DocumentAttributeAudio):
                            media_type = "audio"
                            duration = int(attr.duration or 0)
                        elif isinstance(attr, DocumentAttributeVideo):
                            media_type = "video"
                            media_width, media_height = attr.w, attr.h
                            duration = int(attr.duration or 0)
                        elif isinstance(attr, DocumentAttributeSticker):
                            media_type = "sticker"
                        elif isinstance(attr, DocumentAttributeImageSize):
                            media_width, media_height = attr.w, attr.h
                        elif isinstance(attr, DocumentAttributeFilename):
                            file_name = attr.file_name

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
                "file_name": file_name,
                "duration": duration,
                "media_width": media_width,
                "media_height": media_height,
                "file_size": file_size,
                "link_preview": link_preview,
                "reactions": _reactions(m),
                "edited": bool(m.edit_date) and not getattr(m, "edit_hide", False),
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

        from telethon.tl.types import MessageMediaWebPage, WebPage
        if isinstance(m.media, MessageMediaWebPage) and isinstance(m.media.webpage, WebPage) and m.media.webpage.photo:
            photo_bytes = await client.download_media(m.media.webpage.photo, file=bytes)
            if photo_bytes:
                return {"media_base64": base64.b64encode(photo_bytes).decode('utf-8'),
                        "media_mime": "image/jpeg", "file_name": None, "duration": None}

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
    """Repackages a recording as OGG/Opus, the container Telegram accepts as a voice note.

    Chrome records Opus in WebM and Firefox records OGG already, so a container swap
    (-c:a copy) is tried first; re-encoding with libopus is the fallback for Safari's AAC.

    Returns (bytes, whether it really is OGG/Opus). Without ffmpeg the original is
    returned with False and sent as an ordinary audio file.
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
    """Sends an attachment: a photo, a file or a voice note."""
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
        # In a thread: ffmpeg blocks, and the Telethon client shares this event loop.
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
            # Otherwise Telegram recompresses a PNG as a photo, spoiling what the
            # user deliberately sent as a file.
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


def _presence(entity) -> dict:
    """Online / last seen for a user, worded the way the interface shows it."""
    from telethon.tl.types import (
        UserStatusOnline, UserStatusOffline,
        UserStatusRecently, UserStatusLastWeek, UserStatusLastMonth,
    )
    status = getattr(entity, "status", None)
    if status is None:
        return {"status": "unknown"}
    if isinstance(status, UserStatusOnline):
        return {"status": "online"}
    if isinstance(status, UserStatusOffline):
        last_seen = status.was_online
        minutes = int((datetime.now(timezone.utc) - last_seen.replace(tzinfo=timezone.utc)).total_seconds() / 60)
        hours, days = minutes // 60, minutes // 1440
        if minutes < 1:
            text = "був(ла) щойно"
        elif minutes < 60:
            text = f"був(ла) {minutes} хв тому"
        elif hours < 24:
            text = f"був(ла) {hours} год тому"
        elif days == 1:
            text = "був(ла) вчора"
        else:
            text = "був(ла) " + last_seen.astimezone().strftime("%d.%m")
        return {"status": "offline", "last_seen": text}
    if isinstance(status, UserStatusRecently):
        return {"status": "offline", "last_seen": "був(ла) нещодавно"}
    if isinstance(status, UserStatusLastWeek):
        return {"status": "offline", "last_seen": "був(ла) цього тижня"}
    if isinstance(status, UserStatusLastMonth):
        return {"status": "offline", "last_seen": "був(ла) цього місяця"}
    return {"status": "unknown"}


@app.get("/user-status")
async def get_user_status(chat_id: int, x_session: str = Header(...)):
    client = await get_persistent_client(x_session)
    try:
        entity = await client.get_entity(chat_id)
        if not isinstance(entity, User):
            return {"status": "group"}
        return _presence(entity)
    except Exception as e:
        print(f"User status error for {chat_id}: {e}")
        return {"status": "unknown"}


@app.get("/profile")
async def get_profile(chat_id: int, x_session: str = Header(...)):
    """
    Who is on the other side of a chat: the profile Telegram itself would show.

    Read on demand when the profile panel opens, never during sync. The full-user request
    is rate-limited by Telegram, and a list of fifty chats would spend it for nothing.
    """
    from telethon.tl.types import Channel, Chat
    client = await get_persistent_client(x_session)
    try:
        entity = await client.get_entity(chat_id)
        username = getattr(entity, "username", None)
        if not username and getattr(entity, "usernames", None):
            username = entity.usernames[0].username

        profile = {"id": str(chat_id), "username": username, "phone": None, "bio": None,
                   "members": None, "common_chats": None,
                   "verified": bool(getattr(entity, "verified", False)),
                   "presence": None, "link": None}

        if isinstance(entity, User):
            full = (await client(functions.users.GetFullUserRequest(entity))).full_user
            profile.update(
                kind="BOT" if entity.bot else "PERSON",
                name=f"{entity.first_name or ''} {entity.last_name or ''}".strip() or username or str(chat_id),
                phone=f"+{entity.phone}" if entity.phone else None,
                bio=full.about,
                common_chats=full.common_chats_count,
                presence=_presence(entity),
                # tg:// opens the installed Telegram even when there is no public username.
                link=f"https://t.me/{username}" if username else f"tg://user?id={entity.id}",
            )
        elif isinstance(entity, Channel):
            full = (await client(functions.channels.GetFullChannelRequest(entity))).full_chat
            profile.update(
                kind="GROUP" if entity.megagroup else "CHANNEL",
                name=entity.title,
                bio=full.about,
                members=full.participants_count,
                link=f"https://t.me/{username}" if username else None,
            )
        elif isinstance(entity, Chat):
            full = (await client(functions.messages.GetFullChatRequest(entity.id))).full_chat
            participants = getattr(getattr(full, "participants", None), "participants", None)
            profile.update(
                kind="GROUP",
                name=entity.title,
                bio=full.about,
                members=len(participants) if participants is not None else entity.participants_count,
            )

        try:
            photo = await client.download_profile_photo(entity, file=bytes, download_big=True)
            profile["photo_base64"] = base64.b64encode(photo).decode("utf-8") if photo else None
        except Exception:
            profile["photo_base64"] = None
        return profile
    except Exception as e:
        print(f"Profile error for {chat_id}: {e}")
        raise HTTPException(status_code=404, detail="Не вдалося отримати профіль")


@app.on_event("shutdown")
async def shutdown():
    """Disconnects every long-lived client when the server stops."""
    for client in persistent_clients.values():
        try:
            await client.disconnect()
        except:
            pass