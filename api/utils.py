import json
import logging
from typing import Any

logger = logging.getLogger(__name__)

def flatten_for_mongo(d: dict, parent_key: str = '') -> dict:
    """
    Flattens a nested dictionary for use with MongoDB's $set operator.
    Ensures that updating a nested field doesn't overwrite the entire parent object.
    Preserves empty dictionaries.
    """
    items = []
    for k, v in d.items():
        new_key = parent_key + '.' + k if parent_key else k
        # Only flatten if it is a populated dictionary; preserve empty dicts {}
        if isinstance(v, dict) and v:
            items.extend(flatten_for_mongo(v, new_key).items())
        else:
            items.append((new_key, v))
    return dict(items)

def safe_parse_json(data: Any, default: Any = None) -> Any:
    """
    Safely parses a string into a JSON object (dict or list).
    If the input is already a dict or list, it returns it as-is.
    Handles common LLM formatting artifacts like markdown code blocks.
    """
    if data is None:
        return default
        
    if isinstance(data, (dict, list)):
        return data
        
    if not isinstance(data, str):
        return default
        
    cleaned_data = data.strip()
    if cleaned_data.startswith("```json"): cleaned_data = cleaned_data[7:]
    elif cleaned_data.startswith("```"): cleaned_data = cleaned_data[3:]
    if cleaned_data.endswith("```"): cleaned_data = cleaned_data[:-3]
        
    try:
        return json.loads(cleaned_data.strip())
    except Exception as e:
        logger.warning(f"Failed to parse JSON string: {e}")
        return default