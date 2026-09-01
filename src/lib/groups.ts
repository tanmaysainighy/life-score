import { randomUUID, randomBytes } from "node:crypto";
import { get, run, transaction } from "./db";
import { slugify } from "./text";
import { invalidate } from "./cache";

/**
 * Group membership and permissions. Every mutation checks the caller's role —
 * routes never assume the client told the truth about who it is.
 */

export type GroupResult = { ok: true; id: string; inviteCode: string } | { ok: false; error: string };

export async function createGroup(
  ownerId: string, name: string, description = "", emoji = "🏆",
): Promise<GroupResult> {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return { ok: false, error: "Group names are 2–40 characters." };

  const count = (await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM group_members WHERE user_id = ?`, ownerId,
  ))?.n ?? 0;
  if (count >= 20) return { ok: false, error: "You're in the maximum number of groups (20)." };

  const id = `GRP_${randomUUID()}`;
  const inviteCode = randomBytes(4).toString("hex").toUpperCase();
  const now = new Date().toISOString();

  // Slugs are unique; append a short suffix rather than failing on collision.
  let slug = slugify(trimmed);
  if (await get(`SELECT 1 FROM groups WHERE slug = ?`, slug)) {
    slug = `${slug}-${inviteCode.slice(0, 4).toLowerCase()}`;
  }

  await transaction(async () => {
    await run(
      `INSERT INTO groups (id, name, slug, description, invite_code, owner_id, emoji, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id, trimmed, slug, description.slice(0, 200), inviteCode, ownerId, emoji, now,
    );
    await run(
      `INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)`,
      id, ownerId, now,
    );
  });

  invalidate(`groups:${ownerId}`);
  return { ok: true, id, inviteCode };
}

export async function joinGroup(userId: string, inviteCode: string): Promise<GroupResult> {
  const group = await get<{ id: string; invite_code: string }>(
    `SELECT id, invite_code FROM groups WHERE invite_code = ?`, inviteCode.trim().toUpperCase(),
  );
  if (!group) return { ok: false, error: "That invite code doesn't match any group." };

  if (await get(`SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?`, group.id, userId)) {
    return { ok: true, id: group.id, inviteCode: group.invite_code };
  }

  await run(
    `INSERT INTO group_members (group_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)`,
    group.id, userId, new Date().toISOString(),
  );
  invalidate(`groups:${userId}`);
  invalidate(`lb:${group.id}`);
  return { ok: true, id: group.id, inviteCode: group.invite_code };
}

export async function leaveGroup(
  userId: string, groupId: string,
): Promise<{ ok: boolean; error?: string }> {
  const membership = await get<{ role: string }>(
    `SELECT role FROM group_members WHERE group_id = ? AND user_id = ?`, groupId, userId,
  );
  if (!membership) return { ok: false, error: "You're not in that group." };

  if (membership.role === "owner") {
    // Hand ownership to the longest-standing member, or delete an empty group.
    const successor = await get<{ user_id: string }>(
      `SELECT user_id FROM group_members
        WHERE group_id = ? AND user_id != ? ORDER BY joined_at ASC LIMIT 1`,
      groupId, userId,
    );
    if (!successor) {
      await run(`DELETE FROM groups WHERE id = ?`, groupId);
      invalidate(`groups:${userId}`);
      return { ok: true };
    }
    await transaction(async () => {
      await run(`UPDATE groups SET owner_id = ? WHERE id = ?`, successor.user_id, groupId);
      await run(`UPDATE group_members SET role = 'owner' WHERE group_id = ? AND user_id = ?`, groupId, successor.user_id);
      await run(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`, groupId, userId);
    });
  } else {
    await run(`DELETE FROM group_members WHERE group_id = ? AND user_id = ?`, groupId, userId);
  }

  invalidate(`groups:${userId}`);
  invalidate(`lb:${groupId}`);
  return { ok: true };
}
