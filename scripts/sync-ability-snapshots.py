from __future__ import annotations

from pathlib import Path
import re

TEST_PATH = Path("tests/arc-pong-audit.cjs")


def replace_wait_predicate(text: str, scenario: str) -> str:
    published_message = f"{scenario} scenario did not publish restored energy"
    if published_message in text:
        return text

    old_message = f"{scenario} scenario did not enter play"
    pattern = re.compile(
        r"await waitState\(\s*"
        r"page,\s*"
        r"\(\) => window\.__ARC_PONG_DIAGNOSTICS__\?\.state === 'play',\s*"
        + re.escape(f"`${{engine}}: {old_message}`")
        + r",\s*"
        r"\);",
        re.MULTILINE,
    )

    replacement = f"""await waitState(
      page,
      () => {{
        const diagnostics = window.__ARC_PONG_DIAGNOSTICS__;
        return diagnostics?.state === 'play' && diagnostics.player.energy >= 99;
      }},
      `${{engine}}: {published_message}`,
    );"""

    updated, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        raise RuntimeError(f"Could not find the {scenario} wait predicate")
    return updated


def main() -> None:
    text = TEST_PATH.read_text(encoding="utf-8")
    text = replace_wait_predicate(text, "dash")
    text = replace_wait_predicate(text, "shield")

    old_message = "`${engine}: dash energy delta was too small`,"
    new_message = (
        "`${engine}: dash energy delta was too small "
        "(${dashEnergyBefore} -> ${dashEnergyAfter})`,"
    )
    if new_message not in text:
        if old_message not in text:
            raise RuntimeError("Could not find the Dash energy diagnostic message")
        text = text.replace(old_message, new_message, 1)

    TEST_PATH.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
