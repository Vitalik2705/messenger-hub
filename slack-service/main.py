from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
import base64
import os
import time
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()

app = FastAPI()


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


def format_timestamp(ts: str) -> str:
    if not ts:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    dt = datetime.fromtimestamp(float(ts), tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"


# User Token Scopes the app needs: reading chats and history, names, sending, files.
REQUIRED_SCOPES = [
    "channels:read", "channels:history", "groups:read", "groups:history",
    "im:read", "im:history", "users:read", "chat:write", "files:write",
]


def missing_scopes_message(missing) -> str:
    return ("У токена Slack бракує прав: " + ", ".join(missing) +
            ". Додайте їх у OAuth & Permissions → User Token Scopes, "
            "натисніть Reinstall to Workspace і підключіть Slack ще раз.")


@app.get("/validate")
def validate_token(x_token: str = Header(...)):
    """Validate token and get user info"""
    client = WebClient(token=x_token)
    try:
        response = client.auth_test()
        # A token without read scopes connects fine and then shows no chats at all, with
        # the reason only in this service's log. Refusing it here says what to fix.
        granted = {x.strip() for x in (response.headers.get("x-oauth-scopes") or "").split(",") if x.strip()}
        missing = [scope for scope in REQUIRED_SCOPES if scope not in granted]
        if granted and missing:
            raise HTTPException(status_code=400, detail=missing_scopes_message(missing))
        return {
            "user_id": response["user_id"],
            "username": response["user"],
            "team": response["team"],
            "team_id": response["team_id"]
        }
    except SlackApiError as e:
        raise HTTPException(status_code=400, detail=str(e))


# Who is behind a user id barely ever changes, and asking costs one Slack call per DM on
# every poll of the chat list. Cached per token for an hour.
_user_cache: dict[tuple[str, str], tuple[float, str, bool]] = {}
_USER_TTL = 3600


def _user_info(client: WebClient, token: str, user_id: str) -> tuple[str, bool]:
    key = (token, user_id)
    hit = _user_cache.get(key)
    if hit and time.time() - hit[0] < _USER_TTL:
        return hit[1], hit[2]
    try:
        user = client.users_info(user=user_id)["user"]
        name = user.get("real_name") or user.get("name") or user_id
        is_bot = bool(user.get("is_bot"))
    except Exception as e:
        print(f"Error getting user info: {e}")
        return user_id, False  # not cached: the next poll tries again
    _user_cache[key] = (time.time(), name, is_bot)
    return name, is_bot


def _last_message(client: WebClient, channel_id: str):
    try:
        history = client.conversations_history(channel=channel_id, limit=1)
        if history["messages"]:
            last = history["messages"][0]
            return last.get("text", ""), format_timestamp(last.get("ts"))
    except Exception as e:
        print(f"Error getting history for {channel_id}: {e}")
    return None, None


# A plain def: slack_sdk is blocking, and FastAPI runs plain handlers in a worker thread
# instead of on the event loop that every other request is waiting on.
@app.get("/chats")
def get_chats(x_token: str = Header(...)):
    client = WebClient(token=x_token)
    missing_scope = set()

    def note_scope(e):
        if isinstance(e, SlackApiError) and e.response.get("error") == "missing_scope":
            missing_scope.update(x for x in (e.response.get("needed") or "").split(",") if x)

    ims, channels = [], []
    try:
        ims = client.conversations_list(types="im", limit=50)["channels"]
    except Exception as e:
        note_scope(e)
        print(f"Error getting DMs: {e}")
    try:
        channels = [c for c in client.conversations_list(
            types="public_channel,private_channel", limit=30)["channels"] if c.get("is_member")]
    except Exception as e:
        note_scope(e)
        print(f"Error getting channels: {e}")

    # One history call per chat (Slack's list has no last message), run in parallel.
    targets = [c["id"] for c in ims] + [c["id"] for c in channels]
    with ThreadPoolExecutor(max_workers=8) as pool:
        lasts = dict(zip(targets, pool.map(lambda cid: _last_message(client, cid), targets)))

    result = []
    for channel in ims:
        user_id = channel.get("user")
        # Slack flags bots on the user profile.
        name, is_bot = _user_info(client, x_token, user_id) if user_id else ("Unknown", False)
        last_message, last_message_at = lasts.get(channel["id"], (None, None))
        result.append({
            "id": channel["id"],
            "name": name,
            "type": "PERSONAL",
            "kind": "BOT" if is_bot else "PERSON",
            "last_message": last_message,
            "last_message_at": last_message_at,
            "unread_count": 0
        })
    for channel in channels:
        last_message, last_message_at = lasts.get(channel["id"], (None, None))
        result.append({
            "id": channel["id"],
            "name": "#" + channel["name"],
            "type": "GROUP",
            "kind": "GROUP",
            "last_message": last_message,
            "last_message_at": last_message_at,
            "unread_count": 0
        })

    if not result and missing_scope:
        # Otherwise an empty list is indistinguishable from an empty workspace.
        raise HTTPException(status_code=400, detail=missing_scopes_message(sorted(missing_scope)))
    return result


@app.get("/messages")
def get_messages(channel_id: str, limit: int = 50, x_token: str = Header(...)):
    """Get messages from a channel"""
    client = WebClient(token=x_token)
    try:
        me = client.auth_test()
        my_id = me["user_id"]

        history = client.conversations_history(channel=channel_id, limit=limit)
        messages = history["messages"]

        result = []
        for m in reversed(messages):
            if m.get("type") != "message" or m.get("subtype") == "channel_join":
                continue
            sender_id = m.get("user", "")
            text = m.get("text", "")
            if not text:
                continue

            sender_name = sender_id
            try:
                user_info = client.users_info(user=sender_id)
                sender_name = user_info["user"]["real_name"] or user_info["user"]["name"]
            except:
                pass

            result.append({
                "id": m["ts"],
                "text": text,
                "sender_id": sender_id,
                "sender_name": sender_name,
                "is_from_user": sender_id == my_id,
                "timestamp": format_timestamp(m["ts"])
            })

        return result

    except SlackApiError as e:
        raise HTTPException(status_code=400, detail=str(e))


class DeleteMessageRequest(BaseModel):
    token: str
    channel_id: str
    message_id: str


@app.post("/delete")
def delete_message(req: DeleteMessageRequest):
    """Deletes a message. In Slack the message id is its ts."""
    client = WebClient(token=req.token)
    try:
        client.chat_delete(channel=req.channel_id, ts=req.message_id)
        return {"success": True}
    except SlackApiError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/send-media")
def send_media(req: SendMediaRequest):
    """Uploads an attachment. Slack has no voice-note type, so `kind` only affects the name."""
    client = WebClient(token=req.token)
    try:
        raw = base64.b64decode(req.data_base64)
    except Exception:
        raise HTTPException(status_code=400, detail="Не вдалося декодувати вкладення")
    if not raw:
        raise HTTPException(status_code=400, detail="Порожнє вкладення")

    title = "Голосове повідомлення" if req.kind == "VOICE" else req.file_name
    try:
        # files_upload_v2: files.upload is disabled on new workspaces.
        response = client.files_upload_v2(
            channel=req.channel_id,
            file=raw,
            filename=req.file_name,
            title=title,
            initial_comment=req.caption or None,
        )
        return {"file_id": response["file"]["id"]}
    except SlackApiError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/send")
def send_message(req: SendMessageRequest):
    """Send a message"""
    client = WebClient(token=req.token)
    try:
        response = client.chat_postMessage(
            channel=req.channel_id,
            text=req.text
        )
        return {
            "message_id": response["ts"],
            "timestamp": format_timestamp(response["ts"])
        }
    except SlackApiError as e:
        raise HTTPException(status_code=400, detail=str(e))