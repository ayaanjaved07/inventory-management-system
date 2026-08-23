from django.urls import path

from .views import (
    ActivityLogListView,
    CurrencyListView,
    DashboardStatsView,
    SalesStatsView,
    convert_view,
)

urlpatterns = [
    path("activity/", ActivityLogListView.as_view(), name="activity"),
    path("currencies/", CurrencyListView.as_view(), name="currencies"),
    path("currencies/convert/", convert_view, name="convert"),
    path("stats/dashboard/", DashboardStatsView.as_view(), name="dashboard-stats"),
    path("stats/sales/", SalesStatsView.as_view(), name="sales-stats"),
]
