class AppError(Exception):
    """An expected failure. The UI translates `code`; `params` fill the message."""

    def __init__(self, code: str, status: int = 400, **params):
        super().__init__(code)
        self.code, self.status, self.params = code, status, params

    def body(self) -> dict:
        return {"error": {"code": self.code, "params": self.params}}


def not_found() -> AppError:
    return AppError("not_found", 404)
