from rest_framework.pagination import PageNumberPagination


class Pagination(PageNumberPagination):
    """25 rows per page, but a request can ask for more with ?page_size=200
    (used by the item dropdowns). max_page_size stops ?page_size=1000000."""

    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 500
