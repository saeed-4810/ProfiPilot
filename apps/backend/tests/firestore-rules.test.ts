/**
 * Firestore Security Rules — Structural Validation + Emulator Integration Tests
 *
 * This file contains two test suites:
 *
 * 1. **Structural validation** (always runs): Verifies the firestore.rules file
 *    exists, is well-formed, and contains the expected per-collection rules
 *    matching ADR-004 and database-schema.md requirements.
 *
 * 2. **Emulator integration** (runs when Firestore emulator is available):
 *    Uses @firebase/rules-unit-testing to verify actual rule enforcement
 *    against the emulator. Skipped when emulator is not running.
 *
 * To run emulator tests locally:
 *   1. Install firebase-tools: npm install -g firebase-tools
 *   2. Start emulator: firebase emulators:start --only firestore
 *   3. Run tests: pnpm --filter @prefpilot/backend test
 *
 * Scenario IDs:
 *   T-SEC-001: Rules file exists and is parseable
 *   T-SEC-002: Deny-by-default rule present
 *   T-SEC-003: Per-collection rules defined for all collections
 *   T-SEC-004: Users collection — owner-only access
 *   T-SEC-005: Projects collection — ownerId-based access
 *   T-SEC-006: Projects/urls subcollection — inherits project ownership
 *   T-SEC-007: Audits collection — read by owner, write denied
 *   T-SEC-008: Recommendations — read by audit owner, write denied
 *   T-SEC-009: Summaries — read by audit owner, write denied
 *   T-SEC-010: Exports — read by owner, write denied
 *   T-SEC-011: Unauthenticated access denied for all collections
 *   T-SEC-012: Admin SDK (withSecurityRulesDisabled) can write to all collections
 *   T-SEC-013: Authenticated user cannot read other users' projects
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { RulesTestEnvironment } from "@firebase/rules-unit-testing";
import type { DocumentReference, DocumentData, DocumentSnapshot } from "firebase/firestore";

// ─── Structural Validation (no emulator required) ──────────────────────────

const RULES_PATH = resolve(import.meta.dirname, "../../../firestore.rules");
const INDEXES_PATH = resolve(import.meta.dirname, "../../../firestore.indexes.json");

describe("Firestore rules — structural validation", () => {
  let rulesContent: string;

  beforeAll(() => {
    rulesContent = readFileSync(RULES_PATH, "utf8");
  });

  // T-SEC-001
  it("firestore.rules file exists and is non-empty", () => {
    expect(existsSync(RULES_PATH)).toBe(true);
    expect(rulesContent.length).toBeGreaterThan(0);
  });

  // T-SEC-001
  it("starts with rules_version declaration", () => {
    expect(rulesContent).toMatch(/^rules_version\s*=\s*'2';/);
  });

  // T-SEC-001
  it("contains service cloud.firestore block", () => {
    expect(rulesContent).toContain("service cloud.firestore");
    expect(rulesContent).toContain("match /databases/{database}/documents");
  });

  // T-SEC-002
  it("contains explicit deny-by-default rule", () => {
    expect(rulesContent).toContain("match /{document=**}");
    expect(rulesContent).toMatch(/allow read, write: if false;/);
  });

  // T-SEC-003
  it("defines rules for all required collections", () => {
    const requiredCollections = [
      "match /users/{userId}",
      "match /projects/{projectId}",
      "match /urls/{urlId}",
      "match /audits/{auditId}",
      "match /recommendations/{recommendationId}",
      "match /summaries/{summaryId}",
      "match /exports/{exportId}",
    ];

    for (const collection of requiredCollections) {
      expect(rulesContent).toContain(collection);
    }
  });

  // T-SEC-004
  it("users collection uses uid-based ownership check", () => {
    // Users collection should check request.auth.uid == userId
    expect(rulesContent).toMatch(/match \/users\/\{userId\}/);
    expect(rulesContent).toContain("isOwner(userId)");
  });

  // T-SEC-005
  it("projects collection uses ownerId-based access control", () => {
    expect(rulesContent).toMatch(/match \/projects\/\{projectId\}/);
    expect(rulesContent).toContain("resource.data.ownerId == request.auth.uid");
    expect(rulesContent).toContain("request.resource.data.ownerId == request.auth.uid");
  });

  // T-SEC-006
  it("urls subcollection inherits project ownership via get()", () => {
    expect(rulesContent).toContain("match /urls/{urlId}");
    // Should use get() to check parent project ownership
    expect(rulesContent).toMatch(
      /get\(\/databases\/\$\(database\)\/documents\/projects\/\$\(projectId\)\)/
    );
  });

  // T-SEC-007
  it("audits collection allows read by owner and denies client writes", () => {
    // Read: uid match
    expect(rulesContent).toContain("resource.data.uid == request.auth.uid");
    // Write: denied for client (Admin SDK bypasses rules)
    const auditsSection = rulesContent.slice(
      rulesContent.indexOf("match /audits/{auditId}"),
      rulesContent.indexOf("match /recommendations/")
    );
    expect(auditsSection).toContain("allow write: if false");
  });

  // T-SEC-008, T-SEC-009
  it("recommendations and summaries use cross-document audit ownership check", () => {
    // Both should use get() to look up the audit's uid
    const recsSection = rulesContent.slice(
      rulesContent.indexOf("match /recommendations/"),
      rulesContent.indexOf("match /summaries/")
    );
    expect(recsSection).toContain(
      "get(/databases/$(database)/documents/audits/$(resource.data.auditId))"
    );
    expect(recsSection).toContain("allow write: if false");

    const summariesSection = rulesContent.slice(
      rulesContent.indexOf("match /summaries/"),
      rulesContent.indexOf("match /exports/")
    );
    expect(summariesSection).toContain(
      "get(/databases/$(database)/documents/audits/$(resource.data.auditId))"
    );
    expect(summariesSection).toContain("allow write: if false");
  });

  // T-SEC-010
  it("exports collection allows read by owner and denies client writes", () => {
    const exportsSection = rulesContent.slice(rulesContent.indexOf("match /exports/"));
    expect(exportsSection).toContain("resource.data.uid == request.auth.uid");
    expect(exportsSection).toContain("allow write: if false");
  });

  it("defines isAuthenticated helper function", () => {
    expect(rulesContent).toContain("function isAuthenticated()");
    expect(rulesContent).toContain("return request.auth != null");
  });

  it("defines isOwner helper function", () => {
    expect(rulesContent).toContain("function isOwner(userId)");
    expect(rulesContent).toContain("isAuthenticated()");
    expect(rulesContent).toContain("request.auth.uid == userId");
  });
});

// ─── Composite Indexes Validation ──────────────────────────────────────────

describe("Firestore indexes — structural validation", () => {
  let indexesContent: Record<string, unknown>;

  beforeAll(() => {
    const raw = readFileSync(INDEXES_PATH, "utf8");
    indexesContent = JSON.parse(raw) as Record<string, unknown>;
  });

  it("firestore.indexes.json file exists and is valid JSON", () => {
    expect(existsSync(INDEXES_PATH)).toBe(true);
    expect(indexesContent).toBeDefined();
    expect(indexesContent).toHaveProperty("indexes");
    expect(indexesContent).toHaveProperty("fieldOverrides");
  });

  it("contains projects composite index (ownerId ASC, createdAt DESC)", () => {
    const indexes = indexesContent["indexes"] as Array<{
      collectionGroup: string;
      queryScope: string;
      fields: Array<{ fieldPath: string; order: string }>;
    }>;

    const projectIndex = indexes.find(
      (idx) =>
        idx.collectionGroup === "projects" &&
        idx.fields.length === 2 &&
        idx.fields[0]?.fieldPath === "ownerId" &&
        idx.fields[0]?.order === "ASCENDING" &&
        idx.fields[1]?.fieldPath === "createdAt" &&
        idx.fields[1]?.order === "DESCENDING"
    );

    expect(projectIndex).toBeDefined();
    expect(projectIndex?.queryScope).toBe("COLLECTION");
  });

  it("contains audits composite index for user history (uid ASC, createdAt DESC)", () => {
    const indexes = indexesContent["indexes"] as Array<{
      collectionGroup: string;
      queryScope: string;
      fields: Array<{ fieldPath: string; order: string }>;
    }>;

    const auditUserIndex = indexes.find(
      (idx) =>
        idx.collectionGroup === "audits" &&
        idx.fields.length === 2 &&
        idx.fields[0]?.fieldPath === "uid" &&
        idx.fields[0]?.order === "ASCENDING" &&
        idx.fields[1]?.fieldPath === "createdAt" &&
        idx.fields[1]?.order === "DESCENDING"
    );

    expect(auditUserIndex).toBeDefined();
    expect(auditUserIndex?.queryScope).toBe("COLLECTION");
  });

  it("contains audits composite index for worker job pickup (status ASC, createdAt ASC)", () => {
    const indexes = indexesContent["indexes"] as Array<{
      collectionGroup: string;
      queryScope: string;
      fields: Array<{ fieldPath: string; order: string }>;
    }>;

    const auditWorkerIndex = indexes.find(
      (idx) =>
        idx.collectionGroup === "audits" &&
        idx.fields.length === 2 &&
        idx.fields[0]?.fieldPath === "status" &&
        idx.fields[0]?.order === "ASCENDING" &&
        idx.fields[1]?.fieldPath === "createdAt" &&
        idx.fields[1]?.order === "ASCENDING"
    );

    expect(auditWorkerIndex).toBeDefined();
    expect(auditWorkerIndex?.queryScope).toBe("COLLECTION");
  });

  it("has exactly 3 composite indexes", () => {
    const indexes = indexesContent["indexes"] as unknown[];
    expect(indexes).toHaveLength(3);
  });
});

// ─── Firebase Config Validation ────────────────────────────────────────────

describe("Firebase config — emulator setup", () => {
  const FIREBASE_JSON_PATH = resolve(import.meta.dirname, "../../../firebase.json");

  let firebaseConfig: Record<string, unknown>;

  beforeAll(() => {
    const raw = readFileSync(FIREBASE_JSON_PATH, "utf8");
    firebaseConfig = JSON.parse(raw) as Record<string, unknown>;
  });

  it("firebase.json exists and references firestore.rules", () => {
    expect(existsSync(FIREBASE_JSON_PATH)).toBe(true);
    const firestore = firebaseConfig["firestore"] as Record<string, string>;
    expect(firestore["rules"]).toBe("firestore.rules");
    expect(firestore["indexes"]).toBe("firestore.indexes.json");
  });

  it("configures Firestore emulator on port 8080", () => {
    const emulators = firebaseConfig["emulators"] as Record<string, Record<string, unknown>>;
    expect(emulators).toBeDefined();
    expect(emulators["firestore"]).toBeDefined();
    expect(emulators["firestore"]?.["port"]).toBe(8080);
    expect(emulators["firestore"]?.["host"]).toBe("127.0.0.1");
  });

  it("configures Auth emulator on port 9099", () => {
    const emulators = firebaseConfig["emulators"] as Record<string, Record<string, unknown>>;
    expect(emulators["auth"]).toBeDefined();
    expect(emulators["auth"]?.["port"]).toBe(9099);
    expect(emulators["auth"]?.["host"]).toBe("127.0.0.1");
  });

  it("enables emulator UI on port 4000", () => {
    const emulators = firebaseConfig["emulators"] as Record<string, Record<string, unknown>>;
    expect(emulators["ui"]).toBeDefined();
    expect(emulators["ui"]?.["enabled"]).toBe(true);
    expect(emulators["ui"]?.["port"]).toBe(4000);
  });
});

// ─── Emulator Integration Tests ────────────────────────────────────────────
// These tests require the Firestore emulator to be running.
// Start with: firebase emulators:start --only firestore
// They are skipped when the emulator is not available.

/**
 * Check if the Firestore emulator is running by attempting a connection.
 * Returns true if the emulator responds, false otherwise.
 */
async function isEmulatorRunning(): Promise<boolean> {
  try {
    const response = await fetch("http://127.0.0.1:8080/", {
      signal: AbortSignal.timeout(1000),
    });
    return response.ok || response.status === 200 || response.status === 404;
  } catch {
    return false;
  }
}

// Conditionally run emulator tests
const emulatorAvailable = await isEmulatorRunning();
const describeEmulator = emulatorAvailable ? describe : describe.skip;

describeEmulator("Firestore rules — emulator integration", () => {
  // Function references assigned via dynamic import in beforeAll
  let rutAssertSucceeds: (pr: Promise<unknown>) => Promise<unknown>;
  let rutAssertFails: (pr: Promise<unknown>) => Promise<unknown>;
  let fsDoc: (...args: unknown[]) => DocumentReference<DocumentData, DocumentData>;
  let fsGetDoc: (ref: DocumentReference) => Promise<DocumentSnapshot<DocumentData, DocumentData>>;
  let fsSetDoc: (ref: DocumentReference, data: DocumentData) => Promise<void>;
  let fsDeleteDoc: (ref: DocumentReference) => Promise<void>;

  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    // Dynamic imports — assigned to local refs to avoid typeof import() lint errors
    const rut = await import("@firebase/rules-unit-testing");
    rutAssertSucceeds = rut.assertSucceeds;
    rutAssertFails = rut.assertFails;

    const firestore = await import("firebase/firestore");
    fsDoc = firestore.doc as typeof fsDoc;
    fsGetDoc = firestore.getDoc as typeof fsGetDoc;
    fsSetDoc = firestore.setDoc as typeof fsSetDoc;
    fsDeleteDoc = firestore.deleteDoc as typeof fsDeleteDoc;

    testEnv = await rut.initializeTestEnvironment({
      projectId: "demo-prefpilot-rules-test",
      firestore: {
        rules: readFileSync(RULES_PATH, "utf8"),
        host: "127.0.0.1",
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    await testEnv?.cleanup();
  });

  afterEach(async () => {
    await testEnv?.clearFirestore();
  });

  // ─── Helper: Seed data via admin bypass ───
  async function seedData(path: string, data: Record<string, unknown>): Promise<void> {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await fsSetDoc(fsDoc(db, path), data);
    });
  }

  // T-SEC-011: Unauthenticated access denied
  describe("Unauthenticated access", () => {
    it("cannot read users collection", async () => {
      await seedData("users/alice", { name: "Alice", email: "alice@test.com" });
      const unauthed = testEnv.unauthenticatedContext();
      await rutAssertFails(fsGetDoc(fsDoc(unauthed.firestore(), "users", "alice")));
    });

    it("cannot write to users collection", async () => {
      const unauthed = testEnv.unauthenticatedContext();
      await rutAssertFails(
        fsSetDoc(fsDoc(unauthed.firestore(), "users", "hacker"), { name: "Hacker" })
      );
    });

    it("cannot read projects collection", async () => {
      await seedData("projects/proj-1", { ownerId: "alice", name: "Test" });
      const unauthed = testEnv.unauthenticatedContext();
      await rutAssertFails(fsGetDoc(fsDoc(unauthed.firestore(), "projects", "proj-1")));
    });

    it("cannot read audits collection", async () => {
      await seedData("audits/audit-1", { uid: "alice", url: "https://example.com" });
      const unauthed = testEnv.unauthenticatedContext();
      await rutAssertFails(fsGetDoc(fsDoc(unauthed.firestore(), "audits", "audit-1")));
    });
  });

  // T-SEC-004: Users collection — owner-only
  describe("Users collection — authenticated access", () => {
    it("authenticated user can read own profile", async () => {
      await seedData("users/alice", { name: "Alice", email: "alice@test.com" });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertSucceeds(fsGetDoc(fsDoc(alice.firestore(), "users", "alice")));
    });

    it("authenticated user can write own profile", async () => {
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertSucceeds(
        fsSetDoc(fsDoc(alice.firestore(), "users", "alice"), {
          name: "Alice",
          email: "alice@test.com",
        })
      );
    });

    it("authenticated user cannot read another user's profile", async () => {
      await seedData("users/bob", { name: "Bob", email: "bob@test.com" });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertFails(fsGetDoc(fsDoc(alice.firestore(), "users", "bob")));
    });

    it("authenticated user cannot write to another user's profile", async () => {
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertFails(
        fsSetDoc(fsDoc(alice.firestore(), "users", "bob"), { name: "Impersonator" })
      );
    });
  });

  // T-SEC-005: Projects collection — ownerId-based
  describe("Projects collection — authenticated access", () => {
    it("owner can read own project", async () => {
      await seedData("projects/proj-1", {
        ownerId: "alice",
        name: "My Project",
        createdAt: "2026-01-01T00:00:00Z",
      });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertSucceeds(fsGetDoc(fsDoc(alice.firestore(), "projects", "proj-1")));
    });

    it("owner can create a project with own ownerId", async () => {
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertSucceeds(
        fsSetDoc(fsDoc(alice.firestore(), "projects", "proj-new"), {
          ownerId: "alice",
          name: "New Project",
          createdAt: "2026-01-01T00:00:00Z",
        })
      );
    });

    // T-SEC-013
    it("authenticated user cannot read another user's project", async () => {
      await seedData("projects/proj-1", {
        ownerId: "bob",
        name: "Bob's Project",
        createdAt: "2026-01-01T00:00:00Z",
      });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertFails(fsGetDoc(fsDoc(alice.firestore(), "projects", "proj-1")));
    });

    it("authenticated user cannot create project with another user's ownerId", async () => {
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertFails(
        fsSetDoc(fsDoc(alice.firestore(), "projects", "proj-evil"), {
          ownerId: "bob",
          name: "Stolen Project",
          createdAt: "2026-01-01T00:00:00Z",
        })
      );
    });

    it("owner can delete own project", async () => {
      await seedData("projects/proj-del", {
        ownerId: "alice",
        name: "Delete Me",
        createdAt: "2026-01-01T00:00:00Z",
      });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertSucceeds(fsDeleteDoc(fsDoc(alice.firestore(), "projects", "proj-del")));
    });
  });

  // T-SEC-006: URLs subcollection — inherits project ownership
  describe("Projects/urls subcollection — inherited access", () => {
    it("project owner can read urls in own project", async () => {
      await seedData("projects/proj-1", { ownerId: "alice", name: "Test" });
      await seedData("projects/proj-1/urls/url-1", {
        urlId: "url-1",
        projectId: "proj-1",
        url: "https://example.com",
        normalizedUrl: "https://example.com",
        addedAt: "2026-01-01T00:00:00Z",
      });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertSucceeds(
        fsGetDoc(fsDoc(alice.firestore(), "projects", "proj-1", "urls", "url-1"))
      );
    });

    it("non-owner cannot read urls in another user's project", async () => {
      await seedData("projects/proj-1", { ownerId: "bob", name: "Bob's Project" });
      await seedData("projects/proj-1/urls/url-1", {
        urlId: "url-1",
        projectId: "proj-1",
        url: "https://example.com",
        normalizedUrl: "https://example.com",
        addedAt: "2026-01-01T00:00:00Z",
      });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertFails(
        fsGetDoc(fsDoc(alice.firestore(), "projects", "proj-1", "urls", "url-1"))
      );
    });
  });

  // T-SEC-007: Audits — read by owner, write denied
  describe("Audits collection — restricted access", () => {
    it("owner can read own audit", async () => {
      await seedData("audits/audit-1", {
        uid: "alice",
        url: "https://example.com",
        status: "completed",
      });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertSucceeds(fsGetDoc(fsDoc(alice.firestore(), "audits", "audit-1")));
    });

    it("non-owner cannot read another user's audit", async () => {
      await seedData("audits/audit-1", {
        uid: "bob",
        url: "https://example.com",
        status: "completed",
      });
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertFails(fsGetDoc(fsDoc(alice.firestore(), "audits", "audit-1")));
    });

    it("authenticated user cannot write to audits (server-only)", async () => {
      const alice = testEnv.authenticatedContext("alice");
      await rutAssertFails(
        fsSetDoc(fsDoc(alice.firestore(), "audits", "audit-new"), {
          uid: "alice",
          url: "https://example.com",
          status: "queued",
        })
      );
    });
  });

  // T-SEC-012: Admin SDK can write to all collections
  describe("Admin SDK (withSecurityRulesDisabled) — full access", () => {
    it("can write to users collection", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await fsSetDoc(fsDoc(db, "users", "admin-created"), {
          name: "Admin User",
          email: "admin@test.com",
        });
        const snap = await fsGetDoc(fsDoc(db, "users", "admin-created"));
        expect(snap.exists()).toBe(true);
      });
    });

    it("can write to audits collection", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await fsSetDoc(fsDoc(db, "audits", "admin-audit"), {
          uid: "alice",
          url: "https://example.com",
          status: "queued",
        });
        const snap = await fsGetDoc(fsDoc(db, "audits", "admin-audit"));
        expect(snap.exists()).toBe(true);
      });
    });

    it("can write to recommendations collection", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await fsSetDoc(fsDoc(db, "recommendations", "rec-1"), {
          auditId: "audit-1",
          ruleId: "CWV-LCP-001",
          metric: "lcp",
        });
        const snap = await fsGetDoc(fsDoc(db, "recommendations", "rec-1"));
        expect(snap.exists()).toBe(true);
      });
    });

    it("can write to summaries collection", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await fsSetDoc(fsDoc(db, "summaries", "sum-1"), {
          auditId: "audit-1",
          modelVersion: "gpt-4o",
        });
        const snap = await fsGetDoc(fsDoc(db, "summaries", "sum-1"));
        expect(snap.exists()).toBe(true);
      });
    });

    it("can write to exports collection", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await fsSetDoc(fsDoc(db, "exports", "exp-1"), {
          uid: "alice",
          format: "pdf",
        });
        const snap = await fsGetDoc(fsDoc(db, "exports", "exp-1"));
        expect(snap.exists()).toBe(true);
      });
    });
  });
});
