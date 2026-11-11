ALTER TABLE "households" ADD COLUMN "unitDefinitions" JSONB NOT NULL DEFAULT '[]'::jsonb,
ADD COLUMN "unitDefinitionsUpdatedAt" TIMESTAMP(3);
