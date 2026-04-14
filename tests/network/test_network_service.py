# tests/network/test_network_service.py
import json
import pytest
from unittest.mock import patch, MagicMock
from tests.network.conftest import TARGET_A, TARGET_B, TARGET_C
from services.network_service import analyse_network

MOCK_RESPONSE = [
    {
        "pair_index": 0,
        "edges": [
            {
                "edge_type": "supply_chain",
                "strength": 0.8,
                "description": "Both supply automotive OEMs in southern Germany"
            },
            {
                "edge_type": "geographic",
                "strength": 0.6,
                "description": "Both in Baden-Württemberg / Bavaria corridor"
            }
        ]
    },
    {
        "pair_index": 1,
        "edges": []
    },
    {
        "pair_index": 2,
        "edges": [
            {
                "edge_type": "industry",
                "strength": 0.4,
                "description": "Adjacent manufacturing sectors"
            }
        ]
    }
]


def make_mock_client(response_json):
    mock_msg = MagicMock()
    mock_msg.content = [MagicMock(text=json.dumps(response_json))]
    mock_client = MagicMock()
    mock_client.messages.create.return_value = mock_msg
    return mock_client


@pytest.mark.asyncio
async def test_returns_edges_for_related_pairs():
    with patch("services.network_service.client", make_mock_client(MOCK_RESPONSE)):
        edges = await analyse_network([TARGET_A, TARGET_B, TARGET_C], "Automotive Roll-up")
    assert len(edges) == 3  # 2 from pair 0, 0 from pair 1, 1 from pair 2


@pytest.mark.asyncio
async def test_edge_fields_present():
    with patch("services.network_service.client", make_mock_client(MOCK_RESPONSE)):
        edges = await analyse_network([TARGET_A, TARGET_B, TARGET_C], "Test")
    for edge in edges:
        assert "source_target_id" in edge
        assert "dest_target_id" in edge
        assert "edge_type" in edge
        assert "strength" in edge
        assert "description" in edge


@pytest.mark.asyncio
async def test_source_dest_ids_come_from_targets():
    with patch("services.network_service.client", make_mock_client(MOCK_RESPONSE)):
        edges = await analyse_network([TARGET_A, TARGET_B, TARGET_C], "Test")
    supply_edge = next(e for e in edges if e["edge_type"] == "supply_chain")
    assert supply_edge["source_target_id"] == TARGET_A["id"]
    assert supply_edge["dest_target_id"] == TARGET_B["id"]


@pytest.mark.asyncio
async def test_fewer_than_two_targets_returns_empty():
    edges = await analyse_network([TARGET_A], "Test")
    assert edges == []


@pytest.mark.asyncio
async def test_empty_pairs_not_included():
    with patch("services.network_service.client", make_mock_client(MOCK_RESPONSE)):
        edges = await analyse_network([TARGET_A, TARGET_B, TARGET_C], "Test")
    # pair_index 1 = A vs C — should have no edges
    a_c_edges = [
        e for e in edges
        if e["source_target_id"] == TARGET_A["id"]
        and e["dest_target_id"] == TARGET_C["id"]
    ]
    assert len(a_c_edges) == 0
