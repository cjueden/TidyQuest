"""Async client for the TidyQuest REST API."""

from __future__ import annotations

from typing import Any

import aiohttp


class TidyQuestApiError(Exception):
    """Raised when the TidyQuest API returns an error."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


class TidyQuestApiClient:
    """Minimal API client for TidyQuest."""

    def __init__(
        self,
        session: aiohttp.ClientSession,
        base_url: str,
        username: str,
        password: str,
    ) -> None:
        self._session = session
        self._base_url = base_url.rstrip("/")
        self._username = username
        self._password = password
        self._token: str | None = None

    async def async_login(self) -> dict[str, Any]:
        """Authenticate and cache a JWT token."""
        data = await self._request(
            "post",
            "/auth/login",
            json={"username": self._username, "password": self._password},
            authenticated=False,
        )
        self._token = data["token"]
        return data["user"]

    async def async_get_current_user(self) -> dict[str, Any]:
        """Return the authenticated TidyQuest user."""
        return await self._request("get", "/auth/me")

    async def async_get_rooms(self) -> list[dict[str, Any]]:
        """Return rooms with nested tasks."""
        return await self._request("get", "/rooms")

    async def async_get_users(self) -> list[dict[str, Any]]:
        """Return TidyQuest users."""
        return await self._request("get", "/users")

    async def async_complete_task(
        self, task_id: int, on_behalf_of_user_id: int | None = None
    ) -> dict[str, Any]:
        """Complete a task, optionally on behalf of another TidyQuest user."""
        payload: dict[str, Any] = {}
        if on_behalf_of_user_id is not None:
            payload["onBehalfOfUserId"] = on_behalf_of_user_id
            # The integration logs in as a parent, but the person acting is the one named here,
            # so let TidyQuest apply Strict Mode approval when that person is a child.
            payload["requireApproval"] = True
        return await self._request("post", f"/tasks/{task_id}/complete", json=payload)

    async def async_reset_task(self, task_id: int) -> dict[str, Any]:
        """Reset a task to dirty/due state."""
        return await self._request("post", f"/tasks/{task_id}/reset", json={})

    async def async_create_task(
        self, room_id: int, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Create a task in a room."""
        return await self._request("post", f"/rooms/{room_id}/tasks", json=payload)

    async def async_update_task(
        self, task_id: int, payload: dict[str, Any]
    ) -> dict[str, Any]:
        """Update a task."""
        return await self._request("put", f"/tasks/{task_id}", json=payload)

    async def async_delete_task(self, task_id: int) -> dict[str, Any]:
        """Delete a task."""
        return await self._request("delete", f"/tasks/{task_id}")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        authenticated: bool = True,
        retry_auth: bool = True,
        **kwargs: Any,
    ) -> Any:
        """Send a request and parse JSON responses."""
        headers = kwargs.pop("headers", {})
        if authenticated:
            if not self._token:
                await self.async_login()
            headers["Authorization"] = f"Bearer {self._token}"

        url = f"{self._base_url}/api{path}"
        try:
            async with self._session.request(
                method, url, headers=headers, timeout=aiohttp.ClientTimeout(total=20), **kwargs
            ) as response:
                if response.status == 401 and authenticated and retry_auth:
                    self._token = None
                    await self.async_login()
                    return await self._request(
                        method,
                        path,
                        authenticated=authenticated,
                        retry_auth=False,
                        **kwargs,
                    )

                data = await _json_or_text(response)
                if response.status >= 400:
                    message = data.get("error") if isinstance(data, dict) else str(data)
                    raise TidyQuestApiError(message, response.status)
                return data
        except aiohttp.ClientError as err:
            raise TidyQuestApiError(str(err)) from err


async def _json_or_text(response: aiohttp.ClientResponse) -> Any:
    """Return response JSON when possible, otherwise text."""
    try:
        return await response.json()
    except (aiohttp.ContentTypeError, ValueError):
        return await response.text()
