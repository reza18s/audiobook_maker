"""Local entry point for the FastAPI gateway."""

from .api import create_app


app = create_app()
