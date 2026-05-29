from functools import lru_cache
from app.config import settings

@lru_cache
def get_container():
    return {}

container = get_container
