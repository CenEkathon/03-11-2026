import pytest

from strategy_compiler.skills.mapper import load_taxonomy


def pytest_configure(config):
    config.addinivalue_line(
        "markers", "slow: runs the real vacancy ETL on the full parquet (skipped if the file is absent)"
    )


@pytest.fixture(scope="session")
def taxonomy():
    return load_taxonomy()
