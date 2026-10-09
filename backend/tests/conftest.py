import os

import pytest

os.environ.setdefault("APP_MODE", "test")


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    if os.environ.get("RUN_FOUNDRY_SMOKE") == "1":
        return
    skip_cloud = pytest.mark.skip(
        reason="cloud tests require RUN_FOUNDRY_SMOKE=1 after Azure CLI login"
    )
    for item in items:
        if "cloud" in item.keywords:
            item.add_marker(skip_cloud)
