from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import ChatRequestSerializer
from .services import is_available, safe_chat, tool_catalogue


class AgentChatView(APIView):
    """Ask the assistant a question about the inventory.

    Degrades gracefully with no key configured: GET reports availability and
    POST returns 503, so the rest of the app -- and the demo -- never depends
    on the assistant being reachable.

    The Gemini key is server-side only. The browser talks to this endpoint and
    Django talks to Gemini; anything prefixed VITE_ would be compiled into the
    public bundle.
    """

    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({"available": is_available(), "tools": tool_catalogue()})

    def post(self, request):
        if not is_available():
            return Response(
                {"available": False, "detail": "Assistant is not configured."},
                status=503,
            )

        serializer = ChatRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        # request.user is passed through to every tool: the assistant reads the
        # same data the caller's own REST endpoints would return, nothing more.
        result = safe_chat(
            serializer.validated_data["message"],
            request.user,
            serializer.validated_data.get("history"),
        )
        return Response(result)
