import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
ALLOW = ["read_file(*)", "write_file(*)", "read_url(*)", "execute_url(*)", "command(*)", "mcp(*)"]


class InstallerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.home = self.directory / "home"
        self.home.mkdir()
        self.env = {**os.environ, "HOME": str(self.home), "COLUMNS": "120"}
        self.cli = self.home / ".gemini" / "antigravity-cli" / "settings.json"
        self.config = self.home / ".gemini" / "config"

    def run_script(self, script):
        return subprocess.run(
            ["bash", str(script)], cwd=self.directory,
            env=self.env, text=True, capture_output=True,
        )

    def install(self, script):
        result = self.run_script(script)
        self.assertEqual(result.returncode, 0, result.stderr)

    def render(self, settings):
        rendered = subprocess.run(
            ["sh", "-c", settings["statusLine"]["command"]], input="{}",
            text=True, capture_output=True, env=self.env, cwd=self.directory,
        )
        self.assertEqual(rendered.returncode, 0, rendered.stderr)
        self.assertIn("Antigravity", rendered.stdout)
        self.assertIn("▱▱▱▱▱▱▱▱▱▱ 0", rendered.stdout)

    def test_standalone_installer_preserves_settings_and_is_repeat_safe(self):
        # Shell quoting is observable by executing the installed command, not by
        # requiring a particular command string.
        checkout = self.directory / "checkout with spaces ' and $dollars"
        checkout.mkdir()
        for name in ("setup-statusline.sh", "statusline.py"):
            shutil.copy2(ROOT / name, checkout / name)
        for existing in (False, True):
            with self.subTest(existing=existing):
                original = {}
                if existing:
                    original = {
                        "model": "Gemini 3.8 Flash (Low)",
                        "permissions": {"deny": ["write_file(.env)"]},
                        "statusLine": {"type": "command", "command": "old", "padding": 12},
                    }
                    self.cli.write_text(json.dumps(original))
                self.install(checkout / "setup-statusline.sh")
                first = self.cli.read_bytes()
                installed = json.loads(first)
                self.assertEqual(
                    {key: value for key, value in installed.items() if key != "statusLine"},
                    {key: value for key, value in original.items() if key != "statusLine"},
                )
                self.assertEqual(installed["statusLine"]["type"], "command")
                self.assertNotIn("padding", installed["statusLine"])
                self.render(installed)
                self.install(checkout / "setup-statusline.sh")
                self.assertEqual(self.cli.read_bytes(), first)
                self.assertEqual(self.cli.stat().st_mode & 0o777, 0o600)

    def test_full_installer_grants_every_permission_and_keeps_other_keys(self):
        self.cli.parent.mkdir(parents=True)
        self.cli.write_text(json.dumps({
            "trustedWorkspaces": ["/w"],
            "permissions": {"allow": ["command(git status)"], "deny": ["write_file(.env)"]},
        }))
        self.config.mkdir(parents=True)
        (self.config / "config.json").write_text(json.dumps({
            "plugins": {"swarm": {"enabled": True}},
            "userSettings": {"remoteControlHostname": "host"},
        }))
        self.install(ROOT / "setup-settings.sh")
        snapshot = {p: p.read_bytes() for p in (self.cli, self.config / "config.json")}

        cli = json.loads(snapshot[self.cli])
        self.render(cli)
        self.assertEqual(cli["toolPermission"], "always-proceed")
        self.assertEqual(cli["agentMode"], "accept-edits")
        self.assertIs(cli["allowNonWorkspaceAccess"], True)
        self.assertIs(cli["enableTerminalSandbox"], False)
        self.assertEqual(sorted(cli["permissions"]["allow"]), sorted(ALLOW + ["command(git status)"]))
        self.assertEqual(cli["permissions"]["deny"], ["write_file(.env)"])
        self.assertEqual(cli["trustedWorkspaces"], ["/w"])

        app = json.loads(snapshot[self.config / "config.json"])
        self.assertEqual(app["userSettings"]["permissionPreset"], "AGENT_PERMISSION_PRESET_TURBO")
        self.assertEqual(app["userSettings"]["remoteControlHostname"], "host")
        self.assertEqual(app["plugins"], {"swarm": {"enabled": True}, "laimk": {"enabled": True}})

        link = self.config / "plugins" / "laimk"
        self.assertEqual(link.resolve(), ROOT / "plugins" / "laimk")
        self.assertTrue((link / "plugin.json").is_file())

        self.install(ROOT / "setup-settings.sh")
        for path, content in snapshot.items():
            self.assertEqual(path.read_bytes(), content, path)
        self.assertEqual(link.resolve(), ROOT / "plugins" / "laimk")

    def test_full_installer_refuses_to_replace_a_real_plugin_directory(self):
        (self.config / "plugins" / "laimk").mkdir(parents=True)
        result = self.run_script(ROOT / "setup-settings.sh")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not a symlink", result.stderr)


if __name__ == "__main__":
    unittest.main()
