from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel
from slack_sdk import WebClient
from slack_sdk.errors import SlackApiError
import os
from dotenv import load_dotenv
from datetime import datetime, timezone

load_dotenv()

app = FastAPI()


class SendMessageRequest(BaseModel):
    token: str
    channel_id: str
    text: str


def format_timestamp(ts: str) -> str:
    if not ts:
        return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    dt = datetime.fromtimestamp(float(ts), tz=timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + "Z"


@app.get("/validate")
async def validate_token(x_token: str = Header(...)):
    """Validate token and get user info"""
    client = WebClient(token=x_token)
    try:
        response = client.auth_test()
        return {
            "user_id": response["user_id"],
            "username": response["user"],
            "team": response["team"],
            "team_id": response["team_id"]
        }
    except SlackApiError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/chats")
async def get_chats(x_token: str = Header(...)):
    client = WebClient(token=x_token)
    result = []

    try:
        # Get DMs
        try:
            ims = client.conversations_list(types="im", limit=50)
            for channel in ims["channels"]:
                user_id = channel.get("user")
                name = "Unknown"
                if user_id:
                    try:
                        user_info = client.users_info(user=user_id)
                        name = user_info["user"]["real_name"] or user_info["user"]["name"]
                    except Exception as e:
                        print(f"Error getting user info: {e}")
                        name = user_id

                last_message = None
                last_message_at = None
                try:
                    history = client.conversations_history(channel=channel["id"], limit=1)
                    if history["messages"]:
                        last_message = history["messages"][0].get("text", "")
                        last_message_at = format_timestamp(history["messages"][0].get("ts"))
                except Exception as e:
                    print(f"Error getting history for DM {channel['id']}: {e}")

                result.append({
                    "id": channel["id"],
                    "name": name,
                    "type": "PERSONAL",
                    "last_message": last_message,
                    "last_message_at": last_message_at,
                    "unread_count": 0
                })
        except Exception as e:
            print(f"Error getting DMs: {e}")

        # Get channels
        try:
            channels = client.conversations_list(types="public_channel,private_channel", limit=30)
            for channel in channels["channels"]:
                if not channel.get("is_member", False):
                    continue

                last_message = None
                last_message_at = None
                try:
                    history = client.conversations_history(channel=channel["id"], limit=1)
                    if history["messages"]:
                        last_message = history["messages"][0].get("text", "")
                        last_message_at = format_timestamp(history["messages"][0].get("ts"))
                except Exception as e:
                    print(f"Error getting history for channel {channel['name']}: {e}")

                result.append({
                    "id": channel["id"],
                    "name": "#" + channel["name"],
                    "type": "GROUP",
                    "last_message": last_message,
                    "last_message_at": last_message_at,
                    "unread_count": 0
                })
        except Exception as e:
            print(f"Error getting channels: {e}")

        print(f"Total chats found: {len(result)}")
        return result

    except SlackApiError as e:
        print(f"Slack API Error: {e.response['error']}")
        raise HTTPException(status_code=400, detail=e.response['error'])


@app.get("/messages")
async def get_messages(channel_id: str, limit: int = 50, x_token: str = Header(...)):
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


@app.post("/send")
async def send_message(req: SendMessageRequest):
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