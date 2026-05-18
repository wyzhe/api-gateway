"""Canonical string vocabularies. `str, Enum` so DB column comparisons still
work with raw literals during the gradual migration."""
from enum import Enum


class UserRole(str, Enum):
    USER = "user"
    ADMIN = "admin"


class AccountStatus(str, Enum):
    """Shared by users, api_keys, providers, models."""

    ACTIVE = "active"
    DISABLED = "disabled"


class RequestType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"


class RequestStatus(str, Enum):
    SUCCESS = "success"
    FAILED = "failed"
    RUNNING = "running"
    QUEUED = "queued"


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    SUCCEEDED = "succeeded"
    FAILED = "failed"


class TransactionType(str, Enum):
    RECHARGE = "recharge"
    DEBIT = "debit"
    REFUND = "refund"
    ADJUSTMENT = "adjustment"


class PricingMode(str, Enum):
    PER_TOKEN = "per_token"
    PER_IMAGE = "per_image"
    PER_SECOND = "per_second"
    PER_GENERATION = "per_generation"


class ModelType(str, Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    MULTIMODAL = "multimodal"
