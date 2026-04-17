"""Tests for officer network detection service."""
import pytest
from unittest.mock import MagicMock
from services.officer_network import detect_officer_network, _normalize, _last_name


def test_normalize_strips_honorifics():
    assert _normalize("Dr. Hans Müller") == "hans muller"
    assert _normalize("Prof. Thomas Wagner") == "thomas wagner"
    assert _normalize("Dipl.-Ing. Klaus Weber") == "klaus weber"


def test_normalize_strips_accents():
    assert _normalize("Hans Müller") == "hans muller"
    assert _normalize("Jörg Köhler") == "jorg kohler"


def test_last_name_extraction():
    assert _last_name("hans muller") == "muller"
    assert _last_name("muller") == "muller"


@pytest.mark.asyncio
async def test_detect_shared_officer():
    """Two targets with same director → shared officer found."""
    mock_db = _make_mock_db([
        {"id": "t1", "name": "Müller GmbH", "directors": ["Hans Müller"], "director_roles": [{"name": "Hans Müller", "role": "Geschäftsführer"}]},
        {"id": "t2", "name": "Müller Bau GmbH", "directors": ["Hans Müller"], "director_roles": [{"name": "Hans Müller", "role": "Inhaber"}]},
    ])
    result = await detect_officer_network("tenant-1", mock_db)
    assert result["stats"]["shared_officers_found"] == 1
    assert result["shared_officers"][0]["officer_name"] == "Hans Müller"
    assert len(result["shared_officers"][0]["targets"]) == 2


@pytest.mark.asyncio
async def test_detect_family_cluster():
    """Two targets with same last name (non-common) → family cluster found."""
    mock_db = _make_mock_db([
        {"id": "t1", "name": "Alpha GmbH", "directors": ["Hans Baumann"], "director_roles": []},
        {"id": "t2", "name": "Beta GmbH", "directors": ["Klaus Baumann"], "director_roles": []},
    ])
    result = await detect_officer_network("tenant-1", mock_db)
    assert result["stats"]["family_clusters_found"] == 1
    assert result["family_name_clusters"][0]["family_name"] == "Baumann"


@pytest.mark.asyncio
async def test_common_surname_excluded_from_family():
    """Schmidt is excluded from family clustering."""
    mock_db = _make_mock_db([
        {"id": "t1", "name": "Alpha GmbH", "directors": ["Hans Schmidt"], "director_roles": []},
        {"id": "t2", "name": "Beta GmbH", "directors": ["Klaus Schmidt"], "director_roles": []},
    ])
    result = await detect_officer_network("tenant-1", mock_db)
    assert result["stats"]["family_clusters_found"] == 0


@pytest.mark.asyncio
async def test_no_directors_returns_empty():
    mock_db = _make_mock_db([])
    result = await detect_officer_network("tenant-1", mock_db)
    assert result["stats"]["shared_officers_found"] == 0
    assert result["stats"]["total_targets_with_directors"] == 0


def _make_mock_db(targets: list):
    mock_result = MagicMock()
    mock_result.data = targets
    chain = MagicMock()
    chain.execute = MagicMock(return_value=mock_result)
    chain.eq = MagicMock(return_value=chain)
    chain.is_ = MagicMock(return_value=chain)
    chain.not_ = MagicMock(return_value=chain)
    chain.select = MagicMock(return_value=chain)
    # Handle not_.is_ chaining
    chain.not_.is_ = MagicMock(return_value=chain)
    mock_db = MagicMock()
    mock_db.table = MagicMock(return_value=chain)
    return mock_db
