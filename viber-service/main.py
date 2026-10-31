from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel
import httpx
from datetime import datetime, timezone
from collections import defaultdict

app = FastAPI()

VIBER_API = "https://chatapi.viber.com/pa"

# In-memory stores: token -> user_id -> list[message]
message_store: dict[str, dict[str, list]] = defaultdict(lambda: defaultdict(list))

# In-memory chat info: token -> user_id -> {name, avatar, last_message, last_message_at}
chat_store: dict[str, dict[str, dict]] = defaultdict(dict)


def make_headers(token: str) -> dict:
    return {"X-Viber-Auth-Token": token, "Content-Type": "application/json"}


def now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + "Z"


# ── VALIDATE TOKEN ───────────────────────────────────────────────────────────

@app.get("/validate")
async def validate_token(x_token: str = Header(...)):
    """Validate bot token and return bot account info."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{VIBER_API}/get_account_info",
            headers=make_headers(x_token),
            json={}
        )
        if r.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Viber API error: {r.text}")
        data = r.json()
        if data.get("status") != 0:
            raise HTTPException(
                status_code=400,
                detail=f"Viber error: {data.get('status_message', 'Unknown error')}"
            )
        return {
            "user_id": str(data.get("id", "")),
            "username": data.get("name", "Viber Bot"),
        }


# ── CHATS ────────────────────────────────────────────────────────────────────

@app.get("/chats")
async def get_chats(x_token: str = Header(...)):
    """Return known conversations (populated via incoming webhook messages)."""
    chats = chat_store.get(x_token, {})
    result = []
    for user_id, info in chats.items():
        result.append({
            "id": user_id,
            "name": info.get("name", user_id),
            "type": "PERSONAL",
            # A Viber bot only sees people who have written to it.
            "kind": "PERSON",
            "last_message": info.get("last_message"),
            "last_message_at": info.get("last_message_at"),
            "unread_count": 0,
        })
    # Sort by last_message_at descending
    result.sort(key=lambda x: x.get("last_message_at") or "", reverse=True)
    return result


# ── MESSAGES ─────────────────────────────────────────────────────────────────

@app.get("/messages")
async def get_messages(x_token: str = Header(...), user_id: str = None):
    """Return stored messages for a given Viber user ID."""
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required")
    msgs = message_store.get(x_token, {}).get(user_id, [])
    return msgs[-50:]  # Return last 50


# ── SEND ──────────────────────────────────────────────────────────────────────

class SendRequest(BaseModel):
    token: str
    user_id: str
    text: str


@app.post("/send")
async def send_message(req: SendRequest):
    """Send a text message to a Viber user."""
    payload = {
        "receiver": req.user_id,
        "type": "text",
        "text": req.text,
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(
            f"{VIBER_API}/send_message",
            headers=make_headers(req.token),
            json=payload
        )
        if r.status_code != 200:
            raise HTTPException(status_code=400, detail=r.text)
        data = r.json()
        if data.get("status") != 0:
            raise HTTPException(
                status_code=400,
                detail=data.get("status_message", "Send failed")
            )

    ts = now_iso()
    msg_id = str(data.get("message_token", ""))

    # Store our sent message
    message_store[req.token][req.user_id].append({
        "id": msg_id,
        "text": req.text,
        "sender_id": "bot",
        "sender_name": "Bot",
        "is_from_user": True,
        "timestamp": ts,
    })

    # Update chat info
    if req.user_id in chat_store.get(req.token, {}):
        chat_store[req.token][req.user_id]["last_message"] = req.text
        chat_store[req.token][req.user_id]["last_message_at"] = ts

    return {"success": True, "timestamp": ts}


# ── WEBHOOK ───────────────────────────────────────────────────────────────────

@app.post("/webhook/{token}")
async def webhook(token: str, request: Request):
    """
    Receive incoming Viber events for a specific bot token.
    Register this endpoint with Viber by calling:
      POST https://chatapi.viber.com/pa/set_webhook
      Body: {"url": "http://<your-public-ip>:8205/webhook/<token>"}
    """
    try:
        body = await request.json()
        event_type = body.get("event")

        if event_type == "message":
            sender = body.get("sender", {})
            message = body.get("message", {})

            sender_id = sender.get("id", "")
            sender_name = sender.get("name", sender_id)
            text = message.get("text", "")
            msg_token = str(body.get("message_token", ""))
            ts = now_iso()

            # Update chat store
            chat_store[token][sender_id] = {
                "name": sender_name,
                "avatar": sender.get("avatar"),
                "last_message": text,
                "last_message_at": ts,
            }

            # Store incoming message
            message_store[token][sender_id].append({
                "id": msg_token,
                "text": text,
                "sender_id": sender_id,
                "sender_name": sender_name,
                "is_from_user": False,
                "timestamp": ts,
            })

        return {"status": 0}
    except Exception as e:
        print(f"[Viber] Webhook error: {e}")
        return {"status": 0}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8205)
