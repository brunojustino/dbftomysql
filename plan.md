# Production Hardening Plan - DBF to MySQL Sync App

## Context
- Single-tenant per deployment (one cliente per app instance)
- 30 clients total, API key for authentication
- 1-2 week timeline, security is critical
- Small data volume (<10K records)
- Local file logging only
- Existing dependencies: axios, mysql2, electron-log, electron-store, dbffile

## TL;DR
Fix 8 critical security/stability issues within 1-2 weeks using existing dependencies.
Priority: SQL injection → clientId validation → error handling → logging consolidation.

## Phase 1: Critical Security (Week 1)

### Step 1.1: SQL Injection Prevention
- [ ] CreateTable.js: Implement table name whitelist validation
- [ ] CreateTable.js: Validate column names against DBF schema
- [ ] UpsertQuery.js: Validate tableName before queries
- [ ] Use backticks + parameterized queries (mysql2 supports this)
- Files: src/db/CreateTable.js, src/db/UpsertQuery.js, src/db/TableNames.js

### Step 1.2: API Key Validation & clientId Binding
- [ ] main.js: Remove console.log of API keys
- [ ] main.js: Add request timeout (5000ms) to axios.get in validate-api-key
- [ ] main.js: Store API key hash (not plaintext) - use crypto.createHash
- [ ] InsertQuery.js: Verify clientId from request matches authenticated session
- [ ] Add HTTPS certificate pinning for API endpoint
- Files: src/main.js, src/db/InsertQuery.js

### Step 1.3: Transaction Support for Batch Operations
- [ ] InsertTable.js: Wrap batch inserts in transactions (START TRANSACTION / COMMIT / ROLLBACK)
- [ ] Add rollback on error with detailed error logging
- [ ] Files: src/db/InsertTable.js

### Step 1.4: Prevent Concurrent Syncs
- [ ] main.js: Add global isSyncing flag to prevent multiple migrations
- [ ] Return clear error to user if sync already in progress
- [ ] Files: src/main.js

## Phase 2: Error Handling & Robustness (Week 1-2)

### Step 2.1: Connection Pool Configuration
- [ ] db.js: Set queueLimit to reasonable value (100)
- [ ] Add connection timeout (30000ms)
- [ ] Add enableKeepAlive: true, keepAliveInitialDelayMs: 30000
- [ ] Files: src/db/db.js

### Step 2.2: Unified Error Handling
- [ ] main.js: Wrap each major operation in try-catch with detailed logging
- [ ] SyncHistory.js: Re-throw errors instead of swallowing them
- [ ] Add error context: query, parameters, table name, clientId (no sensitive data)
- [ ] Files: src/main.js, src/db/SyncHistory.js, all db/ files

### Step 2.3: Graceful Shutdown
- [ ] main.js: Add app.on('before-quit') to close DB pool
- [ ] Ensure in-flight operations complete or rollback
- [ ] Files: src/main.js

### Step 2.4: Input Validation
- [ ] renderer.js: Validate folder exists and is readable
- [ ] DbfFuncs.js: Validate DBF records have expected fields
- [ ] InsertQuery.js: Validate numeric fields don't overflow
- [ ] Files: src/renderer.js, src/util/DbfFuncs.js

## Phase 3: Logging Consolidation (Week 2)

### Step 3.1: Unified Logging Framework
- [ ] Replace console.log/console.error with electron-log
- [ ] Configure electron-log to write to AppData with rotation
- [ ] Remove LogError.js middleware, use electron-log instead
- [ ] Add log levels: error, warn, info, debug
- [ ] Files: src/util/logger.js (update), src/middleware/LogError.js (deprecate)

### Step 3.2: Add Structured Logging
- [ ] Log format: timestamp, level, operation, clientId, status, error
- [ ] Never log: API keys, passwords, sensitive data
- [ ] Files: src/main.js, src/services/*.js

## Phase 4: Data Quality & Consistency (Week 2)

### Step 4.1: Sync History Improvements
- [ ] Replace hash-based detection with (lastSync + rowCount + checksum)
- [ ] Track sync status per operation (started, in-progress, completed, failed)
- [ ] Files: src/db/SyncHistory.js

### Step 4.2: Conflict Detection Logging
- [ ] Expand sync_conflicts table to track resolution status
- [ ] Log conflicts with timestamps for manual review
- [ ] Files: src/db/SyncHistory.js

## Dependency Changes
- KEEP existing: axios, mysql2, electron-log, electron-store, dbffile
- OPTIONAL ADD: joi (schema validation) - can skip for now, use manual validation
- No breaking changes to existing dependencies

## Critical Files to Modify (in priority order)
1. src/db/CreateTable.js - SQL injection prevention
2. src/main.js - API validation, clientId binding, concurrency
3. src/db/InsertQuery.js - Input validation
4. src/db/db.js - Connection pool
5. src/db/InsertTable.js - Transactions
6. src/util/logger.js - Unified logging
7. src/db/SyncHistory.js - Error handling, sync tracking
8. src/services/SyncService.js, ReverseSyncService.js - Error context
9. src/renderer.js - Input validation
10. src/util/DbfFuncs.js - Record validation

## Testing Strategy
- [ ] Manual: Run app with invalid table names, test error handling
- [ ] Manual: Start migration twice, verify lock prevents concurrent sync
- [ ] Manual: Force DB connection failure, verify graceful shutdown
- [ ] Manual: Test with malformed DBF file
- [ ] Manual: Verify logs contain no API keys or credentials
- [ ] Check: All axios requests have timeout
- [ ] Check: All DB operations wrap in try-catch

## Success Criteria
1. No SQL injection vectors in code review
2. All API keys and credentials removed from logs
3. Transactions roll back on failure
4. App prevents concurrent syncs
5. Comprehensive error logging with stack traces
6. All axios requests have 5s timeout
7. Graceful shutdown on app close
8. Connection pool has bounded queue

## Estimated Effort
- Phase 1 (Security): 4-6 hours
- Phase 2 (Error Handling): 3-4 hours
- Phase 3 (Logging): 2-3 hours
- Phase 4 (Data Quality): 1-2 hours
- Testing: 1-2 hours
- **Total: 11-17 hours (1-2 weeks with part-time work)**

## Not Included (defer to later)
- Rate limiting on API validation (nice-to-have, can add later)
- Stream-based JSON export (not needed for <10K records)
- Comprehensive conflict resolution UI (log conflicts, manual resolution)
- Reverse sync optimization (keyset pagination not needed for small volumes)
- Monitoring/metrics infrastructure (add later if needed)
