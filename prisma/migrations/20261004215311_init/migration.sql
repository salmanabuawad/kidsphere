-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ORGANIZATION_ADMIN', 'KINDERGARTEN_ADMIN', 'TEACHER', 'PARENT');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('ar', 'he', 'en');

-- CreateEnum
CREATE TYPE "ConfidenceLevel" AS ENUM ('REPORTED', 'OBSERVED', 'CORROBORATED', 'EMERGING', 'RETIRED');

-- CreateEnum
CREATE TYPE "AttributeStatus" AS ENUM ('ACTIVE', 'PENDING_CONFIRMATION', 'RETIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "AttributeCategory" AS ENUM ('INTEREST', 'STRENGTH', 'EMOTIONAL_REGULATION', 'SOCIAL_INTERACTION', 'COMMUNICATION', 'LANGUAGE', 'EXECUTIVE_FUNCTION', 'PLAY', 'MOTOR', 'INDEPENDENCE', 'SENSORY', 'LEARNING_PREFERENCE', 'TRIGGER', 'SUPPORT', 'FAMILY_PRIORITY');

-- CreateEnum
CREATE TYPE "EvidenceSource" AS ENUM ('PARENT_QUESTIONNAIRE', 'TEACHER_OBSERVATION', 'TEACHER_ENTRY', 'OUTCOME', 'AI_SUGGESTION');

-- CreateEnum
CREATE TYPE "ObservationKind" AS ENUM ('QUICK', 'FULL');

-- CreateEnum
CREATE TYPE "ObservationContext" AS ENUM ('arrival', 'free_play', 'group_time', 'structured_activity', 'yard', 'meal', 'art', 'transition', 'end_of_day', 'other');

-- CreateEnum
CREATE TYPE "DevelopmentDomain" AS ENUM ('EMOTIONAL', 'SOCIAL', 'LANGUAGE', 'ATTENTION_EF', 'PLAY', 'GROSS_MOTOR', 'FINE_MOTOR', 'INDEPENDENCE', 'SENSORY', 'COGNITIVE', 'PARTICIPATION');

-- CreateEnum
CREATE TYPE "SupportOutcome" AS ENUM ('helped', 'partly_helped', 'did_not_help', 'not_assessed');

-- CreateEnum
CREATE TYPE "ObservationRating" AS ENUM ('NOT_OBSERVED', 'BEGINNING', 'WITH_SUPPORT', 'CONSISTENT');

-- CreateEnum
CREATE TYPE "OutcomeResult" AS ENUM ('HELPED', 'PARTLY_HELPED', 'DID_NOT_HELP', 'NOT_OBSERVED');

-- CreateEnum
CREATE TYPE "GoalStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ACHIEVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'TEACHER_REVIEW', 'APPROVED', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('INTERACTIVE_STORY', 'STORY', 'SOCIAL_STORY', 'SIMPLE_GAME', 'VISUAL_ROUTINE', 'MATCHING_ACTIVITY', 'CHOICE_ACTIVITY', 'MOVEMENT_ACTIVITY', 'ROLE_PLAY_ACTIVITY', 'PARENT_HOME_ACTIVITY', 'TEACHER_DISCUSSION_ACTIVITY', 'WEEKLY_PLAN');

-- CreateEnum
CREATE TYPE "VersionSource" AS ENUM ('AI_GENERATED', 'AI_REGENERATED', 'TEACHER_EDIT', 'TEMPLATE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ApprovalAction" AS ENUM ('SUBMITTED_FOR_REVIEW', 'APPROVED', 'PUBLISHED', 'RETURNED_TO_DRAFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "ConsentStatus" AS ENUM ('GRANTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "MediaKind" AS ENUM ('CHARACTER_PHOTO');

-- CreateEnum
CREATE TYPE "PersonRelation" AS ENUM ('CHILD', 'MOTHER', 'FATHER', 'SIBLING', 'GRANDPARENT', 'FAMILY_MEMBER', 'FRIEND');

-- CreateEnum
CREATE TYPE "ConsentPurpose" AS ENUM ('CHARACTER_INSPIRATION', 'STORY_ILLUSTRATION');

-- CreateEnum
CREATE TYPE "PlanItemStatus" AS ENUM ('PLANNED', 'READY', 'DONE', 'SKIPPED');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "subdomain" TEXT,
    "brandColor" TEXT NOT NULL DEFAULT '#0f766e',
    "defaultLocale" "Locale" NOT NULL DEFAULT 'ar',
    "enabledLocales" "Locale"[] DEFAULT ARRAY['ar', 'he', 'en']::"Locale"[],
    "aiProvider" TEXT,
    "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kindergarten" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Kindergarten_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kindergartenId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ageBand" TEXT NOT NULL DEFAULT '3-5',
    "contentLocale" "Locale" NOT NULL DEFAULT 'ar',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "organizationId" TEXT,
    "kindergartenId" TEXT,
    "uiLocale" "Locale" NOT NULL DEFAULT 'ar',
    "childModePinHash" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassTeacher" (
    "classId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "isLead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassTeacher_pkey" PRIMARY KEY ("classId","userId")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kindergartenId" TEXT NOT NULL,
    "classId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "displayName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "primaryLanguage" "Locale" NOT NULL DEFAULT 'ar',
    "otherLanguages" "Locale"[] DEFAULT ARRAY[]::"Locale"[],
    "avatarColor" TEXT NOT NULL DEFAULT '#f59e0b',
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentChild" (
    "parentId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "relation" "PersonRelation" NOT NULL DEFAULT 'MOTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentChild_pkey" PRIMARY KEY ("parentId","childId")
);

-- CreateTable
CREATE TABLE "ParentQuestionnaire" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "parentId" TEXT NOT NULL,
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "version" INTEGER NOT NULL DEFAULT 1,
    "currentSection" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentQuestionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentResponse" (
    "id" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "questionKey" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParentResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParentMessage" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Observation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "kind" "ObservationKind" NOT NULL,
    "context" "ObservationContext" NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "observedBehavior" TEXT NOT NULL,
    "frequencyOrDuration" TEXT,
    "whatHappenedBefore" TEXT,
    "supportsTried" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supportOutcome" "SupportOutcome" NOT NULL DEFAULT 'not_assessed',
    "strengthNoticed" TEXT,
    "teacherNote" TEXT,
    "possiblePattern" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Observation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ObservationDomain" (
    "observationId" TEXT NOT NULL,
    "domain" "DevelopmentDomain" NOT NULL,

    CONSTRAINT "ObservationDomain_pkey" PRIMARY KEY ("observationId","domain")
);

-- CreateTable
CREATE TABLE "ObservationItem" (
    "id" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "domain" "DevelopmentDomain" NOT NULL,
    "itemKey" TEXT NOT NULL,
    "rating" "ObservationRating" NOT NULL,
    "note" TEXT,

    CONSTRAINT "ObservationItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileAttribute" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "category" "AttributeCategory" NOT NULL,
    "value" TEXT NOT NULL,
    "confidence" "ConfidenceLevel" NOT NULL,
    "status" "AttributeStatus" NOT NULL,
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileAttribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileAttributeEvidence" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "sourceType" "EvidenceSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "authorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfileAttributeEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "domain" "DevelopmentDomain" NOT NULL,
    "statement" TEXT NOT NULL,
    "successIndicator" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL,
    "status" "GoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "parentReinforcement" TEXT,
    "shareWithParent" BOOLEAN NOT NULL DEFAULT false,
    "parentFocus" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GoalEvidence" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "sourceType" "EvidenceSource" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Intervention" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "goalId" TEXT,
    "contentId" TEXT,
    "support" TEXT,
    "description" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Intervention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Outcome" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "interventionId" TEXT,
    "result" "OutcomeResult" NOT NULL,
    "note" TEXT,
    "context" "ObservationContext",
    "durationMinutes" INTEGER,
    "observationId" TEXT,
    "recordedById" TEXT NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Outcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPlan" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "classId" TEXT,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyPlanItem" (
    "id" TEXT NOT NULL,
    "weeklyPlanId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "goalId" TEXT,
    "dayOfWeek" INTEGER NOT NULL,
    "contentType" "ContentType" NOT NULL,
    "title" TEXT NOT NULL,
    "contentId" TEXT,
    "status" "PlanItemStatus" NOT NULL DEFAULT 'PLANNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT,
    "goalId" TEXT,
    "classId" TEXT,
    "type" "ContentType" NOT NULL,
    "language" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "ageBand" TEXT NOT NULL DEFAULT '4-5',
    "durationMinutes" INTEGER NOT NULL DEFAULT 5,
    "domain" "DevelopmentDomain",
    "theme" TEXT,
    "difficulty" INTEGER NOT NULL DEFAULT 2,
    "createdById" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "rationale" JSONB,
    "generationContext" JSONB,
    "isDemoGenerated" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "source" "VersionSource" NOT NULL,
    "aiRequestId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentApproval" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "versionId" TEXT,
    "action" "ApprovalAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentCharacter" (
    "contentId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,

    CONSTRAINT "ContentCharacter_pkey" PRIMARY KEY ("contentId","mediaAssetId")
);

-- CreateTable
CREATE TABLE "ContentTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "type" "ContentType" NOT NULL,
    "language" "Locale" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "domain" "DevelopmentDomain",
    "ageBand" TEXT NOT NULL DEFAULT '3-5',
    "body" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaAsset" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "kind" "MediaKind" NOT NULL DEFAULT 'CHARACTER_PHOTO',
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "personRelation" "PersonRelation" NOT NULL,
    "personLabel" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaConsent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "mediaAssetId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "personRelation" "PersonRelation" NOT NULL,
    "personLabel" TEXT NOT NULL,
    "allowedPurposes" "ConsentPurpose"[],
    "allowedContentTypes" "ContentType"[],
    "status" "ConsentStatus" NOT NULL DEFAULT 'GRANTED',
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "MediaConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeacherNarration" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "sceneId" TEXT,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherNarration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChildSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "childId" TEXT NOT NULL,
    "launchedById" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "failedPinCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChildSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorId" TEXT,
    "actorRole" TEXT,
    "action" TEXT NOT NULL,
    "objectType" TEXT NOT NULL,
    "objectId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIRequestLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "actorId" TEXT,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "repaired" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "contentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIRequestLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "name" TEXT NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_subdomain_key" ON "Organization"("subdomain");

-- CreateIndex
CREATE INDEX "Kindergarten_organizationId_idx" ON "Kindergarten"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Kindergarten_organizationId_slug_key" ON "Kindergarten"("organizationId", "slug");

-- CreateIndex
CREATE INDEX "Class_organizationId_idx" ON "Class"("organizationId");

-- CreateIndex
CREATE INDEX "Class_kindergartenId_idx" ON "Class"("kindergartenId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "ClassTeacher_userId_idx" ON "ClassTeacher"("userId");

-- CreateIndex
CREATE INDEX "Child_organizationId_idx" ON "Child"("organizationId");

-- CreateIndex
CREATE INDEX "Child_classId_idx" ON "Child"("classId");

-- CreateIndex
CREATE INDEX "ParentChild_childId_idx" ON "ParentChild"("childId");

-- CreateIndex
CREATE INDEX "ParentQuestionnaire_organizationId_childId_idx" ON "ParentQuestionnaire"("organizationId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "ParentResponse_questionnaireId_questionKey_key" ON "ParentResponse"("questionnaireId", "questionKey");

-- CreateIndex
CREATE INDEX "ParentMessage_organizationId_childId_idx" ON "ParentMessage"("organizationId", "childId");

-- CreateIndex
CREATE INDEX "Observation_organizationId_childId_observedAt_idx" ON "Observation"("organizationId", "childId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ObservationItem_observationId_itemKey_key" ON "ObservationItem"("observationId", "itemKey");

-- CreateIndex
CREATE INDEX "ProfileAttribute_organizationId_childId_idx" ON "ProfileAttribute"("organizationId", "childId");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileAttribute_childId_category_value_key" ON "ProfileAttribute"("childId", "category", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ProfileAttributeEvidence_attributeId_sourceType_sourceId_key" ON "ProfileAttributeEvidence"("attributeId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Goal_organizationId_childId_status_idx" ON "Goal"("organizationId", "childId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GoalEvidence_goalId_sourceType_sourceId_key" ON "GoalEvidence"("goalId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "Intervention_organizationId_childId_idx" ON "Intervention"("organizationId", "childId");

-- CreateIndex
CREATE INDEX "Outcome_organizationId_goalId_idx" ON "Outcome"("organizationId", "goalId");

-- CreateIndex
CREATE INDEX "WeeklyPlan_organizationId_weekStart_idx" ON "WeeklyPlan"("organizationId", "weekStart");

-- CreateIndex
CREATE INDEX "WeeklyPlanItem_weeklyPlanId_idx" ON "WeeklyPlanItem"("weeklyPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentAsset_currentVersionId_key" ON "ContentAsset"("currentVersionId");

-- CreateIndex
CREATE INDEX "ContentAsset_organizationId_status_idx" ON "ContentAsset"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ContentAsset_childId_status_idx" ON "ContentAsset"("childId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_contentId_versionNumber_key" ON "ContentVersion"("contentId", "versionNumber");

-- CreateIndex
CREATE INDEX "ContentApproval_contentId_idx" ON "ContentApproval"("contentId");

-- CreateIndex
CREATE INDEX "ContentTemplate_organizationId_idx" ON "ContentTemplate"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "MediaAsset_storageKey_key" ON "MediaAsset"("storageKey");

-- CreateIndex
CREATE INDEX "MediaAsset_organizationId_childId_idx" ON "MediaAsset"("organizationId", "childId");

-- CreateIndex
CREATE INDEX "MediaConsent_organizationId_childId_idx" ON "MediaConsent"("organizationId", "childId");

-- CreateIndex
CREATE INDEX "MediaConsent_mediaAssetId_idx" ON "MediaConsent"("mediaAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherNarration_storageKey_key" ON "TeacherNarration"("storageKey");

-- CreateIndex
CREATE INDEX "TeacherNarration_contentId_idx" ON "TeacherNarration"("contentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChildSession_tokenHash_key" ON "ChildSession"("tokenHash");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_objectType_objectId_idx" ON "AuditLog"("objectType", "objectId");

-- CreateIndex
CREATE INDEX "AIRequestLog_organizationId_createdAt_idx" ON "AIRequestLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- AddForeignKey
ALTER TABLE "Kindergarten" ADD CONSTRAINT "Kindergarten_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_kindergartenId_fkey" FOREIGN KEY ("kindergartenId") REFERENCES "Kindergarten"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_kindergartenId_fkey" FOREIGN KEY ("kindergartenId") REFERENCES "Kindergarten"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassTeacher" ADD CONSTRAINT "ClassTeacher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_kindergartenId_fkey" FOREIGN KEY ("kindergartenId") REFERENCES "Kindergarten"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentChild" ADD CONSTRAINT "ParentChild_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentQuestionnaire" ADD CONSTRAINT "ParentQuestionnaire_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentResponse" ADD CONSTRAINT "ParentResponse_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "ParentQuestionnaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParentMessage" ADD CONSTRAINT "ParentMessage_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Observation" ADD CONSTRAINT "Observation_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationDomain" ADD CONSTRAINT "ObservationDomain_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ObservationItem" ADD CONSTRAINT "ObservationItem_observationId_fkey" FOREIGN KEY ("observationId") REFERENCES "Observation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAttribute" ADD CONSTRAINT "ProfileAttribute_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileAttributeEvidence" ADD CONSTRAINT "ProfileAttributeEvidence_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "ProfileAttribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Goal" ADD CONSTRAINT "Goal_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GoalEvidence" ADD CONSTRAINT "GoalEvidence_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Intervention" ADD CONSTRAINT "Intervention_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Outcome" ADD CONSTRAINT "Outcome_interventionId_fkey" FOREIGN KEY ("interventionId") REFERENCES "Intervention"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlan" ADD CONSTRAINT "WeeklyPlan_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanItem" ADD CONSTRAINT "WeeklyPlanItem_weeklyPlanId_fkey" FOREIGN KEY ("weeklyPlanId") REFERENCES "WeeklyPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanItem" ADD CONSTRAINT "WeeklyPlanItem_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanItem" ADD CONSTRAINT "WeeklyPlanItem_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyPlanItem" ADD CONSTRAINT "WeeklyPlanItem_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentAsset" ADD CONSTRAINT "ContentAsset_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "ContentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentApproval" ADD CONSTRAINT "ContentApproval_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCharacter" ADD CONSTRAINT "ContentCharacter_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentCharacter" ADD CONSTRAINT "ContentCharacter_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentTemplate" ADD CONSTRAINT "ContentTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaConsent" ADD CONSTRAINT "MediaConsent_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaConsent" ADD CONSTRAINT "MediaConsent_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherNarration" ADD CONSTRAINT "TeacherNarration_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "ContentAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChildSession" ADD CONSTRAINT "ChildSession_childId_fkey" FOREIGN KEY ("childId") REFERENCES "Child"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

