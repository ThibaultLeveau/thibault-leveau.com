"""Fournisseur structuré déterministe pour tests ; ne fait jamais de requête externe."""

import json

import httpx
import httpx2


def request_data(body):
    messages = body.get("messages", body.get("input", []))
    value = next(m["content"] for m in messages if m.get("role") == "user")
    if isinstance(value, list):
        value = "".join(c.get("text", "") for c in value)
    return json.loads(value)


def tool_response(body, name, result):
    if any("input_schema" in item for item in body.get("tools", [])):
        return httpx2.Response(
            200,
            json={
                "id": "msg_test",
                "type": "message",
                "role": "assistant",
                "model": body["model"],
                "stop_reason": "tool_use",
                "usage": {"input_tokens": 10, "output_tokens": 10},
                "content": [{"type": "tool_use", "id": "call_test", "name": name, "input": result}],
            },
        )
    if "input" in body:
        return httpx.Response(
            200,
            json={
                "id": "resp_test",
                "object": "response",
                "created_at": 0,
                "model": body["model"],
                "status": "completed",
                "error": None,
                "output": [
                    {
                        "type": "function_call",
                        "id": "fc_test",
                        "call_id": "call_test",
                        "name": name,
                        "arguments": json.dumps(result),
                        "status": "completed",
                    }
                ],
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 10,
                    "total_tokens": 20,
                    "input_tokens_details": {"cached_tokens": 0},
                    "output_tokens_details": {"reasoning_tokens": 0},
                },
            },
        )
    return httpx.Response(
        200,
        json={
            "id": "test-response",
            "object": "chat.completion",
            "created": 0,
            "model": body["model"],
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "tool_calls",
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "call_test",
                                "type": "function",
                                "function": {"name": name, "arguments": json.dumps(result)},
                            }
                        ],
                    },
                }
            ],
        },
    )


class ScriptedProvider:
    def __init__(self, plan, drafts=None):
        self.plan = plan
        self.drafts = drafts or {}
        self.requests = []

    def __call__(self, request):
        body = json.loads(request.content)
        self.requests.append(body)
        data = request_data(body)
        spec = body["tools"][-1]
        final_tool = spec.get("function", spec)["name"]
        if final_tool == "Plan":
            result = self.plan(data) if callable(self.plan) else self.plan
        else:
            task = data["task"]
            draft = self.drafts[task["key"]]
            result = (
                draft(data)
                if callable(draft)
                else {"changes": {k: v for k, v in draft.items() if k in data["allowed_fields"]}}
            )
        return tool_response(body, final_tool, result)
