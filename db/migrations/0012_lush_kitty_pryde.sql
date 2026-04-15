CREATE TABLE "project_storage" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"repo" text NOT NULL,
	"provider" text DEFAULT 'github' NOT NULL,
	"bucket" text,
	"account_id" text,
	"access_key_id" text,
	"access_key_iv" text,
	"secret_access_key" text,
	"secret_key_iv" text,
	"public_url" text,
	"region" text,
	"endpoint" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_project_storage_owner_repo" ON "project_storage" USING btree (lower("owner"),lower("repo"));