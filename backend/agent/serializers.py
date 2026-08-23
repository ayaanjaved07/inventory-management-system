from rest_framework import serializers


class ChatTurnSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    text = serializers.CharField(allow_blank=True, max_length=4000)


class ChatRequestSerializer(serializers.Serializer):
    """One question plus the conversation so far.

    History is client-supplied and capped: it is replayed to Gemini, so an
    unbounded list would be a free way to burn the free tier's token budget.
    """

    message = serializers.CharField(max_length=2000, trim_whitespace=True)
    history = ChatTurnSerializer(many=True, required=False, default=list)

    def validate_history(self, value):
        return value[-20:]
