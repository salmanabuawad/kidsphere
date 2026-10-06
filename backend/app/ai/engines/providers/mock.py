"""The mock provider: every engine, no network, deterministic, the same contracts as a real
provider. For development and tests (``AI_MOCK_MODE=true`` or provider "mock" on an engine).

It answers in the requested language (ar, he, en; other languages get English), echoes the
request's own words where an answer needs content, and never invents facts about a child.
Media are real but tiny files: a 256x256 PNG picture, a short silent WAV, and for video a
JSON storyboard (a long job: ``invoke`` returns "pending" and ``poll`` finishes it).
"""
import hashlib
import io
import json
import struct
import wave

from PIL import Image, ImageDraw

from app.ai.engines.contracts import EngineCall, ProviderBinary, ProviderResponse, Usage
from app.ai.engines.interfaces import ProviderError

PHRASES = {
    "en": {"story": "Once upon a time there was {topic}. {topic} wanted to try: {goal}. With a friend it worked, step by step.",
           "end": "In the end everyone smiled.", "q": "What did {topic} try?", "answer": "A calm, simple choice fits: {q}",
           "summary": "The information shared so far suggests interests and strengths to keep observing.",
           "transcript": "(mock transcript)", "insight": "There are new observations to look at together.",
           "rationale": "It builds on what the child enjoys.", "thing": "a little friend"},
    "ar": {"story": "كان يا ما كان، كان هناك {topic}. أراد {topic} أن يجرّب: {goal}. ومع صديق نجح خطوة بخطوة.",
           "end": "وفي النهاية ابتسم الجميع.", "q": "ماذا جرّب {topic}؟", "answer": "يناسب اختيار هادئ وبسيط: {q}",
           "summary": "تشير المعلومات حتى الآن إلى اهتمامات ونقاط قوة يجدر الاستمرار في ملاحظتها.",
           "transcript": "(نص تجريبي)", "insight": "هناك ملاحظات جديدة تستحق النظر فيها معاً.",
           "rationale": "يعتمد على ما يستمتع به الطفل.", "thing": "صديق صغير"},
    "he": {"story": "היה היה פעם {topic}. {topic} רצה לנסות: {goal}. עם חבר זה הצליח, צעד אחר צעד.",
           "end": "ובסוף כולם חייכו.", "q": "מה {topic} ניסה?", "answer": "מתאימה בחירה רגועה ופשוטה: {q}",
           "summary": "המידע עד עכשיו מצביע על תחומי עניין וחוזקות שכדאי להמשיך לצפות בהם.",
           "transcript": "(תמלול לדוגמה)", "insight": "יש תצפיות חדשות שכדאי להסתכל עליהן יחד.",
           "rationale": "זה נשען על מה שהילד/ה אוהב/ת.", "thing": "חבר קטן"},
}

TAXONOMY_KEYS = {
    "observation_domains": "social",
    "skills": "communication",
    "interests": "animals",
    "content_types": "story",
}


def _p(call: EngineCall) -> dict:
    return PHRASES.get(call.language.language, PHRASES["en"])


def _png(seed: str) -> bytes:
    h = hashlib.sha256(seed.encode()).digest()
    img = Image.new("RGB", (256, 256), (251, 246, 236))
    draw = ImageDraw.Draw(img)
    draw.ellipse((48, 48, 208, 208), fill=(h[0], h[1], h[2]), outline=(31, 34, 51), width=6)
    out = io.BytesIO()
    img.save(out, "PNG")
    return out.getvalue()


def _wav(seconds: float) -> bytes:
    rate = 8000
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(struct.pack("<h", 0) * int(rate * max(0.1, min(seconds, 2.0))))
    return out.getvalue()


def _vector(text: str, dims: int = 16) -> list[float]:
    h = hashlib.sha256(text.encode()).digest()
    return [round((h[i % len(h)] - 128) / 128, 4) for i in range(dims)]


def _structured(call: EngineCall) -> dict:
    p, i, e = _p(call), call.input, call.engine
    if e == "reasoning":
        return {"answer": p["answer"].format(q=i["question"])[:4000], "reasoning_steps": [i["question"][:600]]}
    if e == "child_understanding":
        return {"summary": p["summary"], "strengths": [], "interests": [], "needs": [], "learning_preferences": []}
    if e == "observation_analysis":
        return {"categories": [{"observation_id": o["id"], "domains": o.get("domains") or []} for o in i["observations"]],
                "patterns": [], "changes": []}
    if e == "recommendation":
        kind = {"goals": "goal", "activities": "activity", "content": "content", "next_steps": "next_step"}[i["target"]]
        title = (i.get("focus") or p["thing"])[:160]
        return {"items": [{"kind": kind, "title": title, "rationale": p["rationale"]} for _ in range(i.get("count", 1))]}
    if e == "content_generation":
        out = {"content_type": i["content_type"], "title": i["goal"][:120], "body": {"steps": [i["goal"]]}}
        if i["content_type"] == "game":
            out["game"] = {"game_type": i.get("game_type") or "multiple_choice", "title": i["goal"][:120],
                           "instructions": i["goal"][:400], "learning_goal": i["goal"][:300],
                           "questions": [{"prompt": i["goal"][:200], "choices": [{"label": "1"}, {"label": "2"}],
                                          "preferred_choice": 0}]}
        return out
    if e == "story":
        topic = i.get("topic") or p["thing"]
        return {"title": topic[:120],
                "pages": [{"text": p["story"].format(topic=topic, goal=i["goal"])[:600], "illustration_prompt": topic},
                          {"text": p["end"]}],
                "questions": [p["q"].format(topic=topic)[:200]], "reading_level": i.get("difficulty", "easy")}
    if e == "character":
        return {"name_token": i["name_token"], "description": i["description"],
                "visual_traits": [i.get("style") or "round shapes"], "voice_traits": ["warm"]}
    if e == "vision":
        return {"description": i["question"][:1000], "tags": []}
    if e == "classification":
        label = TAXONOMY_KEYS[i["taxonomy"]]
        return {"results": [{"item_index": n, "labels": [label]} for n in range(len(i["items"]))]}
    if e == "safety_moderation":
        return {"allowed": True, "issues": []}
    if e == "personalization":
        return {"content": i["content"], "adaptations": [p["rationale"]]}
    if e == "progress_analysis":
        return {"insights": [p["insight"]], "trends": [], "suggestions": []}
    if e == "orchestration":
        return {"plan": [{"engine": "recommendation", "task": "recommend", "reason": i["goal"][:300]},
                         {"engine": "content_generation", "task": "generate", "reason": i["goal"][:300]},
                         {"engine": "safety_moderation", "task": "moderate", "reason": i["goal"][:300]}]}
    raise ProviderError("UNSUPPORTED_ENGINE", f"mock has no answer for {e}")


class MockAdapter:
    name = "mock"
    output_kinds = frozenset({"structured", "text", "image", "video", "audio", "transcript", "embedding"})

    def invoke(self, call: EngineCall, secret: str | None) -> ProviderResponse:
        if call.options.get("mock_fail"):
            # Lets tests exercise retries and fallbacks: "retryable" or "permanent".
            raise ProviderError("PROVIDER_ERROR", "mock failure", retryable=call.options["mock_fail"] == "retryable")
        kind, i = call.output_kind, call.input
        rid = "mock-" + hashlib.sha256(json.dumps(i, sort_keys=True, default=str).encode()).hexdigest()[:12]
        model = call.model or "mock-1"
        if kind == "structured":
            return ProviderResponse(output=_structured(call), model=model, provider_request_id=rid,
                                    usage=Usage(input_units=1, output_units=1, unit="requests"))
        if kind == "text":
            return ProviderResponse(output={"text": i["text"], "language": i["target_language"]}, model=model,
                                    provider_request_id=rid, usage=Usage(input_units=len(i["text"]), unit="characters"))
        if kind == "transcript":
            return ProviderResponse(output={"text": _p(call)["transcript"], "language": call.language.language},
                                    model=model, provider_request_id=rid, usage=Usage(input_units=1, unit="seconds"))
        if kind == "embedding":
            vectors = [_vector(t) for t in i["texts"]]
            return ProviderResponse(output={"dimensions": 16, "vectors": vectors}, model=model, provider_request_id=rid,
                                    usage=Usage(input_units=sum(len(t) for t in i["texts"]), unit="characters"))
        if kind == "image":
            return ProviderResponse(output={"description": i["prompt"][:500]}, model=model, provider_request_id=rid,
                                    binaries=[ProviderBinary(kind="image", mime="image/png", data=_png(i["prompt"]),
                                                             alt=i["prompt"][:300], width=256, height=256)],
                                    usage=Usage(output_units=1, unit="images"))
        if kind == "audio":
            seconds = float(i.get("duration_seconds") or 0.5)
            text = i.get("text") or i.get("effect") or i.get("mood") or ""
            return ProviderResponse(output={"description": str(text)[:500]}, model=model, provider_request_id=rid,
                                    binaries=[ProviderBinary(kind="audio", mime="audio/wav", data=_wav(seconds),
                                                             duration_seconds=min(seconds, 2.0))],
                                    usage=Usage(output_units=max(1, int(seconds)), unit="seconds"))
        if kind == "video":
            return ProviderResponse(state="pending", job_id=rid, model=model, provider_request_id=rid)
        raise ProviderError("UNSUPPORTED_ENGINE", f"mock does not produce {kind}")

    def poll(self, job_id: str, call: EngineCall, secret: str | None) -> ProviderResponse:
        scenes = call.input.get("scenes") or []
        board = json.dumps({"storyboard": [{"scene": n + 1, "narration": s["narration"], "visual": s["visual_prompt"]}
                                           for n, s in enumerate(scenes)]}, ensure_ascii=False).encode()
        return ProviderResponse(output={"description": call.input["script"][:500], "scenes": len(scenes)},
                                model=call.model or "mock-1", provider_request_id=job_id,
                                binaries=[ProviderBinary(kind="document", mime="application/json", data=board)],
                                usage=Usage(output_units=sum(s.get("duration_seconds", 8) for s in scenes), unit="seconds"))
