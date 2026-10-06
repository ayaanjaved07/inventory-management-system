// A red "Expired" or amber "Expiring soon" label. Shows nothing otherwise.
// `status` comes from the backend's expiry_status field.
export function ExpiryBadge({ status }: { status: string }) {
  if (status === 'expired') return <span className="badge red">Expired</span>
  if (status === 'expiring') return <span className="badge amber">Expiring soon</span>
  return null
}
