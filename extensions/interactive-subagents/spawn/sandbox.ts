/**
 * What a child process is allowed to do, and how that gets onto its command
 * line.
 *
 * Subagents are default-deny: a child runs with `--no-extensions`, an explicit
 * `--tools` allowlist, and one `-e` per extension backing an allowed tool. The
 * consequence worth knowing is quiet — a tool named in `--tools` but backed by
 * no `-e` simply does not exist in the child, with nothing said about it — so
 * the tool-to-extension map and the allowlist have to agree, and they are kept
 * in one place for that reason.
 *
 * `sandboxArgs` is the single source of truth for reconstructing a sandbox. Both
 * the initial launch and the resume path go through it so the two can never
 * drift. It returns arguments rather than mutating a caller's array, so a test
 * can assert on a result without building a container for it first.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentConfigDir, paths } from "../paths.ts";
import type { SubagentLoadout } from "../store/loadout.ts";
import { shellEscape } from "./tmux.ts";

/**
 * Tools every subagent keeps regardless of how tightly its role restricts tools.
 * Backed by child/index.ts, which is loaded into every subagent session, so
 * granting these never widens which extensions a child loads.
 */
export const SUBAGENT_CONTROL_TOOLS = ["send_message"] as const;

/** Built-in tools pi provides natively — no extension needs to be loaded. */
const BUILTIN_TOOLS = new Set(["read", "write", "edit", "bash", "grep", "find", "ls"]);

/**
 * A filename-safe slug of a display name, for the artifact and script files
 * named after a subagent. `fallback` covers a name with no usable characters
 * at all (e.g. one that is entirely punctuation or CJK).
 *
 * It lives here because every file named after a subagent is a launch artifact,
 * and this module is where a launch is assembled.
 */
export function slugify(name: string, fallback = "subagent") {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || fallback;
}

/**
 * Map a tool name to its loadable extension file or builtin: specifier. Used to build the child's `--extension` whitelist after
 * `--no-extensions` disables global discovery. Returns undefined for built-in
 * tools and for unknown names (which simply won't be granted).
 */
export function getToolExtensionPath(tool: string): string | undefined {
  if (BUILTIN_TOOLS.has(tool)) return undefined;
  if (tool === "codemode") return "builtin:codemode";
  if (tool === "safe_bash") {
    const safeBash = paths.toolExtension("safe-bash.ts");
    return existsSync(safeBash) ? safeBash : undefined;
  }
  const map: Record<string, readonly string[]> = {
    web_search: ["web-search", "index.ts"],
    web_fetch: ["web-fetch", "index.ts"],
    video_extract: ["video-extract", "index.ts"],
    youtube_search: ["youtube-search", "index.ts"],
    google_image_search: ["google-image-search", "index.ts"],
  };
  // This extension is not necessarily installed under ~/.pi/agent. When it is
  // vendored into a config repo the extensions backing these tools sit beside
  // it, so look where this file actually lives before the agent dir.
  const segments = map[tool];
  if (segments) {
    for (const base of [paths.siblingExtensions, join(getAgentConfigDir(), "extensions")]) {
      const candidate = join(base, ...segments);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Build the child's `--tools` allowlist, or null to pass no restriction at all.
 *
 * pi applies `--tools` to built-in, extension and custom tools alike, so a role
 * that restricts itself to e.g. "read,bash,write" would otherwise hide the
 * control tools and leave a resumed or user-touched subagent unable to call
 * send_message. Those are added unconditionally.
 */
export function computeToolAllowlist(effectiveTools: string | undefined) {
  const requested = (effectiveTools ?? "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);

  // No explicit tool restriction → don't pass --tools at all (the child keeps
  // its default toolset).
  if (requested.length === 0) return null;

  const allow = new Set(requested);
  for (const tool of SUBAGENT_CONTROL_TOOLS) {
    allow.add(tool);
  }

  return [...allow].join(",");
}

/**
 * The command-line arguments that reconstruct a loadout's sandbox: model,
 * identity (written to a file under `artifactDir/context`), and the
 * default-deny tool/extension restriction.
 *
 * Env vars (PI_SUBAGENT_AGENT / PI_CODING_AGENT_DIR) and cwd stay the caller's
 * responsibility, since they differ between launch and resume. A null `toolAllowlist` means the spawn was intentionally unrestricted
 * (e.g. a fork clone) and is replayed as-is.
 */
export function sandboxArgs(
  loadout: SubagentLoadout,
  opts: { artifactDir: string; name: string },
) {
  const parts: string[] = [];

  if (loadout.model) {
    const model = loadout.thinking ? `${loadout.model}:${loadout.thinking}` : loadout.model;
    parts.push("--model", shellEscape(model));
  }

  if (loadout.identity) {
    const flag =
      loadout.systemPromptMode === "replace" ? "--system-prompt" : "--append-system-prompt";
    const spTimestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const spPath = join(
      opts.artifactDir,
      `context/${slugify(opts.name)}-sysprompt-${spTimestamp}.md`,
    );
    mkdirSync(dirname(spPath), { recursive: true });
    writeFileSync(spPath, loadout.identity, "utf8");
    parts.push(flag, shellEscape(spPath));
  }

  // Default-deny: disable global extension discovery and re-enable only the
  // extensions backing the whitelisted tools.
  if (loadout.toolAllowlist) {
    parts.push("--no-extensions");
    parts.push("--tools", shellEscape(loadout.toolAllowlist));

    const extPaths = new Set<string>();
    for (const tool of loadout.toolAllowlist.split(",")) {
      const extPath = tool === "cq_run" ? loadout.cqExtension : getToolExtensionPath(tool);
      if (extPath) extPaths.add(extPath);
    }
    for (const extPath of extPaths) {
      parts.push("-e", shellEscape(extPath));
    }
  }

  return parts;
}

/**
 * Build the positional prompt args for a Pi CLI subagent launch.
 *
 * In artifact-backed launches (lineage-only, standalone), Pi's
 * buildInitialMessage() concatenates @file content with messages[0] into one
 * initial prompt. That breaks /skill: expansion because the message no longer
 * starts with "/skill:". Only messages[1..] are sent as separate follow-up
 * prompts where /skill: is recognized. So when there are skill prompts AND
 * artifact-backed delivery, prepend an empty first positional message to push
 * the skill prompts into messages[1..].
 */
export function promptArgs(params: {
  effectiveSkills?: string;
  taskDelivery: "direct" | "artifact";
  taskArg: string;
}): string[] {
  const skillPrompts = (params.effectiveSkills ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((skill) => `/skill:${skill}`);

  const needsSeparator = params.taskDelivery === "artifact" && skillPrompts.length > 0;

  return [...(needsSeparator ? [""] : []), ...skillPrompts, params.taskArg];
}
