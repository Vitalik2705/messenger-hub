from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
import base64
import json
import httpx
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()

app = FastAPI()

DISCORD_API = "https://discord.com/api/v10"


class SendMessageRequest(BaseModel):
    token: str
    channel_id: str
    text: str


class SendMediaRequest(BaseModel):
    token: str
    channel_id: str
    data_base64: str
    mime_type: str = "application/octet-stream"
    file_name: str = "file.bin"
    kind: str = "FILE"
    duration_seconds: int | None = None
    caption: str | None = None


def make_headers(token: str) -> dict:
    return {"Authorization": f"Bot {token}"}


def format_timestamp(ts: str) -> str:
    if not ts:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    except Exception:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + "Z"


@app.get("/validate")
async def validate_token(x_token: str = Header(...)):
    """Validate bot token and return bot user info."""
    async with httpx.AsyncClient() as client:
        r = await client.get(f"{DISCORD_API}/users/@me", headers=make_headers(x_token))
        if r.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Invalid token: {r.text}")
        data = r.json()
        return {
            "user_id": data["id"],
            "username": data.get("global_name") or data.get("username", "Bot"),
        }


@app.get("/chats")
async def get_chats(x_token: str = Header(...)):
    """Return all text channels across all guilds the bot is in."""
    headers = make_headers(x_token)
    result = []

    async with httpx.AsyncClient(timeout=30.0) as client:
        guilds_r = await client.get(f"{DISCORD_API}/users/@me/guilds", headers=headers)
        if guilds_r.status_code != 200:
            raise HTTPException(status_code=400, detail="Failed to get guilds")
        guilds = guilds_r.json()

        for guild in guilds:
            guild_id = guild["id"]
            guild_name = guild["name"]

            channels_r = await client.get(
                f"{DISCORD_API}/guilds/{guild_id}/channels", headers=headers
            )
            if channels_r.status_code != 200:
                continue
            channels = channels_r.json()

            for channel in channels:
                # Type 0 = GUILD_TEXT, Type 5 = GUILD_ANNOUNCEMENT
                if channel.get("type") not in [0, 5]:
                    continue

                channel_id = channel["id"]
                channel_name = channel.get("name", "")

                last_message = None
                last_message_at = None
                try:
                    msgs_r = await client.get(
                        f"{DISCORD_API}/channels/{channel_id}/messages?limit=1",
                        headers=headers
                    )
                    if msgs_r.status_code == 200 and msgs_r.json():
                        msg = msgs_r.json()[0]
                        last_message = msg.get("content", "") or None
                        last_message_at = format_timestamp(msg.get("timestamp", ""))
                except Exception as e:
                    print(f"Could not fetch last message for channel {channel_id}: {e}")

                result.append({
                    "id": channel_id,
                    "name": f"{guild_name} / #{channel_name}",
                    "type": "GROUP",
                    # 5 = GUILD_ANNOUNCEMENT: мовить в один бік, як канал Telegram.
                    # 0 = GUILD_TEXT: звичайна розмова.
                    "kind": "CHANNEL" if channel.get("type") == 5 else "GROUP",
                    "last_message": last_message,
                    "last_message_at": last_message_at,
                    "unread_count": 0,
                })

    return result


@app.get("/messages")
async def get_messages(channel_id: str, limit: int = 50, x_token: str = Header(...)):
    """Get messages from a Discord channel."""
    headers = make_headers(x_token)

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Get bot's own user ID to mark is_from_user
        me_r = await client.get(f"{DISCORD_API}/users/@me", headers=headers)
        my_id = me_r.json().get("id") if me_r.status_code == 200 else None

        msgs_r = await client.get(
            f"{DISCORD_API}/channels/{channel_id}/messages?limit={min(limit, 100)}",
            headers=headers
        )
        if msgs_r.status_code == 403:
            raise HTTPException(status_code=403, detail="Bot lacks permission to read this channel")
        if msgs_r.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Failed to fetch messages: {msgs_r.text}")

        messages = msgs_r.json()
        result = []
        for m in reversed(messages):
            content = m.get("content", "")
            if not content:
                continue
            author = m.get("author", {})
            sender_id = author.get("id", "")
            sender_name = author.get("global_name") or author.get("username", "")
            result.append({
                "id": m["id"],
                "text": content,
                "sender_id": sender_id,
                "sender_name": sender_name,
                "is_from_user": sender_id == my_id,
                "timestamp": format_timestamp(m.get("timestamp", "")),
            })

    return result


class DeleteMessageRequest(BaseModel):
    token: str
    channel_id: str
    message_id: str


@app.post("/delete")
async def delete_message(req: DeleteMessageRequest):
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.delete(
            f"{DISCORD_API}/channels/{req.channel_id}/messages/{req.message_id}",
            headers=make_headers(req.token),
        )
        # 204 — видалено, 404 — його вже немає, що для видалення той самий результат.
        if r.status_code not in (200, 204, 404):
            raise HTTPException(status_code=400, detail=r.text)
        return {"success": True}


@app.post("/send-media")
async def send_media(req: SendMediaRequest):
    """Надсилає вкладення в канал.

    Discord приймає будь-який файл і сам програє аудіо в стрічці, тож окремої
    обробки для голосових не потрібно — на відміну від Telegram, тут немає
    окремого типу «голосове», під який треба підлаштовуватись.
    """
    try:
        raw = base64.b64decode(req.data_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Не вдалося декодувати вкладення")
    if not raw:
        raise HTTPException(status_code=400, detail="Порожнє вкладення")

    # multipart, а не JSON: сам файл іде окремою частиною, а payload_json несе текст.
    headers = make_headers(req.token)
    headers.pop("Content-Type", None)  # httpx виставить свій boundary

    files = {"files[0]": (req.file_name, raw, req.mime_type)}
    data = {"payload_json": json.dumps({"content": req.caption or ""})}

    async with httpx.AsyncClient(timeout=60.0) as client:
        r = await client.post(
            f"{DISCORD_API}/channels/{req.channel_id}/messages",
            headers=headers, files=files, data=data,
        )
        if r.status_code not in [200, 201]:
            raise HTTPException(status_code=400, detail=r.text)
        payload = r.json()
        return {
            "message_id": payload["id"],
            "timestamp": format_timestamp(payload.get("timestamp", "")),
        }


@app.post("/send")
async def send_message(req: SendMessageRequest):
    """Send a message to a Discord channel."""
    headers = make_headers(req.token)
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{DISCORD_API}/channels/{req.channel_id}/messages",
            headers=headers,
            json={"content": req.text}
        )
        if r.status_code not in [200, 201]:
            raise HTTPException(status_code=400, detail=r.text)
        data = r.json()
        return {
            "message_id": data["id"],
            "timestamp": format_timestamp(data.get("timestamp", "")),
        }
