import {sqliteTable,text,integer,primaryKey,index} from 'drizzle-orm/sqlite-core';
export const leagues=sqliteTable('leagues',{ownerId:text('owner_id').primaryKey(),state:text('state').notNull(),revision:integer('revision').notNull().default(0),updatedAt:text('updated_at').notNull()});
export const seasonLeagues=sqliteTable('season_leagues',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),inviteHash:text('invite_hash').notNull().unique(),
 state:text('state').notNull(),revision:integer('revision').notNull().default(0),updatedAt:text('updated_at').notNull(),
});
export const seasonJoinAttempts=sqliteTable('season_join_attempts',{
 userId:text('user_id').primaryKey(),windowAt:integer('window_at').notNull(),attempts:integer('attempts').notNull(),
});
// One active solo season per signed-in manager; resets atomically archive the prior state.
export const demoDrafts=sqliteTable('demo_drafts',{
 ownerId:text('owner_id').primaryKey(),id:text('id').notNull().unique(),
 state:text('state').notNull(),revision:integer('revision').notNull().default(0),updatedAt:text('updated_at').notNull(),
});

export const draftPreferences=sqliteTable('draft_preferences',{
 ownerId:text('owner_id').notNull(),scope:text('scope').notNull(),state:text('state').notNull(),revision:integer('revision').notNull().default(0),
},table=>[primaryKey({columns:[table.ownerId,table.scope]})]);

export const userProfiles=sqliteTable('user_profiles',{
 ownerId:text('owner_id').primaryKey(),state:text('state').notNull(),revision:integer('revision').notNull().default(0),updatedAt:text('updated_at').notNull(),
});

export const demoArchives=sqliteTable('demo_archives',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),state:text('state').notNull(),
 revision:integer('revision').notNull(),archivedAt:text('archived_at').notNull(),
},table=>[index('demo_archives_owner_archived').on(table.ownerId,table.archivedAt)]);

// Separate from reset archives so later resets cannot overwrite this exact snapshot.
export const demoScoringBackups=sqliteTable('demo_scoring_backups',{
 id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),draftId:text('draft_id').notNull(),
 sourceRevision:integer('source_revision').notNull(),state:text('state').notNull(),
 sourceUpdatedAt:text('source_updated_at').notNull(),createdAt:text('created_at').notNull(),
},table=>[index('demo_scoring_backups_owner_draft').on(table.ownerId,table.draftId)]);
