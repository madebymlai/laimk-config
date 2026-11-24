import { it } from "node:test";
import assert from "node:assert/strict";
import bashGuard from "../index.ts";
import { createMockContext, createMockExtensionApi } from "../../interactive-subagents/test/support/mock-extension-api.ts";

function setup(enabled = false) {
  const mock = createMockExtensionApi();
  mock.api.registerFlag = () => {};
  mock.api.getFlag = (name: string) => name === "bash-guard-enabled" ? enabled : false;
  const ui = createMockContext();
  bashGuard(mock.api);
  const status = () => ui.statuses.filter(entry => entry.key.trim() === "bash-guard").at(-1)?.value;
  return { ...mock, ...ui, status };
}

it("publishes an enabled BG status when explicitly enabled at startup", async () => {
  const fixture = setup(true);
  await fixture.emit("session_start", { reason: "startup" }, fixture.ctx);
  assert.equal(fixture.status(), "BG ON");
});

it("publishes plain BG OFF text by default", async () => {
  const fixture = setup();
  await fixture.emit("session_start", { reason: "startup" }, fixture.ctx);
  assert.equal(String(fixture.status()).trim(), "BG OFF");
});

it("keeps the BG status published when the guard is re-enabled", async () => {
  const fixture = setup();
  await fixture.emit("session_start", { reason: "startup" }, fixture.ctx);
  const command = fixture.registeredCommands.find(command => command.name === "bash-guard")!;
  await command.handler("", fixture.ctx);
  assert.equal(fixture.status(), "BG ON");
  await command.handler("", fixture.ctx);
  assert.equal(String(fixture.status()).trim(), "BG OFF");
});
