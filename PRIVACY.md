# Kidsphere privacy & data protection

Child data is treated as highly sensitive by default. Kidsphere is an **educational** tool: it never diagnoses, labels, scores or predicts conditions.

## Data classes

| Class                | Examples                                  | Who can see it                                                              | Used for AI generation?                                                      |
| -------------------- | ----------------------------------------- | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Identity             | first/last name, date of birth, class     | staff in scope, linked parents                                              | display name and **age band** only                                           |
| Parent knowledge     | questionnaire answers                     | class teachers, kindergarten/org admins                                     | **No** — only normalized, ACTIVE profile items                               |
| Protected health     | sleep, eating, allergies, family context  | class teachers and kindergarten admin (access audited)                      | **Never**                                                                    |
| Teacher observations | facts, interpretation, ratings            | staff in scope                                                              | **No** (AI suggestions use masked observation text only when a teacher asks) |
| Profile attributes   | interests, strengths, supports, triggers  | staff in scope; parents see positive ACTIVE items without confidence labels | ACTIVE items only, max 2/2/3/3                                               |
| Media                | family photos, teacher narration          | owner family; staff/child only with active consent                          | relation label only ("Mom"), never names or images                           |
| Operational          | audit log, AI request metadata, analytics | admins                                                                      | No                                                                           |

## Sensitive data handling

- Health questions are flagged `sensitive` in the questionnaire definition and stored with `ParentResponse.isSensitive`. They are excluded from the profile engine and the AI context builder, shown in a separate "protected" panel, and each staff view is audited.
- Observations keep **observable facts** (`observedBehavior`) separate from **interpretation** (`teacherNote`).
- No sensitive values in logs: the API error handler logs only error name/message; audit metadata is primitive and contains no free text about the child.
- Analytics events have fixed names and whitelisted primitive properties — child names and observation text cannot be sent (`sanitize()`, unit-tested).

## Consent

- Uploading a photo grants nothing. A separate `MediaConsent` records **who** is shown, **which asset**, **allowed purposes**, **allowed content types**, **granted/revoked timestamps** and **status**.
- Parents revoke consent independently and instantly. A revoked asset:
  - disappears from the teacher's character picker,
  - is refused for new generation (`CONSENT_REVOKED`),
  - blocks approval/publication of content still referencing it,
  - is no longer served to staff or children (the image route checks consent on every request).
- Deleting a photo soft-deletes the record, revokes its consents and removes the stored object.
- Organizations can disable family-photo characters entirely (consent configuration).

## AI data minimization

- `ContentGenerationContextBuilder` is the only path to a provider. It returns a fixed set of keys (asserted by an integration test) and never includes questionnaire text, observations, health data, last names or dates of birth.
- Teachers see exactly what will be used before generating and can remove any item.
- EMERGING (unconfirmed) attributes are never sent.
- Provider calls are logged as metadata only (provider, model, operation, tokens, duration, outcome).
- AI output is never child-visible without teacher approval and publication.

## Media storage

- Private storage only (local disk in development, private S3-compatible bucket with server-side encryption in production).
- Opaque, tenant-prefixed random keys; storage paths are never returned to clients.
- All retrieval goes through authorized routes with `Cache-Control: private, no-store`.

## Retention & deletion architecture

- Children can be archived (`archivedAt`), which hides them from every scope query.
- Content, observations, attributes, media and consents cascade on child deletion at the database level (`onDelete: Cascade`), and media objects are removed from storage on delete.
- Audit logs hold no child payload, so they can be retained independently.
- Recommended policy (configure per organization): delete child records and media N months after the child leaves; see ROADMAP for the scheduled retention job.

## Security controls

- Server-side authorization on every request (tenant scope + role matrix); 404 for foreign IDs.
- Strict input validation (Zod, unknown fields rejected), same-origin check on mutations, `SameSite=Lax` `httpOnly` cookies, hashed session tokens.
- CSP (`default-src 'self'`, no external scripts, frames or connections) also enforces "no open internet" in child mode.
- Child mode confines the device to approved content; exiting requires the adult PIN.
