"""Multi-engine flows, run step by step through the orchestrator under one ``pipeline_id``.

    run_pipeline(db, user, name, inp, *, language, context, child_uuid) -> dict

    activity_for_goal   Recommendation (activities for the goal) → Content Generation (the
                        first recommended activity) → [Safety, inside every step] → returned
                        for TEACHER REVIEW. Nothing is published by a pipeline.
    personalized_cartoon  Story → Character (each requested character) → Image Generation
                        (one picture per story page, at most 4) → Video Animator (a scene per
                        page) → Voice (the narration) → returned for teacher approval. The
                        video is a long job: the pipeline ends "pending" until it is polled.

A required step that fails stops the pipeline ("failed", or "not_configured" when an engine
is not set up); optional steps (pictures, voice) may fail without stopping it ("partial").
Results never contain made-up output for a step that did not run.
"""
import uuid

from sqlalchemy.orm import Session

from app.ai.engines import orchestrator
from app.ai.engines.contracts import AIResult, EngineRequest, LanguageSpec
from app.models import User

PIPELINES = ("activity_for_goal", "personalized_cartoon")
MAX_PAGES_ILLUSTRATED = 4


def _status(steps: list[tuple[AIResult, bool]]) -> str:
    required_failed = [r for r, required in steps if required and not r.success and r.status != "pending"]
    if required_failed:
        return "not_configured" if required_failed[-1].status == "not_configured" else "failed"
    if any(r.status == "pending" for r, _ in steps):
        return "pending"
    if any(not r.success for r, _ in steps):
        return "partial"
    return "succeeded"


def run_pipeline(db: Session, user: User | None, name: str, inp: dict, *, language: LanguageSpec, context: dict,
                 child_uuid: uuid.UUID | None) -> dict:
    pid = str(uuid.uuid4())
    steps: list[tuple[AIResult, bool]] = []

    def step(engine: str, task: str, data: dict, required: bool = True, parent: str | None = None) -> AIResult:
        result = orchestrator.run(db, user, EngineRequest(engine=engine, task=task, input=data, language=language,
                                                          pipeline_id=pid, parent_request_id=parent),
                                  context=context, child_uuid=child_uuid)
        steps.append((result, required))
        return result

    if name == "activity_for_goal":
        goal = str(inp.get("goal") or "")[:300]
        rec = step("recommendation", "recommend", {"target": "activities", "focus": goal, "count": 3})
        if rec.success:
            first = (rec.output or {}).get("items", [{}])[0]
            step("content_generation", "generate", {"content_type": "activity", "goal": first.get("title") or goal},
                 parent=rec.request_id)
    elif name == "personalized_cartoon":
        story = step("story", "generate", {"goal": str(inp.get("goal") or "")[:300], "topic": inp.get("topic"),
                                          "length": inp.get("length") or "short",
                                          "characters": list(inp.get("characters") or [])[:5]})
        if story.success:
            for ch in list(inp.get("characters") or [])[:5]:
                step("character", "create", {"name_token": ch, "description": str(inp.get("character_hint") or ch)[:500]},
                     required=False, parent=story.request_id)
            pages = (story.output or {}).get("pages", [])
            for page in pages[:MAX_PAGES_ILLUSTRATED]:
                step("image_generation", "generate", {"prompt": page.get("illustration_prompt") or page["text"][:1000],
                                                      "characters": list(inp.get("characters") or [])[:5]},
                     required=False, parent=story.request_id)
            scenes = [{"narration": p["text"][:600], "visual_prompt": (p.get("illustration_prompt") or p["text"])[:600]}
                      for p in pages[:12]]
            step("video_animator", "animate", {"script": " ".join(p["text"] for p in pages)[:5000], "scenes": scenes,
                                               "characters": list(inp.get("characters") or [])[:5]},
                 parent=story.request_id)
            step("voice", "speak", {"text": " ".join(p["text"] for p in pages)[:5000]}, required=False,
                 parent=story.request_id)
    else:
        raise ValueError(f"unknown pipeline {name!r}")

    return {"pipeline_id": pid, "name": name, "status": _status(steps),
            "steps": [r.model_dump(mode="json") for r, _ in steps]}
