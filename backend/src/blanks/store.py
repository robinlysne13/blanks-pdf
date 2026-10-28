"""Open documents, held in memory only. Blanks keeps no library on disk."""

from __future__ import annotations

import secrets
import threading
from collections import OrderedDict
from dataclasses import dataclass

MAX_OPEN = 8


@dataclass
class Document:
    id: str
    name: str
    data: bytes


_docs: OrderedDict[str, Document] = OrderedDict()
_lock = threading.Lock()


def add(name: str, data: bytes) -> Document:
    doc = Document(id=secrets.token_urlsafe(16), name=name, data=data)
    with _lock:
        _docs[doc.id] = doc
        while len(_docs) > MAX_OPEN:
            _docs.popitem(last=False)
    return doc


def get(doc_id: str) -> Document | None:
    with _lock:
        return _docs.get(doc_id)
